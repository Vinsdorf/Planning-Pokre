/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker – Client
   ═══════════════════════════════════════════════════════════════════════════ */

const FIBONACCI_CARDS = ['1', '2', '3', '5', '8', '13'];

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  socket: null,
  myName: null,
  isObserver: false,
  selectedVote: null,
  roomState: null,
  inGame: false       // true after first successful join
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
  // Landing
  playerName:  $('player-name'),
  joinBtn:     $('join-btn'),
  // Header
  shareBtn:  $('share-btn'),
  leaveBtn:  $('leave-btn'),
  // Sidebar
  playerList:       $('player-list'),
  playerCountBadge: $('player-count-badge'),
  observerToggle:   $('observer-toggle'),
  historyList:      $('history-list'),
  clearHistoryBtn:  $('clear-history-btn'),
  // Main
  storyInput:          $('story-input'),
  setStoryBtn:         $('set-story-btn'),
  currentStoryDisplay: $('current-story-display'),
  statusText:          $('status-text'),
  voteTally:           $('vote-tally'),
  progressFill:        $('progress-fill'),
  cardsContainer:      $('cards-container'),
  observerHint:        $('observer-hint'),
  resultsSection:      $('results-section'),
  resultsVotesGrid:    $('results-votes-grid'),
  statConsensus:       $('stat-consensus'),
  consensusChip:          $('consensus-chip'),
  resetBtn:               $('reset-btn'),
  finalEstimateSection:   $('final-estimate-section'),
  finalEstimateCards:     $('final-estimate-cards'),
  toast:               $('toast'),
  // Chat
  chatMessages:  $('chat-messages'),
  chatInput:     $('chat-input'),
  chatSendBtn:   $('chat-send-btn'),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  dom.toast.textContent = msg;
  dom.toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { dom.toast.className = 'toast'; }, 3000);
}

// ── Overlay helpers ───────────────────────────────────────────────────────────
function hideLanding() {
  $('screen-landing').classList.add('hidden');
}

// ── Connection status (shown on landing) ──────────────────────────────────────
function setConnStatus(state, text) {
  // state: 'connecting' | 'ok' | 'error'
  const el = $('conn-status');
  el.className = `conn-status conn-${state}`;
  $('conn-text').textContent = text;
  dom.joinBtn.disabled = (state !== 'ok');
}

// ── Socket ────────────────────────────────────────────────────────────────────
let reconnectToastTimer;

function initSocket() {
  // Guard: socket.io.js may fail to load (server not running, 404, etc.)
  if (typeof io === 'undefined') {
    setConnStatus('error', 'Nelze načíst server – spusťte: node server.js');
    return;
  }

  // Polling first (works everywhere, including proxies/firewalls), then upgrades to WebSocket.
  state.socket = io({
    transports: ['polling', 'websocket'],
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  state.socket.on('connect_error', () => {
    setConnStatus('connecting', 'Připojování…');
  });

  // Fires on initial connect AND after every successful reconnect.
  // We use state.myName (set on first join attempt) as the signal to rejoin.
  // Socket.io does NOT buffer events across reconnects, so we must re-emit
  // 'join' manually whenever the socket reconnects.
  state.socket.on('connect', () => {
    clearTimeout(reconnectToastTimer);
    setConnStatus('ok', 'Připojeno');
    if (state.myName) {
      state.socket.emit('join', { playerName: state.myName, asObserver: state.isObserver });
    }
  });

  state.socket.on('joined', () => {
    const firstJoin = !state.inGame;
    state.inGame = true;
    hideLanding();
    if (firstJoin) showToast('Připojeno!', 'success');
  });

  state.socket.on('room-state', roomState => {
    state.roomState = roomState;
    const me = roomState.players.find(p => p.id === state.socket.id);
    if (me) {
      state.isObserver = me.isObserver;
      dom.observerToggle.checked = me.isObserver;
    }
    renderAll(roomState);
  });

  state.socket.on('observer-toggled', ({ isObserver }) => {
    state.isObserver = isObserver;
    if (isObserver) { state.selectedVote = null; highlightCard(null); }
    showToast(isObserver ? '👁 Jste nyní pozorovatel' : '✏️ Zpět do hlasování');
  });

  state.socket.on('error', ({ message }) => {
    showToast(message, 'error');
    // If not yet in the game, make sure the landing is still visible
    if (!state.inGame) {
      $('screen-landing').classList.remove('hidden');
    }
  });

  state.socket.on('chat-message', ({ name, text, time }) => {
    appendChatMessage(name, text, time);
  });

  // Don't show an error immediately – Socket.io reconnects automatically.
  // Only show a hint after 3 s if still trying.
  state.socket.on('disconnect', reason => {
    if (reason === 'io client disconnect') return; // intentional leave
    if (!state.inGame) {
      setConnStatus('connecting', 'Obnovuji spojení…');
      return;
    }
    reconnectToastTimer = setTimeout(() => showToast('Obnovuji spojení…'), 3000);
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function appendChatMessage(name, text, time) {
  const mine = name === state.myName;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${mine ? 'chat-msg-mine' : 'chat-msg-other'}`;

  const meta = document.createElement('div');
  meta.className = 'chat-msg-meta';
  meta.textContent = mine ? time : `${name} · ${time}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';
  bubble.textContent = text;

  wrap.appendChild(meta);
  wrap.appendChild(bubble);
  dom.chatMessages.appendChild(wrap);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function buildCards() {
  dom.cardsContainer.innerHTML = '';
  FIBONACCI_CARDS.forEach(val => {
    const card = document.createElement('button');
    card.className = 'poker-card';
    card.dataset.val = val;
    card.textContent = val;
    card.setAttribute('aria-label', `Hlasovat: ${val}`);
    card.addEventListener('click', () => {
      if (state.isObserver) return;
      if (!state.roomState || state.roomState.phase === 'revealed') return;
      if (state.selectedVote === val) {
        state.selectedVote = null;
        state.socket.emit('clear-vote');
        highlightCard(null);
      } else {
        state.selectedVote = val;
        state.socket.emit('vote', { vote: val });
        highlightCard(val);
      }
    });
    dom.cardsContainer.appendChild(card);
  });
}

function highlightCard(val) {
  document.querySelectorAll('.poker-card').forEach(c => c.classList.toggle('selected', c.dataset.val === val));
}
function setCardsDisabled(disabled) {
  document.querySelectorAll('.poker-card').forEach(c => c.classList.toggle('disabled', disabled));
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll(room) {
  renderPlayerList(room);
  renderStatus(room);
  renderCards(room);
  renderResults(room);
  renderFinalEstimate(room);
  renderHistory(room);
  renderStory(room);
  renderActionButtons(room);
}

function renderPlayerList(room) {
  dom.playerCountBadge.textContent = room.players.length;
  dom.playerList.innerHTML = '';
  const voters = room.players.filter(p => !p.isObserver);
  const observers = room.players.filter(p => p.isObserver);

  [...voters, ...observers].forEach(player => {
    const isMe = player.id === state.socket.id;
    const li = document.createElement('li');
    li.className = `player-item ${isMe ? 'is-me' : ''}`;

    const av = document.createElement('div');
    av.className = 'player-avatar';
    av.textContent = player.name.charAt(0).toUpperCase();

    const info = document.createElement('div');
    info.className = 'player-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name + (isMe ? ' (Já)' : '');
    info.appendChild(nameEl);

    const voteEl = document.createElement('div');
    voteEl.className = 'player-vote-icon';
    if (player.isObserver) {
      voteEl.classList.add('vote-observer'); voteEl.textContent = '👁';
    } else if (room.phase === 'revealed') {
      voteEl.classList.add('vote-revealed'); voteEl.textContent = player.vote ?? '–';
    } else if (player.hasVoted) {
      voteEl.classList.add('vote-cast'); voteEl.textContent = '✓';
    } else {
      voteEl.classList.add('vote-pending'); voteEl.textContent = '…';
    }

    li.appendChild(av); li.appendChild(info); li.appendChild(voteEl);
    dom.playerList.appendChild(li);
  });
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

  if (!isRevealed && !isObserver) {
    const myPlayer = room.players.find(p => p.id === state.socket.id);
    if (myPlayer && myPlayer.hasVoted && state.selectedVote) {
      highlightCard(state.selectedVote);
    } else if (!myPlayer?.hasVoted) {
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

  dom.resultsVotesGrid.innerHTML = '';
  room.players.filter(p => !p.isObserver).forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'result-card';
    div.style.animationDelay = `${i * 60}ms`;
    const chip = document.createElement('div');
    chip.className = `result-vote-chip ${p.vote == null ? 'no-vote' : ''}`;
    chip.textContent = p.vote ?? '–';
    const name = document.createElement('div');
    name.className = 'result-name';
    name.textContent = p.name;
    div.appendChild(chip); div.appendChild(name);
    dom.resultsVotesGrid.appendChild(div);
  });

  const nums = room.players
    .filter(p => !p.isObserver && p.vote !== null)
    .map(p => Number(p.vote));

  if (!nums.length) {
    dom.statConsensus.textContent = '–';
    dom.consensusChip.className = 'stat-chip';
    return;
  }
  const consensus = nums.every(v => v === nums[0]);
  dom.statConsensus.textContent = consensus ? '✓ Shoda!' : '✗ Neshoda';
  dom.consensusChip.className = `stat-chip ${consensus ? 'consensus-yes' : 'consensus-no'}`;
}

function smartFibRange(nums) {
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const fibs = FIBONACCI_CARDS.map(Number);
  const minIdx = fibs.findIndex(f => f >= min);
  const maxIdx = fibs.findIndex(f => f >= max);
  const endIdx = Math.min(maxIdx + 1, fibs.length - 1);
  return FIBONACCI_CARDS.slice(minIdx < 0 ? 0 : minIdx, endIdx + 1);
}

function renderFinalEstimate(room) {
  if (room.phase !== 'revealed') {
    dom.finalEstimateSection.classList.add('hidden');
    return;
  }
  const nums = room.players
    .filter(p => !p.isObserver && p.vote !== null)
    .map(p => Number(p.vote));
  const hasConsensus = nums.length > 0 && nums.every(v => v === nums[0]);
  if (hasConsensus || nums.length === 0) {
    dom.finalEstimateSection.classList.add('hidden');
    return;
  }

  dom.finalEstimateSection.classList.remove('hidden');
  dom.finalEstimateCards.innerHTML = '';
  smartFibRange(nums).forEach(val => {
    const btn = document.createElement('button');
    btn.className = 'final-estimate-card';
    btn.textContent = val;
    if (room.finalEstimate === val) btn.classList.add('selected');
    if (room.finalEstimate) btn.classList.add('locked');
    btn.addEventListener('click', () => {
      if (room.finalEstimate) return;
      state.socket.emit('set-final-estimate', { estimate: val });
    });
    dom.finalEstimateCards.appendChild(btn);
  });
}

function renderHistory(room) {
  if (!room.history?.length) {
    dom.historyList.innerHTML = '<p class="empty-hint">Žádná kola zatím.</p>';
    return;
  }
  dom.historyList.innerHTML = '';
  [...room.history].reverse().forEach(h => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const finalBadge = h.finalEstimate
      ? `<span class="history-final">→ ${h.finalEstimate}</span>`
      : '';
    div.innerHTML = `
      <div class="history-story">${h.story}</div>
      <div class="history-meta">
        <span>Průměr: <span class="history-avg">${h.avg ?? '–'}</span></span>
        ${finalBadge}
        <span class="${h.consensus ? 'history-consensus-ok' : 'history-consensus-no'}">${h.consensus ? '✓ Shoda' : '≠ Neshoda'}</span>
      </div>
      ${h.time ? `<div class="history-meta" style="color:var(--gray400)">${h.time}</div>` : ''}
    `;
    dom.historyList.appendChild(div);
  });
}

function renderStory(room) {
  const has = room.story?.trim().length > 0;
  dom.currentStoryDisplay.classList.toggle('hidden', !has);
  if (has) {
    dom.currentStoryDisplay.textContent = `📋 ${room.story}`;
    dom.storyInput.value = room.story;
  }
}

function renderActionButtons(room) {
  const isRevealed = room.phase === 'revealed';
  const me = room.players.find(p => p.id === state.socket.id);
  const isObserver = me?.isObserver ?? state.isObserver;
  dom.resetBtn.classList.toggle('hidden', !isRevealed || isObserver);
}

// ── Events ────────────────────────────────────────────────────────────────────
function attachEvents() {
  // Landing – join
  function doJoin() {
    if (!state.socket?.connected) {
      showToast('Čekám na připojení k serveru…', 'error');
      return;
    }
    const name = dom.playerName.value.trim();
    if (!name) { showToast('Zadejte své jméno', 'error'); return; }
    const asObserver = document.querySelector('input[name="role"]:checked').value === 'observer';
    // Set BEFORE emit so the connect handler can re-send if the socket
    // reconnects before the server acks the join.
    state.myName = name;
    state.isObserver = asObserver;
    state.socket.emit('join', { playerName: name, asObserver });
  }
  dom.joinBtn.addEventListener('click', doJoin);
  dom.playerName.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

  // Role cards – highlight selected
  document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('active'));
      radio.closest('.role-option').querySelector('.role-card').classList.add('active');
    });
  });
  // Set initial active state
  document.querySelector('input[name="role"]:checked')
    ?.closest('.role-option')?.querySelector('.role-card')?.classList.add('active');

  // Header
  dom.shareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(location.href)
      .then(() => showToast('Odkaz zkopírován!', 'success'))
      .catch(() => showToast(location.href));
  });
  dom.leaveBtn.addEventListener('click', () => {
    if (confirm('Odejít ze hry?')) {
      state.socket.disconnect();
      location.reload();
    }
  });

  // Story
  function sendStory() {
    state.socket.emit('set-story', { story: dom.storyInput.value.trim() });
  }
  dom.setStoryBtn.addEventListener('click', sendStory);
  dom.storyInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendStory(); });

  // Clear history
  dom.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Smazat celou historii kol?')) state.socket.emit('clear-history');
  });

  // Observer toggle
  dom.observerToggle.addEventListener('change', () => state.socket.emit('toggle-observer'));

  // Chat
  function sendChat() {
    const text = dom.chatInput.value.trim();
    if (!text || !state.socket?.connected) return;
    state.socket.emit('chat-message', { text });
    dom.chatInput.value = '';
  }
  dom.chatSendBtn.addEventListener('click', sendChat);
  dom.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

  // Game actions
  dom.resetBtn.addEventListener('click', () => {
    state.selectedVote = null;
    highlightCard(null);
    dom.storyInput.value = '';
    state.socket.emit('reset-round');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
buildCards();
initSocket();
attachEvents();
