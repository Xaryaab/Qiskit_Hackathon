import { buildModel, problem, simulate, metrics, optimise, sampleShots, exact } from './sim.js';

const data = await (await fetch('data.json')).json();
const inst = data.instance;
const m = buildModel(inst);
const QMU = [0.25, 0.75, 1.5];
const SHOTS = 4096;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const COLORS = ['var(--drone-1)', 'var(--drone-2)', 'var(--drone-3)'];

const state = {
  mu: 1.5, mixer: 'xy', reps: 2, source: 'qiskit', view: 'quantum',
  probs: null, params: null, prob: null, met: null, timing: null, counts: null, shotsDone: 0, busy: false,
};

// ---------- helpers -------------------------------------------------------------------------
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const plan = ch => `(${ch.map(c => c + 1).join(', ')})`;
const isQ = mu => QMU.some(q => Math.abs(q - mu) < 1e-9);
const nearestQ = mu => QMU.reduce((a, b) => Math.abs(b - mu) < Math.abs(a - mu) ? b : a);
const qiskitRun = (mu, mixer, reps) => data.runs.find(r => Math.abs(r.mu - mu) < 1e-9 && r.mixer === mixer && r.reps === reps);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
// The user's choice of source is kept; the recorded Qiskit run is used whenever one exists at this mu.
const source = () => (state.source === 'qiskit' && isQ(state.mu) ? 'qiskit' : 'live');
const mixerName = mx => (mx === 'xy' ? 'XY mixer (rule built in)' : 'penalty (rule as a fine)');

// ---------- computation ---------------------------------------------------------------------
async function compute({ animate = true } = {}) {
  state.counts = null; state.shotsDone = 0;
  state.prob = problem(m, state.mu, state.mixer);
  if (source() === 'qiskit') {
    const run = qiskitRun(state.mu, state.mixer, state.reps);
    state.params = run.params;
    state.probs = Float64Array.from(run.probs);
    state.timing = { how: 'Qiskit statevector + COBYLA, recorded run', seconds: run.seconds, evals: run.evals };
    setStatus(`Loaded the recorded Qiskit run: μ = ${state.mu}, ${mixerName(state.mixer)}, depth ${state.reps}.`);
  } else {
    setBusy(true, `Optimising ${2 * state.reps} circuit angles in this browser…`);
    await nextFrame();
    const t0 = performance.now();
    let warm = null, res = null, evals = 0;
    for (let p = 1; p <= state.reps; p++) {
      res = optimise(m, state.prob, p, state.mixer, { starts: 6, warm });
      warm = res.params; evals += res.evals;
    }
    state.params = res.params;
    state.probs = simulate(m, state.prob, res.params, state.mixer);
    const secs = (performance.now() - t0) / 1000;
    state.timing = { how: 'Nelder–Mead in this browser, live', seconds: secs, evals };
    setBusy(false, `Optimised live in ${secs < 1 ? (secs * 1000).toFixed(0) + ' ms' : secs.toFixed(2) + ' s'} (${evals.toLocaleString()} circuit simulations).`);
  }
  state.met = metrics(m, state.mu, state.probs);
  state.met.exact.ms = timeExact();
  render(animate);
}

// One exact solve takes microseconds, below timer resolution: average over many runs.
function timeExact(reps = 2000) {
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) exact(m, state.mu);
  return (performance.now() - t0) / reps;
}

async function runShots() {
  if (!state.probs || state.busy) return;
  setBusy(true, `Sampling ${SHOTS.toLocaleString()} shots…`);
  state.counts = new Map(); state.shotsDone = 0;
  const batches = 16, per = SHOTS / batches;
  for (let b = 0; b < batches; b++) {
    for (const [z, c] of sampleShots(state.probs, per, 1000 + b)) state.counts.set(z, (state.counts.get(z) || 0) + c);
    state.shotsDone += per;
    renderHist();
    if (!reduceMotion) await new Promise(r => setTimeout(r, 70));
  }
  let best = 0, valid = 0;
  for (const [z, c] of state.counts) {
    if (m.feasible[z]) { valid += c; const pl = m.plans[m.choiceIdx[z]]; if (Math.abs(pl.cost + state.mu * pl.conf - state.met.exact.best) < 1e-9) best += c; }
  }
  setBusy(false, `${SHOTS.toLocaleString()} shots: ${best.toLocaleString()} were an exact best plan, ${valid.toLocaleString()} were valid. ` +
    (best > 0 ? 'Checking each shot classically recovers the best plan.' : 'No shot hit a best plan this time.'));
}

function setBusy(on, msg) {
  state.busy = on;
  $('run').disabled = on; $('shots').disabled = on;
  if (msg) setStatus(msg);
}
function setStatus(msg) { $('status').textContent = msg; }

// ---------- rendering -----------------------------------------------------------------------
function render(animate) {
  renderControls();
  renderMap(animate);
  renderDuel();
  renderHist();
  renderPareto();
  renderDepth();
  renderCircuit();
}

function renderControls() {
  $('mu-out').textContent = state.mu.toFixed(2).replace(/0$/, '');
  for (const b of document.querySelectorAll('[data-mixer]')) b.setAttribute('aria-pressed', b.dataset.mixer === state.mixer);
  for (const b of document.querySelectorAll('[data-reps]')) b.setAttribute('aria-pressed', +b.dataset.reps === state.reps);
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', b.dataset.view === state.view);
  const q = isQ(state.mu);
  for (const b of document.querySelectorAll('[data-source]')) {
    b.setAttribute('aria-pressed', b.dataset.source === source());
    if (b.dataset.source === 'qiskit') b.disabled = !q;
  }
  $('source-hint').textContent = source() === 'qiskit'
    ? 'Probabilities computed by Qiskit from the angles its optimiser found. Switch to live to re-optimise here.'
    : q ? 'This browser runs the same circuit with an exact 9-qubit simulator and tunes the angles itself.'
        : `No recorded Qiskit run at μ = ${state.mu}; this browser runs the same circuit with an exact 9-qubit simulator and tunes the angles itself.`;
  $('run').textContent = source() === 'qiskit' ? 'Replay Qiskit run' : 'Run QAOA live';
}

// --- airspace map ---
const PAD = 70, STEP = 126;
const pt = ([r, c]) => [PAD + c * STEP, PAD + r * STEP];
let flight = null;

function shownChoice() {
  return state.view === 'exact' ? state.met.exact.winners[0].choice : state.met.top.choice;
}

function renderMap(animate) {
  const map = clear($('map'));
  const g = inst.grid;
  for (let i = 0; i < g; i++) {
    map.append(svg('line', { x1: PAD - 30, x2: PAD + (g - 1) * STEP + 30, y1: PAD + i * STEP, y2: PAD + i * STEP, stroke: 'var(--rule)', 'stroke-width': 1 }));
    map.append(svg('line', { y1: PAD - 30, y2: PAD + (g - 1) * STEP + 30, x1: PAD + i * STEP, x2: PAD + i * STEP, stroke: 'var(--rule)', 'stroke-width': 1 }));
  }
  const costLabels = [];
  for (const s of inst.segments) {           // battery cost of each segment, drawn above the routes
    const [x1, y1] = pt(s.a), [x2, y2] = pt(s.b), horiz = y1 === y2;
    costLabels.push(svg('text', { x: (x1 + x2) / 2 + (horiz ? 0 : 12), y: (y1 + y2) / 2 + (horiz ? -10 : 4), 'font-size': 12.5, fill: 'var(--ink-soft)', 'text-anchor': horiz ? 'middle' : 'start', stroke: 'var(--panel)', 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }, s.w));
  }
  const choice = shownChoice();
  const used = new Map();
  inst.corridors.forEach((cs, i) => cs.forEach((path, p) => {   // faint candidate corridors
    const off = (i - 1) * 6;
    map.append(svg('polyline', { points: path.map(c => pt(c).map(v => v + off).join(',')).join(' '), fill: 'none', stroke: COLORS[i], 'stroke-opacity': p === choice[i] ? 0 : 0.16, 'stroke-width': 8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }));
  choice.forEach((p, i) => {
    const path = inst.corridors[i][p];
    for (let k = 0; k + 1 < path.length; k++) { const key = [path[k], path[k + 1]].map(String).sort().join('|'); used.set(key, (used.get(key) || 0) + 1); }
  });
  for (const [key, n] of used) {               // shared airspace in sectional magenta
    if (n < 2) continue;
    const [a, b] = key.split('|').map(s => s.split(',').map(Number));
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    map.append(svg('line', { x1, y1, x2, y2, stroke: 'var(--magenta)', 'stroke-width': 26, 'stroke-opacity': 0.22, 'stroke-linecap': 'round' }));
  }
  const routes = choice.map((p, i) => {
    const off = (i - 1) * 6, pts = inst.corridors[i][p].map(c => pt(c).map(v => v + off));
    map.append(svg('polyline', { points: pts.map(v => v.join(',')).join(' '), fill: 'none', stroke: COLORS[i], 'stroke-width': 4.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    return pts;
  });
  costLabels.forEach(t => map.append(t));
  inst.drones.forEach(([s, t], i) => {
    const [sx, sy] = pt(s), [tx, ty] = pt(t);
    map.append(svg('circle', { cx: sx, cy: sy, r: 15, fill: 'var(--panel)', stroke: COLORS[i], 'stroke-width': 3 }));
    map.append(svg('text', { x: sx, y: sy + 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: COLORS[i] }, `D${i + 1}`));
    map.append(svg('rect', { x: tx - 9, y: ty - 9, width: 18, height: 18, fill: COLORS[i], rx: 2 }));
  });
  const planes = routes.map((pts, i) => {
    const gEl = svg('g');
    gEl.append(svg('path', { d: 'M-11 -8 L11 0 L-11 8 L-6 0 Z', fill: COLORS[i], stroke: 'var(--panel)', 'stroke-width': 1.5 }));
    map.append(gEl);
    return { gEl, pts };
  });
  fly(planes, animate && !reduceMotion);

  const c = inst.cost, [x, y] = [choice.reduce((s, p, i) => s + c[i][p], 0), conflictsOf(choice)];
  const f = x + state.mu * y, best = state.met.exact.best, isBest = Math.abs(f - best) < 1e-9;
  const ties = state.met.exact.winners.length;
  $('map-legend').textContent = `${state.view === 'exact' ? 'Exact best plan' : "QAOA's most likely valid plan"} ${plan(choice)}: battery cost ${x}, ${y} shared segment${y === 1 ? '' : 's'}, score ${f.toFixed(2)}` +
    (isBest ? ` (an exact best plan${ties > 1 ? `, tied with ${ties - 1} other${ties > 2 ? 's' : ''}` : ''}).` : ` (best possible is ${best.toFixed(2)}).`) +
    ' Numbers on the grid are each segment\'s battery cost; shaded magenta marks shared airspace.';
}

function conflictsOf(choice) {
  let k = 0;
  for (let i = 0; i < choice.length; i++) for (let j = i + 1; j < choice.length; j++) k += inst.shared[i * 3 + choice[i]][j * 3 + choice[j]];
  return k;
}

function fly(planes, animate) {
  if (flight) cancelAnimationFrame(flight);
  const place = (pl, t) => {
    const segs = pl.pts.length - 1, u = Math.min(t, 0.9999) * segs, k = Math.floor(u), f = u - k;
    const [x1, y1] = pl.pts[k], [x2, y2] = pl.pts[k + 1];
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    pl.gEl.setAttribute('transform', `translate(${x1 + (x2 - x1) * f} ${y1 + (y2 - y1) * f}) rotate(${ang})`);
  };
  if (!animate) { planes.forEach(pl => place(pl, 1)); return; }
  const t0 = performance.now(), dur = 2200;
  const step = now => {
    const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    planes.forEach(pl => place(pl, e));
    if (t < 1) flight = requestAnimationFrame(step);
  };
  flight = requestAnimationFrame(step);
}

// --- classical vs quantum ---
function dl(target, rows) {
  clear(target);
  for (const [k, v, big] of rows) {
    target.append(Object.assign(document.createElement('dt'), { textContent: k }));
    const dd = document.createElement('dd');
    if (big) { const s = Object.assign(document.createElement('span'), { className: 'big', textContent: v }); dd.append(s); }
    else dd.textContent = v;
    target.append(dd);
  }
}

function renderDuel() {
  const ex = state.met.exact, mt = state.met;
  dl($('classical'), [
    ['Best score (battery + μ × shared)', ex.best.toFixed(2), true],
    ['Best plan', ex.winners.map(w => plan(w.choice)).join(' or ')],
    ['Plans checked', `${m.plans.length} of ${m.plans.length}`],
    ['Time, measured now', `${(ex.ms * 1000).toFixed(1)} µs (average of 2,000 runs)`],
    ['Exact?', 'Always'],
  ]);
  $('quantum-title').textContent = `Quantum: QAOA, ${mixerName(state.mixer)}, depth ${state.reps}`;
  dl($('quantum'), [
    ['Chance one shot is a best plan', pct(mt.pOptimal), true],
    ['Against a random valid plan', `${(mt.pOptimal / mt.randomValid).toFixed(1)}× (random: ${pct(mt.randomValid)})`],
    ['Shots that obey one route per drone', pct(mt.pFeasible)],
    ['Most likely valid plan', `${plan(mt.top.choice)}${mt.top.optimal ? ', an exact best plan' : `, score ${mt.top.f.toFixed(2)}`}`],
    ['Tuning', `${state.timing.seconds < 1 ? (state.timing.seconds * 1000).toFixed(0) + ' ms' : state.timing.seconds.toFixed(1) + ' s'}, ${state.timing.evals.toLocaleString()} simulations (${state.timing.how})`],
  ]);
  const ratio = mt.pOptimal / mt.randomValid;
  const speed = state.timing.seconds * 1000 / Math.max(ex.ms, 0.001);
  $('verdict').textContent = (mt.top.optimal
    ? `QAOA's most likely answer is an exact best plan. `
    : `QAOA's most likely answer is close but not best (score ${mt.top.f.toFixed(2)} vs ${ex.best.toFixed(2)}). `) +
    (ratio >= 1.5 ? `It hits a best plan ${ratio.toFixed(1)}× more often than picking a valid plan at random. `
      : `It hits a best plan no more often than picking a valid plan at random. `) +
    `Classical search is still about ${speed >= 1e6 ? (speed / 1e6).toFixed(0) + ' million' : speed >= 1e3 ? Math.round(speed / 1e3) + ' thousand' : Math.round(speed)} times faster here.`;
}

// --- histogram ---
function renderHist() {
  const h = clear($('hist'));
  const W = 620, H = 300, L = 48, R = 12, T = 18, B = 70;
  let items, total, mode;
  if (state.counts && state.counts.size) {
    total = state.shotsDone; mode = 'shots';
    items = [...state.counts.entries()].map(([z, c]) => [z, c / total]);
  } else {
    mode = 'probs'; total = 1;
    items = [...state.probs.entries()].filter(([, q]) => q > 1e-9);
  }
  items.sort((a, b) => b[1] - a[1]); items = items.slice(0, 12);
  $('hist-sub').textContent = mode === 'shots'
    ? `${state.shotsDone.toLocaleString()} of ${SHOTS.toLocaleString()} shots sampled. Green is an exact best plan, blue is valid, magenta breaks the one-route rule.`
    : 'Exact output probabilities of the 12 most likely outcomes. Green is an exact best plan, blue is valid, magenta breaks the one-route rule. Press "Sample 4,096 shots" to measure.';
  const ymax = Math.max(0.05, Math.ceil(Math.max(...items.map(i => i[1])) * 20) / 20);
  const Y = v => T + (H - T - B) * (1 - v / ymax), bw = (W - L - R) / 12;
  for (let t = 0; t <= ymax + 1e-9; t += ymax / 4) {
    h.append(svg('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: 'var(--rule)' }));
    h.append(svg('text', { x: L - 6, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-soft)' }, pct(t, 0)));
  }
  items.forEach(([z, q], k) => {
    const feas = m.feasible[z], pl = feas ? m.plans[m.choiceIdx[z]] : null;
    const best = feas && Math.abs(pl.cost + state.mu * pl.conf - state.met.exact.best) < 1e-9;
    const fill = best ? 'var(--good)' : feas ? 'var(--airway)' : 'var(--magenta)';
    const x = L + k * bw + 5, w = bw - 10;
    const r = svg('rect', { x, y: Y(q), width: w, height: Y(0) - Y(q), fill, 'fill-opacity': feas ? 0.85 : 0.55, rx: 2 });
    r.append(svg('title', {}, `${feas ? plan(pl.choice) : 'invalid ' + z.toString(2).padStart(9, '0')}: ${pct(q)}`));
    h.append(r);
    h.append(svg('text', { x: x + w / 2, y: Y(q) - 5, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'var(--ink)' }, pct(q, 1)));
    const lab = feas ? plan(pl.choice).replace(/ /g, '') : 'invalid';
    h.append(svg('text', { x: x + w / 2, y: H - B + 18, 'text-anchor': 'end', 'font-size': 12, fill: feas ? 'var(--ink)' : 'var(--magenta)', transform: `rotate(-40 ${x + w / 2} ${H - B + 18})` }, lab));
  });
}

// --- trade-off ---
function renderPareto() {
  const s = clear($('pareto'));
  const W = 620, H = 300, L = 52, R = 16, T = 16, B = 46;
  const X = v => L + (W - L - R) * (v - 18.5) / 7, Y = v => T + (H - T - B) * (1 - (v + 0.5) / 7);
  for (let c = 19; c <= 25; c++) {
    s.append(svg('line', { x1: X(c), x2: X(c), y1: T, y2: H - B, stroke: 'var(--rule)' }));
    s.append(svg('text', { x: X(c), y: H - B + 18, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--ink-soft)' }, c));
  }
  for (let k = 0; k <= 6; k++) {
    s.append(svg('line', { x1: L, x2: W - R, y1: Y(k), y2: Y(k), stroke: 'var(--rule)' }));
    s.append(svg('text', { x: L - 8, y: Y(k) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-soft)' }, k));
  }
  s.append(svg('text', { x: (L + W - R) / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--ink-soft)' }, 'Total battery cost'));
  s.append(svg('text', { x: 14, y: (T + H - B) / 2, 'text-anchor': 'middle', 'font-size': 13, fill: 'var(--ink-soft)', transform: `rotate(-90 14 ${(T + H - B) / 2})` }, 'Shared segments'));
  const front = inst.pareto;
  s.append(svg('polyline', { points: front.map(([c, k]) => `${X(c)},${Y(k)}`).join(' '), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 2 }));
  const best = state.met.exact.best, mu = state.mu;     // iso-score line: cost + mu*conf = best
  if (mu > 1e-6) {
    const k0 = (best - 18.5) / mu, k1 = (best - 25.5) / mu;
    s.append(svg('line', { x1: X(18.5), y1: Y(Math.min(6.5, k0)), x2: X(Math.min(25.5, best + 0.5 * mu)), y2: Y(Math.max(-0.5, k1)), stroke: 'var(--airway)', 'stroke-dasharray': '6 5', 'stroke-width': 1.5 }));
  } else s.append(svg('line', { x1: X(best), x2: X(best), y1: T, y2: H - B, stroke: 'var(--airway)', 'stroke-dasharray': '6 5', 'stroke-width': 1.5 }));
  const groups = new Map();
  for (const pl of m.plans) { const key = `${pl.cost},${pl.conf}`; groups.set(key, [...(groups.get(key) || []), pl]); }
  const top = state.met.top;
  for (const [key, pls] of groups) {
    const [c, k] = key.split(',').map(Number), isBest = Math.abs(c + mu * k - best) < 1e-9;
    const dot = svg('circle', { cx: X(c), cy: Y(k), r: 5 + 2 * (pls.length - 1), fill: isBest ? 'var(--good)' : 'var(--ink-soft)', 'fill-opacity': isBest ? 0.9 : 0.35 });
    dot.append(svg('title', {}, `${pls.map(p => plan(p.choice)).join(', ')}: battery ${c}, shared ${k}`));
    s.append(dot);
    if (pls.length > 1) s.append(svg('text', { x: X(c) + 10 + 2 * pls.length, y: Y(k) + 4, 'font-size': 11, fill: 'var(--ink-soft)' }, `×${pls.length}`));
  }
  s.append(svg('circle', { cx: X(top.cost), cy: Y(top.conf), r: 13, fill: 'none', stroke: 'var(--airway)', 'stroke-width': 2.5 }));
  s.append(svg('text', { x: X(top.cost), y: Y(top.conf) - 18, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: 'var(--airway)' }, "QAOA's pick"));
}

// --- depth chart from the recorded Qiskit run ---
function renderDepth() {
  const s = clear($('depth'));
  const mu = isQ(state.mu) ? state.mu : nearestQ(state.mu);
  $('depth-sub').textContent = `Recorded Qiskit runs at μ = ${mu}${isQ(state.mu) ? '' : ` (nearest to your μ = ${state.mu})`}. Chance a single shot is an exact best plan; the dotted line is picking a valid plan at random.`;
  const W = 620, H = 280, L = 52, R = 90, T = 16, B = 40;
  const runs = data.runs.filter(r => Math.abs(r.mu - mu) < 1e-9);
  const ymax = Math.max(0.2, Math.ceil(Math.max(...runs.map(r => r.p_optimal)) * 10) / 10);
  const X = p => L + (W - L - R) * (p - 1) / 2, Y = v => T + (H - T - B) * (1 - v / ymax);
  for (let t = 0; t <= ymax + 1e-9; t += ymax / 4) {
    s.append(svg('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: 'var(--rule)' }));
    s.append(svg('text', { x: L - 8, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink-soft)' }, pct(t, 0)));
  }
  [1, 2, 3].forEach(p => s.append(svg('text', { x: X(p), y: H - B + 20, 'text-anchor': 'middle', 'font-size': 12.5, fill: 'var(--ink-soft)' }, `depth ${p}`)));
  const guess = runs[0].random_guess_p_optimal * m.N / m.plans.length;
  s.append(svg('line', { x1: L, x2: W - R, y1: Y(guess), y2: Y(guess), stroke: 'var(--ink-soft)', 'stroke-dasharray': '2 4', 'stroke-width': 1.5 }));
  s.append(svg('text', { x: W - R + 8, y: Y(guess) + 4, 'font-size': 12, fill: 'var(--ink-soft)' }, 'random valid'));
  for (const [mx, color, name] of [['x', 'var(--ink-soft)', 'Penalty'], ['xy', 'var(--airway)', 'XY mixer']]) {
    const rr = runs.filter(r => r.mixer === mx).sort((a, b) => a.reps - b.reps);
    s.append(svg('polyline', { points: rr.map(r => `${X(r.reps)},${Y(r.p_optimal)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': mx === 'xy' ? 3 : 2 }));
    for (const r of rr) {
      const sel = r.mixer === state.mixer && r.reps === state.reps;
      const c = svg('circle', { cx: X(r.reps), cy: Y(r.p_optimal), r: sel ? 7 : 4.5, fill: color, stroke: sel ? 'var(--ink)' : 'none', 'stroke-width': 2 });
      c.append(svg('title', {}, `${name}, depth ${r.reps}: ${pct(r.p_optimal)}`));
      s.append(c);
    }
    const last = rr.at(-1);
    s.append(svg('text', { x: X(3) + 12, y: Y(last.p_optimal) + (mx === 'x' && Math.abs(last.p_optimal - guess) < 0.03 ? 16 : 4), 'font-size': 12.5, 'font-weight': 600, fill: color }, `${name} ${pct(last.p_optimal, 0)}`));
  }
}

// --- noise table, circuit, scaling ---
function renderNoiseOnce() {
  const n = data.per_mu['1.5'], nx = n.noise_x, ny = n.noise_xy;
  const rows = nx.noise.map((r, i) => [r.two_qubit_error, r, ny.noise.at(i)]);
  $('noise').innerHTML = `
    <table><thead><tr><th>Two-qubit gate error</th><th>Penalty: valid</th><th>Penalty: best plan</th><th>XY: valid</th><th>XY: best plan</th></tr></thead>
    <tbody>${rows.map(([e, a, b]) => `<tr><td>${e === 0 ? 'none' : pct(e, 1)}</td><td>${pct(a.p_feasible, 0)}</td><td>${pct(a.p_optimal)}</td><td>${pct(b.p_feasible, 0)}</td><td>${pct(b.p_optimal)}</td></tr>`).join('')}</tbody></table>
    <table style="margin-top:14px"><thead><tr><th>CNOT gates after compiling</th><th>Any qubit pair connected</th><th>Chain of qubits</th><th>Extra from routing</th></tr></thead>
    <tbody><tr><td>Penalty</td><td>${nx.cx_all_to_all}</td><td>${nx.cx_linear_chain}</td><td>${(nx.cx_linear_chain / nx.cx_all_to_all).toFixed(1)}×</td></tr>
    <tr><td>XY mixer</td><td>${ny.cx_all_to_all}</td><td>${ny.cx_linear_chain}</td><td>${(ny.cx_linear_chain / ny.cx_all_to_all).toFixed(1)}×</td></tr></tbody></table>
    <p class="note">On a chip, qubits only talk to neighbours, so the circuit itself has to be routed: our routing problem gets routed.</p>`;
}

function renderCircuit() {
  const c = data.circuits[state.mixer];
  $('circuit-img').src = c.image;
  $('circuit-img').alt = `Depth-1 QAOA circuit with the ${mixerName(state.mixer)}, drawn by Qiskit`;
  $('qasm').href = c.qasm;
  $('qasm').setAttribute('download', c.qasm.split('/').at(-1));
  $('circuit-sub').textContent = state.mixer === 'xy'
    ? 'Each drone gets 3 qubits, one per route. The circuit starts every drone in an equal mix of its 3 routes, then alternates a scoring layer (RZ and RZZ gates) with swaps between a drone\'s routes (XX+YY gates), so a drone can never hold 0 or 2 routes.'
    : 'Each drone gets 3 qubits, one per route. The circuit starts in an equal mix of all 512 bitstrings, then alternates a scoring layer (RZ and RZZ gates, including the fine for broken rules) with RX rotations that let any qubit flip.';
  const ops = Object.entries(c.ops).filter(([k]) => !['measure', 'barrier'].includes(k));
  dl($('circuit-stats'), [
    ['Qubits', '9'],
    ['Gates (depth 1, compiled)', ops.map(([k, v]) => `${v} ${k}`).join(', ')],
    ['Circuit depth', String(c.depth)],
    ['Angles γ, β (recorded, μ = 1.5)', c.params.map(v => v.toFixed(3)).join(', ')],
  ]);
}

function renderScalingOnce() {
  const rr = data.scaling.runs;
  $('scaling').innerHTML = `<table><thead><tr><th>Method</th><th>Depth</th><th>Valid shots</th><th>Best-plan shots</th><th>Random valid plan</th><th>Tuning</th></tr></thead><tbody>
    ${rr.map(r => `<tr><td>${r.mixer === 'xy' ? 'XY mixer' : 'Penalty'}</td><td>${r.reps}</td><td>${pct(r.p_feasible, 0)}</td><td>${pct(r.p_optimal)}</td><td>${pct(1 / 81)}</td><td>${r.seconds.toFixed(0)} s</td></tr>`).join('')}
    <tr><td>Classical, all 81 plans</td><td></td><td>100%</td><td>100%</td><td></td><td>0.3 ms</td></tr></tbody></table>`;
}

// ---------- wiring ---------------------------------------------------------------------------
let debounce = null;
$('mu').addEventListener('input', e => {
  let v = +e.target.value;
  const near = QMU.find(q => Math.abs(q - v) <= 0.05);
  if (near !== undefined) v = near;
  state.mu = v;
  renderControls();
  clearTimeout(debounce);
  debounce = setTimeout(() => compute(), 220);
});
for (const b of document.querySelectorAll('[data-mixer]')) b.addEventListener('click', () => { state.mixer = b.dataset.mixer; compute(); });
for (const b of document.querySelectorAll('[data-reps]')) b.addEventListener('click', () => { state.reps = +b.dataset.reps; compute(); });
for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => { if (!b.disabled) { state.source = b.dataset.source; compute(); } });
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => { state.view = b.dataset.view; renderControls(); renderMap(true); });
$('run').addEventListener('click', () => compute());
$('shots').addEventListener('click', runShots);

const v = data.versions;
$('stack').textContent = `Built with Qiskit ${v.qiskit}, qiskit-optimization ${v['qiskit-optimization']} and Qiskit Aer ${v['qiskit-aer']}`;
$('verify').textContent = 'The in-browser simulator runs the same circuits as the Qiskit code and reproduces Qiskit\'s probabilities to within 5 × 10⁻⁹ on all 18 recorded runs (dashboard/test_sim.mjs).';
renderNoiseOnce();
renderScalingOnce();
compute();
