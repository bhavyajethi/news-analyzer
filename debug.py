import os
import sys
import json
import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel
from typing import Literal
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()
SERP_KEY = os.getenv("SERPAPI_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

class ArticleIntel(BaseModel):
    Summary: str
    Expectation: str
    Sentiment: Literal["Positive", "Negative", "Neutral"]
    Perspective: str
    HypeScore: int

print(f"SERP_KEY exists: {bool(SERP_KEY)}")
print(f"GEMINI_KEY exists: {bool(GEMINI_KEY)}")

topic = "googe"
res = requests.get("https://serpapi.com/search", params={
    "engine": "google_news",
    "q": topic,
    "api_key": SERP_KEY,
    "num": 4
})
news = res.json()
if "error" in news:
    print("SerpApi error:", news["error"])
    sys.exit(1)

urls = [r.get("link") for r in news.get("news_results", [])[:4] if r.get("link")]
print("Found URLs:", urls)

ai = genai.Client(api_key=GEMINI_KEY) if GEMINI_KEY else None

for u in urls:
    try:
        print(f"Fetching {u}...")
        p = requests.get(u, timeout=5)
        s = BeautifulSoup(p.text, "html.parser")
        c = " ".join([pt.text for pt in s.find_all("p")])
        print(f"Text length: {len(c)}")
        if len(c) < 100:
            print("Content too short, skipping.")
            continue
        
        print("Calling Gemini...")
        intel = ai.models.generate_content(
            model='gemini-2.5-flash',
            contents=c,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ArticleIntel,
            ),
        )
        print("Gemini raw text:", intel.text)
        data = json.loads(intel.text)
        print("Parsed JSON:", data)
    except Exception as e:
        print(f"Exception for {u}: {e}")
