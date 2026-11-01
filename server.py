"""Argent Citadel of Halazar site and calendar server. Standard library only.

Environment variables:
  CALENDAR_PASSWORD  Admin password. Without it, the admin login stays disabled.
  HOST               Bind address (default 127.0.0.1).
  PORT               Port (default 8123).
  CALENDAR_DATA      Path to the events file (default data/events.json).
"""
import hmac
import http.cookies
import json
import os
import re
import secrets
import threading
import time
import uuid
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = Path(os.environ.get("CALENDAR_DATA", ROOT / "data" / "events.json"))
PASSWORD = os.environ.get("CALENDAR_PASSWORD", "")
SESSION_SECONDS = 12 * 60 * 60
MAX_BODY = 16 * 1024
COOKIE = "calendar_session"
FIELD_LIMITS = {"title": 120, "time": 60, "location": 200, "description": 2000, "url": 500}

lock = threading.Lock()
sessions = {}


def load_events():
    with DATA.open(encoding="utf-8") as f:
        return json.load(f)


def save_events(events):
    events.sort(key=lambda e: (e["date"], e["title"].lower()))
    temp = DATA.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(temp, DATA)


def parse_date(value, name):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{name} must be a date")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise ValueError(f"{name} must be a real date") from None
    return value


def clean_event(body):
    if not isinstance(body, dict):
        raise ValueError("Invalid event")
    event = {"date": parse_date(body.get("date"), "Date")}
    for field, limit in FIELD_LIMITS.items():
        value = body.get(field) or ""
        if not isinstance(value, str):
            raise ValueError(f"{field} must be text")
        value = value.strip()
        if len(value) > limit:
            raise ValueError(f"{field} is limited to {limit} characters")
        if value:
            event[field] = value
    if "title" not in event:
        raise ValueError("Title is required")
    if "url" in event and not re.match(r"https?://[^\s]+$", event["url"], re.I):
        raise ValueError("Link must start with http:// or https://")
    if body.get("end"):
        event["end"] = parse_date(body["end"], "End date")
        if event["end"] < event["date"]:
            raise ValueError("End date is before the start date")
    if body.get("weekly"):
        if "end" in event:
            raise ValueError("A weekly event cannot also have an end date")
        event["weekly"] = True
        if body.get("until"):
            event["until"] = parse_date(body["until"], "Repeat until")
            if event["until"] < event["date"]:
                raise ValueError("Repeat until is before the start date")
    if body.get("skipNext"):
        event["skipNext"] = True
    return event


class Handler(SimpleHTTPRequestHandler):
    server_version = "Halazar"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)

    def api_path(self):
        return urlsplit(self.path).path

    def send_json(self, status, payload, headers=()):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def session_token(self):
        cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
        return cookies[COOKIE].value if COOKIE in cookies else ""

    def authenticated(self):
        token = self.session_token()
        with lock:
            expires = sessions.get(token, 0)
            if expires and expires < time.time():
                del sessions[token]
                return False
        return expires > 0

    def session_cookie(self, value, max_age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return f"{COOKIE}={value}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict{secure}"

    def read_json(self):
        if self.headers.get_content_type() != "application/json":
            raise ValueError("Expected JSON")
        length = self.headers.get("Content-Length", "")
        if not length.isdigit() or int(length) > MAX_BODY:
            self.close_connection = True
            raise ValueError("Request is too large")
        try:
            return json.loads(self.rfile.read(int(length)))
        except ValueError:
            raise ValueError("Invalid JSON") from None

    def require_auth(self):
        if self.authenticated():
            return True
        self.send_json(401, {"error": "Please log in"})
        return False

    def do_GET(self):
        path = self.api_path()
        if path == "/api/events":
            with lock:
                self.send_json(200, load_events())
        elif path == "/api/session":
            self.send_json(200, {"authenticated": self.authenticated(), "enabled": bool(PASSWORD)})
        elif path.startswith("/api/"):
            self.send_json(404, {"error": "Not found"})
        else:
            super().do_GET()

    def do_HEAD(self):
        if self.api_path().startswith("/api/"):
            self.send_error(405)
        else:
            super().do_HEAD()

    def do_POST(self):
        path = self.api_path()
        try:
            if path == "/api/login":
                self.login()
            elif path == "/api/logout":
                self.logout()
            elif path == "/api/events":
                self.create_event()
            else:
                self.send_json(404, {"error": "Not found"})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_PUT(self):
        try:
            self.update_event()
        except ValueError as error:
            self.send_json(400, {"error": str(error)})

    def do_DELETE(self):
        if not self.require_auth():
            return
        event_id = self.event_id()
        with lock:
            events = load_events()
            remaining = [e for e in events if e["id"] != event_id]
            if len(remaining) == len(events):
                self.send_json(404, {"error": "Event not found"})
                return
            save_events(remaining)
        self.send_json(200, {"ok": True})

    def event_id(self):
        match = re.fullmatch(r"/api/events/([0-9a-f]{32})", self.api_path())
        return match.group(1) if match else ""

    def login(self):
        if not PASSWORD:
            self.send_json(503, {"error": "Set CALENDAR_PASSWORD to enable admin login"})
            return
        body = self.read_json()
        supplied = body.get("password") if isinstance(body, dict) else None
        if not isinstance(supplied, str) or not hmac.compare_digest(supplied.encode(), PASSWORD.encode()):
            time.sleep(1)
            self.send_json(401, {"error": "Wrong password"})
            return
        token = secrets.token_urlsafe(32)
        now = time.time()
        with lock:
            for key in [k for k, v in sessions.items() if v < now]:
                del sessions[key]
            sessions[token] = now + SESSION_SECONDS
        self.send_json(200, {"ok": True}, [("Set-Cookie", self.session_cookie(token, SESSION_SECONDS))])

    def logout(self):
        with lock:
            sessions.pop(self.session_token(), None)
        self.send_json(200, {"ok": True}, [("Set-Cookie", self.session_cookie("", 0))])

    def create_event(self):
        if not self.require_auth():
            return
        event = clean_event(self.read_json())
        event["id"] = uuid.uuid4().hex
        with lock:
            events = load_events()
            events.append(event)
            save_events(events)
        self.send_json(201, event)

    def update_event(self):
        if not self.require_auth():
            return
        event_id = self.event_id()
        event = clean_event(self.read_json())
        event["id"] = event_id
        with lock:
            events = load_events()
            for index, existing in enumerate(events):
                if existing["id"] == event_id:
                    events[index] = event
                    save_events(events)
                    self.send_json(200, event)
                    return
        self.send_json(404, {"error": "Event not found"})


def main():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    if not DATA.exists():
        DATA.write_text("[]\n", encoding="utf-8")
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8123"))
    if not PASSWORD:
        print("CALENDAR_PASSWORD is not set, so admin login is disabled.", flush=True)
    # On Windows, address reuse lets a second server silently share the port.
    ThreadingHTTPServer.allow_reuse_address = os.name != "nt"
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Serving on http://{host}:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
