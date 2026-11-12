"""Generate the SkyLanes voice-over with Kokoro (kokoro-onnx) and a frame-accurate timeline.

    .venv/Scripts/python.exe tts.py [--speed 1.0]

Writes remotion/public/voice/<scene>_<n>.wav, remotion/public/voice.wav (full track)
and remotion/src/timeline.json (scene + line start/end in frames at 30 fps).
"""
import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
PUB = HERE / "remotion" / "public"
FPS = 30
LEAD_IN = 0.8     # seconds of music before the first word
TAIL = 1.9        # seconds after the last word


def trim(x, sr, thresh=0.008, pad=0.04):
    idx = np.flatnonzero(np.abs(x) > thresh)
    if not len(idx):
        return x
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--speed", type=float)
    args = ap.parse_args()
    script = json.loads((HERE / "script.json").read_text(encoding="utf-8"))
    speed = args.speed or script["speed"]
    kok = Kokoro(str(HERE / "models" / "kokoro-v1.0.onnx"), str(HERE / "models" / "voices-v1.0.bin"))
    (PUB / "voice").mkdir(parents=True, exist_ok=True)

    sr = 24000
    t = LEAD_IN
    track = [np.zeros(int(LEAD_IN * sr), dtype=np.float32)]
    scenes = []
    for si, scene in enumerate(script["scenes"]):
        s0 = t
        lines = []
        for li, line in enumerate(scene["lines"]):
            audio, sr = kok.create(line["say"], voice=script["voice"], speed=speed, lang="en-us")
            audio = trim(np.asarray(audio, dtype=np.float32), sr)
            name = f"{scene['id']}_{li}.wav"
            sf.write(PUB / "voice" / name, audio, sr)
            dur = len(audio) / sr
            lines.append({"show": line["show"], "file": f"voice/{name}",
                          "from": round(t * FPS), "dur": round(dur * FPS)})
            track.append(audio)
            t += dur
            gap = script["gap_s"] if li < len(scene["lines"]) - 1 else script["scene_gap_s"]
            track.append(np.zeros(int(gap * sr), dtype=np.float32))
            t += gap
            print(f"{scene['id']:<11} {li}  {dur:5.2f}s  {line['show'][:60]}")
        scenes.append({"id": scene["id"], "from": round(s0 * FPS), "dur": round((t - s0) * FPS), "lines": lines})
    track.append(np.zeros(int((TAIL - script["scene_gap_s"]) * sr), dtype=np.float32))
    full = np.concatenate(track)
    total = len(full) / sr
    # the last scene absorbs the tail so the video ends cleanly
    scenes[-1]["dur"] = round(total * FPS) - scenes[-1]["from"]
    sf.write(PUB / "voice.wav", full, sr)
    timeline = {"fps": FPS, "total": round(total * FPS), "leadIn": round(LEAD_IN * FPS), "speed": speed, "scenes": scenes}
    (HERE / "remotion" / "src").mkdir(parents=True, exist_ok=True)
    (HERE / "remotion" / "src" / "timeline.json").write_text(json.dumps(timeline, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"\nTOTAL {total:.1f} s ({timeline['total']} frames) at speed {speed}")


if __name__ == "__main__":
    main()
