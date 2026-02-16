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
MAX_ITEMS = 120  # you can increase/decrease

def google_news_rss_url(query: str) -> str:
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

def write_json(path: str, payload: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def main():
    os.makedirs("data", exist_ok=True)

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    # Generate one file per category
    for category, query in CATEGORY_QUERIES.items():
        url = google_news_rss_url(query)
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        articles = parse_rss(r.text)[:MAX_ITEMS]

        payload = {
            "generated_at_utc": now,
            "category": category,
            "language": "en",
            "summary": f"Top headlines pulled from Google News RSS (free, English). Category: {category}.",
            "articles": articles
        }

        out_path = f"data/top_news_{category}.json"
        write_json(out_path, payload)

    # Also write a default file for backward compatibility
    # (so data/top_news.json still works)
    default_path = "data/top_news.json"
    write_json(default_path, {
        "generated_at_utc": now,
        "category": "all",
        "language": "en",
        "summary": "Top headlines pulled from Google News RSS (free, English). Category: all.",
        "articles": json.load(open("data/top_news_all.json", "r", encoding="utf-8"))["articles"]
    })

if __name__ == "__main__":
    main()
