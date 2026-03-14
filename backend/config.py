"""Konfiguration für das Backend-Modul."""

from pathlib import Path

# Pfade (relativ zum Backend-Ordner) – nur noch für Fallback/Legacy
BACKEND_DIR = Path(__file__).parent
RESULTS_PATH = BACKEND_DIR / "results.json"  # deprecated, wird nicht mehr verwendet
SCREENSHOTS_DIR = BACKEND_DIR / "screenshots"  # deprecated, Supabase Storage wird verwendet

# OpenAI Vision-Modell
OPENAI_MODEL = "gpt-4.1-mini"

# Playwright
VIEWPORT = {"width": 1280, "height": 800}
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
PAGE_LOAD_WAIT = 0.5  # Sekunden (domcontentloaded + kurze Pause)
