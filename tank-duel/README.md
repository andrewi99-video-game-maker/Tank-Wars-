# Tank Duel — Standalone Web Game

This used to be a Chrome extension (manifest.json + background.js injecting
game.js/game.css into whatever tab you were on). It's now a normal website:
one Node server that serves the page AND handles online matchmaking.

## Run it locally

```
npm install
npm start
```

Then open http://localhost:8080 in a browser.

## Playing online — three ways

- **Quick Match** — joins a FIFO queue; whoever's next in line gets paired
  with you. Good for "anyone, right now."
- **Create Room** — generates a 5-character code and waits. Give the code
  to a specific friend.
- **Join Room** — enter a friend's code to connect straight to their game.

Each pairing (however it happens) gets its own private room on the server,
so any number of separate 1v1 games can run at the same time without
interfering with each other — the server was tested with 4 simultaneous
clients and correctly split them into two independent matches.

## Deploy it so it's actually reachable online

Any Node host works (Render, Railway, Fly.io, a VPS, etc.) since it's just
one process listening on one port for both HTTP and WebSocket traffic.
Steps are basically the same everywhere:

1. Push this folder to a Git repo (or upload it directly if the host allows).
2. Set the start command to `npm start` (or `node server.js`).
3. Don't set a fixed PORT — the server reads `process.env.PORT`, which
   these hosts set automatically. Locally it falls back to 8080.
4. Once deployed you'll get a URL like `https://your-app.onrender.com`.
   Share that — Quick Match works for anyone who lands on it at the same
   time, and Create/Join Room lets two specific people connect on purpose.

No manifest, no extension install, no separate server process to run by
hand — it's just a webpage now.

## What changed from the extension version

- Removed `manifest.json` and `background.js` (Chrome-only injection code).
- The overlay markup that used to be built at runtime via
  `overlay.innerHTML = ...` now lives directly in `index.html`.
- The WebSocket client connects to `location.host` instead of a hardcoded
  `ws://localhost:8080`, so the same code works locally and once deployed.
- `server.js` now also serves the static files — one process, one port.
- Fixed a bug where `restart-btn` was wired up with `addEventListener` but
  didn't exist in the markup (would have thrown on load).
- Added room codes (Create Room / Join Room) alongside Quick Match, so you
  can run multiple independent games on purpose instead of only ever being
  paired with whoever's next in the blind matchmaking queue.
