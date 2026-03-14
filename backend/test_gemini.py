"""
Test-Script: Gemini Flash API Latenz messen.
Misst Screenshot + Gemini-Aufruf separat, um Engpässe zu identifizieren.
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import BACKEND_DIR, GEMINI_MODEL

load_dotenv(BACKEND_DIR / ".env")


def test_gemini_only():
    """Nur Gemini API testen – mit kleinem Testbild (1x1 Pixel)."""
    from google import genai
    from google.genai import types

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY nicht gesetzt.")
        return

    # Minimales PNG (1x1 transparent)
    minimal_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    client = genai.Client(api_key=api_key)
    image_part = types.Part.from_bytes(data=minimal_png, mime_type="image/png")
    prompt = "Antworte mit einem JSON: {\"score\": 5, \"reasoning\": \"Test\", \"lovable_prompt\": \"Test\"}"

    print(f"Modell: {GEMINI_MODEL}")
    print("Sende Anfrage an Gemini API ...")

    t0 = time.perf_counter()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[prompt, image_part],
        config=types.GenerateContentConfig(temperature=0.2),
    )
    elapsed = time.perf_counter() - t0

    print(f"Gemini Antwortzeit: {elapsed:.2f}s")
    print(f"Antwort: {(response.text or '')[:200]}...")


def test_full_pipeline(url: str = "https://www.poppele.de/"):
    """Voller Ablauf: Screenshot + Gemini + Speichern (mit Zeiten)."""
    from backend.analyze_website import take_screenshot, analyze_screenshot

    print(f"URL: {url}")
    print("1. Screenshot erstellen ...")
    t0 = time.perf_counter()
    screenshot_bytes = take_screenshot(url)
    t1 = time.perf_counter()
    print(f"   Screenshot: {t1 - t0:.2f}s ({len(screenshot_bytes):,} Bytes)")

    print("2. Gemini analysieren ...")
    t2 = time.perf_counter()
    result = analyze_screenshot(screenshot_bytes, url)
    t3 = time.perf_counter()
    print(f"   Gemini + Upload + Save: {t3 - t2:.2f}s")
    print(f"   Score: {result['score']}/10")
    print(f"\nGesamt: {t3 - t0:.2f}s")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "gemini":
        test_gemini_only()
    else:
        url = sys.argv[1] if len(sys.argv) > 1 else "https://www.poppele.de/"
        test_full_pipeline(url)
