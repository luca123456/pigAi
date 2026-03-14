"""
Backend-Modul: Webseiten-Screenshots, Gemini-Bewertung und Ergebnis-Speicherung.
Speichert Ergebnisse in Supabase (website_analysis + screenshots Storage).
"""

import io
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image

# Projektroot für Imports (funktioniert bei python -m backend.analyze_website)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google import genai
from google.genai import types
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from backend.config import (
    BACKEND_DIR,
    GEMINI_MODEL,
    PAGE_LOAD_WAIT,
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

    client = genai.Client(api_key=api_key)
    image = Image.open(io.BytesIO(screenshot_bytes))

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[GEMINI_PROMPT, image],
        config=types.GenerateContentConfig(temperature=0.2),
    )

    text = (response.text or "").strip()
    # Fallback: JSON aus Markdown-Codeblock extrahieren
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if json_match:
        text = json_match.group(1).strip()
    return json.loads(text)


def _url_to_filename(url: str) -> str:
    """Konvertiert eine URL in einen sicheren Dateinamen."""
    parsed = urlparse(url)
    hostname = parsed.netloc or parsed.path
    name = hostname.replace("www.", "").replace(".", "_")
    name = re.sub(r"[^\w\-]", "", name)
    return f"{name}.png"


def _upload_screenshot(url: str, screenshot_bytes: bytes) -> str | None:
    """Lädt Screenshot in Supabase Storage hoch. Gibt die öffentliche URL zurück oder None."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        return None

    try:
        from backend.supabase_client import get_client

        client = get_client()
        path = _url_to_filename(url)
        client.storage.from_("screenshots").upload(
            path=path,
            file=io.BytesIO(screenshot_bytes),
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return client.storage.from_("screenshots").get_public_url(path)
    except Exception as e:
        print(f"Warnung: Screenshot-Upload fehlgeschlagen: {e}")
        return None


def _save_result(
    url: str,
    score: int,
    reasoning: str,
    lovable_prompt: str,
    screenshot_path: str | None = None,
) -> None:
    """Speichert das Ergebnis in Supabase (website_analysis)."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("Warnung: SUPABASE_URL/SUPABASE_SERVICE_KEY nicht gesetzt. Ergebnis wird nicht gespeichert.")
        return

    try:
        from backend.supabase_client import get_client

        client = get_client()
        client.table("website_analysis").insert(
            {
                "url": url,
                "score": score,
                "reasoning": reasoning,
                "lovable_prompt": lovable_prompt,
                "screenshot_path": screenshot_path,
            }
        ).execute()
    except Exception as e:
        print(f"Fehler beim Speichern in Supabase: {e}")


def take_screenshot(url: str) -> bytes:
    """Erstellt einen Screenshot der URL und gibt die PNG-Bytes zurück."""
    return _take_screenshot(url)


def analyze_screenshot(screenshot_bytes: bytes, url: str) -> dict:
    """
    Bewertet einen Screenshot mit Gemini und speichert das Ergebnis in Supabase.
    Nützlich wenn der Screenshot bereits vorliegt.
    """
    result = _call_gemini(screenshot_bytes)
    score = int(result.get("score", 0))
    reasoning = result.get("reasoning", "")
    lovable_prompt = result.get("lovable_prompt", "")

    screenshot_url = _upload_screenshot(url, screenshot_bytes)
    _save_result(url, score, reasoning, lovable_prompt, screenshot_url)

    preview = reasoning[:80] + "..." if len(reasoning) > 80 else reasoning
    print(f"Bewertung: {score}/10 – {preview}")
    print("Ergebnis gespeichert in Supabase.")

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
