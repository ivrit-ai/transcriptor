#!/usr/bin/env python3
"""Deploy latest code to xhostd via changeset API."""
import requests

XHOST_TOKEN = "xh_d2zP4gObQpdT0UY0IaC98HoCzS9axSDCiCLjtAXpZiZ"
APP_ID = "0b7fc7d5-64f5-4fd4-b87e-c19702bcfb27"
CHANNEL_ID = "4e0f9aa8-72c2-4753-9891-3c1c67bbe328"
API_BASE = "https://api.xhostd.com"
BASE = "C:/Users/Yanir/Dropbox/Projects/transcriptor"

HEADERS = {"Authorization": f"Bearer {XHOST_TOKEN}", "Content-Type": "application/json"}


def read(path):
    with open(f"{BASE}/{path}", "r", encoding="utf-8") as f:
        return f.read()


def post(url, payload):
    resp = requests.post(url, json=payload, headers=HEADERS, timeout=60)
    resp.raise_for_status()
    return resp.json()


changes = {
    # Backend
    "app/main.py": read("app/main.py"),
    "app/config.py": read("app/config.py"),
    "app/db.py": read("app/db.py"),
    "app/storage.py": read("app/storage.py"),
    "app/__init__.py": read("app/__init__.py"),
    "app/api/__init__.py": read("app/api/__init__.py"),
    "app/api/deps.py": read("app/api/deps.py"),
    "app/api/routes/__init__.py": read("app/api/routes/__init__.py"),
    "app/api/routes/session.py": read("app/api/routes/session.py"),
    "app/api/routes/transcription.py": read("app/api/routes/transcription.py"),
    "app/api/routes/consent.py": read("app/api/routes/consent.py"),
    "app/api/routes/progress.py": read("app/api/routes/progress.py"),
    "app/api/routes/leaderboard.py": read("app/api/routes/leaderboard.py"),
    "app/api/routes/community.py": read("app/api/routes/community.py"),
    "app/api/routes/admin.py": read("app/api/routes/admin.py"),
    "app/api/routes/auth.py": read("app/api/routes/auth.py"),
    "app/models/__init__.py": read("app/models/__init__.py"),
    "app/models/batch.py": read("app/models/batch.py"),
    "app/models/page.py": read("app/models/page.py"),
    "app/models/line.py": read("app/models/line.py"),
    "app/models/user.py": read("app/models/user.py"),
    "app/models/transcription.py": read("app/models/transcription.py"),
    "app/models/consent.py": read("app/models/consent.py"),
    "app/models/event.py": read("app/models/event.py"),
    "app/services/__init__.py": read("app/services/__init__.py"),
    "app/services/rules.py": read("app/services/rules.py"),
    "app/services/users.py": read("app/services/users.py"),
    "app/services/consent.py": read("app/services/consent.py"),
    "app/services/transcriptions.py": read("app/services/transcriptions.py"),
    "app/services/dispatch.py": read("app/services/dispatch.py"),
    "app/services/leaderboard.py": read("app/services/leaderboard.py"),
    # Frontend
    "frontend/dist/index.html": read("frontend/dist/index.html"),
    "frontend/dist/assets/index-BZDjzXRf.css": read("frontend/dist/assets/index-BZDjzXRf.css"),
    "frontend/dist/assets/index-C6UprdeB.js": read("frontend/dist/assets/index-C6UprdeB.js"),
    # Delete old JS bundle
    "frontend/dist/assets/index-pshrNtBC.js": None,
}

print(f"Uploading changeset with {len(changes)} file changes...")
for k, v in changes.items():
    sz = len(v) if v else 0
    print(f"  {'DEL' if v is None else 'UPD'} {k} ({sz} bytes)")

result = post(
    f"{API_BASE}/apps/{APP_ID}/changeset",
    {"message": "Deploy all backend + frontend (WorkScreen, nav, auth, landing fixes)", "changes": changes},
)
print(f"\nChangeset result: {result}")

sha = result.get("sha") or result.get("id") or (result if isinstance(result, str) else None)
if not sha:
    print("ERROR: could not extract SHA")
    import sys; sys.exit(1)

print(f"\nDeploying SHA {sha} to channel {CHANNEL_ID}...")
deploy_result = post(
    f"{API_BASE}/apps/{APP_ID}/channels/{CHANNEL_ID}/deploy",
    {"sha": sha},
)
print(f"Deploy result: {deploy_result}")
