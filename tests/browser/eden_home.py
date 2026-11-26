"""Regression check for the device bezel, mobile overflow and the preview's chat action."""
from shutil import which

from playwright.sync_api import sync_playwright


def test_layout(browser, width, height):
    page = browser.new_page(viewport={"width": width, "height": height})
    try:
        page.goto("http://127.0.0.1:3000/eden")
        page.get_by_role("heading", name="Eden Skye").wait_for()
        page.evaluate("document.fonts.ready")
        link = page.get_by_role("link", name="Continue to chat")
        assert link.get_attribute("href") == "https://www.xtremeavatar.com/chat"
        assert page.locator("[data-phone-shell]").count() == 0
        assert page.evaluate("document.documentElement.scrollWidth") == width
        assert page.locator("main").bounding_box()["width"] == width
        assert link.bounding_box()["y"] + link.bounding_box()["height"] <= height
        image = page.locator("main > [aria-hidden=true]").bounding_box()
        conversation = page.locator("main h1").bounding_box()
        if width <= 720:
            assert image["width"] == width
            assert image["y"] + image["height"] <= conversation["y"]
        else:
            assert image["x"] > conversation["x"]
        assert page.get_by_role("link", name="Account").is_visible()
        print(f"{width} × {height} passed")
    finally:
        page.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=which("google-chrome"), headless=True)
        try:
            for size in [(320, 640), (390, 844), (720, 768), (768, 1024), (1366, 900)]:
                test_layout(browser, *size)
        finally:
            browser.close()
