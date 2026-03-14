import io
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

from dotenv import load_dotenv

# Backend-Ordner (relativ zum Projektroot)
BACKEND_DIR = Path(__file__).parent.parent / "backend"
CONFIG_PATH = BACKEND_DIR / "config.json"

load_dotenv(BACKEND_DIR / ".env")


def _screenshot_single_url(url: str, upload_to_supabase: bool = True) -> str:
    """Lädt eine URL, erstellt einen Screenshot und lädt ihn in Supabase Storage hoch."""
    filename = url_to_filename(url)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        print(f"Lade {url} ...")
        page.goto(url, wait_until="load")
        time.sleep(1)  # Warten bis Inhalt gerendert ist
        screenshot_bytes = page.screenshot(full_page=True, type="png")
        browser.close()

    if upload_to_supabase:
        public_url = _upload_to_supabase(filename, screenshot_bytes)
        return public_url or f"(lokal: {filename})"
    return filename


def _upload_to_supabase(path: str, data: bytes) -> str | None:
    """Lädt Screenshot in Supabase Storage hoch. Gibt die öffentliche URL zurück."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("Warnung: SUPABASE_URL/SUPABASE_SERVICE_KEY nicht gesetzt. Screenshot wird nicht hochgeladen.")
        return None

    try:
        import sys
        from pathlib import Path
        _root = Path(__file__).resolve().parent.parent
        if str(_root) not in sys.path:
            sys.path.insert(0, str(_root))
        from backend.supabase_client import get_client

        client = get_client()
        client.storage.from_("screenshots").upload(
            path=path,
            file=io.BytesIO(data),
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return client.storage.from_("screenshots").get_public_url(path)
    except Exception as e:
        print(f"Fehler beim Upload von {path}: {e}")
        return None


def url_to_filename(url: str) -> str:
    """Konvertiert eine URL in einen sicheren Dateinamen."""
    parsed = urlparse(url)
    hostname = parsed.netloc or parsed.path
    # www. entfernen, Punkte durch Unterstriche ersetzen
    name = hostname.replace("www.", "").replace(".", "_")
    # Nur erlaubte Zeichen behalten
    name = re.sub(r"[^\w\-]", "", name)
    return f"{name}.png"


def screenshot_from_config(config_path=None, upload_to_supabase: bool = True):
    if config_path is None:
        config_path = CONFIG_PATH
    config_path = Path(config_path)

    with open(config_path, encoding="utf-8") as f:
        config = json.load(f)
    # Unterstützt "urls" (Liste) oder "url" (einzelne URL)
    urls = config.get("urls", config.get("url", []))
    if isinstance(urls, str):
        urls = [urls]

    max_workers = min(len(urls), 8)  # Max. 8 parallele Browser
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_screenshot_single_url, url, upload_to_supabase): url
            for url in urls
        }
        for future in as_completed(futures):
            url = futures[future]
            try:
                result = future.result()
                print(f"Screenshot: {result}")
            except Exception as e:
                print(f"Fehler bei {url}: {e}")


if __name__ == "__main__":
    screenshot_from_config()
