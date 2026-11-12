"""Exact classical baseline for conflict-aware multi-drone corridor routing.

Instance: 4x4 grid of airspace cells, 3 drones, 3 candidate corridors each
(x[i,p] = 1 if drone i flies corridor p -> 9 binary variables / 9 qubits).
Objective:  total flight cost  +  mu * (shared corridor segments between drones)
Constraint: each drone flies exactly one corridor.

Run:  python baseline_bruteforce.py
Standard library only. Deterministic (fixed seed).
"""
from skylanes.exact import enumerate_feasible, pareto_front, weighted_optimum
from skylanes.instance import build_instance


def main():
    inst = build_instance()
    fmt = lambda p: " -> ".join(f"{a}{b}" for a, b in p)
    print("Candidate corridors (cell row,col):")
    for i, cs in enumerate(inst.corridors):
        for p, path in enumerate(cs):
            print(f"  Drone {i+1} / corridor {p+1}: cost {inst.cost[i][p]:>2}   {fmt(path)}")

    scored = enumerate_feasible(inst)
    print(f"\nFeasible assignments: {len(scored)} (of 2^{inst.n_qubits} = {2**inst.n_qubits} bitstrings)")
    print("Pareto front (total cost, conflicts):", pareto_front(scored))

    print("\nWeighted-sum sweep  min cost + mu*conflicts:")
    for mu in (0.0, 0.25, 0.75, 1.5, 3.0):
        best, _, winners = weighted_optimum(scored, mu)
        shown = [(tuple(x + 1 for x in ch), c, k) for ch, c, k in winners]
        print(f"  mu={mu:<4}  optimum={best:<5}  optimal assignments (corridor per drone, cost, conflicts): {shown}")


if __name__ == "__main__":
    main()
