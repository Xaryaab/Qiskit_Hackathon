"""Export everything the static dashboard needs from the real Qiskit run.

    python dashboard/export_data.py        (after python -m skylanes.experiments)

Writes dashboard/site/data.json, circuit drawings and OpenQASM files for IBM Quantum Composer.
Probabilities are recomputed with Qiskit's Statevector from the optimised angles in
results/qaoa_results.csv, so the browser simulator can be checked against them.
"""
import csv
import json
import sys
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore")

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import numpy as np  # noqa: E402
from qiskit import qasm2, transpile  # noqa: E402

from skylanes.exact import enumerate_feasible, pareto_front  # noqa: E402
from skylanes.experiments import groups_of, problem_for  # noqa: E402
from skylanes.formulation import penalty_weight  # noqa: E402
from skylanes.instance import build_instance  # noqa: E402
from skylanes.qaoa import bind, build_qaoa, probabilities  # noqa: E402

SITE = Path(__file__).resolve().parent / "site"
ASSETS = SITE / "assets"
RESULTS = ROOT / "results"


def instance_block(inst):
    n = inst.n_qubits
    shared = [[0] * n for _ in range(n)]
    for (i, p, j, q), s in inst.conflict.items():
        a, b = inst.var(i, p), inst.var(j, q)
        shared[a][b] = shared[b][a] = s
    return {
        "grid": inst.grid,
        "drones": [[list(s), list(t)] for s, t in inst.drones],
        "segments": [{"a": list(a), "b": list(b), "w": w} for (a, b), w in sorted(inst.weight.items())],
        "corridors": [[[list(c) for c in path] for path in cs] for cs in inst.corridors],
        "cost": inst.cost,
        "shared": shared,
        "feasible": [[*ch, c, k] for ch, c, k in enumerate_feasible(inst)],
        "pareto": pareto_front(enumerate_feasible(inst)),
    }


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    inst = build_instance()
    summary = json.loads((RESULTS / "summary.json").read_text())
    with open(RESULTS / "qaoa_results.csv") as fh:
        rows = list(csv.DictReader(fh))

    runs, scaling = [], []
    for r in rows:
        mu, mixer, reps, nq = float(r["mu"]), r["mixer"], int(r["reps"]), int(r["n_qubits"])
        metrics = {k: float(r[k]) for k in ("p_feasible", "p_optimal", "approx_ratio_feasible",
                                             "random_guess_p_optimal", "seconds")}
        metrics["evals"] = int(r["evals"])
        entry = {"mu": mu, "mixer": mixer, "reps": reps, "params": json.loads(r["params"]),
                 "scale": float(r["hamiltonian_scale"]), **metrics}
        if nq != 9:
            scaling.append(entry)
            continue
        E, op, scale = problem_for(inst, mu, mixer)
        qc, g, b = build_qaoa(op, reps, mixer, groups_of(inst))
        probs = probabilities(qc, g, b, np.array(entry["params"]))
        entry["probs"] = [round(float(x), 8) for x in probs]
        entry["penalty"] = penalty_weight(inst, mu) if mixer == "x" else 0.0
        runs.append(entry)
        print(f"exported mu={mu} {mixer} p={reps}")

    circuits = {}
    for mixer in ("x", "xy"):
        best = next(e for e in runs if e["mu"] == 1.5 and e["mixer"] == mixer and e["reps"] == 1)
        E, op, scale = problem_for(inst, 1.5, mixer)
        qc, g, b = build_qaoa(op, 1, mixer, groups_of(inst))
        fig = qc.draw("mpl", fold=24, style="clifford")
        fig.savefig(ASSETS / f"circuit_{mixer}_p1.png", dpi=110, bbox_inches="tight")
        bound = bind(qc, g, b, np.array(best["params"]))
        bound.measure_all()
        flat = transpile(bound, basis_gates=["h", "rx", "ry", "rz", "cx", "rzz"], optimization_level=1,
                         seed_transpiler=7)
        (ASSETS / f"skylanes_{mixer}_p1.qasm").write_text(qasm2.dumps(flat))
        ops = dict(flat.count_ops())
        circuits[mixer] = {"image": f"assets/circuit_{mixer}_p1.png", "qasm": f"assets/skylanes_{mixer}_p1.qasm",
                           "ops": {k: int(v) for k, v in ops.items()}, "depth": flat.depth(),
                           "params": best["params"]}
        print(f"circuit {mixer}: {ops}")

    data = {
        "instance": instance_block(inst),
        "runs": runs,
        "scaling": {"runs": scaling, **summary.get("scaling_12q", {})},
        "per_mu": {mu: {k: v for k, v in info.items() if k in ("exact_optimum", "exact_optimal_assignments",
                                                                 "ising_max_error", "numpy_eigensolver", "shots",
                                                                 "noise_x", "noise_xy")}
                   for mu, info in summary["per_mu"].items()},
        "circuits": circuits,
        "versions": {line.split("==")[0]: line.split("==")[1]
                     for line in (ROOT / "requirements.txt").read_text().split()
                     if line.split("==")[0] in ("qiskit", "qiskit-optimization", "qiskit-aer", "qiskit-algorithms")},
    }
    (SITE / "data.json").write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {SITE / 'data.json'} ({(SITE / 'data.json').stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
