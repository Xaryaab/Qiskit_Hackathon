# SkyLanes: conflict-aware drone corridor routing with QAOA

IBM Qiskit hackathon entry, **Quantum Optimization Challenge**, domain **UAVs & Robotics**.

A dispatcher must give each drone one flight corridor out of a few candidates, trading total flight cost against shared airspace segments (conflicts). The joint choice is encoded as a 9-qubit QUBO (3 drones x 3 corridors) and solved with QAOA, using both a penalty formulation and a constraint-preserving XY-mixer variant. Results are checked against exact brute force.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full formulation, algorithm justification, metrics and limitations.

## Status

- [x] Problem formulation and test instance
- [x] Exact classical baseline (`baseline_bruteforce.py`), verified
- [x] QuadraticProgram / QUBO / Ising formulation (`skylanes/formulation.py`); Ising mapping verified exact on all 512 bitstrings
- [x] QAOA circuits: penalty (X mixer) and XY mixer (`skylanes/qaoa.py`)
- [x] Full experiment run: results in `results/`, figures in `results/figures/`
- [x] Report
- [ ] Demo video

## Headline results (9 qubits, noise-free, QAOA depth p = 3)

| | Exact brute force | Penalty QAOA | XY-mixer QAOA |
|---|---|---|---|
| P(single sample is optimal) | 1.0 | 0.03–0.11 | 0.32–0.52 |
| vs. picking a random valid plan | n/a | about 1x (no better) | 2.9–9.7x better |
| P(sample is valid) | 1.0 | 0.81–0.90 | 1.00 |
| Optimum found in 4,096 shots | n/a | yes, all 3 settings | yes, all 3 settings |
| Time | 0.09 ms | 31–45 s tuning | 80–127 s tuning |

Ranges cover the trade-off weights μ = 0.25, 0.75 and 1.5.

- **Noise:** at 1% two-qubit depolarising error, both variants drop to P(optimal) ≈ 0.03.
- **Hardware routing:** mapping onto a linear chain of qubits adds 2.4–2.7× CNOTs.

No quantum speed-up is claimed. See [PROJECT_PLAN.md](PROJECT_PLAN.md) and `results/summary.json` for details.

## Layout

```
baseline_bruteforce.py   exact reference (standard library only)
skylanes/
  instance.py            grid, drones, candidate corridors, costs, conflicts
  exact.py               enumeration, Pareto front, weighted optimum
  formulation.py         QuadraticProgram -> QUBO -> Ising, bitstring energies
  qaoa.py                QAOA circuit builder (X / XY mixer) + seeded COBYLA optimiser
  metrics.py             P(feasible), P(optimal), approximation ratio
  experiments.py         full experiment grid, shots, noise study, 12-qubit scaling
  plots.py               route map, Pareto plot, depth curves, histograms
```

## Run

Python 3.12 is recommended.

```bash
python baseline_bruteforce.py
```

```bash
pip install qiskit qiskit-optimization qiskit-algorithms qiskit-aer matplotlib
```

```bash
python -m skylanes.experiments
```

```bash
python -m skylanes.plots
```

Use `python -m skylanes.experiments --quick` for a fast smoke test.
