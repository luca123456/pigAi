"""
Backend-Modul: Webseiten-Screenshots, AI-Bewertung (Gemini + OpenRouter-Fallback) und Ergebnis-Speicherung.
Speichert Ergebnisse in Supabase (website_analysis + screenshots Storage).
"""

import base64
import io
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

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

# Gemini Free Tier: 10 RPM, 250 RPD
MAX_AI_RETRIES = 5
BASE_BACKOFF_SEC = 2

GEMINI_PROMPT = """Du bist ein UX-Experte. Bewerte die visuelle Qualität dieser Website (Screenshot) auf einer Skala von 1-10.

Bewertungskriterien:
- 1-3: Veraltet, unübersichtlich, schlechte Typografie/Farben, wirkt unprofessionell
- 4-6: Funktional aber verbesserungswürdig, z.B. veraltete Ästhetik oder inkonsistentes Layout
- 7-10: Modern, übersichtlich, professionell, gute Lesbarkeit und visuelle Hierarchie

Gib NUR ein valides JSON-Objekt zurück mit:
- "score" (integer, 1-10)
- "reasoning" (2-3 Sätze auf Deutsch: konkrete Stärken/Schwächen)
- "lovable_prompt" (detaillierter Prompt für lovable.dev: konkrete Verbesserungen – spezifisch und umsetzbar)

Antworte ausschließlich mit dem JSON-Objekt, ohne Markdown oder anderen Text."""


def _take_screenshot(url: str) -> bytes:
    """Erstellt einen Screenshot der URL und gibt die PNG-Bytes zurück."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport=VIEWPORT,
            user_agent=USER_AGENT,
        )
        page.goto(url, wait_until="domcontentloaded")
        time.sleep(PAGE_LOAD_WAIT)
        screenshot_bytes = page.screenshot(full_page=True, type="png")
        browser.close()
    return screenshot_bytes


def _parse_ai_json(text: str) -> dict:
    """Extrahiert JSON aus AI-Antwort (Markdown-Codeblöcke, etc.)."""
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if json_match:
        text = json_match.group(1).strip()
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        text = json_match.group(0)
    return json.loads(text)


def _call_openrouter(screenshot_bytes: bytes) -> dict:
    """Fallback: Sendet Screenshot an OpenRouter Free Model (Vision)."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY nicht gesetzt. Fallback nicht möglich.")

    import httpx

    b64 = base64.b64encode(screenshot_bytes).decode()
    payload = {
        "model": "openrouter/free",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": GEMINI_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
        "temperature": 0.2,
    }

    resp = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    text = (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    return _parse_ai_json(text)


def _call_gemini(screenshot_bytes: bytes, max_retries: int = MAX_AI_RETRIES) -> dict:
    """Sendet den Screenshot an Gemini. Bei 429: Exponential Backoff, dann OpenRouter-Fallback."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY nicht gesetzt. Bitte in backend/.env definieren.")

    client = genai.Client(api_key=api_key)
    image_part = types.Part.from_bytes(data=screenshot_bytes, mime_type="image/png")
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[GEMINI_PROMPT, image_part],
                config=types.GenerateContentConfig(temperature=0.2),
            )
            text = (response.text or "").strip()
            return _parse_ai_json(text)
        except Exception as e:
            last_error = e
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                wait = min(BASE_BACKOFF_SEC * (2 ** (attempt - 1)), 90)
                jitter = random.uniform(0, 0.25 * wait)
                total = max(1, wait + jitter)
                print(f"  [Gemini] 429 Rate-Limit. Warte {total:.0f}s (Versuch {attempt}/{max_retries}) ...")
                time.sleep(total)
            else:
                raise

    # Gemini fehlgeschlagen nach allen Retries → OpenRouter-Fallback
    if os.getenv("OPENROUTER_API_KEY"):
        print("  [Gemini] Rate-Limit überschritten. Fallback auf OpenRouter ...")
        try:
            return _call_openrouter(screenshot_bytes)
        except Exception as fallback_err:
            print(f"  [OpenRouter] Fallback fehlgeschlagen: {fallback_err}")
    raise last_error or RuntimeError("Gemini API fehlgeschlagen")


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

    profile_id = os.getenv("PIGAI_PROFILE_ID", "00000000-0000-0000-0000-000000000001")

    try:
        from backend.supabase_client import get_client

        client = get_client()
        client.table("website_analysis").insert(
            {
                "profile_id": profile_id,
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
