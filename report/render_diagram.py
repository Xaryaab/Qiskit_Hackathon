"""Render report/architecture.html to the architecture diagram files.

Writes report/architecture.png (2x, used in the report) and the standalone deliverables
SkyLanes_Architecture.png and SkyLanes_Architecture.pdf (vector) at the repository root.
"""
import asyncio
import shutil
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
W, H = 1600, 830


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
        await page.goto((HERE / "architecture.html").as_uri(), wait_until="networkidle")
        await page.evaluate("document.fonts.ready")
        await page.locator("#arch").screenshot(path=str(HERE / "architecture.png"))
        await page.pdf(path=str(ROOT / "SkyLanes_Architecture.pdf"), width=f"{W}px", height=f"{H}px",
                       print_background=True, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
        await b.close()
    shutil.copyfile(HERE / "architecture.png", ROOT / "SkyLanes_Architecture.png")
    for f in (HERE / "architecture.png", ROOT / "SkyLanes_Architecture.png", ROOT / "SkyLanes_Architecture.pdf"):
        print("wrote", f)


asyncio.run(main())
