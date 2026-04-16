import os
import json
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal, Optional
from groq import Groq
from gtts import gTTS
from dotenv import load_dotenv
import time
import io
import base64
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

SERP_KEY = os.getenv("SERPAPI_API_KEY")
GROQ_KEY = os.getenv("GROQ_API_KEY")

class IntelQuery(BaseModel):
    topic: str

class ArticleIntel(BaseModel):
    Summary: str
    Expectation: str
    Sentiment: Literal["Positive", "Negative", "Neutral"]
    Perspective: str
    HypeScore: int

class BriefImpact(BaseModel):
    Winners: list[str]
    Losers: list[str]

class BriefIntel(BaseModel):
    BottomLine: str
    Consensus: str
    Discrepancies: Optional[str]
    Impact: BriefImpact

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ai = Groq(api_key=GROQ_KEY) if GROQ_KEY else None
r_logs = {}
s_cache = {}

def gen(cli, c, sch=None):
    sys = "You are an intelligence analyst."
    if sch:
        sys += f"\nYou must return a valid JSON object matching this schema. CRITICAL: 'Perspective' MUST be exactly 1 or 2 words ONLY.\n{sch.schema_json()}"
    
    for _ in range(3):
        for m in ['llama-3.3-70b-versatile', 'llama3-8b-8192']:
            try:
                if sch:
                    res = cli.chat.completions.create(
                        model=m,
                        messages=[{"role": "system", "content": sys}, {"role": "user", "content": c}],
                        response_format={"type": "json_object"}
                    )
                else:
                    res = cli.chat.completions.create(
                        model=m,
                        messages=[{"role": "system", "content": "You are a concise intelligence writer. Return plain text only."}, {"role": "user", "content": c}]
                    )
                return res.choices[0].message.content
            except Exception as e:
                err = str(e)
                if "429" in err or "503" in err:
                    time.sleep(1.5)
                else:
                    raise e
    raise Exception("Groq Retry Limit")

@app.post("/api/analyze")
async def analyze_t(q: IntelQuery, req: Request):
    if not SERP_KEY or not GROQ_KEY:
        raise HTTPException(500, "Missing Keys")

    xf = req.headers.get("x-forwarded-for")
    ip = xf.split(",")[0].strip() if xf else (req.client.host if req.client else "unknown")
    
    now = time.time()
    cut = now - 60

    for k in list(r_logs.keys()):
        r_logs[k] = [t for t in r_logs[k] if t > cut]
        if not r_logs[k]:
            del r_logs[k]

    usr_logs = r_logs.get(ip, [])
    if len(usr_logs) >= 2:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again in a minute.")
    usr_logs.append(now)
    r_logs[ip] = usr_logs

    tk = q.topic.lower().strip()
    if tk in s_cache:
        c_dat, c_tim = s_cache[tk]
        if now - c_tim < 900:
            return c_dat

    res = requests.get("https://serpapi.com/search", params={
        "engine": "google_news",
        "q": q.topic,
        "api_key": SERP_KEY,
        "num": 10
    })
    n_data = res.json()
    items = [{"url": r.get("link"), "title": r.get("title", "News Analysis")} for r in n_data.get("news_results", [])[:10] if r.get("link")]

    arts = []
    hdrs = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
    
    for i in items:
        u = i["url"]
        t = i["title"]
        if len(arts) >= 4:
            break
        try:
            p = requests.get(u, timeout=5, headers=hdrs)
            if p.status_code != 200:
                continue
                
            s = BeautifulSoup(p.text, "html.parser")
            c = " ".join([pt.text for pt in s.find_all("p")])
            cl = c.lower()
            
            if len(c) < 150 or "enable javascript" in cl or "verify you are" in cl or "access denied" in cl or "security check" in cl:
                continue

            intl = gen(ai, c, ArticleIntel)
            arts.append({"url": u, "title": t, "data": json.loads(intl)})
        except Exception:
            continue

    if not arts:
        raise HTTPException(400, "Extraction Failed")

    bp = f"Synthesize a daily brief for '{q.topic}' from: {json.dumps(arts)}\nEnsure you outline a 1-sentence Consensus, any conflicting facts as Discrepancies (or null), and an Impact Radius with up to 3 Winners and 3 Losers."
    b_json = gen(ai, bp, BriefIntel)
    b_dat = json.loads(b_json)

    tts = gTTS(text=b_dat["BottomLine"], lang='en', slow=False)
    afp = io.BytesIO()
    tts.write_to_fp(afp)
    afp.seek(0)
    ab64 = base64.b64encode(afp.read()).decode("utf-8")

    f_res = {
        "brief": b_dat,
        "audio_base64": f"data:audio/mp3;base64,{ab64}",
        "articles": arts
    }
    s_cache[tk] = (f_res, now)
    return f_res

app.mount("/", StaticFiles(directory="static", html=True), name="static")