// Build SkyLanes_Report.docx from the recorded results.
//     cd report && npm install && node build_report.js
// Numbers come from dashboard/site/data.json (exported from results/ by dashboard/export_data.py).
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ImageRun, AlignmentType, BorderStyle, LevelFormat, ExternalHyperlink, Footer, PageNumber, TableLayoutType,
} = require('docx');

const ROOT = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'dashboard', 'site', 'data.json'), 'utf8'));
const OUT = process.env.REPORT_OUT || path.join(ROOT, 'SkyLanes_Report.docx');

const NAVY = '1B2A4A', SOFT = '4A5A78', BLUE = '2C5DA8', MAGENTA = 'B0287A', RULE = 'C3CFC8', HEAD_FILL = 'E2E9E3';
const FONT = 'Calibri';
const PAGE_W = 11906, MARGIN = 1134, TEXT_W = PAGE_W - 2 * MARGIN; // A4, 2 cm margins

// ---------- data helpers ----------
const run = (mu, mixer, reps) => data.runs.find(r => r.mu === mu && r.mixer === mixer && r.reps === reps);
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const MUS = [0.25, 0.75, 1.5];
const validGuess = r => r.random_guess_p_optimal * 512 / 27;
const inst = data.instance;
const perMu = data.per_mu;
const plan = ch => `(${ch.join(',')})`;

// ---------- text helpers ----------
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 22, bold: o.bold, italics: o.italics, color: o.color || '1F1F1F' });
const P = (parts, o = {}) => new Paragraph({
  children: (Array.isArray(parts) ? parts : [parts]).map(x => (typeof x === 'string' ? t(x) : x)),
  spacing: { after: o.after ?? 120, before: o.before ?? 0, line: 276 }, alignment: o.align, keepNext: o.keepNext,
});
const B = (text) => t(text, { bold: true });
const H1 = text => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text })] });
const H2 = text => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text })] });
const bullet = (parts, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  children: (Array.isArray(parts) ? parts : [parts]).map(x => (typeof x === 'string' ? t(x) : x)),
  spacing: { after: 60, line: 276 },
});
const numbered = (parts) => new Paragraph({
  numbering: { reference: 'steps', level: 0 },
  children: (Array.isArray(parts) ? parts : [parts]).map(x => (typeof x === 'string' ? t(x) : x)),
  spacing: { after: 60, line: 276 },
});
const code = text => new Paragraph({
  children: [new TextRun({ text, font: 'Consolas', size: 19, color: NAVY })],
  shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F4F1' },
  spacing: { after: 40 }, indent: { left: 200 },
});
const link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size: 22, color: BLUE, underline: {} })] });
const formula = text => new Paragraph({
  children: [new TextRun({ text, font: 'Cambria Math', size: 24, italics: false, color: NAVY })],
  alignment: AlignmentType.CENTER, spacing: { before: 80, after: 140 },
});

function table(headers, rows, widths, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scale = TEXT_W / total;
  const w = widths.map(x => Math.round(x * scale));
  w[w.length - 1] += TEXT_W - w.reduce((a, b) => a + b, 0);
  const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  const cell = (text, i, head, hl) => new TableCell({
    width: { size: w[i], type: WidthType.DXA },
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: HEAD_FILL } : hl ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EAF0FA' } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({
      alignment: i === 0 || o.leftAll ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: [t(String(text), { size: 19, bold: head || (hl && i === 0), color: head ? NAVY : '1F1F1F' })],
    })],
  });
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, o.highlight && o.highlight(k))) })),
    ],
  });
}
const gap = (after = 160) => new Paragraph({ children: [], spacing: { after } });

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}
function figure(file, caption, widthIn = 6.6) {
  const { w, h, data: buf } = pngSize(path.join(ROOT, file));
  const px = Math.round(widthIn * 96);
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 80, after: 60 },
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: px, height: Math.round(px * h / w) } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [t(caption, { size: 18, italics: true, color: SOFT })] }),
  ];
}

// ---------- content ----------
const xy3 = MUS.map(m => run(m, 'xy', 3)), pen3 = MUS.map(m => run(m, 'x', 3));
const xyMin = Math.min(...xy3.map(r => r.p_optimal)), xyMax = Math.max(...xy3.map(r => r.p_optimal));
const ratios = xy3.map(r => r.p_optimal / validGuess(r));
const nx = perMu['1.5'].noise_x, nxy = perMu['1.5'].noise_xy;
const sc = data.scaling.runs;

const children = [];
// Title block
children.push(
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'SkyLanes', font: FONT, size: 64, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Conflict-aware drone corridor routing with QAOA', font: FONT, size: 34, color: SOFT })] }),
  P([t('IBM Qiskit Hackathon: The Quantum Optimization Challenge. Domain: ', { color: SOFT }), t('UAVs & Robotics', { bold: true, color: SOFT })], { after: 200 }),
  table(['Deliverable', 'Where'], [
    ['Code (Qiskit, reproducible)', 'github.com/Xaryaab/Qiskit_Hackathon'],
    ['Live dashboard', 'skylanes-dashboard.vercel.app'],
    ['3-minute video pitch and demo', '[add the Google Drive link]'],
    ['Team', '[team name and members]'],
  ], [3, 5], { leftAll: true }),
  gap(200),
);

// 1. Summary
children.push(H1('1. Summary'),
  P('Three inspection drones must each pick one of three candidate flight corridors after a storm. The dispatcher wants low total battery use and few shared airspace segments, two goals that conflict, and every drone\'s choice affects the others. We encode the joint choice as a 9-qubit QUBO and solve it with QAOA in Qiskit, in two versions: the one-route rule as a penalty, and the rule built into the circuit with an XY mixer. Every quantum result is scored against an exact classical baseline.'),
  bullet([B('Correct mapping. '), t('The Ising Hamiltonian reproduces the QUBO on all 512 bitstrings with zero error; brute force and Qiskit\'s NumPyMinimumEigensolver agree on every optimum.')]),
  bullet([B('Design choice that matters. '), t(`At depth 3 the XY-mixer version samples an exact best plan in ${pct(xyMin, 0)}–${pct(xyMax, 0)} of shots, ${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}× a random valid plan. The penalty version never beats random guessing among valid plans.`)]),
  bullet([B('Honest verdict. '), t('No quantum speed-up is claimed: brute force solves this instance in 0.09 ms, QAOA needs 1–130 s of classical tuning. On simulated noisy hardware (1% two-qubit error) success falls to about 3%.')]),
);

// 2. Problem statement
children.push(H1('2. Problem statement'),
  P([B('Users and context. '), t('Utility and emergency operators who batch-plan drone inspection or delivery missions in shared low-altitude airspace (UAV traffic management). After a storm, several drones launch at once toward damaged assets.')]),
  P([B('Decision. '), t('Give each drone exactly one corridor from a short list of candidate routes.')]),
  P([B('Competing objectives. '), t('(1) Total flight cost: distance plus headwind energy, per grid segment. (2) Separation: the number of grid segments flown by two drones, a proxy for collision risk or forced holding. Cheap corridors tend to bunch through the same gaps, so lowering one objective raises the other.')]),
  P([B('Why it is hard. '), t('One drone\'s best route is a polynomial shortest-path problem. The difficulty is the coupling between drones: the joint choice grows as (corridors)^(drones). Three drones with three corridors give 27 plans; 20 drones with 5 corridors give 95,367,431,640,625.')]),
  P([B('Scope. '), t('A small, simulator-friendly instance (9 qubits) with an exact reference, plus a 12-qubit scaling run, as the challenge requests.')]),
);

// 3. Formulation
children.push(H1('3. Formulation'),
  P([B('Instance. '), t(`A ${inst.grid}×${inst.grid} grid of airspace cells with ${inst.segments.length} segments; segment costs drawn from {1, 1, 1, 2, 2, 3} with seed 3. Drones fly (0,0)→(3,3), (0,1)→(3,2) and (1,0)→(2,3). For each drone, the three cheapest minimum-hop corridors that differ in at least four segments are pre-computed classically.`)]),
  P([B('Decision variables. '), t('x(i,p) ∈ {0,1} equals 1 if drone i flies corridor p; qubit index k = 3i + p. Nine binary variables, no slack variables.')]),
  P([B('Objective (minimise):')], { keepNext: true }),
  formula('f(x) = Σᵢ Σₚ c(i,p)·x(i,p)  +  μ · Σ_{i<j} Σ_{p,q} s(ip, jq)·x(i,p)·x(j,q)'),
  P('c(i,p) is the corridor\'s flight cost, s(ip, jq) the number of grid segments two corridors share, and μ ≥ 0 the cost-versus-safety weight. Twelve corridor pairs share at least one segment (up to three). Without these quadratic terms the problem would be a linear assignment problem, solvable exactly in polynomial time (Hungarian algorithm); the conflict terms are what make it a genuine quadratic optimisation problem.'),
  P([B('Constraint: '), t('Σₚ x(i,p) = 1 for each drone i (one-hot).')]),
  table(['Drone', 'Route', 'Corridor 1 cost', 'Corridor 2 cost', 'Corridor 3 cost'],
    inst.cost.map((c, i) => [`D${i + 1}`, `${plan(inst.drones[i][0])} → ${plan(inst.drones[i][1])}`, c[0], c[1], c[2]]), [1, 2.4, 1.6, 1.6, 1.6]),
  P('Table 1. Corridor flight costs of the test instance.', { before: 60, after: 160 }),
  P([B('Exact reference. '), t(`All 27 feasible plans were enumerated. Pareto front (cost, shared segments): ${inst.pareto.map(p => `(${p[0]}, ${p[1]})`).join(', ')}. Each shared segment removed costs about one extra unit of battery. The weighted-sum optima used in the experiments:`)]),
  table(['μ', 'Exact optimum f', 'Optimal plans (corridor per drone)', 'Uniform random hit rate', 'Random valid plan'],
    MUS.map(m => {
      const e = perMu[String(m)];
      const r = run(m, 'xy', 1);
      return [m, e.exact_optimum.toFixed(1), e.exact_optimal_assignments.map(a => plan(a)).join(', '), pct(r.random_guess_p_optimal, 2), pct(validGuess(r), 1)];
    }), [0.8, 1.4, 3, 1.6, 1.4]),
  P('Table 2. Exact optima from brute force, confirmed by NumPyMinimumEigensolver. The Pareto point (21, 1) is optimal only at μ = 1 exactly, a known blind spot of weighted sums.', { before: 60, after: 160 }),
);

// 4. Quantum approach
children.push(H1('4. Quantum mapping and algorithm'),
  P([B('QUBO and Ising mapping. '), t('qiskit-optimization builds the QuadraticProgram; QuadraticProgramToQubo folds each one-hot constraint into a penalty P(1 − Σₚ x(i,p))². P is set just above the most any single drone can contribute (its dearest corridor plus μ times its worst-case conflicts with every other drone), plus 1. QUBO.to_ising() gives a 9-qubit diagonal Hamiltonian: 30 terms (21 ZZ) with the penalty, 21 terms (12 ZZ, one per conflicting pair) without it. The Hamiltonian is divided by its largest coefficient so circuit angles stay comparable across μ. Mapping check: diag(H) + offset equals the QUBO value for all 512 bitstrings, maximum error 0.0 for every μ.')]),
  table(['', 'Version A: penalty QAOA', 'Version B: constraint-preserving QAOA'], [
    ['Initial state', 'H on every qubit: uniform over 512 bitstrings', 'W-state per drone: uniform over the 27 valid plans'],
    ['Mixer', 'RX(2β) on every qubit', 'XX+YY rotations on a ring inside each drone\'s 3 qubits'],
    ['Cost layer', 'QUBO including the penalty', 'Objective only (no penalty needed)'],
    ['Search space', '512 bitstrings, 27 valid', 'Only the 27 valid plans (Hamming weight conserved per drone)'],
    ['Two-qubit gates per layer', '21 RZZ', '12 RZZ + 9 XX+YY'],
  ], [1.4, 2.6, 3]),
  P('Table 3. The two QAOA variants. Version B is the technical extension (Hadfield et al., Quantum Alternating Operator Ansatz).', { before: 60, after: 160 }),
  P([B('Why QAOA. '), t('The cost Hamiltonian is diagonal and 2-local, exactly what a QAOA cost layer implements (one RZ per linear term, one RZZ per conflict); circuits stay shallow at 9 qubits; depth p is a clean experimental dial; and a constraint-preserving mixer exists for one-hot constraints. A hardware-efficient VQE ansatz was considered and rejected: it ignores the problem structure and needs more parameters at equal depth.')]),
  P([B('Optimisation. '), t('Minimise the exact expectation ⟨f⟩ = Σ P(z) f(z) from Qiskit\'s Statevector with SciPy COBYLA (at most 400 iterations), from 8 seeded random starts plus a warm start interpolated from the depth p−1 optimum (INTERP). The best angles are then sampled with StatevectorSampler (4,096 shots).')]),
);

// 5. Architecture
children.push(H1('5. Architecture'),
  ...figure('report/architecture.png', 'Figure 1. SkyLanes architecture. Classical pre-processing feeds a 9-qubit Ising Hamiltonian into the QAOA loop; every result is scored against the exact baseline.'),
  bullet([B('skylanes/instance.py, exact.py: '), t('instance, corridors, conflicts; brute-force enumeration and Pareto front (standard library only).')]),
  bullet([B('skylanes/formulation.py: '), t('QuadraticProgram → QUBO → Ising, vectorised energies, mapping check.')]),
  bullet([B('skylanes/qaoa.py: '), t('QAOA circuit builder for both mixers (cost layer decomposed once into RZ/RZZ gates), seeded COBYLA optimiser.')]),
  bullet([B('skylanes/experiments.py, metrics.py, plots.py: '), t('full experiment grid, shots, Aer noise study, 12-qubit scaling, figures.')]),
  bullet([B('dashboard/: '), t('static web dashboard whose in-browser simulator reproduces Qiskit\'s probabilities to within 5 × 10⁻⁹ on all 18 recorded runs (dashboard/test_sim.mjs).')]),
);

// 6. Results
children.push(H1('6. Results'),
  H2('6.1 Classical versus quantum'),
  table(['Measure', 'Exact brute force', 'Penalty QAOA (p = 3)', 'XY-mixer QAOA (p = 3)'], [
    ['Finds an exact best plan', 'Always', 'Yes, among 4,096 shots', 'Yes, among 4,096 shots'],
    ['Chance a single shot is a best plan', '100%', `${pct(Math.min(...pen3.map(r => r.p_optimal)), 0)}–${pct(Math.max(...pen3.map(r => r.p_optimal)), 0)}`, `${pct(xyMin, 0)}–${pct(xyMax, 0)}`],
    ['Against a random valid plan', 'n/a', `${Math.min(...pen3.map(r => r.p_optimal / validGuess(r))).toFixed(1)}–${Math.max(...pen3.map(r => r.p_optimal / validGuess(r))).toFixed(1)}×`, `${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}×`],
    ['Shots obeying one route per drone', '100%', `${pct(Math.min(...pen3.map(r => r.p_feasible)), 0)}–${pct(Math.max(...pen3.map(r => r.p_feasible)), 0)}`, '100% (noise-free)'],
    ['Approximation ratio (feasible shots)', '1.00', `${Math.min(...pen3.map(r => r.approx_ratio_feasible)).toFixed(2)}–${Math.max(...pen3.map(r => r.approx_ratio_feasible)).toFixed(2)}`, `${Math.min(...xy3.map(r => r.approx_ratio_feasible)).toFixed(2)}–${Math.max(...xy3.map(r => r.approx_ratio_feasible)).toFixed(2)}`],
    ['Time', '0.09 ms (27 plans)', `${Math.round(Math.min(...pen3.map(r => r.seconds)))}–${Math.round(Math.max(...pen3.map(r => r.seconds)))} s tuning`, `${Math.round(Math.min(...xy3.map(r => r.seconds)))}–${Math.round(Math.max(...xy3.map(r => r.seconds)))} s tuning`],
  ], [2.4, 1.6, 1.7, 1.7]),
  P('Table 4. Ranges cover μ = 0.25, 0.75 and 1.5 (9 qubits, noise-free statevector simulation). Brute-force time measured with timeit.', { before: 60, after: 160 }),
  H2('6.2 Depth sweep'),
  table(['μ', 'Variant', 'P(optimal) p=1 / 2 / 3', 'P(feasible) p=1 / 2 / 3', 'Approx. ratio p=3', 'Random valid'],
    MUS.flatMap(m => ['x', 'xy'].map(mx => {
      const rr = [1, 2, 3].map(p => run(m, mx, p));
      return [m, mx === 'xy' ? 'XY mixer' : 'Penalty', rr.map(r => pct(r.p_optimal, 1)).join(' / '), rr.map(r => pct(r.p_feasible, 0)).join(' / '),
        rr[2].approx_ratio_feasible.toFixed(2), pct(validGuess(rr[0]), 1)];
    })), [0.7, 1.2, 2.2, 2, 1.3, 1.1], { highlight: k => k % 2 === 1 }),
  P('Table 5. Recorded Qiskit runs. COBYLA used its full budget (9 starts × 400 iterations) for XY depth 2–3 and for penalty depth 3 at μ = 0.25 and 0.75, so those optima may not be fully converged.', { before: 60, after: 120 }),
  ...figure('results/figures/depth.png', 'Figure 2. Chance a sample is an exact optimum (left) and is valid (right) against QAOA depth; dotted lines are a random valid plan.'),
  H2('6.3 What a dispatcher would fly'),
  table(['μ', 'Exact optimum', 'Penalty: most frequent plan', 'XY: most frequent plan', 'Best plan in 4,096 shots'],
    MUS.map(m => {
      const e = perMu[String(m)], s = e.shots;
      const lab = sh => `${plan(sh.most_likely_feasible)}${sh.most_likely_is_optimal ? ', optimal' : `: cost ${sh.most_likely_feasible_cost}, ${sh.most_likely_feasible_conflicts} shared`}`;
      return [m, `${e.exact_optimum.toFixed(1)}: ${e.exact_optimal_assignments.map(a => plan(a)).join(' or ')}`, lab(s.x), lab(s.xy), 'Yes, both variants'];
    }), [0.6, 2.2, 1.9, 1.9, 1.4]),
  P('Table 6. Shot sampling at depth 3. Every sample can be checked classically in microseconds, so sampling plus checking recovers the exact optimum in all six configurations.', { before: 60, after: 120 }),
  ...figure('results/figures/routes.png', 'Figure 3. Corridors chosen by XY-mixer QAOA at μ = 0.25, 0.75 and 1.5 (red: shared segments). Raising μ trades battery for separation.'),
  ...figure('results/figures/pareto.png', 'Figure 4. All 27 valid plans, the exact Pareto front and the QAOA picks for each μ.', 4.2),
  H2('6.4 Scaling to 12 qubits'),
  P(`Four drones × three corridors: 81 valid plans out of 4,096 bitstrings, one exact optimum ${plan(data.scaling.exact_optimal_assignments[0])} with f = ${data.scaling.exact_optimum} at μ = 1.5 (Ising mapping error ${data.scaling.ising_max_error}).`),
  table(['Variant', 'p', 'P(feasible)', 'P(optimal)', 'Random valid plan', 'Approx. ratio', 'Tuning'],
    sc.map(r => [r.mixer === 'xy' ? 'XY mixer' : 'Penalty', r.reps, pct(r.p_feasible, 0), pct(r.p_optimal, 1), pct(1 / 81, 1), r.approx_ratio_feasible.toFixed(2), `${Math.round(r.seconds)} s`]),
    [1.4, 0.5, 1.2, 1.2, 1.5, 1.3, 1]),
  P('Table 7. The XY advantage holds (4.4× a random valid plan at p = 2) but absolute P(optimal) drops: one target in 81 instead of up to three in 27, and fewer optimiser starts (5 × 400 evaluations). Brute force: 0.32 ms.', { before: 60, after: 160 }),
  H2('6.5 Noise and hardware cost'),
  table(['Two-qubit error', 'Penalty P(feasible)', 'Penalty P(optimal)', 'XY P(feasible)', 'XY P(optimal)'],
    nx.noise.map((r, i) => [r.two_qubit_error === 0 ? 'none' : pct(r.two_qubit_error, 1), pct(r.p_feasible, 0), pct(r.p_optimal, 1), pct(nxy.noise[i].p_feasible, 0), pct(nxy.noise[i].p_optimal, 1)]),
    [1.4, 1.4, 1.4, 1.4, 1.4]),
  P('Table 8. Qiskit Aer, depolarising noise (1-qubit error = 2-qubit error ÷ 10), μ = 1.5, depth 3, circuits compiled for a linear chain of qubits, 4,096 shots.', { before: 60, after: 120 }),
  table(['Variant', 'CNOTs, all-to-all', 'Depth, all-to-all', 'CNOTs, linear chain', 'Depth, linear chain', 'CNOT overhead'], [
    ['Penalty', nx.cx_all_to_all, nx.depth_all_to_all, nx.cx_linear_chain, nx.depth_linear_chain, `${(nx.cx_linear_chain / nx.cx_all_to_all).toFixed(1)}×`],
    ['XY mixer', nxy.cx_all_to_all, nxy.depth_all_to_all, nxy.cx_linear_chain, nxy.depth_linear_chain, `${(nxy.cx_linear_chain / nxy.cx_all_to_all).toFixed(1)}×`],
  ], [1.3, 1.3, 1.3, 1.4, 1.4, 1.2]),
  P('Table 9. Transpiled size (basis rz, sx, x, cx; optimisation level 3). Chip qubits only interact with neighbours, so the routing circuit itself must be routed with SWAPs. The XY variant\'s deeper routed circuit loses its feasibility guarantee fastest under noise; at 0.2% error it still keeps a 2.6× edge in P(optimal).', { before: 60, after: 160 }),
);

// 7. Limitations
children.push(H1('7. Limitations and future work'),
  P([B('No quantum advantage is claimed. '), t('At 9–12 qubits brute force is exact and finishes in under a millisecond, while QAOA needs seconds to minutes of classical tuning. The project demonstrates a correct mapping, a measured design trade-off and an honest view of hardware costs, not speed.')]),
  bullet([B('The optimiser targets the average, not the best. '), t('QAOA minimises ⟨f⟩. At μ = 0.25, XY depth 3 improved ⟨f⟩ (ratio 0.94) but lowered P(optimal) from 41% to 36%. A CVaR objective would target the best samples directly.')]),
  bullet([B('Penalty landscapes are hard to train. '), t('At p = 1 COBYLA stops after about 40 evaluations per start; once feasibility is learned, probability spreads almost evenly over valid plans. The penalty weight is set by a bound, not tuned.')]),
  bullet([B('Weighted sums miss part of the trade-off curve. '), t('The Pareto point (21, 1) is only reached at μ = 1 exactly; an ε-constraint formulation would reach every point at the cost of slack qubits.')]),
  bullet([B('Corridors are pre-computed classically. '), t('The quantum part chooses among candidates; it does not search for paths. This hybrid split is deliberate (path search is polynomial) but caps quality at the shortlist.')]),
  bullet([B('Conflict is a spatial proxy. '), t('Two drones on the same segment at different times are safe; time-slotted variables x(i,p,t) would model real 4-D deconfliction.')]),
  bullet([B('Simulation only. '), t('Noise-free statevector and a generic depolarising model, not a calibrated IBM device. Some optimiser runs hit their iteration cap.')]),
  bullet([B('Scaling. '), t('Qubits grow linearly (drones × corridors) but couplings can grow quadratically, and every non-adjacent coupling costs SWAPs on real hardware.')]),
  P([B('Future work: '), t('CVaR-QAOA with P(optimal) as the target; time-slotted corridors; a run on IBM hardware through Qiskit Runtime with error mitigation; comparison against simulated annealing at 20+ variables.')], { before: 80 }),
);

// 8. Reproducibility
children.push(H1('8. Reproducibility'),
  P('Every number in this report comes from the repository and is deterministic (instance seed 3; optimiser seeds 7 + p; sampler, transpiler and Aer seed 7). Tested on Python 3.12 with the exact versions pinned in requirements.txt:'),
  P(Object.entries(data.versions).map(([k, v]) => `${k} ${v}`).join(', ') + '.'),
  numbered([t('Install: '), new TextRun({ text: 'pip install -r requirements.txt', font: 'Consolas', size: 20 })]),
  numbered([t('Exact baseline (under 1 s): '), new TextRun({ text: 'python baseline_bruteforce.py', font: 'Consolas', size: 20 })]),
  numbered([t('Quick check (about 1–2 min): '), new TextRun({ text: 'python -m skylanes.experiments --quick', font: 'Consolas', size: 20 })]),
  numbered([t('Full experiments (about 20 min): '), new TextRun({ text: 'python -m skylanes.experiments', font: 'Consolas', size: 20 })]),
  numbered([t('Figures: '), new TextRun({ text: 'python -m skylanes.plots', font: 'Consolas', size: 20 })]),
  P('Each run re-checks the Ising mapping against the QUBO on all bitstrings and cross-checks brute force with NumPyMinimumEigensolver. The repository README gives the full step-by-step instructions, including the dashboard.', { before: 80 }),
);

const doc = new Document({
  creator: 'SkyLanes team', title: 'SkyLanes: Conflict-aware drone corridor routing with QAOA',
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 140 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 26, bold: true, color: BLUE }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'SkyLanes report  |  page ', font: FONT, size: 16, color: SOFT }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: SOFT })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(OUT, buf); console.log('wrote', OUT, `${(buf.length / 1024).toFixed(0)} KiB`); });
