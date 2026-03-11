const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Single global game room ───────────────────────────────────────────────────
const room = {
  story: '',
  phase: 'voting',   // 'voting' | 'revealed'
  players: [],
  history: []
};

function serialize() {
  return {
    story: room.story,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isObserver: p.isObserver,
      hasVoted: p.vote !== null,
      vote: room.phase === 'revealed' ? p.vote : null
    })),
    history: room.history.slice(-10)
  };
}

function broadcast() {
  io.emit('room-state', serialize());
}

function calcStats() {
  const nums = room.players
    .filter(p => !p.isObserver && p.vote !== null && p.vote !== '?' && p.vote !== '☕')
    .map(p => Number(p.vote));
  if (!nums.length) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = (sum / nums.length).toFixed(1);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const freq = nums.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  const consensus = nums.every(v => v === nums[0]);
  return { avg, min, max, mode, consensus };
}

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', socket => {

  // Join the game
  socket.on('join', ({ playerName, asObserver }) => {
    const name = (playerName || '').trim().slice(0, 30);
    if (!name) return socket.emit('error', { message: 'Zadejte prosím své jméno.' });

    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('error', { message: `Jméno „${name}" je již obsazeno.` });
    }
    if (!asObserver && room.players.filter(p => !p.isObserver).length >= 20) {
      return socket.emit('error', { message: 'Hra je plná (max 20 hráčů). Připojte se jako pozorovatel.' });
    }

    room.players.push({ id: socket.id, name, isObserver: !!asObserver, vote: null });
    socket.emit('joined');
    broadcast();
  });

  // Vote
  socket.on('vote', ({ vote }) => {
    if (room.phase !== 'voting') return;
    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.isObserver) return;
    p.vote = vote;
    broadcast();
  });

  // Clear own vote
  socket.on('clear-vote', () => {
    if (room.phase !== 'voting') return;
    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.isObserver) return;
    p.vote = null;
    broadcast();
  });

  // Reveal votes (any non-observer)
  socket.on('reveal-votes', () => {
    if (room.phase === 'revealed') return;
    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.isObserver) return;

    room.phase = 'revealed';
    const stats = calcStats();
    if (stats) {
      room.history.push({
        id: Date.now(),
        story: room.story || '(bez názvu)',
        avg: stats.avg,
        min: stats.min,
        max: stats.max,
        mode: stats.mode,
        consensus: stats.consensus,
        time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
      });
    }
    broadcast();
  });

  // Reset round (any non-observer)
  socket.on('reset-round', () => {
    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.isObserver) return;
    room.phase = 'voting';
    room.story = '';
    room.players.forEach(p => { p.vote = null; });
    broadcast();
  });

  // Set story
  socket.on('set-story', ({ story }) => {
    room.story = (story || '').trim().slice(0, 200);
    broadcast();
  });

  // Toggle observer mode
  socket.on('toggle-observer', () => {
    const p = room.players.find(p => p.id === socket.id);
    if (!p) return;
    if (p.isObserver && room.players.filter(p => !p.isObserver).length >= 20) {
      return socket.emit('error', { message: 'Hra je plná (max 20 hráčů).' });
    }
    p.isObserver = !p.isObserver;
    p.vote = null;
    socket.emit('observer-toggled', { isObserver: p.isObserver });
    broadcast();
  });

  // Disconnect
  socket.on('disconnect', () => {
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      broadcast();
    }
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Planning Poker běží na http://localhost:${PORT}`);
});
