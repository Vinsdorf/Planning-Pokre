const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room store
const rooms = new Map();

// ── helpers ──────────────────────────────────────────────────────────────────

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function serializeRoom(room) {
  return {
    code: room.code,
    story: room.story,
    phase: room.phase,   // 'voting' | 'revealed'
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isObserver: p.isObserver,
      isAdmin: p.isAdmin,
      hasVoted: p.vote !== null,
      vote: room.phase === 'revealed' ? p.vote : null
    })),
    history: room.history.slice(-10)
  };
}

function calcStats(players) {
  const numericVotes = players
    .filter(p => !p.isObserver && p.vote !== null && p.vote !== '?' && p.vote !== '☕')
    .map(p => Number(p.vote));

  if (numericVotes.length === 0) return null;

  const sum = numericVotes.reduce((a, b) => a + b, 0);
  const avg = (sum / numericVotes.length).toFixed(1);
  const min = Math.min(...numericVotes);
  const max = Math.max(...numericVotes);
  const freq = numericVotes.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  const consensus = numericVotes.every(v => v === numericVotes[0]);

  return { avg, min, max, mode, consensus };
}

function broadcast(roomCode) {
  const room = rooms.get(roomCode);
  if (room) io.to(roomCode).emit('room-state', serializeRoom(room));
}

// ── socket events ─────────────────────────────────────────────────────────────

io.on('connection', socket => {

  // Create a new room
  socket.on('create-room', ({ playerName }) => {
    if (!playerName || !playerName.trim()) {
      return socket.emit('error', { message: 'Zadejte prosím své jméno.' });
    }
    const code = generateRoomCode();
    const room = {
      code,
      story: '',
      phase: 'voting',
      players: [{
        id: socket.id,
        name: playerName.trim().slice(0, 30),
        isObserver: false,
        isAdmin: true,
        vote: null
      }],
      history: []
    };
    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room-joined', { code, isAdmin: true });
    broadcast(code);
  });

  // Join existing room
  socket.on('join-room', ({ roomCode, playerName }) => {
    const code = (roomCode || '').toUpperCase().trim();
    if (!playerName || !playerName.trim()) {
      return socket.emit('error', { message: 'Zadejte prosím své jméno.' });
    }
    const room = rooms.get(code);
    if (!room) {
      return socket.emit('error', { message: `Místnost „${code}" neexistuje.` });
    }
    const name = playerName.trim().slice(0, 30);
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('error', { message: `Jméno „${name}" je již obsazeno.` });
    }
    const activePlayers = room.players.filter(p => !p.isObserver).length;
    if (activePlayers >= 20) {
      return socket.emit('error', { message: 'Místnost je plná (max 20 hráčů).' });
    }
    room.players.push({ id: socket.id, name, isObserver: false, isAdmin: false, vote: null });
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room-joined', { code, isAdmin: false });
    broadcast(code);
  });

  // Vote
  socket.on('vote', ({ vote }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase !== 'voting') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isObserver) return;
    player.vote = vote;
    broadcast(socket.roomCode);
  });

  // Clear own vote
  socket.on('clear-vote', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase !== 'voting') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isObserver) return;
    player.vote = null;
    broadcast(socket.roomCode);
  });

  // Reveal votes (any non-observer player)
  socket.on('reveal-votes', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.phase === 'revealed') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isObserver) return;

    room.phase = 'revealed';
    const stats = calcStats(room.players);

    if (stats) {
      const voteEntries = room.players
        .filter(p => !p.isObserver)
        .map(p => ({ name: p.name, vote: p.vote }));
      room.history.push({
        id: Date.now(),
        story: room.story || '(bez názvu)',
        votes: voteEntries,
        avg: stats.avg,
        min: stats.min,
        max: stats.max,
        mode: stats.mode,
        consensus: stats.consensus,
        revealedBy: player.name,
        time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
      });
    }
    broadcast(socket.roomCode);
  });

  // Reset round (any non-observer player)
  socket.on('reset-round', ({ newStory }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.isObserver) return;
    room.phase = 'voting';
    room.story = typeof newStory === 'string' ? newStory.trim().slice(0, 200) : '';
    room.players.forEach(p => { p.vote = null; });
    broadcast(socket.roomCode);
  });

  // Set story title
  socket.on('set-story', ({ story }) => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    room.story = (story || '').trim().slice(0, 200);
    broadcast(socket.roomCode);
  });

  // Toggle observer mode
  socket.on('toggle-observer', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Can't toggle to active when room is full
    if (player.isObserver) {
      const activePlayers = room.players.filter(p => !p.isObserver).length;
      if (activePlayers >= 20) {
        return socket.emit('error', { message: 'Místnost je plná (max 20 hráčů).' });
      }
    }
    player.isObserver = !player.isObserver;
    player.vote = null;
    socket.emit('observer-toggled', { isObserver: player.isObserver });
    broadcast(socket.roomCode);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    const idx = room.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;

    const wasAdmin = room.players[idx].isAdmin;
    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      rooms.delete(socket.roomCode);
      return;
    }
    if (wasAdmin) {
      room.players[0].isAdmin = true;
    }
    broadcast(socket.roomCode);
  });
});

// ── start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🃏 Planning Poker běží na http://localhost:${PORT}`);
});
