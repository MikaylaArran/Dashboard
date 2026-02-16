import os
import json
from datetime import datetime, timedelta, timezone
from collections import Counter
import requests

ACLED_USERNAME = os.environ["ACLED_USERNAME"]
ACLED_PASSWORD = os.environ["ACLED_PASSWORD"]

TOKEN_URL = "https://acleddata.com/oauth/token"
ACLED_READ_URL = "https://acleddata.com/api/acled/read"

COUNTRIES = [
    "South Africa",
    "United States",
    "India",
    "United Kingdom",
    "France",
    "Germany",
    "Brazil",
    "Nigeria"
]

WINDOW_DAYS = 7

def get_access_token(username: str, password: str) -> str:
    data = {
        "username": username,
        "password": password,
        "grant_type": "password",
        "client_id": "acled",
    }
    r = requests.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=data,
        timeout=30
    )
    r.raise_for_status()
    return r.json()["access_token"]

def fetch_events(token: str, country: str, start_date: str, end_date: str, limit: int = 5000):
    params = {
        "_format": "json",
        "country": country,
        "event_date": f"{start_date}|{end_date}",
        "event_date_where": "BETWEEN",
        "fields": "event_id_cnty|event_date|event_type|sub_event_type|disorder_type|fatalities|country",
        "limit": str(limit),
    }
    r = requests.get(
        ACLED_READ_URL,
        params=params,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        timeout=60,
    )
    r.raise_for_status()
    payload = r.json()

    if str(payload.get("status")) != "200":
        raise RuntimeError(f"ACLED returned status={payload.get('status')} for {country}: {payload.get('message')}")
    return payload.get("data", [])

def score_country(events):
    total = len(events)
    fatalities = sum(int(e.get("fatalities") or 0) for e in events)

    conflict = 0
    societal = 0

    etypes = Counter()

    for e in events:
        disorder = (e.get("disorder_type") or "").lower()
        etype = (e.get("event_type") or "").strip()
        etype_l = etype.lower()

        if etype:
            etypes[etype] += 1

        if "political violence" in disorder or "battle" in etype_l or "explos" in etype_l:
            conflict += 1
        if "protest" in etype_l or "riot" in etype_l:
            societal += 1

    U = min(30, total)
    C = min(30, conflict * 2)
    S = min(30, societal * 2)
    I = min(30, fatalities * 3)

    score = min(100, U + C + S + I)

    top_event_types = [{"name": k, "count": v} for k, v in etypes.most_common(4)]

    return score, U, C, S, I, total, fatalities, top_event_types

def build_meaning(score: int, total: int, fatalities: int, top_event_types: list, window_days: int) -> str:
    if score >= 80:
        level = "CRITICAL"
    elif score >= 65:
        level = "HIGH"
    elif score >= 50:
        level = "ELEVATED"
    else:
        level = "MODERATE"

    top1 = top_event_types[0]["name"] if top_event_types else "mixed activity"
    top2 = top_event_types[1]["name"] if len(top_event_types) > 1 else None

    parts = []
    parts.append(f"Instability is {level} over the last {window_days} days based on ACLED-reported events.")
    parts.append(f"{total} events and {fatalities} reported fatalities were recorded in this window.")
    if top2:
        parts.append(f"Most reported activity is {top1}, followed by {top2}.")
    else:
        parts.append(f"Most reported activity is {top1}.")
    parts.append("Watch for sudden spikes in event volume, geographic spread, or increases in fatal incidents.")

    return " ".join(parts)

def main():
    os.makedirs("data", exist_ok=True)

    now = datetime.now(timezone.utc)

    # Current window
    end_date = now.date().isoformat()
    start_date = (now - timedelta(days=WINDOW_DAYS)).date().isoformat()

    # Previous window (for trend)
    prev_end = (now - timedelta(days=WINDOW_DAYS)).date().isoformat()
    prev_start = (now - timedelta(days=WINDOW_DAYS * 2)).date().isoformat()

    token = get_access_token(ACLED_USERNAME, ACLED_PASSWORD)

    rows = []
    for country in COUNTRIES:
        events_now = fetch_events(token, country, start_date, end_date)
        score, U, C, S, I, total, fatalities, top_event_types = score_country(events_now)

        events_prev = fetch_events(token, country, prev_start, prev_end)
        score_prev, *_ = score_country(events_prev)

        delta = score - score_prev
        meaning = build_meaning(score, total, fatalities, top_event_types, WINDOW_DAYS)

        rows.append({
            "country": country,
            "score": score,
            "delta": delta,
            "U": U,
            "C": C,
            "S": S,
            "I": I,
            "events_total": total,
            "fatalities_total": fatalities,
            "top_event_types": top_event_types,
            "meaning": meaning
        })

    payload = {
        "generated_at_utc": now.isoformat().replace("+00:00", "Z"),
        "window_days": WINDOW_DAYS,
        "countries": sorted(rows, key=lambda x: x["score"], reverse=True)
    }

    with open("data/instability.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
