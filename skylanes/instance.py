"""Problem instance: airspace grid, drones, candidate corridors, costs and conflicts.

Pure standard library so the exact baseline can run anywhere.
"""
import itertools
import random
from dataclasses import dataclass, field

Cell = tuple[int, int]
Edge = tuple[Cell, Cell]


def ekey(a: Cell, b: Cell) -> Edge:
    return tuple(sorted((a, b)))


def grid_edges(grid: int):
    for r in range(grid):
        for c in range(grid):
            if c + 1 < grid:
                yield ekey((r, c), (r, c + 1))
            if r + 1 < grid:
                yield ekey((r, c), (r + 1, c))


def monotone_paths(s: Cell, t: Cell):
    """All minimum-hop (staircase) paths from s to t."""
    dr = (t[0] > s[0]) - (t[0] < s[0])
    dc = (t[1] > s[1]) - (t[1] < s[1])
    moves = ["r"] * abs(t[0] - s[0]) + ["c"] * abs(t[1] - s[1])
    out = set()
    for perm in set(itertools.permutations(moves)):
        cur, path = s, [s]
        for m in perm:
            cur = (cur[0] + dr, cur[1]) if m == "r" else (cur[0], cur[1] + dc)
            path.append(cur)
        out.add(tuple(path))
    return sorted(out)


def path_edges(p) -> set:
    return {ekey(a, b) for a, b in zip(p, p[1:])}


@dataclass
class Instance:
    grid: int
    drones: list                      # [(start, goal), ...]
    weight: dict                      # edge -> flight cost
    corridors: list                   # corridors[i][p] = tuple of cells
    cost: list                        # cost[i][p]
    conflict: dict = field(default_factory=dict)  # (i, p, j, q) -> shared segments, i < j

    @property
    def n_drones(self) -> int:
        return len(self.drones)

    @property
    def n_paths(self) -> int:
        return len(self.corridors[0])

    @property
    def n_qubits(self) -> int:
        return self.n_drones * self.n_paths

    def var(self, i: int, p: int) -> int:
        """Variable / qubit index of x[i,p]."""
        return i * self.n_paths + p

    def shared(self, i: int, p: int, j: int, q: int) -> int:
        """Shared segments between drone i corridor p and drone j corridor q (any order)."""
        return self.conflict[i, p, j, q] if i < j else self.conflict[j, q, i, p]

    def evaluate(self, choice) -> tuple[int, int]:
        """(total cost, total shared segments) for a corridor choice per drone."""
        n = self.n_drones
        c = sum(self.cost[i][choice[i]] for i in range(n))
        k = sum(self.conflict[i, choice[i], j, choice[j]] for i in range(n) for j in range(i + 1, n))
        return c, k

    def decode(self, bits) -> tuple | None:
        """bits[var] -> corridor choice per drone, or None if a drone has != 1 corridor."""
        choice = []
        for i in range(self.n_drones):
            on = [p for p in range(self.n_paths) if bits[self.var(i, p)]]
            if len(on) != 1:
                return None
            choice.append(on[0])
        return tuple(choice)


DEFAULT_DRONES = [((0, 0), (3, 3)), ((0, 1), (3, 2)), ((1, 0), (2, 3))]


def build_instance(grid: int = 4, drones=None, n_paths: int = 3, seed: int = 3) -> Instance:
    """Random segment costs (1-3, distance + wind/energy); pick the n_paths cheapest
    mutually distinct staircase corridors per drone."""
    drones = drones or DEFAULT_DRONES
    rng = random.Random(seed)
    weight = {e: rng.choice([1, 1, 1, 2, 2, 3]) for e in grid_edges(grid)}
    corridors, cost = [], []
    for s, t in drones:
        paths = sorted(monotone_paths(s, t), key=lambda p: (sum(weight[e] for e in path_edges(p)), p))
        chosen = []
        for p in paths:
            if all(len(path_edges(p) ^ path_edges(q)) >= 4 for q in chosen):
                chosen.append(p)
            if len(chosen) == n_paths:
                break
        if len(chosen) < n_paths:
            raise ValueError(f"drone {s}->{t} has fewer than {n_paths} distinct corridors")
        corridors.append(chosen)
        cost.append([sum(weight[e] for e in path_edges(p)) for p in chosen])
    n = len(drones)
    conflict = {(i, p, j, q): len(path_edges(corridors[i][p]) & path_edges(corridors[j][q]))
                for i in range(n) for j in range(i + 1, n)
                for p in range(n_paths) for q in range(n_paths)}
    return Instance(grid, list(drones), weight, corridors, cost, conflict)


# Larger instances for the scaling slide (still brute-forceable).
SCALING_DRONES = {
    3: DEFAULT_DRONES,
    4: DEFAULT_DRONES + [((3, 0), (0, 3))],
}
