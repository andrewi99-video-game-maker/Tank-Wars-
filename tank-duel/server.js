const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

// Cloud hosts (Render, Railway, Fly.io, Glitch, etc.) assign the port via
// the PORT env var, so we fall back to 8080 only for local testing.
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

// --- Static file server (serves index.html, game.js, game.css) ---
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Prevent directory traversal outside of /public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- WebSocket matchmaking / relay server, attached to the same HTTP server ---
const wss = new WebSocketServer({ server });

let waitingPlayer = null;
const rooms = new Map(); // roomId -> { p1, p2 }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 9);
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'find_match') {
        if (waitingPlayer && waitingPlayer.readyState === ws.OPEN) {
          // Pair them
          const roomId = generateRoomId();
          const p1 = waitingPlayer;
          const p2 = ws;

          p1.roomId = roomId;
          p1.role = 1;
          p2.roomId = roomId;
          p2.role = 2;

          rooms.set(roomId, { p1, p2 });
          waitingPlayer = null;

          p1.send(JSON.stringify({ type: 'match_found', role: 1, roomId }));
          p2.send(JSON.stringify({ type: 'match_found', role: 2, roomId }));
          console.log(`Match created: Room ${roomId}`);
        } else {
          waitingPlayer = ws;
          ws.send(JSON.stringify({ type: 'searching' }));
          console.log('Client waiting for match...');
        }
      }

      // Forward game states between players in the same room
      if (data.roomId) {
        const room = rooms.get(data.roomId);
        if (room) {
          const opponent = data.role === 1 ? room.p2 : room.p1;
          if (opponent && opponent.readyState === ws.OPEN) {
            opponent.send(JSON.stringify(data));
          }
        }
      }

    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (waitingPlayer === ws) {
      waitingPlayer = null;
    }

    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        const opponent = ws.role === 1 ? room.p2 : room.p1;
        if (opponent && opponent.readyState === ws.OPEN) {
          opponent.send(JSON.stringify({ type: 'opponent_disconnected' }));
        }
        rooms.delete(ws.roomId);
        console.log(`Room ${ws.roomId} closed due to disconnection`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tank Duel running at http://localhost:${PORT}`);
});
