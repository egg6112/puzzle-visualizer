// duel.js — PDB-max vs L字 同時 Solution Replay
// Puzzle helpers / WD table copied from main.js (main.js は変更しない)

const API_BASE   = "https://puzzle-api-m99y.onrender.com";
const SIZE = 4, CELL = 56, GAP = 3;
const GOAL       = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
const MOVE_DELTA = { up:[-1,0], down:[1,0], left:[0,-1], right:[0,1] };
const SPEED_MS   = [1800,1200,800,550,400,280,180,110,60,30];

// ── State ─────────────────────────────────────────────────────────────────────
let board        = GOAL.slice();
let pdbPath      = null;   // board states for PDB-max (length = optimal_moves + 1)
let stagedPath   = null;   // board states for L字    (length = total_moves   + 1)
let pdbResult    = null;
let stagedResult = null;
let stagedPhases = [];     // phases from /solve_staged

let step = 0, playing = false, timer = null, speed = 400;
let initMH = 0, initWD = 0;

// tileEls[0] = PDB-max, tileEls[1] = L字
const tileEls     = [{}, {}];
const GRID_IDS    = ['grid-pdb',    'grid-staged'];
const LOADING_IDS = ['loading-pdb', 'loading-staged'];
const PANEL_KEYS  = ['pdb',          'staged'];

// ── Puzzle helpers (copied from main.js) ─────────────────────────────────────

function manhattan(st) {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    if (!st[i]) continue;
    const v = st[i] - 1;
    d += Math.abs((i >> 2) - (v >> 2)) + Math.abs((i & 3) - (v & 3));
  }
  return d;
}

// ── Walking Distance (copied from main.js) ────────────────────────────────────

function buildWdTable() {
  const goal = new Array(SIZE * SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    goal[i * SIZE + i] = i < SIZE - 1 ? SIZE : SIZE - 1;
  }
  const goalKey = goal.join(',') + ',' + (SIZE - 1);
  const table   = new Map([[goalKey, 0]]);
  const queue   = [{ T: goal, br: SIZE - 1, dist: 0 }];
  let head = 0;
  while (head < queue.length) {
    const { T, br, dist } = queue[head++];
    for (const delta of [-1, 1]) {
      const nbr = br + delta;
      if (nbr < 0 || nbr >= SIZE) continue;
      for (let g = 0; g < SIZE; g++) {
        if (T[nbr * SIZE + g] > 0) {
          const nT = T.slice();
          nT[nbr * SIZE + g]--;
          nT[br  * SIZE + g]++;
          const nKey = nT.join(',') + ',' + nbr;
          if (!table.has(nKey)) {
            table.set(nKey, dist + 1);
            queue.push({ T: nT, br: nbr, dist: dist + 1 });
          }
        }
      }
    }
  }
  return table;
}
const _WD_TABLE = buildWdTable();

function rowConfig(state) {
  const T = new Array(SIZE * SIZE).fill(0);
  let blankRow = 0;
  for (let i = 0; i < 16; i++) {
    const val = state[i];
    if (val === 0) { blankRow = i >> 2; }
    else { T[(i >> 2) * SIZE + ((val - 1) >> 2)]++; }
  }
  return T.join(',') + ',' + blankRow;
}

function colConfig(state) {
  const T = new Array(SIZE * SIZE).fill(0);
  let blankCol = 0;
  for (let i = 0; i < 16; i++) {
    const val = state[i];
    if (val === 0) { blankCol = i & 3; }
    else { T[(i & 3) * SIZE + ((val - 1) & 3)]++; }
  }
  return T.join(',') + ',' + blankCol;
}

function walkingDistance(state) {
  return (_WD_TABLE.get(rowConfig(state)) ?? 0)
       + (_WD_TABLE.get(colConfig(state)) ?? 0);
}

// ── Board helpers ─────────────────────────────────────────────────────────────

function getNeighbors(st) {
  const z = st.indexOf(0), r = z >> 2, c = z & 3, ns = [];
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr=r+dr, nc=c+dc;
    if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE) {
      const s=st.slice(); [s[z],s[nr*SIZE+nc]]=[s[nr*SIZE+nc],s[z]]; ns.push(s);
    }
  }
  return ns;
}

function randomShuffle() {
  let st = GOAL.slice();
  for (let i = 0; i < 150; i++) {
    const ns = getNeighbors(st);
    st = ns[Math.floor(Math.random()*ns.length)];
  }
  return st;
}

function buildPath(initial, moves) {
  const path = [initial.slice()];
  let cur = initial.slice();
  for (const m of moves) {
    const z = cur.indexOf(0);
    const [dr,dc] = MOVE_DELTA[m];
    const ni = (Math.floor(z/SIZE)+dr)*SIZE+(z%SIZE+dc);
    const nxt = cur.slice();
    [nxt[z],nxt[ni]] = [nxt[ni],nxt[z]];
    path.push(nxt);
    cur = nxt;
  }
  return path;
}

// ── Grid init ─────────────────────────────────────────────────────────────────

function initGrids() {
  for (let p = 0; p < 2; p++) {
    const grid    = document.getElementById(GRID_IDS[p]);
    const overlay = document.getElementById(LOADING_IDS[p]);
    for (const el of [...grid.children]) { if (el !== overlay) el.remove(); }
    tileEls[p] = {};
    for (let v = 1; v <= 15; v++) {
      const el = document.createElement('div');
      el.className   = 'tile';
      el.textContent = v;
      tileEls[p][v]  = el;
      grid.insertBefore(el, overlay);
    }
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function placePanel(p, st) {
  const tiles = tileEls[p];
  for (let i = 0; i < 16; i++) {
    if (!st[i]) continue;
    const el = tiles[st[i]];
    el.style.left = (i % SIZE) * CELL + GAP + 'px';
    el.style.top  = Math.floor(i / SIZE) * CELL + GAP + 'px';
    el.classList.toggle('correct', st[i] - 1 === i);
  }
}

function flashPanel(p, from, to) {
  for (let i = 0; i < 16; i++) {
    if (to[i] && to[i] !== from[i]) {
      const el = tileEls[p][to[i]];
      el.classList.remove('moved');
      void el.offsetWidth;
      el.classList.add('moved');
      setTimeout(() => el.classList.remove('moved'), 400);
      return;
    }
  }
}

function getStateAt(p, s) {
  const path = p === 0 ? pdbPath : stagedPath;
  if (!path) return board;
  return path[Math.min(s, path.length - 1)];
}

// ── h-bar update (adapted from main.js updateHBar) ────────────────────────────

function updateHBar(p, st) {
  const k   = PANEL_KEYS[p];
  const mh  = manhattan(st);
  const wd  = walkingDistance(st);
  const mhPct = initMH > 0 ? Math.max(0, Math.min(100, Math.round((1 - mh/initMH)*100))) : 0;
  const wdPct = initWD > 0 ? Math.max(0, Math.min(100, Math.round((1 - wd/initWD)*100))) : 0;

  document.getElementById(k+'-hmh').textContent     = mh;
  document.getElementById(k+'-hwd').textContent     = wd;
  document.getElementById(k+'-mhlabel').textContent = 'MH:' + mh;
  document.getElementById(k+'-wdlabel').textContent = 'WD:' + wd;
  document.getElementById(k+'-mhbar').style.width   = mhPct + '%';
  document.getElementById(k+'-wdbar').style.width   = wdPct + '%';
}

// ── Phase display ─────────────────────────────────────────────────────────────

function updatePhaseDisplay() {
  const nameEl = document.getElementById('phase-name');
  if (!stagedPhases.length || !stagedResult) { nameEl.textContent = '—'; return; }
  if (step >= stagedResult.total_moves)      { nameEl.textContent = '完了！'; return; }

  // step = n: moves[0..n-1] applied; last applied move = moves[n-1]
  const moveIdx = Math.max(0, step - 1);
  const phase   = stagedPhases.find(ph => moveIdx >= ph.move_range[0] && moveIdx < ph.move_range[1]);
  nameEl.textContent = phase ? phase.name : stagedPhases[0].name;
}

// ── Solved check ─────────────────────────────────────────────────────────────

function checkSolvedBothPanels() {
  if (pdbPath    && step >= pdbPath.length    - 1) setStatus('pdb',    'Solved! ✓', 'solved');
  if (stagedPath && step >= stagedPath.length - 1) setStatus('staged', 'Solved! ✓', 'solved');
}

// ── Render all ───────────────────────────────────────────────────────────────

function renderAll(prevStep = null) {
  for (let p = 0; p < 2; p++) {
    const st     = getStateAt(p, step);
    const prevSt = prevStep !== null ? getStateAt(p, prevStep) : null;
    if (prevSt && prevSt !== st) flashPanel(p, prevSt, st);
    placePanel(p, st);
    updateHBar(p, st);
  }
  updatePhaseDisplay();
  syncProgress();
}

// ── Progress / seek ───────────────────────────────────────────────────────────

function maxPathLen() {
  const a = pdbPath    ? pdbPath.length    : 1;
  const b = stagedPath ? stagedPath.length : 1;
  return Math.max(a, b);
}

function syncProgress() {
  const slider = document.getElementById('seek-slider');
  const maxLen = maxPathLen();
  if (maxLen <= 1) { slider.max = 0; slider.value = 0; slider.disabled = true; return; }
  slider.max      = maxLen - 1;
  slider.value    = step;
  slider.disabled = false;
}

function updatePhaseMarkers() {
  const container = document.getElementById('phase-markers');
  container.innerHTML = '';
  if (!stagedPhases.length || !stagedResult) return;
  const maxLen = maxPathLen() - 1;
  if (maxLen <= 0) return;
  stagedPhases.forEach((ph, i) => {
    if (i === 0) return;
    const pct = (ph.move_range[0] / maxLen) * 100;
    if (pct <= 0 || pct >= 100) return;
    const m = document.createElement('div');
    m.className  = 'phase-marker';
    m.style.left = pct + '%';
    m.title      = ph.name;
    container.appendChild(m);
  });
}

// ── Loading / status ──────────────────────────────────────────────────────────

function setLoading(id, visible) {
  document.getElementById('loading-' + id).classList.toggle('hidden', !visible);
}

function setStatus(id, msg, cls) {
  const el = document.getElementById(id + '-status');
  el.textContent = msg;
  el.className   = 'panel-status ' + cls;
}

function showError(msg) {
  document.getElementById('global-error-msg').textContent = msg;
  document.getElementById('global-error').classList.remove('hidden');
}
function clearError() {
  document.getElementById('global-error').classList.add('hidden');
}

// ── Playback ──────────────────────────────────────────────────────────────────

function stopTimer() { clearTimeout(timer); timer = null; }

function setPlaying(val) {
  playing = val;
  document.getElementById('btn-play').innerHTML = val
    ? '&#9646;&#9646; Pause'
    : '&#9654; Play';
}

function tick() {
  if (!playing) return;
  const maxLen = maxPathLen();
  if (step >= maxLen - 1) {
    setPlaying(false);
    checkSolvedBothPanels();
    return;
  }
  const prev = step++;
  renderAll(prev);
  checkSolvedBothPanels();
  timer = setTimeout(tick, speed);
}

function play() {
  if (maxPathLen() <= 1) return;
  if (step >= maxPathLen() - 1) { step = 0; renderAll(); }
  setPlaying(true);
  tick();
}
function pause()      { stopTimer(); setPlaying(false); }
function togglePlay() { if (maxPathLen() <= 1) return; playing ? pause() : play(); }

function stepForward() {
  if (maxPathLen() <= 1 || step >= maxPathLen() - 1) return;
  pause();
  const prev = step++;
  renderAll(prev);
  checkSolvedBothPanels();
}

function stepBack() {
  if (maxPathLen() <= 1 || step <= 0) return;
  pause();
  const prev = step--;
  renderAll(prev);
}

// ── Stats display ─────────────────────────────────────────────────────────────

function displayPdbStats(data) {
  const timeEl   = document.getElementById('pdb-time');
  const movesEl  = document.getElementById('pdb-moves');
  const statesEl = document.getElementById('pdb-states');
  if (!data || data.error) {
    timeEl.textContent   = data ? (data.time_ms/1000).toFixed(2)+' s' : '—';
    movesEl.textContent  = '—';
    statesEl.textContent = data?.states_explored?.toLocaleString() ?? '—';
    return;
  }
  timeEl.textContent   = (data.time_ms/1000).toFixed(3) + ' s';
  timeEl.className     = 'stat-val' + (data.time_ms < 2000 ? '' : ' orange');
  movesEl.textContent  = data.optimal_moves;
  statesEl.textContent = data.states_explored.toLocaleString();
}

function displayStagedStats(data) {
  const timeEl  = document.getElementById('staged-time');
  const movesEl = document.getElementById('staged-moves');
  if (!data || !data.solvable) { timeEl.textContent = '—'; movesEl.textContent = '—'; return; }
  timeEl.textContent  = data.time_ms < 1000
    ? data.time_ms.toFixed(1) + ' ms'
    : (data.time_ms/1000).toFixed(3) + ' s';
  timeEl.className    = 'stat-val green';
  movesEl.textContent = data.total_moves;
}

// ── Reset helpers ─────────────────────────────────────────────────────────────

function clearHBars() {
  for (const k of PANEL_KEYS) {
    document.getElementById(k+'-hmh').textContent     = '0';
    document.getElementById(k+'-hwd').textContent     = '0';
    document.getElementById(k+'-mhlabel').textContent = 'MH:0';
    document.getElementById(k+'-wdlabel').textContent = 'WD:0';
    document.getElementById(k+'-mhbar').style.width   = '0%';
    document.getElementById(k+'-wdbar').style.width   = '0%';
  }
}

function resetResults() {
  pdbPath = stagedPath = pdbResult = stagedResult = null;
  stagedPhases = [];
  step = 0;
  setStatus('pdb',    'Waiting', 'waiting');
  setStatus('staged', 'Waiting', 'waiting');
  document.getElementById('pdb-time').textContent     = '—';
  document.getElementById('pdb-moves').textContent    = '—';
  document.getElementById('pdb-states').textContent   = '—';
  document.getElementById('staged-time').textContent  = '—';
  document.getElementById('staged-moves').textContent = '—';
  document.getElementById('phase-name').textContent   = '—';
  document.getElementById('phase-markers').innerHTML  = '';
  clearHBars();
}

// ── Actions ───────────────────────────────────────────────────────────────────

function setBusy(busy) {
  ['btn-shuffle','btn-solve','btn-reset','btn-play','btn-prev','btn-next']
    .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = busy; });
}

function doShuffle() {
  pause(); clearError();
  board  = randomShuffle();
  initMH = manhattan(board);
  initWD = walkingDistance(board);
  resetResults();
  renderAll();  // shows h values immediately after shuffle
}

function doReset() {
  pause(); clearError();
  board  = GOAL.slice();
  initMH = 0;
  initWD = 0;
  resetResults();
  renderAll();
}

async function doSolve() {
  if (board.every((v, i) => v === GOAL[i])) { doShuffle(); return; }

  pause(); clearError();
  setBusy(true);
  resetResults();
  // Re-apply initMH/WD after resetResults clears bars
  initMH = manhattan(board);
  initWD = walkingDistance(board);
  setStatus('pdb',    'Solving…', 'waiting');
  setStatus('staged', 'Solving…', 'waiting');

  const _raw    = parseFloat(document.getElementById('max-time-input').value);
  const maxTime = Math.min(300, Math.max(1, isNaN(_raw) ? 30 : _raw));

  try { await fetch(API_BASE + '/warmup'); } catch (_) {}

  // ── 1. PDB-max ────────────────────────────────────────────────────────────
  setLoading('pdb', true);
  try {
    const res = await fetch(API_BASE + '/solve_one', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ board, algo: 'maxidastar', max_time: maxTime }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg  = body.detail ?? `HTTP ${res.status}`;
      if (res.status === 400) {
        showError('Board is unsolvable: ' + msg);
        setStatus('pdb', 'Error', 'error'); setStatus('staged', 'Error', 'error');
        setBusy(false); setLoading('pdb', false); return;
      }
      pdbResult = { error: msg, time_ms: 0, states_explored: 0 };
    } else {
      const data = await res.json();
      pdbResult  = data;
      if (!data.error) pdbPath = buildPath(board, data.moves);
    }
  } catch (err) {
    const msg = err instanceof TypeError
      ? `Cannot reach ${API_BASE} — API may be sleeping`
      : (err.message || 'Network error');
    showError(msg);
    pdbResult = { error: msg, time_ms: 0, states_explored: 0 };
  }
  setLoading('pdb', false);
  displayPdbStats(pdbResult);
  setStatus('pdb', pdbResult?.error
    ? (pdbResult.error.startsWith('Timeout') ? '⏱ Timeout' : '❌ Error')
    : 'Ready', pdbResult?.error
    ? (pdbResult.error.startsWith('Timeout') ? 'error-timeout' : 'error')
    : 'waiting');

  // ── 2. L字 ───────────────────────────────────────────────────────────────
  setLoading('staged', true);
  try {
    const res = await fetch(API_BASE + '/solve_staged', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ board }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      stagedResult = { solvable: false, error: body.detail ?? `HTTP ${res.status}` };
    } else {
      const data = await res.json();
      stagedResult = data;
      if (data.solvable) {
        stagedPhases = data.phases ?? [];
        stagedPath   = buildPath(board, data.moves);
      }
    }
  } catch (err) {
    showError(err instanceof TypeError ? `Cannot reach ${API_BASE}` : (err.message || 'Network error'));
    stagedResult = { solvable: false };
  }
  setLoading('staged', false);
  displayStagedStats(stagedResult);
  setStatus('staged', stagedResult?.solvable ? 'Ready' : '❌ Error',
                       stagedResult?.solvable ? 'waiting' : 'error');

  // ── Finalize ──────────────────────────────────────────────────────────────
  setBusy(false);
  step = 0;
  renderAll();
  updatePhaseMarkers();
  if (pdbPath || stagedPath) play();
}

// ── Speed ─────────────────────────────────────────────────────────────────────

function applySpeed(val) {
  speed = SPEED_MS[val - 1];
  document.getElementById('speed-display').textContent = (1000/speed).toFixed(1) + '×';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-solve').addEventListener('click', doSolve);
document.getElementById('btn-reset').addEventListener('click', doReset);
document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-prev').addEventListener('click', stepBack);
document.getElementById('btn-next').addEventListener('click', stepForward);
document.getElementById('global-error-close').addEventListener('click', clearError);
document.getElementById('speed-slider').addEventListener('input', e => applySpeed(+e.target.value));
document.getElementById('seek-slider').addEventListener('input', e => {
  const prev = step;
  step = +e.target.value;
  pause();
  renderAll(prev);
  checkSolvedBothPanels();
});

initGrids();
renderAll();
applySpeed(5);
