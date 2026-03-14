"""
Test-Startdatei: Screenshot von URL aus Backend-Config → weitergeben an Analyse.
"""

import json
import sys
from pathlib import Path

# Projektroot für Imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import BACKEND_DIR
from backend.analyze_website import analyze_screenshot, take_screenshot

load_dotenv(BACKEND_DIR / ".env")
from backend.config import BACKEND_DIR

CONFIG_PATH = BACKEND_DIR / "config.json"


def main():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    urls = config.get("urls", config.get("url", []))
    if isinstance(urls, str):
        urls = [urls]

    if not urls:
        print("Keine URLs in backend/config.json gefunden.")
        sys.exit(1)

    url = urls[0]
    print(f"Test: Screenshot von {url} -> Analyse mit Gemini\n")

    # 1. Screenshot erstellen
    screenshot_bytes = take_screenshot(url)
    print(f"Screenshot erstellt ({len(screenshot_bytes):,} Bytes)\n")

    # 2. Screenshot weitergeben an Analyse
    result = analyze_screenshot(screenshot_bytes, url)

    print(f"\nFertig. Score: {result['score']}/10")


if __name__ == "__main__":
    main()
