"""
Backend-Modul: Webseiten-Screenshots, Gemini-Bewertung und Ergebnis-Speicherung.
"""

import io
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from PIL import Image

# Projektroot für Imports (funktioniert bei python -m backend.analyze_website)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import google.generativeai as genai
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from backend.config import (
    BACKEND_DIR,
    GEMINI_MODEL,
    PAGE_LOAD_WAIT,
    RESULTS_PATH,
    SCREENSHOTS_DIR,
    USER_AGENT,
    VIEWPORT,
)

load_dotenv(BACKEND_DIR / ".env")

GEMINI_PROMPT = """Bewerte die visuelle Qualität der Website auf einer Skala von 1-10.
Gib NUR ein valides JSON-Objekt zurück mit den Feldern:
- "score" (integer, 1-10)
- "reasoning" (kurzer Text, max. 2 Sätze)
- "lovable_prompt" (ein detaillierter Prompt für lovable.dev, um das Design zu modernisieren)

Antworte ausschließlich mit dem JSON-Objekt, ohne Markdown oder anderen Text."""


def _take_screenshot(url: str) -> bytes:
    """Erstellt einen Screenshot der URL und gibt die PNG-Bytes zurück."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport=VIEWPORT,
            user_agent=USER_AGENT,
        )
        page.goto(url, wait_until="load")
        time.sleep(PAGE_LOAD_WAIT)
        screenshot_bytes = page.screenshot(full_page=True, type="png")
        browser.close()
    return screenshot_bytes


def _call_gemini(screenshot_bytes: bytes) -> dict:
    """Sendet den Screenshot an Gemini und parst die JSON-Antwort."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY nicht gesetzt. Bitte in .env definieren oder als Umgebungsvariable setzen."
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)

    image = Image.open(io.BytesIO(screenshot_bytes))

    response = model.generate_content(
        [GEMINI_PROMPT, image],
        generation_config=genai.GenerationConfig(temperature=0.2),
    )

    text = response.text.strip()
    # Fallback: JSON aus Markdown-Codeblock extrahieren
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if json_match:
        text = json_match.group(1).strip()
    return json.loads(text)


def _save_result(url: str, score: int, reasoning: str, lovable_prompt: str) -> None:
    """Speichert das Ergebnis in results.json (an Liste anhängen)."""
    entry = {
        "url": url,
        "score": score,
        "reasoning": reasoning,
        "lovable_prompt": lovable_prompt,
        "timestamp": datetime.now().isoformat(),
    }

    results = []
    if RESULTS_PATH.exists():
        with open(RESULTS_PATH, encoding="utf-8") as f:
            results = json.load(f)

    results.append(entry)

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def take_screenshot(url: str) -> bytes:
    """Erstellt einen Screenshot der URL und gibt die PNG-Bytes zurück."""
    return _take_screenshot(url)


def analyze_screenshot(screenshot_bytes: bytes, url: str) -> dict:
    """
    Bewertet einen Screenshot mit Gemini und speichert das Ergebnis.
    Nützlich wenn der Screenshot bereits vorliegt.
    """
    result = _call_gemini(screenshot_bytes)
    score = int(result.get("score", 0))
    reasoning = result.get("reasoning", "")
    lovable_prompt = result.get("lovable_prompt", "")

    _save_result(url, score, reasoning, lovable_prompt)
    preview = reasoning[:80] + "..." if len(reasoning) > 80 else reasoning
    print(f"Bewertung: {score}/10 – {preview}")
    print(f"Ergebnis gespeichert in {RESULTS_PATH}")

    return {
        "score": score,
        "reasoning": reasoning,
        "lovable_prompt": lovable_prompt,
    }


def analyze_and_score(url: str) -> dict:
    """
    Macht einen Screenshot der URL, lässt ihn von Gemini bewerten und speichert das Ergebnis.

    Returns:
        dict mit score, reasoning, lovable_prompt
    """
    print(f"Analysiere {url} ...")
    screenshot_bytes = take_screenshot(url)
    print("Screenshot erstellt. Sende an Gemini ...")
    return analyze_screenshot(screenshot_bytes, url)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Verwendung: python -m backend.analyze_website <URL>")
        sys.exit(1)

    url = sys.argv[1]
    analyze_and_score(url)
