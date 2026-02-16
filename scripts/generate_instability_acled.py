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
        raise RuntimeError(
            f"ACLED returned status={payload.get('status')} for {country}: {payload.get('message')}"
        )
    return payload.get("data", [])

def score_country(events):
    """
    Simple scoring model:
    - U (Unrest): total event volume
    - C (Conflict): political violence / battles / explosions
    - S (Societal): protests / riots
    - I (Impact): fatalities
    """
    total = len(events)
    fatalities = sum(int(e.get("fatalities") or 0) for e in events)

    conflict = 0
    societal = 0

    for e in events:
        disorder = (e.get("disorder_type") or "").lower()
        etype = (e.get("event_type") or "").lower()

        if "political violence" in disorder or "battle" in etype or "explos" in etype:
            conflict += 1
        if "protest" in etype or "riot" in etype:
            societal += 1

    U = min(30, total)
    C = min(30, conflict * 2)
    S = min(30, societal * 2)
    I = min(30, fatalities * 3)

    score = min(100, U + C + S + I)
    return score, U, C, S, I, total, fatalities

def build_meaning(country: str, score: int, U: int, C: int, S: int, I: int, total: int, fatalities: int, window_days: int) -> str:
    # Severity label (match dashboard buckets)
    if score >= 80:
        level = "CRITICAL"
    elif score >= 65:
        level = "HIGH"
    elif score >= 50:
        level = "ELEVATED"
    else:
        level = "MODERATE"

    # Identify strongest drivers
    parts = [
        ("event volume", U),
        ("conflict signals", C),
        ("protest/riot signals", S),
        ("fatality impact", I),
    ]
    parts_sorted = sorted(parts, key=lambda x: x[1], reverse=True)
    primary, _ = parts_sorted[0]
    secondary, _ = parts_sorted[1]

    # Build meaning text
    lines = []
    lines.append(f"Instability is {level} over the last {window_days} days based on ACLED-reported events.")
    lines.append(f"Primary driver: {primary}; secondary driver: {secondary}.")
    lines.append(f"Observed {total} events and {fatalities} reported fatalities in this window.")

    # Add guidance text
    if C >= max(S, I) and C >= 10:
        lines.append("Monitor for escalation in armed clashes, attacks, or explosive incidents.")
    elif S >= max(C, I) and S >= 10:
        lines.append("Monitor for large demonstrations/riots and signs of spillover into violence.")
    elif I >= max(C, S) and I >= 10:
        lines.append("Fatalities are a key risk signal; watch whether lethal incidents are increasing.")
    else:
        lines.append("Signals are present but not concentrated; watch for sudden spikes or geographic spread.")

    return " ".join(lines)

def main():
    os.makedirs("data", exist_ok=True)

    now = datetime.now(timezone.utc)
    end_date = now.date().isoformat()
    start_date = (now - timedelta(days=WINDOW_DAYS)).date().isoformat()

    token = get_access_token(ACLED_USERNAME, ACLED_PASSWORD)

    rows = []
    for country in COUNTRIES:
        events = fetch_events(token, country, start_date, end_date)
        score, U, C, S, I, total, fatalities = score_country(events)

        meaning = build_meaning(
            country=country,
            score=score,
            U=U, C=C, S=S, I=I,
            total=total,
            fatalities=fatalities,
            window_days=WINDOW_DAYS
        )

        rows.append({
            "country": country,
            "score": score,
            "U": U,
            "C": C,
            "S": S,
            "I": I,
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
