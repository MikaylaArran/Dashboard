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

    # Retry with exponential backoff on 429 (Too Many Requests)
    for attempt in range(5):
        r = requests.get(URL, params=params, timeout=45)

        if r.status_code == 429:
            wait = (2 ** attempt) * 15  # 15s, 30s, 60s, 120s, 240s
            print(f"NewsData rate limit (429). Waiting {wait}s then retrying...")
            time.sleep(wait)
            continue

        r.raise_for_status()
        return r.json()

    # If still rate-limited after retries, don't crash the workflow
    print("Still rate limited after retries. Returning empty results.")
    return {"results": []}

def normalize(payload):
    results = payload.get("results") or []

    summary_text = ""
    if not results:
        summary_text = "Rate limited by NewsData.io (429) or no results returned. Showing empty feed."

    articles = []
    for a in results[:50]:
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

if __name__ == "__main__":
    main()
