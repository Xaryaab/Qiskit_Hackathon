// Verify the browser simulator against Qiskit: same angles in, same probabilities out.
//     node dashboard/test_sim.mjs
import { readFileSync } from 'node:fs';
import { buildModel, problem, simulate, metrics } from './site/sim.js';

const data = JSON.parse(readFileSync(new URL('./site/data.json', import.meta.url)));
const m = buildModel(data.instance);
let worstProb = 0, worstScale = 0, worstPen = 0, fail = 0;
for (const run of data.runs) {
  const prob = problem(m, run.mu, run.mixer);
  const probs = simulate(m, prob, run.params, run.mixer);
  let d = 0;
  for (let z = 0; z < m.N; z++) d = Math.max(d, Math.abs(probs[z] - run.probs[z]));
  const ds = Math.abs(prob.scale - run.scale), dp = Math.abs(prob.penalty - run.penalty);
  worstProb = Math.max(worstProb, d); worstScale = Math.max(worstScale, ds); worstPen = Math.max(worstPen, dp);
  const mt = metrics(m, run.mu, probs);
  const ok = d < 1e-6 && ds < 1e-9 && dp < 1e-9;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} mu=${run.mu} ${run.mixer.padEnd(2)} p=${run.reps}  max|dP|=${d.toExponential(1)}  ` +
    `P(opt) js=${mt.pOptimal.toFixed(4)} csv=${run.p_optimal.toFixed(4)}  P(feas) js=${mt.pFeasible.toFixed(4)}`);
}
console.log(`\n${data.runs.length - fail}/${data.runs.length} match. worst |dP|=${worstProb.toExponential(2)}, ` +
  `worst |dscale|=${worstScale}, worst |dpenalty|=${worstPen}`);
process.exit(fail ? 1 : 0);
