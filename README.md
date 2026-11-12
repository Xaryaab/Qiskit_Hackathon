# SkyLanes: conflict-aware drone corridor routing with QAOA

IBM Qiskit hackathon entry, **Quantum Optimization Challenge**, domain **UAVs & Robotics**.

A dispatcher must give each drone one flight corridor out of a few candidates, trading total flight cost against shared airspace segments (conflicts). The joint choice is encoded as a 9-qubit QUBO (3 drones x 3 corridors) and solved with QAOA, using both a penalty formulation and a constraint-preserving XY-mixer variant. Results are checked against exact brute force.

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the full formulation, algorithm justification, metrics and limitations.

## Status

Work in progress.

- [x] Problem formulation and test instance
- [x] Exact classical baseline (`baseline_bruteforce.py`), verified
- [x] QuadraticProgram / QUBO / Ising formulation (`skylanes/formulation.py`)
- [x] QAOA circuits: penalty (X mixer) and XY mixer (`skylanes/qaoa.py`)
- [x] Experiment runner and plots (`skylanes/experiments.py`, `skylanes/plots.py`)
- [ ] QAOA code run and verified against the exact optimum
- [ ] Results, figures, report, demo video

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
