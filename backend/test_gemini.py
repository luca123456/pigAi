"""
Test-Script: OpenAI Vision API Latenz messen.
Misst Screenshot + OpenAI-Aufruf separat, um Engpässe zu identifizieren.
"""

import os
import sys
import time
from pathlib import Path
import base64

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import BACKEND_DIR, OPENAI_MODEL

load_dotenv(BACKEND_DIR / ".env")


def test_openai_only():
    """Nur OpenAI API testen – mit kleinem Testbild (1x1 Pixel)."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY nicht gesetzt.")
        return

    # Minimales PNG (1x1 transparent)
    minimal_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    prompt = "Antworte mit einem JSON: {\"score\": 5, \"reasoning\": \"Test\", \"lovable_prompt\": \"Test\"}"
    b64 = base64.b64encode(minimal_png).decode()
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            }
        ],
        "temperature": 0.2,
    }

    print(f"Modell: {OPENAI_MODEL}")
    print("Sende Anfrage an OpenAI API ...")

    t0 = time.perf_counter()
    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60.0,
    )
    response.raise_for_status()
    elapsed = time.perf_counter() - t0
    data = response.json()
    text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()

    print(f"OpenAI Antwortzeit: {elapsed:.2f}s")
    print(f"Antwort: {text[:200]}...")


def test_full_pipeline(url: str = "https://www.poppele.de/"):
    """Voller Ablauf: Screenshot + OpenAI + Speichern (mit Zeiten)."""
    from backend.analyze_website import take_screenshot, analyze_screenshot

    print(f"URL: {url}")
    print("1. Screenshot erstellen ...")
    t0 = time.perf_counter()
    screenshot_bytes = take_screenshot(url)
    t1 = time.perf_counter()
    print(f"   Screenshot: {t1 - t0:.2f}s ({len(screenshot_bytes):,} Bytes)")

    print("2. OpenAI analysieren ...")
    t2 = time.perf_counter()
    result = analyze_screenshot(screenshot_bytes, url)
    t3 = time.perf_counter()
    print(f"   OpenAI + Upload + Save: {t3 - t2:.2f}s")
    print(f"   Score: {result['score']}/10")
    print(f"\nGesamt: {t3 - t0:.2f}s")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "openai":
        test_openai_only()
    else:
        url = sys.argv[1] if len(sys.argv) > 1 else "https://www.poppele.de/"
        test_full_pipeline(url)
