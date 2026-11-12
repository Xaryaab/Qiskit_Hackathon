"""Interpret a QAOA output distribution against the exact optimum."""
import numpy as np

from .formulation import all_bitstrings
from .instance import Instance


class Landscape:
    """Per-bitstring feasibility, decoded choice, and true objective for one (instance, mu)."""

    def __init__(self, inst: Instance, mu: float):
        n, D, P = inst.n_qubits, inst.n_drones, inst.n_paths
        X = all_bitstrings(n).reshape(-1, D, P)
        self.feasible = np.all(X.sum(axis=2) == 1, axis=1)
        choice = X.argmax(axis=2)
        self.choice = choice
        self.cost = np.full(len(X), np.nan)
        self.conf = np.full(len(X), np.nan)
        for z in np.flatnonzero(self.feasible):
            c, k = inst.evaluate(tuple(choice[z]))
            self.cost[z], self.conf[z] = c, k
        self.f = self.cost + mu * self.conf            # NaN where infeasible
        self.best = np.nanmin(self.f)
        self.worst = np.nanmax(self.f)
        self.optimal = self.feasible & np.isclose(np.nan_to_num(self.f, nan=np.inf), self.best)

    def summarise(self, probs: np.ndarray) -> dict:
        p_feas = float(probs[self.feasible].sum())
        p_opt = float(probs[self.optimal].sum())
        if p_feas > 0:
            mean_f = float(probs[self.feasible] @ self.f[self.feasible] / p_feas)
            ratio = (self.worst - mean_f) / (self.worst - self.best) if self.worst > self.best else 1.0
        else:
            mean_f, ratio = float("nan"), 0.0
        fz = np.where(self.feasible, probs, -1.0)
        z = int(np.argmax(fz))
        top = int(np.argmax(probs))
        return {
            "p_feasible": p_feas,
            "p_optimal": p_opt,
            "mean_objective_feasible": mean_f,
            "approx_ratio_feasible": float(ratio),
            "most_likely_feasible": [int(x) + 1 for x in self.choice[z]],
            "most_likely_feasible_cost": float(self.cost[z]),
            "most_likely_feasible_conflicts": float(self.conf[z]),
            "most_likely_is_optimal": bool(self.optimal[z]),
            "top_bitstring_feasible": bool(self.feasible[top]),
            "random_guess_p_optimal": float(self.optimal.sum() / len(probs)),
        }


def counts_to_probs(counts: dict, n: int) -> np.ndarray:
    """Qiskit counts keys are big-endian strings (qubit 0 is the rightmost character)."""
    probs = np.zeros(2 ** n)
    total = sum(counts.values())
    for key, v in counts.items():
        probs[int(key.replace(" ", ""), 2)] += v / total
    return probs
