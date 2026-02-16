import os
import json
from datetime import datetime, timedelta, timezone
import requests

ACLED_USERNAME = os.environ["ACLED_USERNAME"]
ACLED_PASSWORD = os.environ["ACLED_PASSWORD"]

TOKEN_URL = "https://acleddata.com/oauth/token"
ACLED_READ_URL = "https://acleddata.com/api/acled/read"

# Countries you want in your dashboard (start small, expand later)
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

def get_access_token(username: str, password: str) -> str:
    # Per ACLED docs: grant_type=password and client_id=acled :contentReference[oaicite:3]{index=3}
    data = {
        "username": username,
        "password": password,
        "grant_type": "password",
        "client_id": "acled",
    }
    r = requests.post(TOKEN_URL, headers={"Content-Type": "application/x-www-form-urlencoded"}, data=data, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

def fetch_events(token: str, country: str, start_date: str, end_date: str, limit: int = 5000):
    # ACLED read endpoint with filters; BETWEEN uses | and event_date_where=BETWEEN :contentReference[oaicite:4]{index=4}
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

    # ACLED responses include status + data (per their examples) :contentReference[oaicite:5]{index=5}
    if str(payload.get("status")) != "200":
        raise RuntimeError(f"ACLED returned status={payload.get('status')} for {country}: {payload.get('message')}")
    return payload.get("data", [])

def score_country(events):
    """
    Simple scoring model (you can refine later):
    - C (Conflict): political violence / battles / explosions
    - S (Societal): protests / riots
    - I (Impact): fatalities
    - U (Unrest): total event volume
    """
    total = len(events)
    fatalities = sum(int(e.get("fatalities") or 0) for e in events)

    conflict = 0
    societal = 0

    for e in events:
        disorder = (e.get("disorder_type") or "").lower()
        etype = (e.get("event_type") or "").lower()

        # rough buckets
        if "political violence" in disorder or "battle" in etype or "explos" in etype:
            conflict += 1
        if "protest" in etype or "riot" in etype:
            societal += 1

    # Normalize into 0–100-ish
    U = min(30, total)                 # unrest/volume capped
    C = min(30, conflict * 2)          # weight conflict
    S = min(30, societal * 2)          # weight protest/riot
    I = min(30, fatalities * 3)        # weight fatalities strongly

    score = min(100, U + C + S + I)
    return score, U, C, S, I

def main():
    os.makedirs("data", exist_ok=True)

    now = datetime.now(timezone.utc)
    end_date = now.date().isoformat()
    start_date = (now - timedelta(days=7)).date().isoformat()

    token = get_access_token(ACLED_USERNAME, ACLED_PASSWORD)

    rows = []
    for country in COUNTRIES:
        events = fetch_events(token, country, start_date, end_date)
        score, U, C, S, I = score_country(events)
        rows.append({
            "country": country,
            "score": score,
            "U": U,
            "C": C,
            "S": S,
            "I": I
        })

    payload = {
        "generated_at_utc": now.isoformat().replace("+00:00", "Z"),
        "window_days": 7,
        "countries": sorted(rows, key=lambda x: x["score"], reverse=True)
    }

    with open("data/instability.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
