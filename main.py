import os
import json
import uuid
import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal, Optional
from groq import Groq
from gtts import gTTS
from dotenv import load_dotenv
import time
import io
import base64
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

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
ai = Groq(api_key=GROQ_KEY) if GROQ_KEY else None

ai = Groq(api_key=GROQ_KEY) if GROQ_KEY else None

def auto_retry_genai(cli, c, schema=None):
    sys = "You are an intelligence analyst."
    if schema:
        sys += f"\nYou must return a valid JSON object matching this schema. CRITICAL: 'Perspective' MUST be exactly 1 or 2 words ONLY (e.g. 'Pro-Consumer', 'Skeptical').\n{schema.schema_json()}"
    
    for _ in range(3):
        for m in ['llama-3.3-70b-versatile', 'llama3-8b-8192']:
            try:
                if schema:
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
                err_str = str(e)
                if "429" in err_str or "503" in err_str:
                    time.sleep(1.5)
                else:
                    raise e
    raise Exception("Groq Retry Limit")

@app.post("/api/analyze")
async def analyze_topic(q: IntelQuery):
    if not SERP_KEY or not GROQ_KEY:
        raise HTTPException(500, "Missing Keys")

    res = requests.get("https://serpapi.com/search", params={
        "engine": "google_news",
        "q": q.topic,
        "api_key": SERP_KEY,
        "num": 10
    })
    news = res.json()
    news_items = [{"url": r.get("link"), "title": r.get("title", "News Analysis")} for r in news.get("news_results", [])[:10] if r.get("link")]

    articles = []
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"}
    
    for item in news_items:
        u = item["url"]
        t = item["title"]
        if len(articles) >= 4:
            break
        try:
            p = requests.get(u, timeout=5, headers=headers)
            if p.status_code != 200:
                continue
                
            s = BeautifulSoup(p.text, "html.parser")
            c = " ".join([pt.text for pt in s.find_all("p")])
            c_low = c.lower()
            
            if len(c) < 150 or "enable javascript" in c_low or "verify you are" in c_low or "access denied" in c_low or "security check" in c_low:
                continue

            intel = auto_retry_genai(ai, c, ArticleIntel)
            articles.append({"url": u, "title": t, "data": json.loads(intel)})
        except Exception:
            continue

    if not articles:
        raise HTTPException(400, "Extraction Failed")

    bp = f"Synthesize a daily brief for '{q.topic}' from: {json.dumps(articles)}\nEnsure you outline a 1-sentence Consensus, any conflicting facts as Discrepancies (or null), and an Impact Radius with up to 3 Winners and 3 Losers."
    bt_json = auto_retry_genai(ai, bp, BriefIntel)
    bt_data = json.loads(bt_json)

    tts = gTTS(text=bt_data["BottomLine"], lang='en', slow=False)
    audio_fp = io.BytesIO()
    tts.write_to_fp(audio_fp)
    audio_fp.seek(0)
    audio_b64 = base64.b64encode(audio_fp.read()).decode("utf-8")

    return {
        "brief": bt_data,
        "audio_base64": f"data:audio/mp3;base64,{audio_b64}",
        "articles": articles
    }

app.mount("/", StaticFiles(directory="static", html=True), name="static")
