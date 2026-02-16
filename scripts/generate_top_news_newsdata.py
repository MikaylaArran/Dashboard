import os, json
from datetime import datetime, timezone
import requests

API_KEY = os.environ["NEWSDATA_API_KEY"]

# NewsData.io 'latest' endpoint (past 48h). :contentReference[oaicite:2]{index=2}
URL = "https://newsdata.io/api/1/latest"

# Choose your defaults
LANGUAGE = "en"
COUNTRY = ""      # e.g. "za" for South Africa, "us", etc. (leave blank for global)
QUERY = ""        # e.g. "war OR election OR protest" (optional)

def fetch_latest():
    params = {
        "apikey": API_KEY,
        "language": LANGUAGE,
    }
    if COUNTRY:
        params["country"] = COUNTRY
    if QUERY:
        params["q"] = QUERY

    r = requests.get(URL, params=params, timeout=45)
    r.raise_for_status()
    return r.json()

def normalize(payload):
    # NewsData.io commonly returns results list in "results"
    results = payload.get("results") or []

    articles = []
    for a in results[:50]:
        articles.append({
            "title": a.get("title") or "Untitled",
            "link": a.get("link") or "",
            "pubDate": a.get("pubDate") or a.get("publishedAt") or "",
            "source": a.get("source_id") or a.get("source") or "",
            "category": (a.get("category")[0] if isinstance(a.get("category"), list) and a.get("category") else a.get("category")) or "",
            "language": a.get("language") or "",
        })

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "category": "all",
        "language": LANGUAGE,
        "summary": "",
        "articles": articles
    }

def main():
    os.makedirs("data", exist_ok=True)
    raw = fetch_latest()
    out = normalize(raw)

    with open("data/top_news.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
