/**
 * MAFIA WARS — LOBBY / INDEX JS
 * Handles: player identity, joining game, player list polling
 */

const API = 'api.php';
let myPlayerId = null;
let myPlayerName = null;
let pollInterval = null;
let isHost = false;

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  addBgLines();
  checkIdentity();
  bindButtons();
});

function addBgLines() {
  const div = document.createElement('div');
  div.className = 'bg-lines';
  document.body.appendChild(div);
}

// ─────────────────────────────────────────────
//  IDENTITY FLOW
// ─────────────────────────────────────────────
function checkIdentity() {
  const storedId   = localStorage.getItem('mw_player_id');
  const storedName = localStorage.getItem('mw_player_name');
  const storedMotto = localStorage.getItem('mw_player_motto');

  if (!storedName || !storedMotto) {
    // First ever visit — show modal
    showModal();
  } else {
    myPlayerId   = storedId;
    myPlayerName = storedName;
    // Re-register / ping server
    registerPlayer(storedId, storedName, storedMotto);
  }
}

function showModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('input-username').focus();
}

function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay.classList.contains('hidden')) confirmIdentity();
  }
});

function confirmIdentity() {
  const name  = document.getElementById('input-username').value.trim();
  const motto = document.getElementById('input-motto').value.trim();

  if (!name) {
    flashInput('input-username', 'A codename is required, friend.');
    return;
  }
  if (!motto) {
    flashInput('input-motto', 'Even ghosts have mottos.');
    return;
  }

  // Generate a local UUID
  const newId = 'p_' + Math.random().toString(36).substr(2,9) + '_' + Date.now();
  localStorage.setItem('mw_player_id', newId);
  localStorage.setItem('mw_player_name', name);
  localStorage.setItem('mw_player_motto', motto);

  myPlayerId   = newId;
  myPlayerName = name;

  hideModal();
  registerPlayer(newId, name, motto);
}

function flashInput(id, msg) {
  const el = document.getElementById(id);
  el.style.borderColor = '#c0392b';
  el.style.boxShadow = '0 0 8px rgba(192,57,43,0.5)';
  el.placeholder = msg;
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
    el.placeholder = id === 'input-username' ? 'Your alias...' : 'Your motto...';
  }, 2000);
}

// ─────────────────────────────────────────────
//  SERVER REGISTRATION
// ─────────────────────────────────────────────
async function registerPlayer(id, name, motto) {
  setStatus('CONNECTING...');
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'join', id, name, motto })
    });
    const data = await res.json();

    if (data.success) {
      myPlayerId = data.playerId || id;
      localStorage.setItem('mw_player_id', myPlayerId);
      isHost = data.isHost;

      if (isHost) {
        setStatus('YOU ARE THE HOST');
        document.getElementById('btn-start').classList.remove('disabled');
      } else {
        setStatus('WAITING FOR HOST...');
        document.getElementById('btn-start').classList.add('disabled');
        document.getElementById('btn-start').querySelector('.btn-label').textContent = 'WAITING';
      }

      // If a game is already running, redirect
      if (data.gamePhase && data.gamePhase !== 'lobby') {
        window.location.href = 'game.html';
        return;
      }

      startPolling();
    } else {
      setStatus('CONNECTION FAILED');
    }
  } catch (err) {
    console.error('Register error:', err);
    setStatus('SERVER OFFLINE — SOLO MODE');
    // Fallback: still show the player locally
    renderLocalPlayer();
  }
}

function renderLocalPlayer() {
  const name  = localStorage.getItem('mw_player_name') || '???';
  const motto = localStorage.getItem('mw_player_motto') || '...';
  renderPlayers([{
    id: myPlayerId,
    name, motto,
    isHost: true,
    isBot: false
  }]);
  document.getElementById('btn-start').classList.remove('disabled');
  isHost = true;
}

// ─────────────────────────────────────────────
//  POLLING
// ─────────────────────────────────────────────
function startPolling() {
  fetchGameState();
  pollInterval = setInterval(fetchGameState, 2000);
}

async function fetchGameState() {
  try {
    const res  = await fetch(`${API}?action=state&pid=${myPlayerId}`);
    const data = await res.json();

    if (!data.success) return;

    renderPlayers(data.players || []);

    // Redirect if game started
    if (data.phase && data.phase !== 'lobby') {
      clearInterval(pollInterval);
      window.location.href = 'game.html';
    }

    if (data.hostId === myPlayerId) {
      isHost = true;
      document.getElementById('btn-start').classList.remove('disabled');
      document.getElementById('btn-start').querySelector('.btn-label').textContent = 'START';
      setStatus('YOU ARE THE HOST');
    }
  } catch (err) {
    // silent fail — server might be down
  }
}

// ─────────────────────────────────────────────
//  RENDER PLAYER LIST
// ─────────────────────────────────────────────
function renderPlayers(players) {
  const container = document.getElementById('player-list-items');
  if (!players || players.length === 0) {
    container.innerHTML = '<div class="player-loading">Waiting for players...</div>';
    return;
  }

  container.innerHTML = players.map(p => {
    const hostBadge = p.isHost ? '<span class="host-tag">(host)</span>' : '';
    const youBadge  = (p.id === myPlayerId) ? '<span class="you-tag">(you)</span>' : '';
    const botClass  = p.isBot ? ' player-bot' : '';
    const nameStr   = `<div class="player-name">${escHtml(p.name)}${hostBadge}${youBadge}</div>`;
    const mottoStr  = `<div class="player-motto">${escHtml(p.motto || 'No motto')}</div>`;
    return `<div class="player-entry${botClass}">${nameStr}${mottoStr}</div>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
//  BUTTONS
// ─────────────────────────────────────────────
function bindButtons() {
  document.getElementById('btn-start').addEventListener('click', onStartClick);
  document.getElementById('btn-credits').addEventListener('click', () => {
    window.location.href = 'credits.html';
  });
  document.getElementById('btn-confirm-identity').addEventListener('click', confirmIdentity);
}

async function onStartClick() {
  if (!isHost) return;
  if (!myPlayerId) return;

  // Need at least 2 players (or 1 for solo testing)
  try {
    const res  = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', hostId: myPlayerId })
    });
    const data = await res.json();
    if (data.success) {
      clearInterval(pollInterval);
      window.location.href = 'game.html';
    } else {
      setStatus(data.message || 'CANNOT START YET');
      setTimeout(() => setStatus('YOU ARE THE HOST'), 2500);
    }
  } catch (err) {
    // Offline fallback — solo test
    localStorage.setItem('mw_solo_mode', '1');
    localStorage.setItem('mw_game_phase', 'role_reveal');
    clearInterval(pollInterval);
    window.location.href = 'game.html';
  }
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function setStatus(msg) {
  document.getElementById('status-text').textContent = msg;
}
