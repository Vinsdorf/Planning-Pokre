/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker – Client
   ═══════════════════════════════════════════════════════════════════════════ */

const FIBONACCI_CARDS = ['1', '2', '3', '5', '8', '13', '?', '☕'];

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  socket: null,
  roomCode: null,
  myName: null,
  isObserver: false,
  selectedVote: null,
  roomState: null
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  // Screens
  landing: $('screen-landing'),
  game:    $('screen-game'),
  // Landing
  createName: $('create-name'),
  createBtn:  $('create-btn'),
  joinName:   $('join-name'),
  joinCode:   $('join-code'),
  joinBtn:    $('join-btn'),
  // Header
  roomCodeDisplay: $('room-code-display'),
  copyCodeBtn:     $('copy-code-btn'),
  leaveBtn:        $('leave-btn'),
  // Sidebar
  playerList:       $('player-list'),
  playerCountBadge: $('player-count-badge'),
  observerToggle:   $('observer-toggle'),
  historyList:      $('history-list'),
  // Main
  storyInput:         $('story-input'),
  setStoryBtn:        $('set-story-btn'),
  currentStoryDisplay:$('current-story-display'),
  statusText:         $('status-text'),
  voteTally:          $('vote-tally'),
  progressFill:       $('progress-fill'),
  cardsSection:       $('cards-section'),
  cardsContainer:     $('cards-container'),
  observerHint:       $('observer-hint'),
  resultsSection:     $('results-section'),
  resultsVotesGrid:   $('results-votes-grid'),
  statAvg:            $('stat-avg'),
  statMode:           $('stat-mode'),
  statRange:          $('stat-range'),
  statConsensus:      $('stat-consensus'),
  consensusChip:      $('consensus-chip'),
  revealBtn:          $('reveal-btn'),
  resetBtn:           $('reset-btn'),
  toast:              $('toast'),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.className = 'toast'; }, 3000);
}

// ── Screen switch ─────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

// ── Socket connect ────────────────────────────────────────────────────────────
function initSocket() {
  if (state.socket) return;
  state.socket = io();

  state.socket.on('room-joined', ({ code, isAdmin }) => {
    state.roomCode = code;
    dom.roomCodeDisplay.textContent = code;
    showScreen('game');
    showToast(`Připojeno do místnosti ${code}`, 'success');
  });

  state.socket.on('room-state', roomState => {
    state.roomState = roomState;
    const me = roomState.players.find(p => p.id === state.socket.id);
    if (me) {
      state.isObserver = me.isObserver;
      // Sync observer toggle
      dom.observerToggle.checked = me.isObserver;
    }
    renderAll(roomState);
  });

  state.socket.on('observer-toggled', ({ isObserver }) => {
    state.isObserver = isObserver;
    if (isObserver) {
      state.selectedVote = null;
      highlightCard(null);
    }
    showToast(isObserver ? '👁 Jste nyní pozorovatel' : '✏️ Zpět do hlasování');
  });

  state.socket.on('error', ({ message }) => {
    showToast(message, 'error');
  });

  state.socket.on('disconnect', () => {
    showToast('Spojení přerušeno. Obnovte stránku.', 'error');
  });
}

// ── Build cards ───────────────────────────────────────────────────────────────
function buildCards() {
  dom.cardsContainer.innerHTML = '';
  FIBONACCI_CARDS.forEach(val => {
    const card = document.createElement('button');
    card.className = 'poker-card';
    card.dataset.val = val;
    card.textContent = val;
    card.setAttribute('aria-label', `Hlasovat: ${val}`);
    card.addEventListener('click', () => onCardClick(val, card));
    dom.cardsContainer.appendChild(card);
  });
}

function onCardClick(val, cardEl) {
  if (state.isObserver) return;
  const room = state.roomState;
  if (!room || room.phase === 'revealed') return;

  if (state.selectedVote === val) {
    // Deselect
    state.selectedVote = null;
    state.socket.emit('clear-vote');
    highlightCard(null);
  } else {
    state.selectedVote = val;
    state.socket.emit('vote', { vote: val });
    highlightCard(val);
  }
}

function highlightCard(val) {
  document.querySelectorAll('.poker-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.val === val);
  });
}

function setCardsDisabled(disabled) {
  document.querySelectorAll('.poker-card').forEach(c => {
    c.classList.toggle('disabled', disabled);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll(room) {
  renderPlayerList(room);
  renderStatus(room);
  renderCards(room);
  renderResults(room);
  renderHistory(room);
  renderStory(room);
  renderActionButtons(room);
}

function renderPlayerList(room) {
  const voters = room.players.filter(p => !p.isObserver);
  const observers = room.players.filter(p => p.isObserver);
  const total = voters.length;

  dom.playerCountBadge.textContent = room.players.length;
  dom.playerList.innerHTML = '';

  const renderItem = player => {
    const isMe = player.id === state.socket.id;
    const li = document.createElement('li');
    li.className = `player-item ${isMe ? 'is-me' : ''}`;

    // Avatar
    const av = document.createElement('div');
    av.className = 'player-avatar';
    av.textContent = player.name.charAt(0).toUpperCase();

    // Info
    const info = document.createElement('div');
    info.className = 'player-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name + (isMe ? ' (Já)' : '');
    info.appendChild(nameEl);

    if (player.isAdmin) {
      const tag = document.createElement('span');
      tag.className = 'player-role-tag';
      tag.textContent = '⭐ Vedoucí';
      info.appendChild(tag);
    }

    // Vote icon
    const voteEl = document.createElement('div');
    voteEl.className = 'player-vote-icon';

    if (player.isObserver) {
      voteEl.classList.add('vote-observer');
      voteEl.textContent = '👁';
    } else if (room.phase === 'revealed') {
      voteEl.classList.add('vote-revealed');
      voteEl.textContent = player.vote ?? '–';
    } else if (player.hasVoted) {
      voteEl.classList.add('vote-cast');
      voteEl.textContent = '✓';
    } else {
      voteEl.classList.add('vote-pending');
      voteEl.textContent = '…';
    }

    li.appendChild(av);
    li.appendChild(info);
    li.appendChild(voteEl);
    dom.playerList.appendChild(li);
  };

  voters.forEach(renderItem);
  observers.forEach(renderItem);
}

function renderStatus(room) {
  const voters = room.players.filter(p => !p.isObserver);
  const voted = voters.filter(p => p.hasVoted).length;
  const total = voters.length;
  const pct = total === 0 ? 0 : Math.round((voted / total) * 100);

  dom.progressFill.style.width = `${pct}%`;
  dom.voteTally.textContent = total > 0 ? `${voted} / ${total}` : '';

  if (room.phase === 'revealed') {
    dom.statusText.textContent = '🎉 Hlasy odhaleny!';
    dom.progressFill.style.width = '100%';
    dom.voteTally.textContent = '';
  } else if (voted === total && total > 0) {
    dom.statusText.textContent = '✅ Všichni hlasovali – připraveni odhalit!';
  } else if (voted === 0) {
    dom.statusText.textContent = 'Vyberte kartu a hlasujte';
  } else {
    dom.statusText.textContent = 'Čekáme na ostatní hráče…';
  }
}

function renderCards(room) {
  const isRevealed = room.phase === 'revealed';
  const me = room.players.find(p => p.id === state.socket.id);
  const isObserver = me?.isObserver ?? state.isObserver;

  dom.observerHint.classList.toggle('hidden', !isObserver);
  setCardsDisabled(isObserver || isRevealed);

  // Restore own selection
  if (!isRevealed && !isObserver) {
    const me2 = room.players.find(p => p.id === state.socket.id);
    if (me2 && me2.hasVoted && state.selectedVote) {
      highlightCard(state.selectedVote);
    } else if (!me2?.hasVoted) {
      highlightCard(null);
      state.selectedVote = null;
    }
  } else {
    highlightCard(null);
  }
}

function renderResults(room) {
  const revealed = room.phase === 'revealed';
  dom.resultsSection.classList.toggle('hidden', !revealed);
  if (!revealed) return;

  // Vote cards grid
  dom.resultsVotesGrid.innerHTML = '';
  const nonObservers = room.players.filter(p => !p.isObserver);

  nonObservers.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'result-card';
    div.style.animationDelay = `${i * 60}ms`;

    const chip = document.createElement('div');
    chip.className = `result-vote-chip ${p.vote == null ? 'no-vote' : ''}`;
    chip.textContent = p.vote ?? '–';

    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = p.name;

    div.appendChild(chip);
    div.appendChild(name);
    dom.resultsVotesGrid.appendChild(div);
  });

  // Stats
  const numericVotes = nonObservers
    .filter(p => p.vote !== null && p.vote !== '?' && p.vote !== '☕')
    .map(p => Number(p.vote));

  if (numericVotes.length === 0) {
    dom.statAvg.textContent = '–';
    dom.statMode.textContent = '–';
    dom.statRange.textContent = '–';
    dom.statConsensus.textContent = '–';
    dom.consensusChip.className = 'stat-chip';
    return;
  }

  const sum = numericVotes.reduce((a, b) => a + b, 0);
  const avg = (sum / numericVotes.length).toFixed(1);
  const min = Math.min(...numericVotes);
  const max = Math.max(...numericVotes);
  const freq = numericVotes.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  const consensus = numericVotes.every(v => v === numericVotes[0]);

  dom.statAvg.textContent = avg;
  dom.statMode.textContent = mode;
  dom.statRange.textContent = min === max ? `${min}` : `${min} – ${max}`;
  dom.statConsensus.textContent = consensus ? '✓ Shoda!' : '✗ Neshoda';
  dom.consensusChip.className = `stat-chip ${consensus ? 'consensus-yes' : 'consensus-no'}`;
}

function renderHistory(room) {
  if (!room.history || room.history.length === 0) {
    dom.historyList.innerHTML = '<p class="empty-hint">Žádná kola zatím.</p>';
    return;
  }
  dom.historyList.innerHTML = '';
  // Show most recent first
  const items = [...room.history].reverse();
  items.forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item';

    const story = document.createElement('div');
    story.className = 'history-story';
    story.textContent = h.story;

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.innerHTML = `
      <span>Průměr: <span class="history-avg">${h.avg ?? '–'}</span></span>
      <span class="${h.consensus ? 'history-consensus-ok' : 'history-consensus-no'}">${h.consensus ? '✓ Shoda' : '≠ Neshoda'}</span>
    `;
    const time = document.createElement('div');
    time.className = 'history-meta';
    time.style.color = 'var(--gray400)';
    time.textContent = h.time ?? '';

    div.appendChild(story);
    div.appendChild(meta);
    if (h.time) div.appendChild(time);
    dom.historyList.appendChild(div);
  });
}

function renderStory(room) {
  const hasStory = room.story && room.story.trim().length > 0;
  dom.currentStoryDisplay.classList.toggle('hidden', !hasStory);
  if (hasStory) {
    dom.currentStoryDisplay.textContent = `📋 ${room.story}`;
    dom.storyInput.value = room.story;
  }
}

function renderActionButtons(room) {
  const isRevealed = room.phase === 'revealed';
  const voters = room.players.filter(p => !p.isObserver);
  const allVoted = voters.length > 0 && voters.every(p => p.hasVoted);
  const me = room.players.find(p => p.id === state.socket.id);
  const isObserver = me?.isObserver ?? state.isObserver;

  dom.revealBtn.classList.toggle('hidden', isRevealed || isObserver);
  dom.resetBtn.classList.toggle('hidden', !isRevealed || isObserver);

  // Pulse reveal button when all voted
  dom.revealBtn.classList.toggle('pulse', allVoted && !isRevealed);
}

// ── Events ────────────────────────────────────────────────────────────────────
function attachEvents() {
  // Landing
  dom.createBtn.addEventListener('click', () => {
    const name = dom.createName.value.trim();
    if (!name) { showToast('Zadejte své jméno', 'error'); return; }
    state.myName = name;
    state.socket.emit('create-room', { playerName: name });
  });

  dom.joinBtn.addEventListener('click', joinRoom);
  dom.joinCode.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  dom.joinName.addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  dom.createName.addEventListener('keydown', e => { if (e.key === 'Enter') dom.createBtn.click(); });

  function joinRoom() {
    const name = dom.joinName.value.trim();
    const code = dom.joinCode.value.trim().toUpperCase();
    if (!name) { showToast('Zadejte své jméno', 'error'); return; }
    if (!code) { showToast('Zadejte kód místnosti', 'error'); return; }
    state.myName = name;
    state.socket.emit('join-room', { playerName: name, roomCode: code });
  }

  // Header
  dom.copyCodeBtn.addEventListener('click', () => {
    if (!state.roomCode) return;
    const url = `${location.origin}?room=${state.roomCode}`;
    navigator.clipboard.writeText(url).then(() => showToast('Odkaz zkopírován!', 'success'))
      .catch(() => {
        navigator.clipboard.writeText(state.roomCode).then(() => showToast('Kód zkopírován!', 'success'));
      });
  });

  dom.leaveBtn.addEventListener('click', () => {
    if (confirm('Opustit místnost?')) {
      state.socket.disconnect();
      location.reload();
    }
  });

  // Story
  dom.setStoryBtn.addEventListener('click', sendStory);
  dom.storyInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendStory(); });
  function sendStory() {
    const story = dom.storyInput.value.trim();
    state.socket.emit('set-story', { story });
  }

  // Observer toggle
  dom.observerToggle.addEventListener('change', () => {
    state.socket.emit('toggle-observer');
  });

  // Action buttons
  dom.revealBtn.addEventListener('click', () => {
    state.socket.emit('reveal-votes');
  });

  dom.resetBtn.addEventListener('click', () => {
    state.selectedVote = null;
    highlightCard(null);
    state.socket.emit('reset-round', { newStory: '' });
    dom.storyInput.value = '';
  });
}

// ── URL room code autofill ────────────────────────────────────────────────────
function checkURLRoom() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    dom.joinCode.value = room.toUpperCase();
    dom.joinName.focus();
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  buildCards();
  initSocket();
  attachEvents();
  checkURLRoom();
})();
