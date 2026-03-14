"""
Einmaliges Setup: Lovable-Login-Session speichern.

Verwendung:
    python -m backend.lovable_session_setup

Öffnet einen Chromium-Browser. Dort bei lovable.dev einloggen.
Nach erfolgreichem Login Enter drücken – die Session wird gespeichert.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from playwright.sync_api import sync_playwright

SESSION_PATH = Path(__file__).parent / "lovable_session.json"


def main():
    print("Lovable Login-Setup")
    print("=" * 40)
    print(f"Session wird gespeichert in: {SESSION_PATH}")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        page.goto("https://lovable.dev/", wait_until="domcontentloaded")
        print("Browser geöffnet. Bitte bei Lovable einloggen.")
        print()

        input("Nach dem Login hier Enter drücken ...")

        context.storage_state(path=str(SESSION_PATH))
        print(f"\nSession gespeichert: {SESSION_PATH}")

        browser.close()

    print("Setup abgeschlossen. Du kannst jetzt die Lovable-Automation nutzen.")


if __name__ == "__main__":
    main()
