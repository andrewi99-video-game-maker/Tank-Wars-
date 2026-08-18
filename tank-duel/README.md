# Tank Duel — Standalone Web Game

This used to be a Chrome extension (manifest.json + background.js injecting
game.js/game.css into whatever tab you were on). It's now a normal website:
one Node server that serves the page AND handles online matchmaking.

## Run it locally

```
npm install
npm start
```

Then open http://localhost:8080 in a browser. Open it in two tabs/windows
(or on two different computers on the same network, using your machine's
local IP instead of localhost) and click "PLAY ONLINE" in both to test
matchmaking.

## Deploy it so it's actually reachable online

Any Node host works (Render, Railway, Fly.io, a VPS, etc.) since it's just
one process listening on one port for both HTTP and WebSocket traffic.
Steps are basically the same everywhere:

1. Push this folder to a Git repo (or upload it directly if the host allows).
2. Set the start command to `npm start` (or `node server.js`).
3. Don't set a fixed PORT — the server reads `process.env.PORT`, which
   these hosts set automatically. Locally it falls back to 8080.
4. Once deployed you'll get a URL like `https://your-app.onrender.com`.
   Share that — anyone who opens it and clicks "PLAY ONLINE" will be
   matched with whoever else is waiting.

No manifest, no extension install, no separate server process to run by
hand — it's just a webpage now.

## What changed from the extension version

- Removed `manifest.json` and `background.js` (Chrome-only injection code).
- The overlay markup that used to be built at runtime via
  `overlay.innerHTML = ...` now lives directly in `index.html`.
- `game.js` no longer toggles itself on/off via a custom `cleanup` event —
  it just runs once when the page loads.
- The WebSocket client connects to `location.host` instead of a hardcoded
  `ws://localhost:8080`, so the same code works locally and once deployed.
- `server.js` now also serves the static files (`index.html`, `game.js`,
  `game.css`) instead of just running the WebSocket relay — one process,
  one port.
- Fixed a bug where `restart-btn` was wired up with `addEventListener` but
  didn't exist in the markup (would have thrown on load).
