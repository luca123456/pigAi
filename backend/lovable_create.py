"""
Lovable-Automation: Erstellt eine verbesserte Website über lovable.dev per Playwright.

Verwendung:
    python -m backend.lovable_create <website_analysis_id>

Voraussetzung: Einmalig `python -m backend.lovable_session_setup` ausführen.

Ablauf:
1. Liest lovable_prompt und screenshot_path aus Supabase
2. Öffnet lovable.dev mit Build-URL (Prompt + optionales Screenshot-Bild)
3. Wartet bis Lovable das Projekt generiert hat (URL enthält /projects/)
4. Macht einen Screenshot der generierten Seite
5. Speichert lovable_project_url + lovable_screenshot_path in website_analysis
6. Gibt JSON-Ergebnis auf stdout aus
"""

import io
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from backend.config import BACKEND_DIR, VIEWPORT, USER_AGENT

load_dotenv(BACKEND_DIR / ".env")

SESSION_PATH = BACKEND_DIR / "lovable_session.json"
LOVABLE_WORKSPACE = os.getenv("LOVABLE_WORKSPACE", "")
MAX_WAIT_SECONDS = 420
POLL_INTERVAL = 5
PREVIEW_POLL_TIMEOUT = 300
PREVIEW_RENDER_WAIT = 10


def _build_lovable_url(prompt: str, image_url: str | None = None) -> str:
    encoded_prompt = quote(prompt, safe="")
    url = f"https://lovable.dev/?autosubmit=true#prompt={encoded_prompt}"
    if image_url:
        url += f"&images={quote(image_url, safe='')}"
    return url


def _update_analysis(analysis_id: int, lovable_url: str, screenshot_path: str | None = None) -> None:
    from backend.supabase_client import get_client

    data: dict = {"lovable_project_url": lovable_url}
    if screenshot_path:
        data["lovable_screenshot_path"] = screenshot_path

    client = get_client()
    client.table("website_analysis").update(data).eq("id", analysis_id).execute()


def _get_analysis(analysis_id: int) -> dict | None:
    from backend.supabase_client import get_client

    client = get_client()
    result = client.table("website_analysis").select("*").eq("id", analysis_id).limit(1).execute()
    rows = result.data
    return rows[0] if rows else None


def _upload_screenshot(analysis_id: int, screenshot_bytes: bytes) -> str | None:
    """Lädt den Lovable-Screenshot in Supabase Storage hoch."""
    try:
        from backend.supabase_client import get_client

        client = get_client()
        path = f"lovable_{analysis_id}.png"
        client.storage.from_("screenshots").upload(
            path=path,
            file=io.BytesIO(screenshot_bytes),
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return client.storage.from_("screenshots").get_public_url(path)
    except Exception as e:
        print(f"  Screenshot-Upload fehlgeschlagen: {e}", file=sys.stderr)
        return None


def _dismiss_chrome_translate(page) -> None:
    try:
        page.wait_for_timeout(1000)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
    except Exception:
        pass


def _try_select_workspace(page) -> None:
    """Klickt den konfigurierten Workspace im Auswahl-Dialog an."""
    if not LOVABLE_WORKSPACE:
        return
    try:
        page.wait_for_timeout(2000)
        dialog = page.get_by_role("dialog", name="Choose workspace")
        if not dialog.is_visible(timeout=3000):
            return
        print("  Workspace-Dialog erkannt", file=sys.stderr)
        ws = dialog.get_by_text(LOVABLE_WORKSPACE, exact=False).first
        if ws.is_visible(timeout=2000):
            ws.click()
            page.wait_for_timeout(3000)
            print(f"  Workspace '{LOVABLE_WORKSPACE}' geklickt", file=sys.stderr)
    except Exception as e:
        print(f"  Workspace-Klick Fehler: {e}", file=sys.stderr)


def _log_page_state(page, label: str = "") -> None:
    """Loggt den aktuellen Seitenzustand fuer Debugging."""
    try:
        iframes = page.locator("iframe")
        count = iframes.count()
        info = []
        for i in range(count):
            frame = iframes.nth(i)
            try:
                src = frame.get_attribute("src") or "(kein src)"
                visible = frame.is_visible(timeout=200)
                box = frame.bounding_box() if visible else None
                size = f"{box['width']:.0f}x{box['height']:.0f}" if box else "?"
                info.append(f"    iframe[{i}]: visible={visible} size={size} src={src[:80]}")
            except Exception:
                info.append(f"    iframe[{i}]: (Fehler)")
        prefix = f"  [{label}] " if label else "  "
        print(f"{prefix}{count} iframes auf der Seite:", file=sys.stderr)
        for line in info:
            print(line, file=sys.stderr)
    except Exception as e:
        print(f"  Page-State Fehler: {e}", file=sys.stderr)


def _find_preview_iframe(page):
    """Sucht den Preview-iframe im Lovable-Editor. Gibt das Element oder None zurueck."""
    # Spezifische Selektoren fuer bekannte Preview-iframe-Quellen
    specific_selectors = [
        "iframe[src*='webcontainer']",
        "iframe[src*='stackblitz']",
        "iframe[src*='sandbox']",
        "iframe[src*='codesandbox']",
        "iframe[src*='preview']",
        "iframe[src*='localhost']",
        "iframe[src*='lovable.app']",
        "iframe[src*='5173']",
        "iframe[src*='5174']",
        "iframe[src*='3000']",
        "iframe[src*='4173']",
    ]
    for selector in specific_selectors:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=500):
                return el, selector
        except Exception:
            pass

    # Fallback: groesster sichtbarer iframe (Preview ist immer der groessere Panel)
    try:
        iframes = page.locator("iframe")
        count = iframes.count()
        best = None
        best_area = 0
        for i in range(count):
            frame = iframes.nth(i)
            try:
                if not frame.is_visible(timeout=300):
                    continue
                box = frame.bounding_box()
                if box:
                    area = box["width"] * box["height"]
                    if area > best_area:
                        best_area = area
                        best = frame
            except Exception:
                pass
        if best and best_area > 50000:
            return best, f"groesster-iframe(area={best_area:.0f})"
    except Exception:
        pass

    return None, None


def _take_lovable_screenshot(page) -> bytes:
    """Pollt bis der Preview-iframe erscheint, dann Screenshot davon."""
    print(f"  Warte auf Preview-iframe (max {PREVIEW_POLL_TIMEOUT}s)...", file=sys.stderr)
    waited = 0

    while waited < PREVIEW_POLL_TIMEOUT:
        page.wait_for_timeout(POLL_INTERVAL * 1000)
        waited += POLL_INTERVAL

        el, selector = _find_preview_iframe(page)
        if el:
            print(f"  Preview-iframe gefunden nach {waited}s ({selector})", file=sys.stderr)
            print(f"  Warte {PREVIEW_RENDER_WAIT}s auf vollstaendiges Rendering...", file=sys.stderr)
            page.wait_for_timeout(PREVIEW_RENDER_WAIT * 1000)
            try:
                screenshot = el.screenshot(type="png")
                print("  Preview-Screenshot erstellt", file=sys.stderr)
                return screenshot
            except Exception as e:
                print(f"  Screenshot des iframes fehlgeschlagen: {e}", file=sys.stderr)

        if waited % 30 == 0:
            print(f"  [{waited}s] Preview-iframe noch nicht gefunden", file=sys.stderr)
            _log_page_state(page, f"{waited}s")

    # Timeout: Logge Zustand und mache Fullpage-Screenshot
    print(f"  Preview-Timeout nach {waited}s", file=sys.stderr)
    _log_page_state(page, "timeout")
    print("  Fallback: Screenshot der gesamten Seite", file=sys.stderr)
    return page.screenshot(full_page=False, type="png")


def create_lovable_project(analysis_id: int) -> dict:
    """Erstellt ein Lovable-Projekt, macht einen Screenshot und gibt das Ergebnis zurück."""
    if not SESSION_PATH.exists():
        raise FileNotFoundError(
            f"Lovable-Session nicht gefunden: {SESSION_PATH}\n"
            "Bitte einmalig ausführen: python -m backend.lovable_session_setup"
        )

    row = _get_analysis(analysis_id)
    if not row:
        raise ValueError(f"website_analysis mit id={analysis_id} nicht gefunden.")

    prompt = row.get("lovable_prompt", "")
    if not prompt.strip():
        raise ValueError(f"Kein lovable_prompt für id={analysis_id}.")

    image_url = row.get("screenshot_path")
    build_url = _build_lovable_url(prompt, image_url)

    print(f"Starte Lovable-Generierung für id={analysis_id} ...", file=sys.stderr)

    lovable_url = None
    screenshot_path = None

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--lang=en-US",
                "--disable-features=TranslateUI",
                "--disable-translate",
                "--disable-popup-blocking",
            ],
        )
        lovable_viewport = {"width": 1920, "height": 1080}
        context = browser.new_context(
            storage_state=str(SESSION_PATH),
            viewport=lovable_viewport,
            user_agent=USER_AGENT,
            locale="en-US",
        )
        page = context.new_page()
        page.goto(build_url, wait_until="domcontentloaded")

        _dismiss_chrome_translate(page)
        _try_select_workspace(page)

        waited = 0
        generation_started = False

        while waited < MAX_WAIT_SECONDS:
            time.sleep(POLL_INTERVAL)
            waited += POLL_INTERVAL

            current_url = page.url

            if "/projects/" in current_url:
                lovable_url = current_url.split("#")[0].split("?")[0]
                print(f"Projekt erstellt nach {waited}s: {lovable_url}", file=sys.stderr)
                break

            if "promptKey=" in current_url and not generation_started:
                generation_started = True
                print(f"  [{waited}s] Generierung gestartet (promptKey erkannt)", file=sys.stderr)

            if waited <= 30 and not generation_started:
                _try_select_workspace(page)

            if waited % 30 == 0:
                print(f"  [{waited}s] Aktuelle URL: {current_url[:100]}...", file=sys.stderr)

        if not lovable_url:
            final_url = page.url
            if "/projects/" in final_url:
                lovable_url = final_url.split("#")[0].split("?")[0]
                print(f"Projekt doch gefunden: {lovable_url}", file=sys.stderr)
            else:
                browser.close()
                raise TimeoutError(
                    f"Lovable hat innerhalb von {MAX_WAIT_SECONDS}s kein Projekt erstellt. "
                    f"Letzte URL: {final_url}"
                )

        # Screenshot der generierten Seite machen
        screenshot_bytes = _take_lovable_screenshot(page)
        browser.close()

    # Screenshot hochladen
    screenshot_path = _upload_screenshot(analysis_id, screenshot_bytes)
    print(f"  Screenshot: {screenshot_path or '(Upload fehlgeschlagen)'}", file=sys.stderr)

    # DB updaten: Editor-URL + Screenshot
    _update_analysis(analysis_id, lovable_url, screenshot_path)

    result = {
        "lovable_project_url": lovable_url,
        "lovable_screenshot_path": screenshot_path,
    }
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Verwendung: python -m backend.lovable_create <website_analysis_id>")
        sys.exit(1)

    try:
        aid = int(sys.argv[1])
    except ValueError:
        print("Fehler: website_analysis_id muss eine Zahl sein.")
        sys.exit(1)

    try:
        create_lovable_project(aid)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
