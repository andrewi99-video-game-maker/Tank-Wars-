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

**This will not work on Netlify, Vercel, GitHub Pages, or any other
static-site / serverless host.** Those platforms don't keep a Node process
running continuously — they either just serve static files or spin up
short-lived functions per request. This game needs one process that stays
alive holding the WebSocket connections and the in-memory game rooms, so
it needs a host that runs a persistent server.

### Deploying to Render (recommended, has a free tier)

This repo includes a `render.yaml`, so Render can pick up the config
automatically:

1. Push this folder to a GitHub (or GitLab) repo.
2. In the Render dashboard: **New > Blueprint**, then connect that repo.
   Render will read `render.yaml` and set everything up — build command
   `npm install`, start command `npm start`, free plan.
3. If you'd rather set it up manually instead of via the blueprint,
   use **New > Web Service** with these settings:
   - **Root Directory**: leave blank (this folder *is* the root — the one
     with `package.json` in it)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Runtime**: Node
   - Don't set a PORT env var — Render provides one automatically and the
     server already reads `process.env.PORT`.
4. Once it deploys you'll get a URL like `https://tank-duel.onrender.com`.
   Open that directly — that's the actual page, not a "publish directory"
   you need to point at anything.

The free Render plan spins the service down after periods of inactivity,
so the first request after a while can take ~30-60 seconds to wake back
up. That's normal, not a broken deploy.

### Other hosts that will work

Railway, Fly.io, or a plain VPS — anywhere that runs `node server.js` (or
`npm start`) as one continuously-running process. Steps are basically the
same as above minus the `render.yaml` auto-detection.

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
