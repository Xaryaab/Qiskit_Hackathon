"""Original underscore for the SkyLanes video + final mix with the Kokoro voice.

    ../.venv/Scripts/python.exe music.py          (run from video/audio)

A calm, forward-moving A-minor progression (Am - F - C - G, 100 bpm): warm pad, soft plucked arpeggio,
sub bass, and a glockenspiel chime on every scene change. Ducked under the voice, loudness-normalised to
-16 LUFS integrated (web), true-peak safe. Writes ../remotion/public/mix.wav (48 kHz stereo).
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from dsp import SR, ns, rng, place, make_ir, convolve_st, integrated, lp, hp, dbg
import instruments as I

HERE = Path(__file__).resolve().parent
PUB = HERE.parent / "remotion" / "public"
TL = json.loads((HERE.parent / "remotion" / "src" / "timeline.json").read_text())
FPS = TL["fps"]
DUR = TL["total"] / FPS
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
PROG = [  # (root midi, chord tones)
    (45, [57, 60, 64]),   # Am
    (41, [57, 60, 65]),   # F
    (48, [55, 60, 64]),   # C
    (43, [55, 59, 62]),   # G
]
DASH = {"dash_intro", "dash_mu", "dash_mixer", "dash_shots", "dash_live"}


def build():
    r = rng(11)
    n = ns(DUR + 2)
    pad_b, arp_b, bass_b, glk_b = (np.zeros((2, n)) for _ in range(4))
    nbars = int(DUR / BAR) + 2
    for b in range(nbars):
        t = b * BAR
        root, tones = PROG[b % 4]
        place(pad_b, I.pad([I.m2f(m) for m in tones], BAR + 0.15, vel=0.5, r=r, att=0.9, rel=1.2, warm=700), t)
        # sub bass: root on beat 1, fifth on beat 3
        for k, m in ((0, root - 12), (2, root - 5)):
            x = I.pluck(I.m2f(m), vel=0.55, r=r, dur=1.4, bright=0.15)
            place(bass_b, np.stack([x, x]), t + k * BEAT)
        # arpeggio (8ths) enters after the first sentence
        if t < 2.8:
            continue
        pattern = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[1] + 12] * 2
        for k, m in enumerate(pattern):
            x = I.pluck(I.m2f(m), vel=0.32 if k % 2 else 0.4, r=r, dur=0.7, bright=0.55)
            pn = -0.35 if k % 2 else 0.35
            th = (pn + 1) * np.pi / 4
            place(arp_b, np.stack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2), t + k * BEAT / 2)
    # chime on each scene change (inside the dashboard block only on its first clip)
    for s in TL["scenes"]:
        if s["id"] in DASH and s["id"] != "dash_intro":
            continue
        t = max(0.0, s["from"] / FPS - 0.05)
        bar = int(t / BAR)
        tones = PROG[bar % 4][1]
        for j, m in enumerate((tones[0] + 24, tones[2] + 24)):
            x = I.glock(I.m2f(m), vel=0.5, r=r, dur=2.2)
            place(glk_b, np.stack([x, x]), t + j * 0.09)
    music = 0.9 * pad_b + 0.55 * arp_b + 0.8 * bass_b + 0.45 * glk_b
    music = hp(music, 35)
    ir = make_ir(2.4, 5, hf=1.6)
    music = music + 0.28 * convolve_st(lp(music.mean(axis=0), 6000), ir)
    # fade in/out
    e = np.ones(n)
    e[: ns(1.2)] = np.linspace(0, 1, ns(1.2)) ** 2
    end = ns(DUR)
    e[end - ns(3.0): end] = np.linspace(1, 0, ns(3.0)) ** 1.5
    e[end:] = 0
    return (music * e[None, :])[:, :end]


def voice_track():
    v, sr = sf.read(PUB / "voice.wav", dtype="float64")
    v = resample_poly(v, SR, sr)
    out = np.zeros(ns(DUR))
    out[: min(len(v), len(out))] = v[: len(out)]
    return out


def duck_env(v, depth_db=9.0):
    a = np.abs(v)
    win = ns(0.12)
    env = np.convolve(a, np.ones(win) / win, mode="same")
    on = (env > 0.01).astype(float)
    # attack 60 ms, release 450 ms smoothing
    att, rel = ns(0.06), ns(0.45)
    g = np.zeros_like(on)
    cur = 0.0
    for i in range(0, len(on), 64):
        tgt = on[i]
        k = 64 / (att if tgt > cur else rel)
        cur += (tgt - cur) * min(1.0, k)
        g[i:i + 64] = cur
    return dbg(-depth_db * g)


def limit(x, thr):
    """look-ahead brickwall: per-sample gain needed, min over 5 ms ahead/behind, smoothed over 3 ms"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    need = np.minimum(1.0, thr / (np.abs(x).max(axis=0) + 1e-12))
    g = minimum_filter1d(need, size=ns(0.010))
    g = uniform_filter1d(g, size=ns(0.003))
    g = np.minimum(g, minimum_filter1d(need, size=ns(0.004)))
    return x * g[None, :]


def main():
    music = build()
    voice = voice_track()
    voice_st = np.stack([voice, voice])
    # set the music bed ~16 dB under the voice, then duck it further while words are spoken
    lv, lm = integrated(voice_st), integrated(music)
    music *= dbg((lv - 10.0) - lm)
    music *= duck_env(voice, depth_db=8.0)[None, :]
    mix = voice_st + music
    # normalise to -16 LUFS, then a 5 ms look-ahead peak limiter holds peaks at -1.5 dBFS
    for _ in range(3):
        mix *= dbg(-16.0 - integrated(mix))
        mix = limit(mix, dbg(-1.5))
    sf.write(PUB / "mix.wav", mix.T.astype(np.float32), SR, subtype="PCM_24")
    print(f"mix.wav {DUR:.1f}s  voice {lv:.1f} LUFS  music bed {integrated(music):.1f} LUFS  final {integrated(mix):.1f} LUFS  peak {20*np.log10(np.abs(mix).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
