/**
 * MAFIA WARS — GAME JS
 * Handles all in-game phases:
 *   role_reveal → night → morning → voting → gameover
 */

const API = 'api.php';

let gameState = null;
let myId       = localStorage.getItem('mw_player_id');
let myName     = localStorage.getItem('mw_player_name');
let myRole     = null;
let pollHandle = null;
let soloMode   = localStorage.getItem('mw_solo_mode') === '1';
let nightTimer = null;
let morningTimer = null;
let voteTimer  = null;

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('my-status-name').textContent = myName || '???';
  generateStars('night-stars-civ', 80);
  generateStars('night-stars-mafia', 80, true);

  document.getElementById('btn-play-again').addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  if (soloMode) {
    runSoloDemo();
  } else {
    fetchAndSync();
    pollHandle = setInterval(fetchAndSync, 2000);
  }
});

// ─────────────────────────────────────────────
//  STARS
// ─────────────────────────────────────────────
function generateStars(containerId, count, red = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.style.cssText = `
      position:absolute;
      width:${Math.random()*2+1}px;
      height:${Math.random()*2+1}px;
      background:${red ? '#ff4433' : '#ffffff'};
      border-radius:50%;
      top:${Math.random()*100}%;
      left:${Math.random()*100}%;
      opacity:${Math.random()*0.7+0.1};
      animation: twinkle ${1+Math.random()*3}s ease-in-out infinite;
      animation-delay:${Math.random()*2}s;
    `;
    container.appendChild(star);
  }
  // Add twinkle keyframe once
  if (!document.getElementById('twinkle-style')) {
    const s = document.createElement('style');
    s.id = 'twinkle-style';
    s.textContent = `@keyframes twinkle { 0%,100%{opacity:0.8} 50%{opacity:0.1} }`;
    document.head.appendChild(s);
  }
}

// ─────────────────────────────────────────────
//  FETCH & SYNC
// ─────────────────────────────────────────────
async function fetchAndSync() {
  try {
    const res  = await fetch(`${API}?action=state&pid=${myId}`);
    const data = await res.json();
    if (!data.success) return;
    applyGameState(data);
  } catch (err) { /* silent */ }
}

let currentPhase = null;

function applyGameState(state) {
  gameState = state;

  // Update round
  document.getElementById('round-num').textContent = state.round || 1;

  // Determine my role
  if (state.players && !myRole) {
    const me = state.players.find(p => p.id === myId);
    if (me && me.role) {
      myRole = me.role;
      document.getElementById('my-status-role').textContent = myRole.toUpperCase();
    }
  }

  // Update alive sidebar
  renderAliveSidebar(state.players || []);

  if (state.phase === currentPhase) return; // no change
  currentPhase = state.phase;

  document.getElementById('phase-label').textContent = phaseLabel(state.phase);

  switch (state.phase) {
    case 'role_reveal': showRoleReveal(state); break;
    case 'night':       showNight(state); break;
    case 'morning':     showMorning(state); break;
    case 'voting':      showVoting(state); break;
    case 'gameover':    showGameOver(state); break;
  }
}

function phaseLabel(phase) {
  const map = {
    role_reveal: 'ROLE REVEAL',
    night: 'NIGHT',
    morning: 'MORNING',
    voting: 'THE VOTE',
    gameover: 'GAME OVER'
  };
  return map[phase] || phase.toUpperCase();
}

// ─────────────────────────────────────────────
//  PHASE: ROLE REVEAL
// ─────────────────────────────────────────────
function showRoleReveal(state) {
  hideAll();
  showScreen('phase-role-reveal');

  const me = state.players ? state.players.find(p => p.id === myId) : null;
  const role = (me && me.role) ? me.role : (myRole || 'CIVILIAN');
  myRole = role;

  const roleEl   = document.getElementById('role-name');
  const descEl   = document.getElementById('role-desc');
  const abilEl   = document.getElementById('role-ability');
  const timerEl  = document.getElementById('role-timer');

  roleEl.textContent  = role.toUpperCase();
  roleEl.className    = 'role-name-text ' + role.toLowerCase();
  descEl.textContent  = getRoleDesc(role);
  abilEl.textContent  = getRoleAbility(role);
  document.getElementById('my-status-role').textContent = role.toUpperCase();

  let t = 5;
  timerEl.textContent = t;
  const iv = setInterval(() => {
    t--;
    timerEl.textContent = t;
    if (t <= 0) {
      clearInterval(iv);
      // After reveal, server controls transition
    }
  }, 1000);
}

function getRoleDesc(role) {
  const map = {
    MAFIA:    'You are a shadow in the night. A predator among the unsuspecting.',
    CIVILIAN: 'You are an ordinary citizen. Use your wits to find the mafia.',
    BOT:      'An automated player. Watch your back.',
  };
  return map[role.toUpperCase()] || 'Your role is shrouded in mystery.';
}

function getRoleAbility(role) {
  const map = {
    MAFIA:    '⚡ ABILITY: ELIMINATE one person each night',
    CIVILIAN: '⚡ ABILITY: VOTE to eliminate suspects each morning',
    BOT:      '⚡ ABILITY: AUTOMATED ACTIONS',
  };
  return map[role.toUpperCase()] || '⚡ ABILITY: ???';
}

// ─────────────────────────────────────────────
//  PHASE: NIGHT
// ─────────────────────────────────────────────
function showNight(state) {
  hideAll();
  clearTimers();

  const isMafia = myRole && myRole.toUpperCase() === 'MAFIA';

  if (isMafia) {
    showScreen('phase-night-mafia');
    buildKillTargets(state);
    startKillTimer(state);
  } else {
    showScreen('phase-night-civ');
  }
}

function buildKillTargets(state) {
  const list = document.getElementById('kill-target-list');
  list.innerHTML = '';
  const me = state.players ? state.players.find(p => p.id === myId) : null;
  const alive = (state.players || []).filter(p =>
    p.alive !== false &&
    p.id !== myId &&
    (!p.role || p.role.toUpperCase() !== 'MAFIA')
  );

  if (alive.length === 0) {
    list.innerHTML = '<div style="color:var(--gold-dim);letter-spacing:2px;font-size:16px;">No targets alive</div>';
    return;
  }

  alive.forEach(p => {
    const btn = document.createElement('div');
    btn.className = 'kill-target-btn';
    btn.textContent = p.name;
    btn.dataset.targetId = p.id;
    btn.addEventListener('click', () => selectKillTarget(p.id, btn, state));
    list.appendChild(btn);
  });
}

let selectedKillTarget = null;

function selectKillTarget(targetId, btn, state) {
  selectedKillTarget = targetId;
  document.querySelectorAll('.kill-target-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  // Submit kill action
  submitNightAction(targetId);
}

async function submitNightAction(targetId) {
  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'night_kill', playerId: myId, targetId })
    });
  } catch (e) { /* solo handled elsewhere */ }
}

function startKillTimer(state) {
  let t = 20;
  const el = document.getElementById('kill-timer');
  el.textContent = t;

  nightTimer = setInterval(() => {
    t--;
    el.textContent = t;
    if (t <= 0) {
      clearInterval(nightTimer);
      // Auto-pick random if none selected
      if (!selectedKillTarget) {
        const btns = document.querySelectorAll('.kill-target-btn');
        if (btns.length > 0) {
          const random = btns[Math.floor(Math.random() * btns.length)];
          random.click();
        }
      }
    }
  }, 1000);
}

// ─────────────────────────────────────────────
//  PHASE: MORNING
// ─────────────────────────────────────────────
function showMorning(state) {
  hideAll();
  clearTimers();
  showScreen('phase-morning');

  const eventEl = document.getElementById('morning-event');
  const countEl = document.getElementById('morning-countdown');

  // Format the night event message
  const killed = state.lastKilled;
  if (killed) {
    eventEl.innerHTML = `The city woke to grim news...<br><br><strong style="color:var(--red-bright);font-family:'Cinzel',serif;font-size:24px;">${escHtml(killed)}</strong><br><br>was found dead in the streets.<br>The killer remains unknown.`;
  } else {
    eventEl.textContent = 'The night passed in silence. No one was harmed... this time.';
  }

  let t = 15;
  countEl.textContent = t;
  morningTimer = setInterval(() => {
    t--;
    countEl.textContent = t;
    if (t <= 0) clearInterval(morningTimer);
  }, 1000);
}

// ─────────────────────────────────────────────
//  PHASE: VOTING
// ─────────────────────────────────────────────
function showVoting(state) {
  hideAll();
  clearTimers();
  showScreen('phase-voting');
  buildVoteList(state);
  startVoteTimer(state);
}

let myVote = null;

function buildVoteList(state) {
  const list = document.getElementById('vote-list');
  list.innerHTML = '';
  const alive = (state.players || []).filter(p => p.alive !== false && p.id !== myId);

  alive.forEach(p => {
    const entry = document.createElement('div');
    entry.className = 'vote-entry';
    entry.innerHTML = `
      <span class="vote-entry-name">${escHtml(p.name)}</span>
      <span class="vote-count-badge" id="votes-for-${p.id}">${countVotesFor(state.votes, p.id)} votes</span>
    `;
    entry.addEventListener('click', () => castVote(p.id, entry, state));
    list.appendChild(entry);
  });
}

function countVotesFor(votes, targetId) {
  if (!votes) return 0;
  return Object.values(votes).filter(v => v === targetId).length;
}

async function castVote(targetId, entryEl, state) {
  if (myVote) return; // already voted
  myVote = targetId;

  document.querySelectorAll('.vote-entry').forEach(e => e.classList.remove('voted'));
  entryEl.classList.add('voted');

  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vote', playerId: myId, targetId })
    });
  } catch (e) { /* solo */ }
}

function startVoteTimer(state) {
  let t = 30;
  const bar    = document.getElementById('vote-timer-bar');
  const text   = document.getElementById('vote-timer-text');
  bar.style.width = '100%';

  voteTimer = setInterval(() => {
    t--;
    bar.style.width = ((t / 30) * 100) + '%';
    text.textContent = `Time to vote: ${t}s`;
    if (t <= 0) clearInterval(voteTimer);
  }, 1000);
}

// ─────────────────────────────────────────────
//  PHASE: GAME OVER
// ─────────────────────────────────────────────
function showGameOver(state) {
  hideAll();
  clearTimers();
  if (pollHandle) clearInterval(pollHandle);
  showScreen('phase-gameover');

  const banner = document.getElementById('winner-banner');
  const sub    = document.getElementById('winner-sub');
  const roles  = document.getElementById('gameover-roles');

  if (state.winner === 'mafia') {
    banner.textContent = 'MAFIA WINS';
    banner.classList.add('mafia-wins');
    sub.textContent = 'The city falls into darkness...';
  } else {
    banner.textContent = 'CIVILIANS WIN';
    banner.classList.remove('mafia-wins');
    sub.textContent = 'Justice has been served. The mafia is gone.';
  }

  // Reveal all roles
  if (state.players) {
    roles.innerHTML = state.players.map(p =>
      `<div>${escHtml(p.name)} — <span style="color:${p.role?.toUpperCase()==='MAFIA'?'var(--red-bright)':'var(--gold)'}">${(p.role||'?').toUpperCase()}</span></div>`
    ).join('');
  }
}

// ─────────────────────────────────────────────
//  SIDEBAR
// ─────────────────────────────────────────────
function renderAliveSidebar(players) {
  const list = document.getElementById('alive-list');
  list.innerHTML = players.map(p =>
    `<div class="sidebar-player${p.alive===false?' dead':''}">${escHtml(p.name)}</div>`
  ).join('');
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function hideAll() {
  document.querySelectorAll('.phase-screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
}

function showScreen(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  // Trigger reflow for transition
  void el.offsetWidth;
  el.classList.add('active');
}

function clearTimers() {
  if (nightTimer)   { clearInterval(nightTimer);   nightTimer   = null; }
  if (morningTimer) { clearInterval(morningTimer); morningTimer = null; }
  if (voteTimer)    { clearInterval(voteTimer);    voteTimer    = null; }
}

function escHtml(str) {
  return String(str||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─────────────────────────────────────────────
//  SOLO / OFFLINE DEMO MODE
// ─────────────────────────────────────────────
function runSoloDemo() {
  const name  = localStorage.getItem('mw_player_name') || 'You';
  const motto = localStorage.getItem('mw_player_motto') || '...';

  // Create a fake 4-player game
  const fakePlayers = [
    { id: myId,     name, motto, role: 'CIVILIAN', alive: true, isHost: true },
    { id: 'bot1',   name: 'Shadow',   motto: 'I blend in',     role: 'MAFIA',    alive: true, isBot: true },
    { id: 'bot2',   name: 'Gino',     motto: 'Trust me',       role: 'CIVILIAN', alive: true, isBot: true },
    { id: 'bot3',   name: 'Maria',    motto: 'Eyes everywhere',role: 'CIVILIAN', alive: true, isBot: true },
  ];

  let round = 1;

  const phases = [
    // Role reveal
    { phase: 'role_reveal', players: fakePlayers, round },
    // Night 1
    { phase: 'night', players: fakePlayers, round, lastKilled: null },
    // Morning 1
    { phase: 'morning', players: fakePlayers, round, lastKilled: 'Gino' },
    // Voting 1
    { phase: 'voting', players: fakePlayers.filter(p=>p.name!=='Gino'), round, votes: {} },
    // Game over
    { phase: 'gameover', players: fakePlayers, round, winner: 'civilians' },
  ];

  let step = 0;
  const phaseDurations = [6000, 22000, 17000, 32000, 99999];

  function advanceDemoPhase() {
    if (step >= phases.length) return;
    applyGameState({ success: true, ...phases[step] });
    const dur = phaseDurations[step] || 8000;
    step++;
    if (step < phases.length) {
      setTimeout(advanceDemoPhase, dur);
    }
  }

  advanceDemoPhase();
}
