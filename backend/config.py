"""Konfiguration für das Backend-Modul."""

from pathlib import Path

# Pfade (relativ zum Backend-Ordner)
BACKEND_DIR = Path(__file__).parent
RESULTS_PATH = BACKEND_DIR / "results.json"
SCREENSHOTS_DIR = BACKEND_DIR / "screenshots"

# Gemini
GEMINI_MODEL = "gemini-1.5-flash"

# Playwright
VIEWPORT = {"width": 1280, "height": 800}
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
PAGE_LOAD_WAIT = 1  # Sekunden
