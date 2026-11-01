# Argent Citadel of Halazar site

The site is in `public/`. `server.py` serves it and runs the calendar, using only the
Python standard library (3.7 or later).

## Run it

Set a long random admin password, then start the server:

```powershell
$env:CALENDAR_PASSWORD = "your-long-password"
python server.py
```

- Site: http://127.0.0.1:8123
- Calendar admin: http://127.0.0.1:8123/admin.html (not linked from the site)

Without `CALENDAR_PASSWORD`, the site and public calendar still work, and admin login is off.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `CALENDAR_PASSWORD` | none | Admin password |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `8123` | Port |
| `CALENDAR_DATA` | `data/events.json` | Events file |

## Publishing with GitHub Pages

Pushing to `main` runs `.github/workflows/pages.yml`, which publishes `public/` and
`data/events.json`, leaving out the admin page. Pages must be set to deploy from GitHub
Actions under **Settings → Pages**.

GitHub Pages can't run `server.py`, so manage events locally:

1. Start the server and add events at `/admin.html`.
2. Commit and push `data/events.json`:

```powershell
git add data/events.json
git commit -m "Update events"
git push
```

## Hosting with Python instead

To edit events online, run `server.py` as a service behind a reverse proxy that handles
HTTPS, and keep it bound to `127.0.0.1`. The admin password and session cookie must
travel over HTTPS. The proxy must send `X-Forwarded-Proto: https` so the cookie is
marked Secure.

Keep one server process running: sessions are held in memory, so a restart logs you
out, and the events file is only locked within a single process.

Back up `data/events.json`, and store it outside the deploy path with `CALENDAR_DATA`
so a redeploy can't overwrite it.

## API

| Method | Path | Login needed | Purpose |
|---|---|---|---|
| GET | `/api/events` | No | List events |
| POST | `/api/events` | Yes | Add an event |
| PUT | `/api/events/<id>` | Yes | Replace an event |
| DELETE | `/api/events/<id>` | Yes | Delete an event |
| POST | `/api/login`, `/api/logout` | No | Start or end a session |
| GET | `/api/session` | No | Check login state |
