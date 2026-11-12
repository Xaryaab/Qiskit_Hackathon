"""QuadraticProgram -> QUBO -> Ising Hamiltonian, plus vectorised energies of every bitstring.

Qubit k <-> variable k <-> x[i,p] with k = i*n_paths + p.
Bitstring index convention (Qiskit little-endian): bit k of integer z is variable k.
"""
import numpy as np
from qiskit.quantum_info import SparsePauliOp
from qiskit_optimization import QuadraticProgram
from qiskit_optimization.converters import QuadraticProgramToQubo

from .instance import Instance


def var_name(i: int, p: int) -> str:
    return f"x_{i}_{p}"


def build_qp(inst: Instance, mu: float, with_constraints: bool = True) -> QuadraticProgram:
    qp = QuadraticProgram("skylanes")
    for i in range(inst.n_drones):
        for p in range(inst.n_paths):
            qp.binary_var(var_name(i, p))
    linear = {var_name(i, p): inst.cost[i][p] for i in range(inst.n_drones) for p in range(inst.n_paths)}
    quadratic = {(var_name(i, p), var_name(j, q)): mu * s
                 for (i, p, j, q), s in inst.conflict.items() if s}
    qp.minimize(linear=linear, quadratic=quadratic)
    if with_constraints:
        for i in range(inst.n_drones):
            qp.linear_constraint({var_name(i, p): 1 for p in range(inst.n_paths)}, "==", 1, f"one_corridor_{i}")
    return qp


def penalty_weight(inst: Instance, mu: float) -> float:
    """Large enough that dropping or doubling a drone's corridor never pays off:
    exceeds the most any single drone can contribute to the objective."""
    paths = range(inst.n_paths)
    worst = max(
        max(inst.cost[i]) + mu * sum(max(inst.shared(i, p, j, q) for p in paths for q in paths)
                                     for j in range(inst.n_drones) if j != i)
        for i in range(inst.n_drones))
    return worst + 1.0


def to_qubo(inst: Instance, mu: float) -> QuadraticProgram:
    qp = build_qp(inst, mu, with_constraints=True)
    return QuadraticProgramToQubo(penalty=penalty_weight(inst, mu)).convert(qp)


def ising(qp: QuadraticProgram) -> tuple[SparsePauliOp, float]:
    op, offset = qp.to_ising()
    return op, float(offset)


def all_bitstrings(n: int) -> np.ndarray:
    z = np.arange(2 ** n)
    return ((z[:, None] >> np.arange(n)[None, :]) & 1).astype(float)  # row z, column = variable


def energies(qp: QuadraticProgram) -> np.ndarray:
    """Objective value of every bitstring (index = little-endian integer)."""
    n = qp.get_num_vars()
    X = all_bitstrings(n)
    lin = qp.objective.linear.to_array()
    quad = qp.objective.quadratic.to_array()
    return qp.objective.constant + X @ lin + np.einsum("zi,ij,zj->z", X, quad, X)


def normalised(op: SparsePauliOp) -> tuple[SparsePauliOp, float]:
    """Scale so the largest non-identity coefficient is 1 (keeps QAOA angles in a sane range)."""
    coeffs = np.abs(op.coeffs)
    scale = float(coeffs.max()) if coeffs.size else 1.0
    return (op / scale).simplify(), scale


def check_ising(qp: QuadraticProgram) -> float:
    """Max |diag(H)+offset - energies|: verifies the Ising mapping is exact."""
    op, offset = ising(qp)
    diag = np.real(op.to_matrix(sparse=True).diagonal()) + offset
    return float(np.max(np.abs(diag - energies(qp))))
