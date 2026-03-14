"""
Backend-Modul: Webseiten-Screenshots, AI-Bewertung (OpenAI) und Ergebnis-Speicherung.
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

from dotenv import load_dotenv
import httpx
from playwright.sync_api import sync_playwright

from backend.config import (
    BACKEND_DIR,
    OPENAI_MODEL,
    PAGE_LOAD_WAIT,
    USER_AGENT,
    VIEWPORT,
)

load_dotenv(BACKEND_DIR / ".env")

MAX_AI_RETRIES = 5
BASE_BACKOFF_SEC = 2

MAX_PAGE_CONTENT_CHARS = 5000

_EXTRACT_CONTENT_JS = """() => {
    const parts = [];
    // Headings
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
        const t = el.innerText.trim();
        if (t) parts.push('[' + el.tagName + '] ' + t);
    });
    // Paragraphs and list items
    document.querySelectorAll('p,li,address,blockquote').forEach(el => {
        const t = el.innerText.trim();
        if (t && t.length > 10) parts.push(t);
    });
    // Fallback: if nothing was found, use body text
    if (parts.length === 0) {
        const body = document.body?.innerText ?? '';
        return body.substring(0, 5000);
    }
    return parts.join('\\n');
}"""

ANALYSIS_PROMPT_TEMPLATE = """Du bist ein UX-Experte. Bewerte die visuelle Qualitaet dieser Website (Screenshot) auf einer Skala von 1-10.

Original-URL der Website: {url}

Bewertungskriterien:
- 1-3: Veraltet, unuebersichtlich, schlechte Typografie/Farben, wirkt unprofessionell
- 4-6: Funktional aber verbesserungswuerdig, z.B. veraltete Aesthetik oder inkonsistentes Layout
- 7-10: Modern, uebersichtlich, professionell, gute Lesbarkeit und visuelle Hierarchie

Gib NUR ein valides JSON-Objekt zurueck mit:
- "score" (integer, 1-10)
- "reasoning" (2-3 Saetze auf Deutsch: konkrete Staerken/Schwaechen)

Antworte ausschliesslich mit dem JSON-Objekt, ohne Markdown oder anderen Text."""


LOVABLE_PROMPT_TEMPLATE = "Erstelle eine moderne, verbesserte Version der Website {url}."


def _take_screenshot_and_extract_content(url: str) -> tuple[bytes, str]:
    """Erstellt einen Screenshot und extrahiert strukturierten Content (Headings, Absaetze, Kontaktdaten)."""
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport=VIEWPORT,
            user_agent=USER_AGENT,
        )
        page.goto(url, wait_until="domcontentloaded")
        time.sleep(PAGE_LOAD_WAIT)
        screenshot_bytes = page.screenshot(full_page=True, type="png")
        page_content = ""
        try:
            raw = page.evaluate(_EXTRACT_CONTENT_JS)
            page_content = (raw or "").strip()[:MAX_PAGE_CONTENT_CHARS]
        except Exception:
            pass
        browser.close()
    return screenshot_bytes, page_content


def _take_screenshot(url: str) -> bytes:
    """Erstellt einen Screenshot der URL und gibt die PNG-Bytes zurück."""
    screenshot_bytes, _ = _take_screenshot_and_extract_content(url)
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


def _call_openai(
    screenshot_bytes: bytes,
    url: str = "",
    max_retries: int = MAX_AI_RETRIES,
) -> dict:
    """Sendet den Screenshot an OpenAI Vision und erwartet JSON-Ausgabe."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY nicht gesetzt. Bitte in backend/.env definieren.")

    prompt = ANALYSIS_PROMPT_TEMPLATE.format(url=url or "(unbekannt)")
    b64 = base64.b64encode(screenshot_bytes).decode()
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
        "temperature": 0.2,
    }

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60.0,
            )
            if resp.status_code in (429, 500, 502, 503, 504):
                wait = min(BASE_BACKOFF_SEC * (2 ** (attempt - 1)), 90)
                jitter = random.uniform(0, 0.25 * wait)
                total = max(1, wait + jitter)
                print(
                    f"  [OpenAI] HTTP {resp.status_code}. Warte {total:.0f}s "
                    f"(Versuch {attempt}/{max_retries}) ..."
                )
                time.sleep(total)
                continue
            resp.raise_for_status()
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if isinstance(content, list):
                text = "".join(part.get("text", "") for part in content if isinstance(part, dict)).strip()
            else:
                text = (content or "").strip()
            return _parse_ai_json(text)
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                wait = min(BASE_BACKOFF_SEC * (2 ** (attempt - 1)), 90)
                time.sleep(wait)
            else:
                raise

    raise last_error or RuntimeError("OpenAI API fehlgeschlagen")


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


def _build_lovable_prompt(url: str) -> str:
    """Baut den Lovable-Prompt: Einfach URL + Anweisung zur modernen Version."""
    return LOVABLE_PROMPT_TEMPLATE.format(url=url)


def analyze_screenshot(
    screenshot_bytes: bytes,
    url: str,
    page_content: str = "",
) -> dict:
    """
    Bewertet einen Screenshot mit OpenAI und speichert das Ergebnis in Supabase.
    page_content: Optional – extrahierter Text der Seite für thematische Treue.
    """
    result = _call_openai(screenshot_bytes, url=url)
    score = int(result.get("score", 0))
    reasoning = result.get("reasoning", "")
    lovable_prompt = _build_lovable_prompt(url)

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
    Macht einen Screenshot der URL, extrahiert den Content, lässt von OpenAI bewerten und speichert das Ergebnis.

    Returns:
        dict mit score, reasoning, lovable_prompt
    """
    print(f"Analysiere {url} ...")
    screenshot_bytes, page_content = _take_screenshot_and_extract_content(url)
    print("Screenshot erstellt. Sende an OpenAI ...")
    return analyze_screenshot(screenshot_bytes, url, page_content=page_content)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Verwendung: python -m backend.analyze_website <URL>")
        sys.exit(1)

    url = sys.argv[1]
    analyze_and_score(url)
