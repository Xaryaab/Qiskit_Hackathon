"""Render report/architecture.html to report/architecture.png (2x, for print)."""
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1600, "height": 830}, device_scale_factor=2)
        await page.goto((HERE / "architecture.html").as_uri(), wait_until="networkidle")
        await page.evaluate("document.fonts.ready")
        await page.locator("#arch").screenshot(path=str(HERE / "architecture.png"))
        await b.close()
    print("wrote", HERE / "architecture.png")


asyncio.run(main())
