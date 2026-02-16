import os, json, time
from datetime import datetime, timezone
import requests

API_KEY = os.environ.get("NEWSDATA_API_KEY", "").strip()

URL = "https://newsdata.io/api/1/news"  # more reliable than /latest
LANGUAGE = "en"
COUNTRY = "us"
QUERY = "politics OR war OR conflict OR government OR protest"

def fetch_latest():
    if not API_KEY:
        return {"results": [], "_error": "Missing NEWSDATA_API_KEY"}

    params = {
        "apikey": API_KEY,
        "language": LANGUAGE,
        "country": COUNTRY,
        "q": QUERY,
    }

    for attempt in range(5):
        r = requests.get(URL, params=params, timeout=45)

        if r.status_code == 429:
            wait = (2 ** attempt) * 15
            print(f"429 rate limit. Waiting {wait}s...")
            time.sleep(wait)
            continue

        try:
            r.raise_for_status()
        except Exception as e:
            return {"results": [], "_error": f"HTTP error: {str(e)}"}

        try:
            data = r.json()
        except Exception:
            return {"results": [], "_error": "Failed to parse JSON response"}

        return data

    return {"results": [], "_error": "Rate limited after retries (429)"}

def normalize(payload):
    results = payload.get("results") or []
    err = payload.get("_error", "")

    articles = []
    for a in results[:60]:
        cat = a.get("category")
        if isinstance(cat, list):
            cat = cat[0] if cat else ""

        articles.append({
            "title": a.get("title") or "Untitled",
            "link": a.get("link") or "",
            "pubDate": a.get("pubDate") or a.get("publishedAt") or "",
            "source": a.get("source_id") or a.get("source") or "",
            "category": cat or "",
            "language": a.get("language") or "",
        })

    summary_text = ""
    if err:
        summary_text = f"NewsData fetch issue: {err}"
    elif not articles:
        summary_text = "No results returned by NewsData with current filters."

    return {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "category": "all",
        "language": LANGUAGE,
        "summary": summary_text,
        "articles": articles
    }

def main():
    os.makedirs("data", exist_ok=True)
    raw = fetch_latest()
    out = normalize(raw)

    with open("data/top_news.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("Wrote data/top_news.json articles:", len(out["articles"]))
    if out["summary"]:
        print("Summary:", out["summary"])

if __name__ == "__main__":
    main()
