import os, re, json, time
import requests
from datetime import datetime, timezone
from collections import Counter

API_KEY = os.getenv("NEWSDATA_API_KEY", "").strip()
BASE_URL = "https://newsdata.io/api/1/latest"

LANGUAGE = "en"
CATEGORY = None        # None = all. Or "world", "politics", "business", "technology", "environment"
N = 80                 # how many headlines to keep (max 100 recommended)
MAX_CALLS = 6          # pagination calls (keeps you under limits)

# ----------------------------
# Fetch up to N headlines
# ----------------------------
def fetch_top_n(api_key: str, n: int = 100, language: str = "en", max_calls: int = 6, category: str | None = None):
    items = []
    page_token = None

    for attempt in range(max_calls):
        params = {"apikey": api_key, "language": language}
        if category:
            params["category"] = category
        if page_token:
            params["page"] = page_token

        r = requests.get(BASE_URL, params=params, timeout=30)

        # Backoff on 429
        if r.status_code == 429:
            wait = (2 ** attempt) * 10
            print(f"429 rate limited. Waiting {wait}s then retrying...")
            time.sleep(wait)
            continue

        r.raise_for_status()
        data = r.json()

        if data.get("status") != "success":
            raise RuntimeError(str(data))

        items.extend(data.get("results") or [])

        if len(items) >= n:
            break

        page_token = data.get("nextPage")
        if not page_token:
            break

    return items[:n]

# ----------------------------
# Text utilities
# ----------------------------
STOP = set("""
a an the and or but if then than so to of in on for with from by at as is are was were be been being
this that these those it its into over under about across after before during between also not no
can could would should may might will just more most much very per via
""".split())

SPORTS = set("""
nba nfl nhl mlb match game games season playoff all-star dunk overtime quarter finals championship
wrestle wrestling division scoreboard wildcats lakers
""".split())

LIFESTYLE_LOCAL = set("""
wedding weddings horoscope crossword recipe recipes dining travel scenic waterfall park
town county local citizen newsletter obituaries health scores
""".split())

FINANCE_TICKER = set("""
nyse nasdaq etf stock stocks shares bond bonds yield earnings ticker short interest price target
""".split())

def normalize(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"[^a-z0-9\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def tokenize(text: str):
    return [
        w for w in normalize(text).split()
        if w not in STOP and len(w) > 2 and not w.isdigit()
    ]

def is_low_signal(title: str, desc: str) -> bool:
    ws = set(tokenize((title or "") + " " + (desc or "")))
    if len(ws & SPORTS) >= 2:
        return True
    if len(ws & LIFESTYLE_LOCAL) >= 2:
        return True
    if len(ws & FINANCE_TICKER) >= 3:
        return True
    return False

# ----------------------------
# Storyline clustering
# ----------------------------
def jaccard(a, b):
    A, B = set(a), set(b)
    if not A or not B:
        return 0.0
    return len(A & B) / (len(A | B) or 1)

def cluster_titles(rows, sim_threshold=0.33):
    clusters = []
    for r in rows:
        title = (r.get("title") or "").strip()
        if not title:
            continue
        tks = tokenize(title)
        if not tks:
            continue

        best_i = None
        best_sim = 0.0
        for i, c in enumerate(clusters):
            centroid = [w for w, _ in c["tok_counts"].most_common(25)]
            sim = jaccard(tks, centroid)
            if sim > best_sim:
                best_sim, best_i = sim, i

        if best_i is not None and best_sim >= sim_threshold:
            clusters[best_i]["rows"].append(r)
            clusters[best_i]["tok_counts"].update(tks)
        else:
            clusters.append({"rows":[r], "tok_counts":Counter(tks)})

    clusters.sort(key=lambda c: len(c["rows"]), reverse=True)
    return clusters

TOPIC_LEXICON = {
    "Geopolitics & security": ["war","military","nuclear","sanctions","border","defense","attack","navy"],
    "Elections & governance": ["election","vote","parliament","government","president","minister","court","policy"],
    "Economy & markets": ["inflation","gdp","economy","bank","interest","rate","currency","trade","jobs","markets"],
    "Tech & AI": ["ai","artificial","chip","cyber","data","software","platform"],
    "Climate & disasters": ["climate","flood","storm","drought","wildfire","earthquake"],
    "Public safety & crime": ["police","arrest","trial","fraud","shooting","crime"]
}

def label_cluster(cluster):
    counts = cluster["tok_counts"]
    best_topic = None
    best_score = 0
    for topic, words in TOPIC_LEXICON.items():
        score = sum(counts.get(w, 0) for w in words)
        if score > best_score:
            best_score = score
            best_topic = topic
    return best_topic or "Other"

def representative_title(cluster):
    counts = cluster["tok_counts"]
    def score(t):
        return sum(counts.get(w, 0) for w in tokenize(t))
    rows = cluster["rows"]
    rows_sorted = sorted(rows, key=lambda r: (-score(r.get("title","")), len(r.get("title","") or "")))
    return rows_sorted[0].get("title","")

def build_clean_paragraph(rows):
    if not rows:
        return "No headlines were available to summarize."

    filtered = [r for r in rows if not is_low_signal(r.get("title",""), r.get("description",""))]
    corpus = filtered if len(filtered) >= 40 else rows

    clusters = cluster_titles(corpus)
    if not clusters:
        return "Insufficient signal to produce a coherent summary."

    for c in clusters:
        c["topic"] = label_cluster(c)

    chosen = []
    seen = set()
    for c in clusters:
        if c["topic"] not in seen:
            chosen.append(c)
            seen.add(c["topic"])
        if len(chosen) == 3:
            break
    if len(chosen) < 3:
        chosen = clusters[:3]

    lines = []
    for c in chosen:
        rep = representative_title(c)
        topic = c["topic"]
        lines.append(f"{topic}: {rep}")

    return (
        "The current headlines point to several parallel developments. "
        f"{lines[0]}. {lines[1]}. {lines[2]}. "
        "Taken together, the feed reflects a dispersed news cycle rather than a single dominant global event."
    )

# ----------------------------
# Main → write data/top_news.json
# ----------------------------
def main():
    if not API_KEY:
        raise RuntimeError("Missing NEWSDATA_API_KEY (set in GitHub Secrets).")

    rows = fetch_top_n(API_KEY, n=N, language=LANGUAGE, max_calls=MAX_CALLS, category=CATEGORY)

    out = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "category": CATEGORY or "all",
        "language": LANGUAGE,
        "summary": build_clean_paragraph(rows),
        "articles": []
    }

    for a in rows:
        out["articles"].append({
            "title": a.get("title") or "Untitled",
            "link": a.get("link") or "",
            "pubDate": a.get("pubDate") or "",
            "source": a.get("source_id") or "",
        })

    os.makedirs("data", exist_ok=True)
    with open("data/top_news.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("Wrote data/top_news.json with", len(out["articles"]), "articles")

if __name__ == "__main__":
    main()
