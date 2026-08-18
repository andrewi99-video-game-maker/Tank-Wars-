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
const pendingRooms = new Map(); // code -> { host: ws }

function generateRoomId() {
  return Math.random().toString(36).substring(2, 9);
}

// Short, easy-to-read code for sharing with a specific friend.
// Avoids ambiguous characters (0/O, 1/I) and retries on the rare collision.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (pendingRooms.has(code));
  return code;
}

function pairPlayers(p1, p2) {
  const roomId = generateRoomId();
  p1.roomId = roomId;
  p1.role = 1;
  p2.roomId = roomId;
  p2.role = 2;

  rooms.set(roomId, { p1, p2 });

  p1.send(JSON.stringify({ type: 'match_found', role: 1, roomId }));
  p2.send(JSON.stringify({ type: 'match_found', role: 2, roomId }));
  console.log(`Match created: Room ${roomId}`);
}

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // --- Quick Match: pairs whoever is next in the FIFO queue ---
      if (data.type === 'find_match') {
        if (waitingPlayer && waitingPlayer.readyState === ws.OPEN) {
          const p1 = waitingPlayer;
          const p2 = ws;
          waitingPlayer = null;
          pairPlayers(p1, p2);
        } else {
          waitingPlayer = ws;
          ws.send(JSON.stringify({ type: 'searching' }));
          console.log('Client waiting for match...');
        }
      }

      // --- Create Room: host gets a shareable code, waits for a joiner ---
      if (data.type === 'create_room') {
        const code = generateRoomCode();
        ws.pendingCode = code;
        pendingRooms.set(code, { host: ws });
        ws.send(JSON.stringify({ type: 'room_created', code }));
        console.log(`Room ${code} created, waiting for a second player`);
      }

      // --- Join Room: pairs with the host waiting on that code ---
      if (data.type === 'join_room') {
        const code = (data.code || '').trim().toUpperCase();
        const pending = pendingRooms.get(code);
        if (pending && pending.host.readyState === ws.OPEN) {
          pendingRooms.delete(code);
          delete pending.host.pendingCode;
          pairPlayers(pending.host, ws);
        } else {
          ws.send(JSON.stringify({ type: 'join_error', message: 'Room not found or already started.' }));
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

    if (ws.pendingCode && pendingRooms.get(ws.pendingCode)?.host === ws) {
      pendingRooms.delete(ws.pendingCode);
      console.log(`Room ${ws.pendingCode} closed — host disconnected before anyone joined`);
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
