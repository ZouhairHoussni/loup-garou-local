# Loup-Garou MVP (Local) — Smooth Pack

This pack runs **everything from one FastAPI server**:
- **TV/Narrator** UI: `/tv/`
- **Player** UI: `/player/`
- Shared assets: `/static/` (CSS + `cards/`)

No more separate `python -m http.server` processes.

## 1) Install

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
```

## 2) Run backend

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

## 3) Open the UIs

- TV screen: `http://127.0.0.1:8000/tv/`
- Player: `http://127.0.0.1:8000/player/?name=Alice&autojoin=1`

Bots:
- Add `&bot=1` to auto-play as a bot.

## 4) Spawn multiple players (Windows)

From PowerShell in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\spawn_players.ps1 -Count 6 -Bot
```

By default it opens: `http://127.0.0.1:8000/player/`

## 5) Cards

Place your real card images in:

```
web/static/cards/
```

This pack ships with **placeholder PNG cards**:
- verso.png
- villageois.png
- loup-garou.png
- voyante.png
- sorciere.png
- cupidon.png

If your filenames differ, edit the `CARD_FILES` mapping in `web/static/shared.js`.

## Troubleshooting quick checks

- If TV shows no players: make sure you opened **/tv/** (not an old port 3000/3001 static server).
- If you see WS disconnected (red dot): backend not running or port mismatch.
- If you changed the backend port, add `?backendPort=XXXX` to the URL (TV and players).
