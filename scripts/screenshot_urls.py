import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

# Backend-Ordner (relativ zum Projektroot)
BACKEND_DIR = Path(__file__).parent.parent / "backend"
CONFIG_PATH = BACKEND_DIR / "config.json"
SCREENSHOTS_DIR = BACKEND_DIR / "screenshots"


def _screenshot_single_url(url: str, output_dir: Path) -> str:
    """Lädt eine URL und erstellt einen Screenshot. Pro Thread eigener Browser."""
    filename = url_to_filename(url)
    screenshot_path = output_dir / filename
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        print(f"Lade {url} ...")
        page.goto(url, wait_until="load")
        time.sleep(1)  # Warten bis Inhalt gerendert ist
        page.screenshot(path=str(screenshot_path), full_page=True)
        browser.close()
    return str(screenshot_path)


def url_to_filename(url: str) -> str:
    """Konvertiert eine URL in einen sicheren Dateinamen."""
    parsed = urlparse(url)
    hostname = parsed.netloc or parsed.path
    # www. entfernen, Punkte durch Unterstriche ersetzen
    name = hostname.replace("www.", "").replace(".", "_")
    # Nur erlaubte Zeichen behalten
    name = re.sub(r"[^\w\-]", "", name)
    return f"{name}.png"


def screenshot_from_config(config_path=None):
    if config_path is None:
        config_path = CONFIG_PATH
    config_path = Path(config_path)

    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)
    # Unterstützt "urls" (Liste) oder "url" (einzelne URL)
    urls = config.get("urls", config.get("url", []))
    if isinstance(urls, str):
        urls = [urls]

    output_dir = Path(config.get("output_folder", "screenshots"))
    if not output_dir.is_absolute():
        output_dir = BACKEND_DIR / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    max_workers = min(len(urls), 8)  # Max. 8 parallele Browser
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_screenshot_single_url, url, output_dir): url
            for url in urls
        }
        for future in as_completed(futures):
            url = futures[future]
            try:
                screenshot_path = future.result()
                print(f"Screenshot gespeichert: {screenshot_path}")
            except Exception as e:
                print(f"Fehler bei {url}: {e}")


if __name__ == "__main__":
    screenshot_from_config()
