"""
Batch-Analyse: Holt bis zu 30 Website-URLs aus OSM-Daten in Supabase,
analysiert sie mit Gemini und speichert die Ergebnisse.
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import BACKEND_DIR

load_dotenv(BACKEND_DIR / ".env")

BATCH_SIZE = 30

# Social-Media- und andere Nicht-Website-Domains ausschließen
_SOCIAL_DOMAINS = (
    "instagram.com", "facebook.com", "fb.com", "fb.me",
    "twitter.com", "x.com", "tiktok.com", "linkedin.com",
    "youtube.com", "youtu.be", "pinterest.com", "snapchat.com",
    "whatsapp.com", "telegram.me", "t.me", "xing.com",
    "tripadvisor.", "google.com/maps", "maps.google", "goo.gl/maps",
)


def _is_valid_website_url(url: str) -> bool:
    """True wenn URL eine normale Website ist (kein Social Media etc.)."""
    if not url or not url.strip().startswith("http"):
        return False
    lower = url.lower()
    return not any(d in lower for d in _SOCIAL_DOMAINS)


def _get_supabase_client():
    from backend.supabase_client import get_client
    return get_client()


def _get_website_urls_from_osm(limit: int = BATCH_SIZE) -> list[str]:
    """Holt Website-URLs aus osm_data (tags->>'website' oder tags->>'contact:website')."""
    client = _get_supabase_client()

    res = client.table("osm_data").select("tags").limit(500).execute()

    urls: list[str] = []
    seen: set[str] = set()

    for row in res.data or []:
        tags = row.get("tags") or {}
        if not isinstance(tags, dict):
            continue
        url = tags.get("website") or tags.get("contact:website") or ""
        url = url.strip()
        if url and url.startswith("http") and _is_valid_website_url(url) and url not in seen:
            seen.add(url)
            urls.append(url)
            if len(urls) >= limit:
                break

    return urls


def _get_already_analyzed() -> set[str]:
    """Gibt URLs zurück, die bereits analysiert wurden."""
    client = _get_supabase_client()
    res = client.table("website_analysis").select("url").execute()
    return {row["url"] for row in (res.data or [])}


def run_batch(limit: int = BATCH_SIZE):
    """Analysiert bis zu `limit` Websites aus OSM-Daten."""
    from backend.analyze_website import analyze_and_score

    print(f"Lade Website-URLs aus Supabase OSM-Daten (max. {limit})...")
    try:
        all_urls = _get_website_urls_from_osm(limit * 2)
    except Exception as e:
        print(f"Fehler beim Laden der OSM-Daten: {e}")
        print("Tipp: SUPABASE_URL und SUPABASE_SERVICE_KEY in backend/.env prüfen.")
        print("      Zuerst Overpass-Abfrage im Frontend ausführen, um osm_data zu füllen.")
        raise
    already = _get_already_analyzed()

    urls = [u for u in all_urls if u not in already][:limit]

    if not urls:
        print("Keine neuen Website-URLs gefunden.")
        if not all_urls:
            print("Tipp: Zuerst eine Overpass-Abfrage ausführen, um OSM-Daten zu laden.")
        else:
            print(f"Alle {len(all_urls)} URLs wurden bereits analysiert.")
        return

    print(f"{len(urls)} neue Websites zu analysieren:\n")
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] {url}")
        try:
            result = analyze_and_score(url)
            print(f"  -> Score: {result['score']}/10")
        except Exception as e:
            print(f"  -> Fehler: {e}")
        time.sleep(1)

    print(f"\nFertig. {len(urls)} Websites analysiert.")


if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else BATCH_SIZE
    run_batch(limit)
