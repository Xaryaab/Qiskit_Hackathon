"""Run every SkyLanes experiment and write results/ (CSV + JSON) for the report.

    python -m skylanes.experiments            # full run
    python -m skylanes.experiments --quick    # fewer starts / smaller grid, for smoke tests
"""
import argparse
import csv
import json
import time
import warnings
from pathlib import Path

import numpy as np

from .exact import enumerate_feasible, pareto_front, weighted_optimum
from .formulation import build_qp, check_ising, energies, ising, normalised, to_qubo
from .instance import SCALING_DRONES, build_instance
from .metrics import Landscape, counts_to_probs
from .qaoa import bind, build_qaoa, optimise

RESULTS = Path("results")
SEED = 7


def groups_of(inst):
    return [[inst.var(i, p) for p in range(inst.n_paths)] for i in range(inst.n_drones)]


def problem_for(inst, mu, mixer):
    """Energy vector the optimiser minimises + normalised cost operator for the circuit."""
    qp = to_qubo(inst, mu) if mixer == "x" else build_qp(inst, mu, with_constraints=False)
    op, _ = ising(qp)
    op_n, scale = normalised(op)
    return energies(qp), op_n, scale


def run_variant(inst, mu, mixer, reps_list, n_starts, land=None):
    land = land or Landscape(inst, mu)
    E, op_n, scale = problem_for(inst, mu, mixer)
    rows, circuits, prev = [], {}, None
    for reps in reps_list:
        qc, g, b = build_qaoa(op_n, reps, mixer, groups_of(inst))
        t0 = time.perf_counter()
        res = optimise(qc, g, b, E, n_starts=n_starts, seed=SEED + reps, warm=prev)
        prev = res.params
        row = {"n_qubits": inst.n_qubits, "mu": mu, "mixer": mixer, "reps": reps,
               "expectation": res.expectation, "evals": res.n_evals,
               "seconds": round(time.perf_counter() - t0, 2),
               "params": [round(float(v), 5) for v in res.params], "hamiltonian_scale": scale}
        row |= land.summarise(res.probs)
        rows.append(row)
        circuits[reps] = (qc, g, b, res.params)
        print(f"  q={inst.n_qubits} mu={mu:<4} {mixer:<2} p={reps}  P(feasible)={row['p_feasible']:.3f}  "
              f"P(optimal)={row['p_optimal']:.3f}  ratio={row['approx_ratio_feasible']:.3f}  "
              f"best={row['most_likely_feasible']} ({row['seconds']}s)")
    return rows, circuits


def cross_check_numpy(inst, mu):
    """Independent exact check with Qiskit's own classical eigensolver."""
    try:
        from qiskit_algorithms import NumPyMinimumEigensolver
        from qiskit_optimization.algorithms import MinimumEigenOptimizer
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = MinimumEigenOptimizer(NumPyMinimumEigensolver()).solve(build_qp(inst, mu))
        choice = inst.decode([int(v) for v in res.x])
        return {"fval": float(res.fval), "choice": [c + 1 for c in choice] if choice else None}
    except Exception as e:  # report, don't hide
        return {"error": f"{type(e).__name__}: {e}"}


def sample(qc, g, b, params, shots, seed):
    from qiskit.primitives import StatevectorSampler
    circ = bind(qc, g, b, params)
    circ.measure_all()
    res = StatevectorSampler(seed=seed).run([circ], shots=shots).result()
    return res[0].data.meas.get_counts()


def noise_study(inst, mu, qc, g, b, params, land, shots, seed):
    """Transpile for (a) all-to-all and (b) a linear chain, then run (b) under depolarising noise."""
    from qiskit import transpile
    from qiskit.transpiler import CouplingMap
    from qiskit_aer import AerSimulator
    from qiskit_aer.noise import NoiseModel, depolarizing_error

    basis = ["rz", "sx", "x", "cx"]
    circ = bind(qc, g, b, params)
    circ.measure_all()
    full = transpile(circ, basis_gates=basis, optimization_level=3, seed_transpiler=seed)
    line = transpile(circ, basis_gates=basis, coupling_map=CouplingMap.from_line(inst.n_qubits),
                     optimization_level=3, seed_transpiler=seed)
    out = {"cx_all_to_all": full.count_ops().get("cx", 0), "depth_all_to_all": full.depth(),
           "cx_linear_chain": line.count_ops().get("cx", 0), "depth_linear_chain": line.depth(),
           "noise": []}
    for p2 in (0.0, 0.002, 0.01):
        nm = NoiseModel()
        if p2:
            nm.add_all_qubit_quantum_error(depolarizing_error(p2 / 10, 1), ["sx", "x"])
            nm.add_all_qubit_quantum_error(depolarizing_error(p2, 2), ["cx"])
        sim = AerSimulator(noise_model=nm, seed_simulator=seed)
        counts = sim.run(line, shots=shots).result().get_counts()
        s = land.summarise(counts_to_probs(counts, inst.n_qubits))
        out["noise"].append({"two_qubit_error": p2, "p_feasible": s["p_feasible"], "p_optimal": s["p_optimal"],
                             "most_likely_feasible": s["most_likely_feasible"]})
        print(f"  noise 2q-error={p2:<6} P(feasible)={s['p_feasible']:.3f} P(optimal)={s['p_optimal']:.3f}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    n_starts = 3 if args.quick else 8
    reps_list = [1, 2] if args.quick else [1, 2, 3]
    mus = [1.5] if args.quick else [0.25, 0.75, 1.5]
    shots = 4096
    RESULTS.mkdir(exist_ok=True)

    inst = build_instance()
    scored = enumerate_feasible(inst)
    summary = {"instance": {"n_drones": inst.n_drones, "n_paths": inst.n_paths, "n_qubits": inst.n_qubits,
                            "cost": inst.cost, "pareto_front": pareto_front(scored)},
               "per_mu": {}}
    rows = []
    for mu in mus:
        best, worst, winners = weighted_optimum(scored, mu)
        land = Landscape(inst, mu)
        info = {"exact_optimum": best, "exact_worst_feasible": worst,
                "exact_optimal_assignments": [[c + 1 for c in ch] for ch, _, _ in winners],
                "ising_max_error": check_ising(to_qubo(inst, mu)),
                "numpy_eigensolver": cross_check_numpy(inst, mu)}
        print(f"mu={mu}: exact optimum {best} via {info['exact_optimal_assignments']}; "
              f"Ising mapping error {info['ising_max_error']:.2e}; NumPy eigensolver {info['numpy_eigensolver']}")
        circuits = {}
        for mixer in ("x", "xy"):
            r, c = run_variant(inst, mu, mixer, reps_list, n_starts, land)
            rows += r
            circuits[mixer] = c
        top = max(reps_list)
        info["shots"] = {}
        for mixer in ("x", "xy"):
            counts = sample(*circuits[mixer][top], shots=shots, seed=SEED)
            s = land.summarise(counts_to_probs(counts, inst.n_qubits))
            info["shots"][mixer] = {"reps": top, "shots": shots, **s,
                                    "top_counts": dict(sorted(counts.items(), key=lambda kv: -kv[1])[:12])}
        if mu == mus[-1]:
            print("noise study (penalty QAOA, linear-chain hardware):")
            info["noise_x"] = noise_study(inst, mu, *circuits["x"][top], land, shots, SEED)
            print("noise study (XY-mixer QAOA, linear-chain hardware):")
            info["noise_xy"] = noise_study(inst, mu, *circuits["xy"][top], land, shots, SEED)
        summary["per_mu"][str(mu)] = info

    # scaling: 4 drones x 3 corridors = 12 qubits
    scale_rows = []
    if not args.quick:
        big = build_instance(drones=SCALING_DRONES[4])
        mu = mus[-1]
        b_best, _, b_win = weighted_optimum(enumerate_feasible(big), mu)
        summary["scaling_12q"] = {"exact_optimum": b_best,
                                  "exact_optimal_assignments": [[c + 1 for c in ch] for ch, _, _ in b_win],
                                  "ising_max_error": check_ising(to_qubo(big, mu))}
        print(f"scaling: 12 qubits, exact optimum {b_best}")
        for mixer in ("x", "xy"):
            r, _ = run_variant(big, mu, mixer, [1, 2], max(3, n_starts // 2))
            scale_rows += r
        rows += scale_rows

    fields = ["n_qubits", "mu", "mixer", "reps", "p_feasible", "p_optimal", "random_guess_p_optimal",
              "approx_ratio_feasible", "mean_objective_feasible", "most_likely_feasible",
              "most_likely_feasible_cost", "most_likely_feasible_conflicts", "most_likely_is_optimal",
              "top_bitstring_feasible", "expectation", "evals", "seconds", "hamiltonian_scale", "params"]
    with open(RESULTS / "qaoa_results.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in fields})
    (RESULTS / "summary.json").write_text(json.dumps(summary, indent=2, default=float))
    print(f"\nwrote {RESULTS/'qaoa_results.csv'} and {RESULTS/'summary.json'}")


if __name__ == "__main__":
    main()
