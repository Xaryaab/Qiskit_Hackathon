"""QAOA circuits (standard X mixer and constraint-preserving XY mixer) and a seeded optimiser.

Circuits are built explicitly from Qiskit gates so both variants share one code path:
  cost layer  : PauliEvolutionGate(H_C / scale, time=gamma)    (diagonal, exact)
  X mixer     : RX(2*beta) on every qubit, start in |+>^n      (penalty QUBO)
  XY mixer    : XXPlusYY(2*beta) on a ring inside each drone's qubit group,
                start in a W-state per drone                  (one-hot preserved)
"""
from dataclasses import dataclass

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import ParameterVector
from qiskit.circuit.library import PauliEvolutionGate, StatePreparation, XXPlusYYGate
from qiskit.quantum_info import SparsePauliOp, Statevector
from scipy.optimize import minimize


def w_state(m: int) -> np.ndarray:
    v = np.zeros(2 ** m)
    for k in range(m):
        v[1 << k] = 1.0
    return v / np.sqrt(m)


def ring_pairs(group):
    if len(group) == 2:
        return [(group[0], group[1])]
    return [(group[k], group[(k + 1) % len(group)]) for k in range(len(group))]


def build_qaoa(cost_op: SparsePauliOp, reps: int, mixer: str = "x", groups=None):
    n = cost_op.num_qubits
    gammas = ParameterVector("gamma", reps)
    betas = ParameterVector("beta", reps)
    qc = QuantumCircuit(n, name=f"qaoa_{mixer}_p{reps}")
    if mixer == "x":
        qc.h(range(n))
    elif mixer == "xy":
        for g in groups:
            qc.append(StatePreparation(w_state(len(g))), list(g))
    else:
        raise ValueError(mixer)
    for r in range(reps):
        qc.append(PauliEvolutionGate(cost_op, time=gammas[r]), range(n))
        if mixer == "x":
            qc.rx(2 * betas[r], range(n))
        else:
            for g in groups:
                for a, b in ring_pairs(g):
                    qc.append(XXPlusYYGate(2 * betas[r]), [a, b])
    return qc, list(gammas), list(betas)


def bind(qc, gammas, betas, x):
    reps = len(gammas)
    values = dict(zip(gammas, x[:reps])) | dict(zip(betas, x[reps:]))
    return qc.assign_parameters(values)


def probabilities(qc, gammas, betas, x) -> np.ndarray:
    return Statevector(bind(qc, gammas, betas, x)).probabilities()


@dataclass
class QAOAResult:
    reps: int
    mixer: str
    params: np.ndarray
    expectation: float
    probs: np.ndarray
    n_evals: int


def optimise(qc, gammas, betas, energy: np.ndarray, n_starts: int = 8, seed: int = 7,
             warm: np.ndarray | None = None, maxiter: int = 400) -> QAOAResult:
    """Minimise <E> = sum_z P(z) E(z) with COBYLA from several seeded starts.
    `warm` (params for reps-1) is interpolated to reps as an extra start (INTERP heuristic)."""
    reps = len(gammas)
    rng = np.random.default_rng(seed)
    starts = [np.concatenate([rng.uniform(0, np.pi, reps), rng.uniform(0, np.pi / 2, reps)])
              for _ in range(n_starts)]
    if warm is not None:
        starts.insert(0, np.concatenate([_interp(warm[: reps - 1], reps), _interp(warm[reps - 1:], reps)]))
    evals = 0

    def f(x):
        nonlocal evals
        evals += 1
        return float(probabilities(qc, gammas, betas, x) @ energy)

    best = None
    for x0 in starts:
        res = minimize(f, x0, method="COBYLA", options={"maxiter": maxiter, "rhobeg": 0.3})
        if best is None or res.fun < best.fun:
            best = res
    probs = probabilities(qc, gammas, betas, best.x)
    return QAOAResult(reps, "", best.x, float(best.fun), probs, evals)


def _interp(v: np.ndarray, reps: int) -> np.ndarray:
    """Zhou et al. INTERP: stretch a length-(reps-1) angle schedule to length reps."""
    p = len(v)
    if p == 0:
        return np.full(reps, 0.1)
    out = np.zeros(reps)
    for i in range(reps):
        left = v[i - 1] if i - 1 >= 0 else 0.0
        right = v[i] if i < p else 0.0
        out[i] = (i / p) * left + ((p - i) / p) * right
    return out
