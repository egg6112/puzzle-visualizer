// 15-Puzzle Algorithm Comparator
// Two panels (A* / IDA*) share the same board and step counter.
// Solving is delegated to POST /compare on the FastAPI server.

const API_BASE = "https://puzzle-api-m99y.onrender.com";
const API_URL  = API_BASE + '/compare';

const SIZE = 4;
const CELL = 80;   // px per grid cell  →  4 × 80 = 320 px grid
const GAP  = 3;    // px between tile edge and cell boundary

const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
const KEYS = ['astar', 'idastar'];

// ── Shared animation state ────────────────────────────────────────────────────
let state      = GOAL.slice(); // current board (frozen at solve-time; mutated by shuffle/reset)
let step       = 0;
let playing    = false;
let timer      = null;
let speed      = 400; // ms
let replayMode = 'explore'; // 'solution' | 'explore'

// ── Per-algorithm state ───────────────────────────────────────────────────────
const panels = {
  astar:   { tileEls: {}, path: null, exploredPath: null, error: null },
  idastar: { tileEls: {}, path: null, exploredPath: null, error: null },
};

// ── Puzzle helpers ────────────────────────────────────────────────────────────

function manhattan(st) {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    if (st[i] === 0) continue;
    const v = st[i] - 1;
    d += Math.abs(Math.floor(i / SIZE) - Math.floor(v / SIZE))
       + Math.abs((i % SIZE) - (v % SIZE));
  }
  return d;
}

function getNeighbors(st) {
  const z = st.indexOf(0), r = Math.floor(z / SIZE), c = z % SIZE;
  const result = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
      const s = st.slice();
      [s[z], s[nr * SIZE + nc]] = [s[nr * SIZE + nc], s[z]];
      result.push(s);
    }
  }
  return result;
}

// Random walk from goal — always solvable, no parity check needed.
function randomShuffle() {
  let st = GOAL.slice();
  for (let i = 0; i < 150; i++) {
    const ns = getNeighbors(st);
    st = ns[Math.floor(Math.random() * ns.length)];
  }
  return st;
}

// Reconstruct the full list of board states from the API's move list.
const MOVE_DELTA = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

function buildPath(initial, moves) {
  const path = [initial.slice()];
  let cur = initial.slice();
  for (const m of moves) {
    const z = cur.indexOf(0);
    const [dr, dc] = MOVE_DELTA[m];
    const ni = (Math.floor(z / SIZE) + dr) * SIZE + (z % SIZE + dc);
    const nxt = cur.slice();
    [nxt[z], nxt[ni]] = [nxt[ni], nxt[z]];
    path.push(nxt);
    cur = nxt;
  }
  return path;
}

// Convert API's explored_log (array of 16-element arrays) into a path array.
function buildExploredPath(exploredLog) {
  if (!exploredLog || exploredLog.length === 0) return null;
  return exploredLog.map(board => board.slice());
}

// ── Grid initialisation ───────────────────────────────────────────────────────

function initGrids() {
  for (const key of KEYS) {
    const grid    = document.getElementById('grid-' + key);
    const overlay = document.getElementById('loading-' + key);
    const tiles   = panels[key].tileEls;

    [...grid.children].forEach(el => { if (el !== overlay) el.remove(); });

    for (let v = 1; v <= 15; v++) {
      const el = document.createElement('div');
      el.className   = 'tile';
      el.textContent = v;
      tiles[v]       = el;
      grid.insertBefore(el, overlay); // tiles sit below the overlay in z-order
    }
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function placePanel(key, st) {
  const tiles = panels[key].tileEls;
  for (let i = 0; i < 16; i++) {
    if (st[i] === 0) continue;
    const el = tiles[st[i]];
    el.style.left = (i % SIZE) * CELL + GAP + 'px';
    el.style.top  = Math.floor(i / SIZE) * CELL + GAP + 'px';
    el.classList.toggle('correct', st[i] - 1 === i);
  }
}

function flashPanel(key, from, to) {
  const tiles = panels[key].tileEls;
  for (let i = 0; i < 16; i++) {
    if (to[i] !== 0 && to[i] !== from[i]) {
      const el = tiles[to[i]];
      el.classList.remove('moved');
      void el.offsetWidth; // restart CSS animation
      el.classList.add('moved');
      setTimeout(() => el.classList.remove('moved'), 400);
      return;
    }
  }
}

function renderPanel(key, st, prevSt) {
  if (prevSt) flashPanel(key, prevSt, st);
  placePanel(key, st);
  document.getElementById(key + '-h').textContent = manhattan(st);
}

// Render both panels at the current `step`, animating from `prevStep` if given.
function renderAll(prevStep = null) {
  for (const key of KEYS) {
    const p = panels[key];
    let st, prevSt = null;

    const activePath = replayMode === 'explore' ? p.exploredPath : p.path;

    if (activePath) {
      const idx = Math.min(step, activePath.length - 1);
      st = activePath[idx];
      if (prevStep !== null) {
        const pi = Math.min(prevStep, activePath.length - 1);
        if (pi !== idx) prevSt = activePath[pi];
      }
    } else {
      st = state; // no solution / no explored log: show the starting board
    }

    renderPanel(key, st, prevSt);
  }
  syncProgress();
}

// ── Stats & status ────────────────────────────────────────────────────────────

function setPanelStats(key, data) {
  const el = id => document.getElementById(key + '-' + id);
  if (data.states_explored !== undefined)
    el('explored').textContent = data.states_explored.toLocaleString();
  if (data.optimal_moves !== undefined)
    el('moves').textContent = data.optimal_moves;
  if (data.time_ms !== undefined)
    el('time').textContent = (data.time_ms / 1000).toFixed(3) + ' s';
}

function clearPanelStats(key) {
  ['explored', 'moves', 'time'].forEach(id =>
    document.getElementById(key + '-' + id).textContent = '—'
  );
  document.getElementById(key + '-h').textContent = manhattan(state);
}

function setPanelStatus(key, msg, type = 'waiting') {
  const el = document.getElementById(key + '-status');
  el.textContent = msg;
  el.className   = 'panel-status ' + type;
}

function setGlobalStatus(msg) {
  document.getElementById('global-status').textContent = msg;
}

function maxPathLen() {
  if (replayMode === 'explore') {
    const lens = KEYS.map(k => panels[k].exploredPath ? panels[k].exploredPath.length : 0);
    return Math.max(...lens, 1);
  }
  const lens = KEYS.map(k => panels[k].path ? panels[k].path.length : 0);
  return Math.max(...lens, 1);
}

function syncProgress() {
  const slider  = document.getElementById('seek-slider');
  const counter = document.getElementById('step-counter');
  const maxLen  = maxPathLen();
  if (maxLen <= 1) {
    slider.max      = 0;
    slider.value    = 0;
    slider.disabled = true;
    counter.textContent = '—';
    return;
  }
  slider.max      = maxLen - 1;
  slider.value    = step;
  slider.disabled = false;
  if (replayMode === 'explore') {
    counter.textContent = `Explore ${step.toLocaleString()} / ${(maxLen - 1).toLocaleString()}`;
  } else {
    counter.textContent = `Step ${step} / ${maxLen - 1}`;
  }
}

// ── Loading & error UI ────────────────────────────────────────────────────────

function showLoadingAll(visible) {
  for (const key of KEYS)
    document.getElementById('loading-' + key).classList.toggle('hidden', !visible);
}

function showGlobalError(msg) {
  document.getElementById('global-error-msg').textContent = msg;
  document.getElementById('global-error').classList.remove('hidden');
}

function clearGlobalError() {
  document.getElementById('global-error').classList.add('hidden');
}

// ── Playback ──────────────────────────────────────────────────────────────────

function stopTimer() { clearTimeout(timer); timer = null; }

function setPlaying(val) {
  playing = val;
  document.getElementById('btn-play').innerHTML =
    val ? '&#9646;&#9646; Pause' : '&#9654; Play';
}

function tick() {
  if (!playing) return;
  const maxLen = maxPathLen();
  if (step >= maxLen - 1) {
    setPlaying(false);
    if (replayMode === 'solution') {
      for (const key of KEYS)
        if (panels[key].path && !panels[key].error)
          setPanelStatus(key, 'Solved! ✓', 'solved');
    }
    return;
  }
  const prev = step;
  step++;
  renderAll(prev);
  timer = setTimeout(tick, speed);
}

function play() {
  if (maxPathLen() <= 1) return;
  if (step >= maxPathLen() - 1) { step = 0; renderAll(); }
  setPlaying(true);
  tick();
}

function pause() { stopTimer(); setPlaying(false); }
function togglePlay() { if (maxPathLen() <= 1) return; if (playing) pause(); else play(); }

// ── Replay mode ───────────────────────────────────────────────────────────────

function setReplayMode(mode) {
  replayMode = mode;
  document.getElementById('btn-mode-solution').classList.toggle('active-mode', mode === 'solution');
  document.getElementById('btn-mode-explore').classList.toggle('active-mode', mode === 'explore');
  pause();
  step = 0;
  renderAll();
}

// ── Actions ───────────────────────────────────────────────────────────────────

function setBusy(busy) {
  ['btn-shuffle', 'btn-solve', 'btn-reset', 'btn-play', 'btn-prev', 'btn-next',
   'btn-mode-solution', 'btn-mode-explore']
    .forEach(id => { document.getElementById(id).disabled = busy; });
}

function doShuffle() {
  pause();
  clearGlobalError();
  state = randomShuffle();
  for (const key of KEYS) {
    panels[key].path         = null;
    panels[key].exploredPath = null;
    panels[key].error        = null;
    setPanelStatus(key, 'Waiting', 'waiting');
    clearPanelStats(key);
  }
  step = 0;
  renderAll();
  setGlobalStatus('Shuffled — press Solve');
}

async function doSolve() {
  pause();
  clearGlobalError();
  setBusy(true);
  showLoadingAll(true);
  setGlobalStatus('Solving…');
  for (const key of KEYS) setPanelStatus(key, 'Waiting', 'waiting');

  const _raw    = parseFloat(document.getElementById('max-time-input').value);
  const maxTime = Math.min(300, Math.max(1, isNaN(_raw) ? 30 : _raw));
  const solveStart = Date.now();

  const ctrl    = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), (maxTime + 10) * 1000);

  try {
    // ウォームアップ（コールドスタート対策）
    setGlobalStatus('APIを起動中…（初回は30〜50秒かかる場合があります）');
    try {
      await fetch(`${API_BASE}/warmup`);
    } catch (e) {
      // warmup 失敗は無視して続行
    }
    setGlobalStatus('Solving…');

    const res = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ board: state, max_time: maxTime }),
      signal:  ctrl.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `HTTP ${res.status}`);
    }

    // { astar: {...|{error}}, idastar: {...|{error}} }
    const data = await res.json();

    step = 0;
    let anyValid = false;
    const summaryParts = [];

    for (const key of KEYS) {
      const d = data[key];
      const p = panels[key];
      const label = key === 'astar' ? 'A*' : 'IDA*';

      if (d.error) {
        p.path         = null;
        p.exploredPath = null;
        p.error        = d.error;
        let statusMsg, statusClass, summaryMsg;
        if (d.error.startsWith('Timeout')) {
          const secs  = Math.round(d.time_ms / 1000);
          statusMsg   = `⏱ Timeout (${secs}s)`;
          statusClass = 'error-timeout';
          summaryMsg  = `${label}: timed out`;
        } else if (d.error.includes('states')) {
          statusMsg   = '❌ State limit exceeded';
          statusClass = 'error-limit';
          summaryMsg  = `${label}: state limit`;
        } else {
          statusMsg   = `❌ Error: ${d.error}`;
          statusClass = 'error';
          summaryMsg  = `${label}: failed`;
        }
        setPanelStatus(key, statusMsg, statusClass);
        setPanelStats(key, { time_ms: d.time_ms, states_explored: d.states_explored });
        summaryParts.push(`${summaryMsg} (${(d.time_ms / 1000).toFixed(1)}s)`);
      } else {
        p.path         = buildPath(state, d.moves);
        p.exploredPath = buildExploredPath(d.explored_log ?? []);
        p.error        = null;
        setPanelStatus(key, 'Waiting', 'waiting');
        setPanelStats(key, {
          states_explored: d.states_explored,
          optimal_moves:   d.optimal_moves,
          time_ms:         d.time_ms,
        });
        summaryParts.push(
          `${label}: ${d.optimal_moves} moves · ${d.states_explored.toLocaleString()} states · ${d.time_ms.toFixed(0)} ms`
        );
        anyValid = true;
      }
    }

    showLoadingAll(false);
    setBusy(false);
    setGlobalStatus(summaryParts.join('\n'));
    renderAll();
    if (anyValid) play();

  } catch (err) {
    clearTimeout(timeout);
    showLoadingAll(false);
    setBusy(false);

    if (err.name === 'AbortError') {
      const elapsed = Date.now() - solveStart;
      const elapsedSec = (elapsed / 1000).toFixed(0);
      for (const key of KEYS) {
        setPanelStatus(key, `⏱ Timed out (${elapsedSec}s)`, 'error-timeout');
        setPanelStats(key, { time_ms: elapsed });
      }
      setGlobalStatus('Timed out');
    } else {
      const msg = (err instanceof TypeError && (err.message || '').toLowerCase().includes('fetch'))
        ? `Cannot connect to ${API_BASE}  —  Render サービスが停止している可能性があります`
        : (err.message || 'Unknown error');
      showGlobalError(msg);
      setGlobalStatus('Error');
    }
  }
}

function doReset() {
  pause();
  clearGlobalError();
  state = GOAL.slice();
  for (const key of KEYS) {
    panels[key].path         = null;
    panels[key].exploredPath = null;
    panels[key].error        = null;
    setPanelStatus(key, 'Waiting', 'waiting');
    clearPanelStats(key);
  }
  step = 0;
  renderAll();
  setGlobalStatus('Ready');
}

function stepForward() {
  if (maxPathLen() <= 1 || step >= maxPathLen() - 1) return;
  pause();
  const prev = step;
  step++;
  renderAll(prev);
  if (step >= maxPathLen() - 1 && replayMode === 'solution')
    for (const key of KEYS)
      if (panels[key].path && !panels[key].error) setPanelStatus(key, 'Solved! ✓', 'solved');
}

function stepBack() {
  if (maxPathLen() <= 1 || step <= 0) return;
  pause();
  const prev = step;
  step--;
  renderAll(prev);
  if (replayMode === 'solution')
    for (const key of KEYS)
      if (panels[key].path && !panels[key].error) setPanelStatus(key, 'Waiting', 'waiting');
}

// ── Speed slider ──────────────────────────────────────────────────────────────

const SPEED_MS = [1800, 1200, 800, 550, 400, 280, 180, 110, 60, 30];

function applySpeed(val) {
  speed = SPEED_MS[val - 1];
  document.getElementById('speed-display').textContent =
    (1000 / speed).toFixed(1) + '×';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-prev').addEventListener('click', stepBack);
document.getElementById('btn-next').addEventListener('click', stepForward);
document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-solve').addEventListener('click', doSolve);
document.getElementById('btn-reset').addEventListener('click', doReset);
document.getElementById('global-error-close').addEventListener('click', clearGlobalError);
document.getElementById('speed-slider').addEventListener('input', e => applySpeed(+e.target.value));
document.getElementById('seek-slider').addEventListener('input', e => {
  const prev = step;
  step = +e.target.value;
  pause();
  renderAll(prev);
});
document.getElementById('btn-mode-solution').addEventListener('click', () => setReplayMode('solution'));
document.getElementById('btn-mode-explore').addEventListener('click', () => setReplayMode('explore'));

initGrids();
renderAll();
applySpeed(5);
