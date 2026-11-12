"""Film the live SkyLanes dashboard for the video: headless Chromium at 1920x1080, a drawn cursor,
lossless screencast frames, one clip per dashboard scene paced to the narration in timeline.json.

    .venv/Scripts/python.exe capture.py [--url https://skylanes-dashboard.vercel.app/]
Writes remotion/public/clips/<scene>.mp4 and remotion/public/clips/fullpage.png.
"""
import argparse
import asyncio
import base64
import json
import shutil
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
CLIPS = HERE / "remotion" / "public" / "clips"
FRAMES = HERE / "frames"
W, H = 1920, 1080
FFMPEG = str(HERE / "remotion" / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe")

CURSOR_JS = """
(() => {
  const c = document.createElement('div');
  c.id = '__cursor';
  c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.4 L18 13.4 Z" fill="#fff" stroke="#1B2A4A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, {position:'fixed', left:'0px', top:'0px', zIndex: 99999, pointerEvents:'none', transform:'translate(-3px,-2px)', filter:'drop-shadow(0 2px 3px rgba(0,0,0,.35))'});
  document.body.appendChild(c);
  const ring = document.createElement('div');
  Object.assign(ring.style, {position:'fixed', width:'46px', height:'46px', marginLeft:'-23px', marginTop:'-23px', borderRadius:'50%', border:'3px solid #B0287A', opacity:0, zIndex:99998, pointerEvents:'none', transition:'opacity .5s, transform .5s', transform:'scale(.4)'});
  document.body.appendChild(ring);
  // Everything below runs on the page's own clock, so the recording's timestamps match the choreography.
  const pos = { x: innerWidth * 0.62, y: innerHeight * 0.45 };
  const put = () => { c.style.left = pos.x + 'px'; c.style.top = pos.y + 'px'; };
  put();
  const ease = t => t * t * (3 - 2 * t);
  const anim = (ms, fn) => new Promise(res => { const t0 = performance.now();
    const step = now => { const t = Math.min(1, (now - t0) / ms); fn(ease(t)); if (t < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step); });
  window.__glide = (x, y, ms = 700) => { const x0 = pos.x, y0 = pos.y; return anim(ms, e => { pos.x = x0 + (x - x0) * e; pos.y = y0 + (y - y0) * e; put(); }); };
  const pulse = () => { ring.style.transition = 'none'; ring.style.left = pos.x + 'px'; ring.style.top = pos.y + 'px'; ring.style.opacity = 1; ring.style.transform = 'scale(.4)';
    requestAnimationFrame(() => { ring.style.transition = 'opacity .6s, transform .6s'; ring.style.opacity = 0; ring.style.transform = 'scale(1.4)'; }); };
  const center = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  window.__click = async (sel, ms = 700, pause = 220) => { const [x, y] = center(sel); await __glide(x, y, ms);
    await new Promise(r => setTimeout(r, pause)); pulse(); document.querySelector(sel).click(); };
  window.__drag = async (from, to, ms = 1400) => {
    const s = document.getElementById('mu'), r = s.getBoundingClientRect(), pad = 10;
    const X = v => r.left + pad + (r.width - 2 * pad) * v / 3, y = r.top + r.height / 2;
    await __glide(X(from), y, 600); pulse();
    await anim(ms, e => { const v = from + (to - from) * e; s.value = v.toFixed(2); s.dispatchEvent(new Event('input', { bubbles: true }));
      pos.x = X(v); pos.y = y; put(); });
  };
  window.__scroll = (y, ms = 1000) => { const y0 = scrollY; return anim(ms, e => scrollTo(0, y0 + (y - y0) * e)); };
})();
"""


class Recorder:
    def __init__(self, page, cdp, name):
        self.page, self.cdp, self.name = page, cdp, name
        self.dir = FRAMES / name
        self.dir.mkdir(parents=True, exist_ok=True)
        for old in self.dir.glob("*.jpg"):
            old.unlink()
        self.frames = []          # (timestamp, path)
        self.cdp.on("Page.screencastFrame", self.on_frame)

    def on_frame(self, ev):
        p = self.dir / f"{len(self.frames):05d}.jpg"
        p.write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((ev["metadata"]["timestamp"], p))
        asyncio.ensure_future(self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]}))

    async def start(self):
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 95, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        self.t0 = await self.page.evaluate("performance.timeOrigin + performance.now()") / 1000

    async def stop(self, length_s):
        await asyncio.sleep(0.2)
        await self.cdp.send("Page.stopScreencast")
        self.cdp.remove_listener("Page.screencastFrame", self.on_frame)
        await asyncio.sleep(0.2)
        return self.encode(length_s)

    def encode(self, length_s):
        # Constant 30 fps: output frame k shows the latest screencast frame captured at or before k/30 s.
        fr = sorted(self.frames)
        start = fr[0][0]
        seq = self.dir / "seq"
        seq.mkdir(exist_ok=True)
        for old in seq.glob("*"):
            old.unlink()
        j = 0
        for k in range(int(round(length_s * 30))):
            t = start + k / 30
            while j + 1 < len(fr) and fr[j + 1][0] <= t:
                j += 1
            shutil.copyfile(fr[j][1], seq / f"{k:05d}.jpg")
        out = CLIPS / f"{self.name}.mp4"
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-framerate", "30", "-i", str(seq / "%05d.jpg"),
                        "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", str(out)], check=True)
        print(f"{self.name}: {len(fr)} frames -> {out.name} ({length_s:.1f}s)")
        return out


class Mouse:
    def __init__(self, page):
        self.page, self.x, self.y = page, W * 0.62, H * 0.45

    async def glide(self, x, y, secs=0.7):
        n = max(2, int(secs * 60))
        x0, y0 = self.x, self.y
        for i in range(1, n + 1):
            t = i / n
            e = t * t * (3 - 2 * t)
            await self.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            await asyncio.sleep(secs / n)
        self.x, self.y = x, y

    async def click(self, sel, secs=0.7, pause=0.25):
        box = await self.page.locator(sel).first.bounding_box()
        await self.glide(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, secs)
        await asyncio.sleep(pause)
        await self.page.mouse.down(); await asyncio.sleep(0.07); await self.page.mouse.up()

    async def drag_slider(self, frm, to, secs=1.4, vmax=3.0):
        box = await self.page.locator("#mu").bounding_box()
        pad = 10
        X = lambda v: box["x"] + pad + (box["width"] - 2 * pad) * v / vmax
        yy = box["y"] + box["height"] / 2
        await self.glide(X(frm), yy, 0.6)
        await self.page.mouse.down()
        n = int(secs * 60)
        for i in range(1, n + 1):
            t = i / n; e = t * t * (3 - 2 * t)
            await self.page.mouse.move(X(frm + (to - frm) * e), yy)
            await asyncio.sleep(secs / n)
        await self.page.mouse.up()
        self.x, self.y = X(to), yy


async def smooth_scroll(page, y, secs=1.0):
    await page.evaluate("""([y, ms]) => new Promise(res => { const y0 = scrollY, t0 = performance.now();
      const step = now => { const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
        scrollTo(0, y0 + (y - y0) * e); if (t < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); })""", [y, secs * 1000])


def scene_len(tl, sid):
    s = next(s for s in tl["scenes"] if s["id"] == sid)
    return s["dur"] / tl["fps"] + 0.5


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://skylanes-dashboard.vercel.app/")
    args = ap.parse_args()
    tl = json.loads((HERE / "remotion" / "src" / "timeline.json").read_text())
    CLIPS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        page = await ctx.new_page()

        async def fresh():
            await page.goto(args.url, wait_until="networkidle")
            await page.add_script_tag(content=CURSOR_JS)
            await page.wait_for_function("document.getElementById('verdict').textContent.length > 10")

        await fresh()
        await page.screenshot(path=str(CLIPS / "fullpage.png"), full_page=True)
        print("fullpage.png saved")
        cdp = await ctx.new_cdp_session(page)
        js = page.evaluate

        async def run(name, steps):
            """steps: list of (seconds after start, js expression); each awaited in order, starting no earlier than its time"""
            L = scene_len(tl, name)
            rec = Recorder(page, cdp, name)
            await rec.start()
            t0 = asyncio.get_running_loop().time()
            for t, expr in steps:
                wait = t - (asyncio.get_running_loop().time() - t0)
                if wait > 0:
                    await asyncio.sleep(wait)
                await js(expr)
            rest = L - (asyncio.get_running_loop().time() - t0)
            if rest > 0:
                await asyncio.sleep(rest)
            await rec.stop(L)

        # Times are seconds into each clip, matched to the narration of that scene.
        await asyncio.sleep(1.5)
        await run("dash_intro", [
            (0.15, "__click('[data-view=quantum]', 450)"),      # re-renders the map: drones fly on camera
            (4.6, "__click('[data-view=exact]')"),               # "...matches the exact best plan"
            (6.8, "__click('[data-view=quantum]')"),
        ])
        await run("dash_mu", [
            (0.1, "__drag(1.5, 0.25, 1100)"),                    # "Lower the safety weight"
            (5.0, "__drag(0.25, 1.5, 1100)"),                    # "Raise it"
        ])
        mixer_top = await js("document.querySelector('[data-mixer=x]').getBoundingClientRect().top + scrollY")
        duel_bottom = await js("document.querySelector('.duel').getBoundingClientRect().bottom + scrollY")
        target = max(0, min(mixer_top - 90, duel_bottom - H + 30))
        await run("dash_mixer", [
            (0.0, f"__scroll({target}, 800)"),
            (0.85, "__click('[data-mixer=x]', 600)"),           # "Switch to the penalty version"
            (4.5, "__click('[data-mixer=xy]', 600)"),           # "Switch back"
        ])
        btn_top = await js("document.getElementById('shots').getBoundingClientRect().top + scrollY")
        await run("dash_shots", [
            (0.0, f"__scroll({btn_top - 70}, 900)"),
            (1.0, "__click('#shots', 550)"),                     # "Sample 4,096 shots"
            (2.7, f"__scroll({btn_top + 360}, 1100)"),           # bring the whole histogram into view
            (4.0, "__glide(520, document.getElementById('hist').getBoundingClientRect().top + 230, 900)"),
        ])
        await run("dash_live", [
            (0.0, "__scroll(0, 800)"),
            (0.9, "__click('[data-source=live]', 600)"),        # "Live mode re-optimises..."
            (2.6, "__drag(1.5, 0.55, 1100)"),                    # "...at any setting"
            (5.8, "__click('[data-reps=\"3\"]', 600)"),
        ])
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
