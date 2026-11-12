"""Figures for the report and demo, built from results/ (run experiments first).

    python -m skylanes.plots
"""
import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .exact import enumerate_feasible
from .instance import build_instance, path_edges

RESULTS = Path("results")
FIG = RESULTS / "figures"
COLORS = ["#2a6fdb", "#e08a1e", "#2a9d6f", "#9b4dca"]


def load():
    summary = json.loads((RESULTS / "summary.json").read_text())
    with open(RESULTS / "qaoa_results.csv") as fh:
        rows = list(csv.DictReader(fh))
    for r in rows:
        for k in ("n_qubits", "reps"):
            r[k] = int(r[k])
        for k in ("mu", "p_feasible", "p_optimal", "random_guess_p_optimal", "approx_ratio_feasible"):
            r[k] = float(r[k])
    return summary, rows


def draw_routes(ax, inst, choice, title):
    g = inst.grid
    for r in range(g):
        for c in range(g):
            ax.plot(c, -r, "o", color="#bbbbbb", ms=4, zorder=1)
    for i, cs in enumerate(inst.corridors):
        for p in cs:
            xs, ys = [c for _, c in p], [-r for r, _ in p]
            ax.plot(xs, ys, color=COLORS[i], alpha=0.12, lw=6, solid_capstyle="round", zorder=2)
    used = {}
    for i, p in enumerate(choice):
        path = inst.corridors[i][p - 1]
        off = (i - 1) * 0.06
        ax.plot([c + off for _, c in path], [-r + off for r, _ in path], color=COLORS[i], lw=2.6,
                marker="o", ms=4, label=f"Drone {i+1}: corridor {p}", zorder=3)
        for e in path_edges(path):
            used[e] = used.get(e, 0) + 1
    for (a, b), n in used.items():
        if n > 1:
            ax.plot([a[1], b[1]], [-a[0], -b[0]], color="#d62828", lw=9, alpha=0.35, zorder=2.5)
    ax.set_title(title, fontsize=10)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.legend(loc="upper center", fontsize=7, frameon=False, bbox_to_anchor=(0.5, 0.0))


def fig_routes(inst, summary):
    mus = list(summary["per_mu"])
    fig, axes = plt.subplots(1, len(mus), figsize=(4.4 * len(mus), 5))
    axes = axes if len(mus) > 1 else [axes]
    for ax, mu in zip(axes, mus):
        s = summary["per_mu"][mu]["shots"]["xy"]
        ch = s["most_likely_feasible"]
        c, k = inst.evaluate(tuple(x - 1 for x in ch))
        draw_routes(ax, inst, ch, f"mu={mu}: QAOA (XY) pick {tuple(ch)}\ncost {c}, shared segments {k}"
                                  f"{' (exact optimum)' if s['most_likely_is_optimal'] else ''}")
    fig.suptitle("Corridors chosen by QAOA (red = shared segment)", fontsize=11)
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(FIG / "routes.png", dpi=160, bbox_inches="tight")
    plt.close(fig)


def fig_pareto(inst, summary):
    scored = enumerate_feasible(inst)
    fig, ax = plt.subplots(figsize=(5.2, 4))
    ax.scatter([c for _, c, _ in scored], [k for _, _, k in scored], color="#cccccc", s=40,
               label="all 27 feasible assignments", zorder=1)
    front = summary["instance"]["pareto_front"]
    ax.plot([c for c, _ in front], [k for _, k in front], "k--", lw=1, label="exact Pareto front", zorder=2)
    for idx, mu in enumerate(summary["per_mu"]):
        for mixer, marker in (("x", "s"), ("xy", "o")):
            s = summary["per_mu"][mu]["shots"][mixer]
            ax.scatter(s["most_likely_feasible_cost"], s["most_likely_feasible_conflicts"], marker=marker,
                       s=110 if mixer == "x" else 60, facecolor="none" if mixer == "x" else COLORS[idx],
                       edgecolor=COLORS[idx], lw=2, zorder=3,
                       label=f"QAOA {'penalty' if mixer == 'x' else 'XY'} mu={mu}")
    ax.set_xlabel("total flight cost")
    ax.set_ylabel("shared corridor segments (conflicts)")
    ax.set_title("Trade-off: sweeping mu moves QAOA along the Pareto front", fontsize=10)
    ax.legend(fontsize=7, frameon=False)
    fig.tight_layout()
    fig.savefig(FIG / "pareto.png", dpi=160)
    plt.close(fig)


def fig_depth(rows):
    rows = [r for r in rows if r["n_qubits"] == 9]
    mus = sorted({r["mu"] for r in rows})
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.6))
    for idx, mu in enumerate(mus):
        for mixer, ls in (("x", "--"), ("xy", "-")):
            rr = sorted((r for r in rows if r["mu"] == mu and r["mixer"] == mixer), key=lambda r: r["reps"])
            label = f"{'penalty' if mixer == 'x' else 'XY'} mu={mu}"
            axes[0].plot([r["reps"] for r in rr], [r["p_optimal"] for r in rr], ls, marker="o",
                         color=COLORS[idx], label=label)
            axes[1].plot([r["reps"] for r in rr], [r["p_feasible"] for r in rr], ls, marker="o",
                         color=COLORS[idx], label=label)
    n_feasible = 3 ** 3  # 3 drones x 3 corridors
    for idx, mu in enumerate(mus):
        r0 = next(r for r in rows if r["mu"] == mu)
        valid_guess = r0["random_guess_p_optimal"] * 2 ** 9 / n_feasible
        axes[0].axhline(valid_guess, color=COLORS[idx], lw=0.9, ls=":", alpha=0.8,
                        label=f"random valid plan mu={mu}")
    axes[0].legend(fontsize=6.5, frameon=False, loc="upper left")
    axes[0].set_title("P(sample is an exact optimum)  dotted = random valid plan", fontsize=10)
    axes[1].set_title("P(sample is feasible: one corridor per drone)", fontsize=10)
    for ax in axes:
        ax.set_xlabel("QAOA depth p")
        ax.set_ylim(0, 1.05)
        ax.set_xticks(sorted({r["reps"] for r in rows}))
    axes[1].legend(fontsize=7, frameon=False)
    fig.tight_layout()
    fig.savefig(FIG / "depth.png", dpi=160)
    plt.close(fig)


def fig_histogram(inst, summary):
    mu = list(summary["per_mu"])[-1]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.6), sharey=True)
    from .metrics import Landscape
    land = Landscape(inst, float(mu))
    for ax, mixer in zip(axes, ("x", "xy")):
        s = summary["per_mu"][mu]["shots"][mixer]
        items = list(s["top_counts"].items())[:10]
        colors, labels = [], []
        for key, _ in items:
            z = int(key, 2)
            colors.append("#2a9d6f" if land.optimal[z] else ("#2a6fdb" if land.feasible[z] else "#d62828"))
            labels.append(str(tuple(int(c) + 1 for c in land.choice[z])) if land.feasible[z] else key)
        ax.bar(range(len(items)), [v / s["shots"] for _, v in items], color=colors)
        ax.set_xticks(range(len(items)))
        ax.set_xticklabels(labels, rotation=60, fontsize=7, family="monospace")
        ax.set_xlabel("corridor per drone (D1, D2, D3); raw bitstring if infeasible", fontsize=8)
        ax.set_title(f"{'Penalty' if mixer == 'x' else 'XY-mixer'} QAOA p={s['reps']}, mu={mu}: "
                     f"P(opt)={s['p_optimal']:.2f}, P(feasible)={s['p_feasible']:.2f}", fontsize=9)
    axes[0].set_ylabel("sample frequency (4096 shots)")
    fig.text(0.5, -0.02, "green = exact optimum, blue = feasible, red = infeasible (constraint broken)",
             ha="center", fontsize=8)
    fig.tight_layout()
    fig.savefig(FIG / "histogram.png", dpi=160, bbox_inches="tight")
    plt.close(fig)


def main():
    FIG.mkdir(parents=True, exist_ok=True)
    summary, rows = load()
    inst = build_instance()
    fig_routes(inst, summary)
    fig_pareto(inst, summary)
    fig_depth(rows)
    fig_histogram(inst, summary)
    print("figures written to", FIG)


if __name__ == "__main__":
    main()
