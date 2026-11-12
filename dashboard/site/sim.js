// SkyLanes browser QAOA simulator: an exact 9-qubit statevector simulation of the same
// circuits skylanes/qaoa.py builds in Qiskit (verified against Qiskit by dashboard/test_sim.mjs).
//
// Qubit k <-> x[i,p] with k = i*P + p; bit k of basis index z is qubit k (Qiskit little-endian).

export function buildModel(inst) {
  const D = inst.cost.length, P = inst.cost[0].length, n = D * P, N = 1 << n;
  const c = inst.cost.flat();
  const S = inst.shared;
  const groups = Array.from({ length: D }, (_, i) => Array.from({ length: P }, (_, p) => i * P + p));
  // decode every basis state once: feasible? which corridor per drone? cost, conflicts
  const feasible = new Uint8Array(N), choiceIdx = new Int32Array(N).fill(-1);
  const costOf = new Float64Array(N), confOf = new Float64Array(N);
  const plans = [];
  for (let z = 0; z < N; z++) {
    let ok = true;
    const ch = [];
    for (const g of groups) {
      const on = g.filter(k => (z >> k) & 1);
      if (on.length !== 1) { ok = false; break; }
      ch.push(on[0] % P);
    }
    let cost = 0, conf = 0;
    for (let k = 0; k < n; k++) if ((z >> k) & 1) cost += c[k];
    for (let k = 0; k < n; k++) for (let l = k + 1; l < n; l++)
      if (((z >> k) & 1) && ((z >> l) & 1)) conf += S[k][l];
    costOf[z] = cost; confOf[z] = conf;
    if (ok) { feasible[z] = 1; choiceIdx[z] = plans.length; plans.push({ z, choice: ch, cost, conf }); }
  }
  return { D, P, n, N, c, S, groups, feasible, choiceIdx, costOf, confOf, plans };
}

// Penalty weight: just above the most any single drone can contribute (skylanes.formulation.penalty_weight).
export function penaltyWeight(m, mu) {
  let worst = 0;
  for (let i = 0; i < m.D; i++) {
    let own = 0;
    for (const k of m.groups[i]) own = Math.max(own, m.c[k]);
    let coupling = 0;
    for (let j = 0; j < m.D; j++) {
      if (j === i) continue;
      let mx = 0;
      for (const k of m.groups[i]) for (const l of m.groups[j]) mx = Math.max(mx, m.S[k][l]);
      coupling += mx;
    }
    worst = Math.max(worst, own + mu * coupling);
  }
  return worst + 1;
}

// QUBO energy of every bitstring + the Ising normalisation Qiskit uses (largest |coefficient|).
export function problem(m, mu, mixer) {
  const pen = mixer === 'x' ? penaltyWeight(m, mu) : 0;
  const lin = new Float64Array(m.n), quad = Array.from({ length: m.n }, () => new Float64Array(m.n));
  for (let k = 0; k < m.n; k++) lin[k] = m.c[k] - pen;              // P(1 - sum x)^2 = P - P sum x + 2P sum_{p<q} x_p x_q
  for (let k = 0; k < m.n; k++) for (let l = k + 1; l < m.n; l++) {
    let q = mu * m.S[k][l];
    if (pen && Math.floor(k / m.P) === Math.floor(l / m.P)) q += 2 * pen;
    quad[k][l] = q;
  }
  // x = (1 - Z)/2  ->  h_k Z_k + J_kl Z_k Z_l
  let scale = 0;
  for (let k = 0; k < m.n; k++) {
    let h = -lin[k] / 2;
    for (let l = 0; l < m.n; l++) if (l !== k) h -= (k < l ? quad[k][l] : quad[l][k]) / 4;
    if (Math.abs(h) > 1e-12) scale = Math.max(scale, Math.abs(h));
    for (let l = k + 1; l < m.n; l++) if (quad[k][l]) scale = Math.max(scale, Math.abs(quad[k][l] / 4));
  }
  const E = new Float64Array(m.N);
  for (let z = 0; z < m.N; z++) {
    let e = m.costOf[z] + mu * m.confOf[z];
    if (pen) for (const g of m.groups) { let s = 0; for (const k of g) s += (z >> k) & 1; e += pen * (1 - s) * (1 - s); }
    E[z] = e;
  }
  return { E, scale, penalty: pen };
}

// |gamma, beta> = prod_l exp(-i beta_l H_M) exp(-i gamma_l H_C / scale) |psi_0>; returns probabilities.
export function simulate(m, prob, params, mixer) {
  const { N, n } = m, p = params.length / 2;
  const re = new Float64Array(N), im = new Float64Array(N);
  if (mixer === 'x') re.fill(1 / Math.sqrt(N));
  else { const a = 1 / Math.sqrt(m.plans.length); for (const pl of m.plans) re[pl.z] = a; }
  for (let l = 0; l < p; l++) {
    const gamma = params[l], beta = params[p + l];
    for (let z = 0; z < N; z++) {                        // diagonal cost layer
      const ph = -gamma * prob.E[z] / prob.scale, cs = Math.cos(ph), sn = Math.sin(ph);
      const r = re[z], i = im[z];
      re[z] = r * cs - i * sn; im[z] = r * sn + i * cs;
    }
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const rot = (a, b) => {                             // [[c, -is], [-is, c]] on amplitudes a, b
      const ar = re[a], ai = im[a], br = re[b], bi = im[b];
      re[a] = cb * ar + sb * bi; im[a] = cb * ai - sb * br;
      re[b] = cb * br + sb * ai; im[b] = cb * bi - sb * ar;
    };
    if (mixer === 'x') {                                  // RX(2 beta) on every qubit
      for (let k = 0; k < n; k++) { const bit = 1 << k; for (let z = 0; z < N; z++) if (!(z & bit)) rot(z, z | bit); }
    } else {                                              // XXPlusYY(2 beta) on a ring inside each drone's group
      for (const g of m.groups) {
        const ring = g.length === 2 ? [[g[0], g[1]]] : g.map((k, j) => [k, g[(j + 1) % g.length]]);
        for (const [a, b] of ring) {
          const ba = 1 << a, bb = 1 << b;
          for (let z = 0; z < N; z++) if ((z & ba) && !(z & bb)) rot(z, (z & ~ba) | bb);  // |..1_a 0_b..> <-> |..0_a 1_b..>
        }
      }
    }
  }
  const pr = new Float64Array(N);
  for (let z = 0; z < N; z++) pr[z] = re[z] * re[z] + im[z] * im[z];
  return pr;
}

export function exact(m, mu) {
  const t0 = performance.now();
  let best = Infinity, worst = -Infinity;
  for (const pl of m.plans) { const f = pl.cost + mu * pl.conf; best = Math.min(best, f); worst = Math.max(worst, f); }
  const winners = m.plans.filter(pl => Math.abs(pl.cost + mu * pl.conf - best) < 1e-9);
  return { best, worst, winners, ms: performance.now() - t0 };
}

export function metrics(m, mu, probs) {
  const ex = exact(m, mu);
  let pF = 0, pO = 0, sumF = 0, bestZ = -1;
  for (const pl of m.plans) {
    const q = probs[pl.z], f = pl.cost + mu * pl.conf;
    pF += q; sumF += q * f;
    if (Math.abs(f - ex.best) < 1e-9) pO += q;
    if (bestZ < 0 || q > probs[bestZ]) bestZ = pl.z;
  }
  const meanF = pF > 0 ? sumF / pF : NaN;
  const ratio = ex.worst > ex.best ? (ex.worst - meanF) / (ex.worst - ex.best) : 1;
  const top = m.plans[m.choiceIdx[bestZ]];
  return {
    pFeasible: pF, pOptimal: pO, ratio, meanF,
    top: { ...top, f: top.cost + mu * top.conf, optimal: Math.abs(top.cost + mu * top.conf - ex.best) < 1e-9 },
    randomValid: ex.winners.length / m.plans.length, randomAny: ex.winners.length / m.N, exact: ex,
  };
}

// --- live optimisation: Nelder-Mead on <E>, seeded starts + INTERP warm start ------------------
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function nelderMead(f, x0, { maxEvals = 400, step = 0.3 } = {}) {
  const d = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < d; i++) { const x = x0.slice(); x[i] += step; simplex.push(x); }
  let vals = simplex.map(f), evals = d + 1;
  while (evals < maxEvals) {
    const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = idx.map(i => simplex[i]); vals = idx.map(i => vals[i]);
    if (Math.abs(vals[d] - vals[0]) < 1e-9) break;
    const cen = Array(d).fill(0);
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cen[j] += simplex[i][j] / d;
    const pt = t => cen.map((cj, j) => cj + t * (simplex[d][j] - cj));
    const xr = pt(-1), fr = f(xr); evals++;
    if (fr < vals[0]) { const xe = pt(-2), fe = f(xe); evals++; if (fe < fr) { simplex[d] = xe; vals[d] = fe; } else { simplex[d] = xr; vals[d] = fr; } }
    else if (fr < vals[d - 1]) { simplex[d] = xr; vals[d] = fr; }
    else {
      const xc = pt(0.5), fc = f(xc); evals++;
      if (fc < vals[d]) { simplex[d] = xc; vals[d] = fc; }
      else { for (let i = 1; i <= d; i++) { simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j])); vals[i] = f(simplex[i]); evals++; } }
    }
  }
  const b = vals.indexOf(Math.min(...vals));
  return { x: simplex[b], fun: vals[b], evals };
}

function interp(v, reps) {
  const p = v.length;
  if (!p) return Array(reps).fill(0.1);
  return Array.from({ length: reps }, (_, i) => (i / p) * (i - 1 >= 0 ? v[i - 1] : 0) + ((p - i) / p) * (i < p ? v[i] : 0));
}

export function optimise(m, prob, reps, mixer, { starts = 6, seed = 7, maxEvals = 400, warm = null } = {}) {
  const r = rng(seed + reps);
  const f = x => { const pr = simulate(m, prob, x, mixer); let s = 0; for (let z = 0; z < m.N; z++) s += pr[z] * prob.E[z]; return s; };
  const inits = Array.from({ length: starts }, () => [
    ...Array.from({ length: reps }, () => r() * Math.PI), ...Array.from({ length: reps }, () => r() * Math.PI / 2)]);
  if (warm) inits.unshift([...interp(warm.slice(0, reps - 1), reps), ...interp(warm.slice(reps - 1), reps)]);
  let best = null, evals = 0;
  for (const x0 of inits) { const res = nelderMead(f, x0, { maxEvals }); evals += res.evals; if (!best || res.fun < best.fun) best = res; }
  return { params: best.x, expectation: best.fun, evals };
}

export function sampleShots(probs, shots, seed = 7) {
  const r = rng(seed), cdf = new Float64Array(probs.length);
  let acc = 0;
  for (let z = 0; z < probs.length; z++) { acc += probs[z]; cdf[z] = acc; }
  const counts = new Map();
  for (let s = 0; s < shots; s++) {
    const u = r() * acc;
    let lo = 0, hi = probs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; }
    counts.set(lo, (counts.get(lo) || 0) + 1);
  }
  return counts;
}
