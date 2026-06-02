// 15-Puzzle Algorithm Comparator — 7-algorithm edition
// Panels show any of: A* / IDA* / WD+A* / WD+IDA* / PDB-row / PDB-diag / PDB-max, selectable via dropdown.

const API_BASE = "https://puzzle-api-m99y.onrender.com";
const API_URL  = API_BASE + '/compare';

const SIZE = 4;
const CELL = 56;   // px per grid cell  → 4 × 56 = 224 px
const GAP  = 3;    // px tile offset inside cell

const GOAL      = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
const ALGO_KEYS = ['astar','idastar','wdastar','wdidastar','pdbidastar','diagidastar','maxidastar'];

const ALGO_LABELS = {
  astar:       'A*',
  idastar:     'IDA*',
  wdastar:     'WD+A*',
  wdidastar:   'WD+IDA*',
  pdbidastar:  'PDB-row',
  diagidastar: 'PDB-diag',
  maxidastar:  'PDB-max',
};
const ALGO_DESC = {
  astar:       'Best-first search',
  idastar:     'Iterative deepening',
  wdastar:     'WD heuristic, A*',
  wdidastar:   'WD heuristic, IDA*',
  pdbidastar:  'Row PDB, IDA*',
  diagidastar: 'Diagonal PDB, IDA*',
  maxidastar:  'max(row,diag) PDB, IDA*',
};
const ALGO_BADGE = {
  astar:       'b-a',
  idastar:     'b-ida',
  wdastar:     'b-wda',
  wdidastar:   'b-wida',
  pdbidastar:  'b-pdb',
  diagidastar: 'b-pdb-diag',
  maxidastar:  'b-pdb-max',
};

const MOVE_DELTA = { up:[-1,0], down:[1,0], left:[0,-1], right:[0,1] };

// ── Shared state ──────────────────────────────────────────────────────────────
let board      = GOAL.slice();
let step       = 0;
let playing    = false;
let timer      = null;
let speed      = 400;
let replayMode = 'explore';

// panelAlgos[i] = which algo key panel i is currently showing
let panelAlgos = ['astar', 'pdbidastar'];

// results keyed by algo key; undefined = not yet solved
let results = {};

// per-algo solve state: 'waiting' | 'running' | 'done' | 'failed'
let algoStates = {};

// initial h values captured when board is set (used for progress bar scale)
let initMH  = 0;
let initWD  = 0;
let initPDB = 0;  // from data.h_pdb; 0 means PDB not loaded or board at goal

// tile DOM elements per panel: tileEls[panelIdx][value 1-15] = <div>
const tileEls = [{}, {}];

// ── Puzzle helpers ────────────────────────────────────────────────────────────

function manhattan(st) {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    if (!st[i]) continue;
    const v = st[i] - 1;
    d += Math.abs((i >> 2) - (v >> 2)) + Math.abs((i & 3) - (v & 3));
  }
  return d;
}

// ── Walking Distance precomputation ──────────────────────────────────────────
// Mirrors solver.py: _build_wd_table / _row_config / _col_config

function buildWdTable() {
  const goal = new Array(SIZE * SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    goal[i * SIZE + i] = i < SIZE - 1 ? SIZE : SIZE - 1;
  }
  const goalKey = goal.join(',') + ',' + (SIZE - 1);

  const table = new Map([[goalKey, 0]]);
  const queue = [{ T: goal, br: SIZE - 1, dist: 0 }];
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
          nT[br * SIZE + g]++;
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
  return (_WD_TABLE.get(rowConfig(state)) ?? 0) + (_WD_TABLE.get(colConfig(state)) ?? 0);
}

function getNeighbors(st) {
  const z = st.indexOf(0), r = z >> 2, c = z & 3, ns = [];
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const nr = r+dr, nc = c+dc;
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

function buildExploredPath(log) {
  return (log && log.length) ? log.map(b => b.slice()) : null;
}

// ── Grid init ─────────────────────────────────────────────────────────────────

function initGrids() {
  for (let p = 0; p < 2; p++) {
    const grid    = document.getElementById('grid-' + p);
    const overlay = document.getElementById('loading-' + p);
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

function activePath(p) {
  const key = panelAlgos[p];
  const r   = results[key];
  if (!r || r.error) return null;
  return replayMode === 'explore' ? r.exploredPath : r.path;
}

function renderPanel(p, prevStep) {
  const path = activePath(p);
  let st, prevSt = null;
  if (path) {
    const idx = Math.min(step, path.length - 1);
    st = path[idx];
    if (prevStep !== null) {
      const pi = Math.min(prevStep, path.length - 1);
      if (pi !== idx) prevSt = path[pi];
    }
  } else {
    st = board;
  }
  if (prevSt) flashPanel(p, prevSt, st);
  placePanel(p, st);
  updateHBar(p, st);
}

function renderAll(prevStep = null) {
  renderPanel(0, prevStep);
  renderPanel(1, prevStep);
  syncProgress();
}

// ── h-bar update ──────────────────────────────────────────────────────────────

function updateHBar(p, st) {
  const mh = manhattan(st);
  const wd = walkingDistance(st);

  // Progress ratio: 0% at initial board (h=initH), 100% at goal (h=0).
  // Clamped to [0, 100] so bars never overflow the track.
  const mhPct = initMH > 0 ? Math.max(0, Math.min(100, Math.round((1 - mh / initMH) * 100))) : 0;
  const wdPct = initWD > 0 ? Math.max(0, Math.min(100, Math.round((1 - wd / initWD) * 100))) : 0;

  document.getElementById('p' + p + '-hmh').textContent = mh;
  document.getElementById('p' + p + '-hwd').textContent = wd;
  document.getElementById('p' + p + '-hcompare').classList.remove('hidden');
  document.getElementById('p' + p + '-mhlabel').textContent = 'MH:' + mh;
  document.getElementById('p' + p + '-wdlabel').textContent = 'WD:' + wd;
  document.getElementById('p' + p + '-mhbar').style.width = mhPct + '%';
  document.getElementById('p' + p + '-wdbar').style.width = wdPct + '%';

  // PDB bar: index into exploredHPdb using the current explore-step index.
  // Only valid in Explore Replay; show "—" in Solution Replay or when unavailable.
  const pdblabel = document.getElementById('p' + p + '-pdblabel');
  const pdbbar   = document.getElementById('p' + p + '-pdbbar');
  let pdbVal = null;

  if (replayMode === 'explore') {
    const key = panelAlgos[p];
    const r   = results[key];
    if (r && !r.error && r.exploredHPdb && r.exploredHPdb.length > 0
        && initPDB > 0) {
      const exploredPath = r.exploredPath;
      if (exploredPath) {
        const idx = Math.min(step, exploredPath.length - 1);
        const raw = r.exploredHPdb[idx];
        if (typeof raw === 'number') pdbVal = raw;
      }
    }
  }

  if (pdbVal !== null) {
    // Clamp to [0, 100%]: h_pdb can temporarily exceed initPDB during IDA* backtrack
    const pdbPct = Math.max(0, Math.min(100, Math.round((1 - pdbVal / initPDB) * 100)));
    pdblabel.textContent  = 'PDB:' + pdbVal;
    pdbbar.style.width    = pdbPct + '%';
  } else {
    pdblabel.textContent  = 'PDB:—';
    pdbbar.style.width    = '0%';
  }
}

// ── Stats & status ────────────────────────────────────────────────────────────

function setPanelResult(p) {
  const key = panelAlgos[p];
  const r   = results[key];

  if (!r) {
    document.getElementById('p'+p+'-explored').textContent = '—';
    document.getElementById('p'+p+'-moves').textContent    = '—';
    document.getElementById('p'+p+'-time').textContent     = '—';
    setPanelStatus(p, 'Waiting', 'waiting');
    return;
  }

  if (r.error) {
    const t = (r.time_ms / 1000).toFixed(2) + ' s';
    document.getElementById('p'+p+'-explored').textContent = r.states_explored ? r.states_explored.toLocaleString() : '—';
    document.getElementById('p'+p+'-moves').textContent    = '—';
    document.getElementById('p'+p+'-time').textContent     = t;
    const isTimeout = r.error.startsWith('Timeout');
    setPanelStatus(p, isTimeout ? '⏱ Timeout' : '❌ State limit exceeded',
      isTimeout ? 'error-timeout' : 'error-limit');
    return;
  }

  const exploredEl = document.getElementById('p'+p+'-explored');
  const movesEl    = document.getElementById('p'+p+'-moves');
  const timeEl     = document.getElementById('p'+p+'-time');

  exploredEl.textContent = r.states_explored.toLocaleString();
  movesEl.textContent    = r.optimal_moves;
  timeEl.textContent     = (r.time_ms / 1000).toFixed(3) + ' s';

  // Color time: green if under 1s, orange if over 5s
  timeEl.className = 'stat-val' + (r.time_ms < 1000 ? ' green' : r.time_ms > 5000 ? ' orange' : '');
}

function setPanelStatus(p, msg, type) {
  const el = document.getElementById('p'+p+'-status');
  el.textContent = msg;
  el.className   = 'panel-status ' + type;
}

// ── Panel header (badge + desc) ───────────────────────────────────────────────

function updatePanelHeader(p) {
  const key = panelAlgos[p];
  const badge = document.getElementById('p'+p+'-badge');
  const desc  = document.getElementById('p'+p+'-desc');
  badge.textContent = ALGO_LABELS[key];
  badge.className   = 'algo-badge ' + ALGO_BADGE[key];
  desc.textContent  = ALGO_DESC[key];
}

// ── Comparison table ──────────────────────────────────────────────────────────

function updateComparisonTable() {
  // ★ and colour-coding only when all algos have settled (no waiting/running left)
  const allDone = ALGO_KEYS.every(k => {
    const s = algoStates[k];
    return s === 'done' || s === 'failed';
  });

  let bestStates = Infinity, bestTime = Infinity;
  if (allDone) {
    for (const key of ALGO_KEYS) {
      const r = results[key];
      if (r && !r.error) {
        bestStates = Math.min(bestStates, r.states_explored);
        bestTime   = Math.min(bestTime,   r.time_ms);
      }
    }
  }

  for (const key of ALGO_KEYS) {
    const r     = results[key];
    const state = algoStates[key] ?? 'waiting';
    const pfx   = 'tbl-' + key + '-';

    const statusEl = document.getElementById(pfx + 'status');
    const statesEl = document.getElementById(pfx + 'states');
    const timeEl   = document.getElementById(pfx + 'time');

    if (state === 'waiting') {
      statusEl.innerHTML = '—'; statusEl.className = 'tbl-val';
      statesEl.innerHTML = '—'; statesEl.className = 'tbl-val';
      timeEl.innerHTML   = '—'; timeEl.className   = 'tbl-val';
      continue;
    }

    if (state === 'running') {
      statusEl.innerHTML = '<span class="tbl-spinner"></span>';
      statusEl.className = 'tbl-val';
      statesEl.innerHTML = '—'; statesEl.className = 'tbl-val';
      timeEl.innerHTML   = '—'; timeEl.className   = 'tbl-val';
      continue;
    }

    // done or failed — r is guaranteed to exist
    if (r && r.error) {
      const isTimeout = r.error.startsWith('Timeout');
      statusEl.innerHTML   = '<span class="status-pill sp-fail">✗</span>';
      statusEl.className   = 'tbl-val';
      statesEl.textContent = r.states_explored ? r.states_explored.toLocaleString() : '—';
      statesEl.className   = 'tbl-val val-fail';
      timeEl.textContent   = (r.time_ms / 1000).toFixed(1) + 's';
      timeEl.className     = 'tbl-val ' + (isTimeout ? 'val-slow' : 'val-fail');
    } else if (r) {
      statusEl.innerHTML = '<span class="status-pill sp-ok">✓</span>';
      statusEl.className = 'tbl-val';

      const isBestStates = allDone && r.states_explored === bestStates;
      const isSlowStates = allDone && r.states_explored > bestStates * 5;
      statesEl.textContent = r.states_explored.toLocaleString() + (isBestStates ? '★' : '');
      statesEl.className   = 'tbl-val ' + (isBestStates ? 'val-best' : isSlowStates ? 'val-slow' : 'val-mid');

      const isBestTime = allDone && r.time_ms === bestTime;
      const isSlowTime = allDone && r.time_ms > bestTime * 5;
      timeEl.textContent = (r.time_ms / 1000).toFixed(2) + 's';
      timeEl.className   = 'tbl-val ' + (isBestTime ? 'val-best' : isSlowTime ? 'val-slow' : 'val-mid');
    }
  }
}

// ── Progress / seek ───────────────────────────────────────────────────────────

function maxPathLen() {
  let max = 1;
  for (let p = 0; p < 2; p++) {
    const path = activePath(p);
    if (path) max = Math.max(max, path.length);
  }
  return max;
}

function syncProgress() {
  const slider  = document.getElementById('seek-slider');
  const maxLen  = maxPathLen();
  if (maxLen <= 1) {
    slider.max = 0; slider.value = 0; slider.disabled = true;
    return;
  }
  slider.max      = maxLen - 1;
  slider.value    = step;
  slider.disabled = false;
}

// ── Loading ───────────────────────────────────────────────────────────────────

function showLoading(visible) {
  for (let p = 0; p < 2; p++)
    document.getElementById('loading-' + p).classList.toggle('hidden', !visible);
}

// Show/hide each panel's loading overlay based on whether its algo is 'running'.
function updatePanelLoading() {
  for (let p = 0; p < 2; p++) {
    const state   = algoStates[panelAlgos[p]] ?? 'waiting';
    const overlay = document.getElementById('loading-' + p);
    overlay.classList.toggle('hidden', state !== 'running');
  }
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
  document.getElementById('btn-play').innerHTML = val ? '&#9646;&#9646; Pause' : '&#9654; Play';
}

function tick() {
  if (!playing) return;
  const maxLen = maxPathLen();
  if (step >= maxLen - 1) {
    setPlaying(false);
    if (replayMode === 'solution') {
      for (let p = 0; p < 2; p++) {
        const key = panelAlgos[p];
        if (results[key] && !results[key].error) setPanelStatus(p, 'Solved! ✓', 'solved');
      }
    }
    return;
  }
  const prev = step++;
  renderAll(prev);
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

// ── Replay mode ───────────────────────────────────────────────────────────────

function setReplayMode(mode) {
  replayMode = mode;
  document.getElementById('btn-mode-explore').classList.toggle('active-mode',  mode === 'explore');
  document.getElementById('btn-mode-solution').classList.toggle('active-mode', mode === 'solution');
  pause(); step = 0; renderAll();
}

// ── Switch panel algorithm ────────────────────────────────────────────────────

function switchPanelAlgo(p, key) {
  panelAlgos[p] = key;
  updatePanelHeader(p);
  setPanelResult(p);
  pause();
  step = 0;
  renderAll();
}

// ── Actions ───────────────────────────────────────────────────────────────────

function setBusy(busy) {
  ['btn-shuffle','btn-solve','btn-reset','btn-play','btn-prev','btn-next',
   'btn-mode-explore','btn-mode-solution','p0-select','p1-select']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = busy;
    });
}

function doShuffle() {
  pause(); clearGlobalError();
  board      = randomShuffle();
  results    = {};
  algoStates = {};
  initMH     = manhattan(board);
  initWD     = walkingDistance(board);
  initPDB    = 0;
  for (let p = 0; p < 2; p++) { setPanelResult(p); setPanelStatus(p, 'Waiting', 'waiting'); }
  updateComparisonTable();
  step = 0; renderAll();
}

async function doSolve() {
  pause(); clearGlobalError();
  setBusy(true);
  results    = {};
  initPDB    = 0;
  algoStates = {};
  ALGO_KEYS.forEach(k => { algoStates[k] = 'waiting'; });
  updateComparisonTable();
  for (let p = 0; p < 2; p++) { setPanelResult(p); setPanelStatus(p, 'Waiting', 'waiting'); }

  const _raw    = parseFloat(document.getElementById('max-time-input').value);
  const maxTime = Math.min(300, Math.max(1, isNaN(_raw) ? 30 : _raw));
  const solveStart = Date.now();

  // Wake-up ping for Render cold-start
  try { await fetch(API_BASE + '/warmup'); } catch (_) {}

  let aborted = false;

  for (const algo of ALGO_KEYS) {
    // If board is unsolvable (detected on first call), mark remaining as failed
    if (aborted) {
      algoStates[algo] = 'failed';
      results[algo]    = { error: 'Skipped', time_ms: 0, states_explored: 0 };
      updateComparisonTable();
      continue;
    }

    // Mark this algo as running and show spinner
    algoStates[algo] = 'running';
    updateComparisonTable();
    updatePanelLoading();
    for (let p = 0; p < 2; p++) {
      if (panelAlgos[p] === algo) setPanelStatus(p, 'Solving…', 'waiting');
    }

    const ctrl    = new AbortController();
    // Each /solve_one call has its own budget: max_time + 15 s network buffer
    const timeout = setTimeout(() => ctrl.abort(), (maxTime + 15) * 1000);

    try {
      const res = await fetch(API_BASE + '/solve_one', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ board, algo, max_time: maxTime }),
        signal:  ctrl.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg  = body.detail ?? `HTTP ${res.status}`;
        if (res.status === 400) {
          // Unsolvable board — show error and skip remaining algos
          showGlobalError(msg);
          aborted = true;
          for (let p = 0; p < 2; p++) setPanelStatus(p, 'Error', 'error');
        }
        algoStates[algo] = 'failed';
        results[algo]    = { error: msg, time_ms: 0, states_explored: 0 };
        updateComparisonTable();
        updatePanelLoading();
        for (let p = 0; p < 2; p++) {
          if (panelAlgos[p] === algo) setPanelResult(p);
        }
        continue;
      }

      const data = await res.json();

      // Capture initPDB from first response that carries it
      if (initPDB === 0 && data.h_pdb) initPDB = data.h_pdb;

      if (data.error) {
        // Server-side timeout or state-limit — per-algo failure, continue others
        results[algo]    = { error: data.error, time_ms: data.time_ms,
                             states_explored: data.states_explored };
        algoStates[algo] = 'failed';
      } else {
        results[algo] = {
          ...data,
          path:         buildPath(board, data.moves),
          exploredPath: buildExploredPath(data.explored_log ?? []),
          exploredHPdb: data.explored_h_pdb ?? [],
        };
        algoStates[algo] = 'done';
      }

    } catch (err) {
      clearTimeout(timeout);
      algoStates[algo] = 'failed';
      if (err.name === 'AbortError') {
        const secs = Math.round((Date.now() - solveStart) / 1000);
        results[algo] = { error: `Timed out (${secs}s)`,
                          time_ms: (maxTime + 15) * 1000, states_explored: 0 };
      } else {
        const msg = err instanceof TypeError && (err.message || '').toLowerCase().includes('fetch')
          ? `Cannot reach ${API_BASE} — API may be sleeping`
          : (err.message || 'Network error');
        results[algo] = { error: msg, time_ms: 0, states_explored: 0 };
        if (err instanceof TypeError) { showGlobalError(msg); aborted = true; }
      }
    }

    // Immediately update comparison row and any panel showing this algo
    updateComparisonTable();
    updatePanelLoading();
    for (let p = 0; p < 2; p++) {
      if (panelAlgos[p] === algo) {
        setPanelResult(p);
        step = 0;
        renderAll();
      }
    }
  }

  // All done: final ★ computation, cleanup, auto-play
  setBusy(false);
  updateComparisonTable();   // recomputes with allDone=true → adds ★
  updatePanelLoading();
  for (let p = 0; p < 2; p++) setPanelResult(p);
  step = 0;
  renderAll();
  if (ALGO_KEYS.some(k => results[k] && !results[k].error)) play();
}

function doReset() {
  pause(); clearGlobalError();
  board      = GOAL.slice();
  results    = {};
  algoStates = {};
  initMH     = 0;
  initWD     = 0;
  initPDB    = 0;
  for (let p = 0; p < 2; p++) { setPanelResult(p); setPanelStatus(p, 'Waiting', 'waiting'); }
  updateComparisonTable();
  step = 0; renderAll();
}

function stepForward() {
  if (maxPathLen() <= 1 || step >= maxPathLen()-1) return;
  pause();
  const prev = step++;
  renderAll(prev);
  if (step >= maxPathLen()-1 && replayMode === 'solution')
    for (let p = 0; p < 2; p++) {
      const key = panelAlgos[p];
      if (results[key] && !results[key].error) setPanelStatus(p, 'Solved! ✓', 'solved');
    }
}

function stepBack() {
  if (maxPathLen() <= 1 || step <= 0) return;
  pause();
  const prev = step--;
  renderAll(prev);
}

// ── Speed ─────────────────────────────────────────────────────────────────────

const SPEED_MS = [1800,1200,800,550,400,280,180,110,60,30];

function applySpeed(val) {
  speed = SPEED_MS[val - 1];
  document.getElementById('speed-display').textContent = (1000/speed).toFixed(1) + '×';
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.getElementById('btn-play').addEventListener('click', togglePlay);
document.getElementById('btn-prev').addEventListener('click', stepBack);
document.getElementById('btn-next').addEventListener('click', stepForward);
document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
document.getElementById('btn-solve').addEventListener('click', doSolve);
document.getElementById('btn-reset').addEventListener('click', doReset);
document.getElementById('global-error-close').addEventListener('click', clearGlobalError);
document.getElementById('btn-mode-explore').addEventListener('click',  () => setReplayMode('explore'));
document.getElementById('btn-mode-solution').addEventListener('click', () => setReplayMode('solution'));
document.getElementById('speed-slider').addEventListener('input', e => applySpeed(+e.target.value));
document.getElementById('seek-slider').addEventListener('input', e => {
  const prev = step;
  step = +e.target.value;
  pause();
  renderAll(prev);
});

// Panel dropdowns
for (let p = 0; p < 2; p++) {
  document.getElementById('p'+p+'-select').addEventListener('change', e => {
    switchPanelAlgo(p, e.target.value);
  });
}

// Replay buttons in comparison table
document.querySelectorAll('.replay-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.algo;
    // Put in panel 0 if neither panel shows it; prefer panel 1 if panel 0 already shows another solved algo
    const p = panelAlgos[0] === key ? 0 : panelAlgos[1] === key ? 1 : 0;
    // Switch the panel that doesn't currently hold a solved algo, or just panel 0
    const targetPanel = (results[panelAlgos[0]] && !results[panelAlgos[0]].error &&
                         panelAlgos[0] !== key) ? 1 : 0;
    document.getElementById('p'+targetPanel+'-select').value = key;
    switchPanelAlgo(targetPanel, key);
    setReplayMode('solution');
    step = 0;
    play();
  });
});

initGrids();
for (let p = 0; p < 2; p++) { updatePanelHeader(p); }
renderAll();
applySpeed(5);
