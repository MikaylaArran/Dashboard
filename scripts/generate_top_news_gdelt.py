import os
import json
from datetime import datetime, timezone
import requests

OUT_PATH = "data/top_news.json"

# You can change these any time
MAX_RECORDS = int(os.getenv("NEWS_MAX", "20"))  # keep 20 because your UI displays max 20
QUERY = os.getenv(
    "NEWS_QUERY",
    # broad global query, you can refine later
    '(war OR conflict OR election OR "central bank" OR inflation OR AI OR cyber OR climate OR protest)'
)

def main():
    os.makedirs("data", exist_ok=True)

    url = "https://api.gdeltproject.org/api/v2/doc/doc"
    params = {
        "query": QUERY,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": str(MAX_RECORDS),
        "sort": "HybridRel"
    }

    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    payload = r.json()

    articles_raw = payload.get("articles", []) or []

    articles = []
    for a in articles_raw:
        title = a.get("title") or "Untitled"
        link = a.get("url") or ""
        domain = a.get("domain") or ""
        source_country = a.get("sourceCountry") or ""
        seendate = a.get("seendate") or ""

        # Your frontend expects: title, link, source, pubDate
        articles.append({
            "title": title,
            "link": link,
            "source": domain or source_country,
            "pubDate": seendate
        })

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    out = {
        "generated_at_utc": now,
        "category": "all",
        "language": "mixed",
        "summary": "Top global headlines pulled from GDELT (free).",
        "articles": articles
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
