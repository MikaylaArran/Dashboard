import os
import json
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import requests

# --- Config ---
CATEGORY_QUERIES = {
    "all": "world",
    "world": "world",
    "politics": "politics",
    "business": "business",
    "technology": "technology",
    "environment": "climate OR environment",
}

LANGUAGE = "en"
REGION = "US"
CEID = "US:en"
MAX_ITEMS = 100

def google_news_rss_url(query: str) -> str:
    # Google News RSS Search
    # hl = language, gl = region, ceid = edition
    q = requests.utils.quote(query)
    return f"https://news.google.com/rss/search?q={q}&hl={LANGUAGE}&gl={REGION}&ceid={CEID}"

def parse_rss(xml_text: str):
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    items = []
    for item in channel.findall("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pubDate = (item.findtext("pubDate") or "").strip()

        source_el = item.find("source")
        source = (source_el.text.strip() if source_el is not None and source_el.text else "")

        if title and link:
            items.append({
                "title": title,
                "link": link,
                "source": source,
                "pubDate": pubDate
            })

    return items

def main():
    os.makedirs("data", exist_ok=True)

    category = os.environ.get("NEWS_CATEGORY", "all").strip().lower()
    query = CATEGORY_QUERIES.get(category, CATEGORY_QUERIES["all"])

    url = google_news_rss_url(query)
    r = requests.get(url, timeout=30)
    r.raise_for_status()

    articles = parse_rss(r.text)[:MAX_ITEMS]

    payload = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "category": category,
        "language": "en",
        "summary": "Top headlines pulled from Google News RSS (free, English).",
        "articles": articles
    }

    with open("data/top_news.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
