"""Exact classical reference: enumerate every feasible corridor assignment."""
import itertools

from .instance import Instance


def enumerate_feasible(inst: Instance):
    """List of (choice, cost, conflicts) for all n_paths ** n_drones feasible assignments."""
    return [(ch, *inst.evaluate(ch))
            for ch in itertools.product(range(inst.n_paths), repeat=inst.n_drones)]


def pareto_front(scored):
    pts = {(c, k) for _, c, k in scored}
    return sorted(p for p in pts if not any(q[0] <= p[0] and q[1] <= p[1] and q != p for q in pts))


def weighted_optimum(scored, mu: float):
    """Best value of cost + mu*conflicts and every assignment achieving it."""
    best = min(c + mu * k for _, c, k in scored)
    winners = [(ch, c, k) for ch, c, k in scored if abs(c + mu * k - best) < 1e-9]
    worst = max(c + mu * k for _, c, k in scored)
    return best, worst, winners
