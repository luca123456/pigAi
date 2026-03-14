"""
Batch-Analyse: Holt bis zu 10 Website-URLs aus OSM-Daten in Supabase,
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

BATCH_SIZE = 10
# Gemini Free Tier: 10 RPM → mind. 6s Abstand. 7s + Puffer für Retries.
DELAY_BETWEEN_REQUESTS_SEC = 7

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


def _get_unanalyzed_urls_via_rpc(limit: int) -> list[str]:
    """Holt noch nicht analysierte URLs direkt per RPC (nur neue, deterministische Reihenfolge)."""
    from backend.supabase_client import rpc

    profile_id = os.getenv("PIGAI_PROFILE_ID", "00000000-0000-0000-0000-000000000001")
    try:
        rows = rpc("get_unanalyzed_urls", {"p_profile_id": profile_id, "p_limit": limit})
        urls = [r["url"] for r in (rows or []) if r.get("url")]
        valid = [u for u in urls if _is_valid_website_url(u)]
        print(f"  RPC lieferte {len(rows or [])} Zeilen, {len(valid)} valide URLs")
        return valid
    except Exception as e:
        print(f"  RPC 'get_unanalyzed_urls' fehlgeschlagen: {e}")
        print("  -> Fallback auf manuelle OSM-Abfrage ...")
        return []


def _get_website_urls_from_osm(limit: int = BATCH_SIZE) -> list[str]:
    """Holt Website-URLs aus osm_data (Fallback wenn RPC nicht existiert)."""
    client = _get_supabase_client()
    profile_id = os.getenv("PIGAI_PROFILE_ID", "00000000-0000-0000-0000-000000000001")

    res = (
        client.table("osm_data")
        .select("tags,id,element_type")
        .eq("profile_id", profile_id)
        .order("id.asc,element_type.asc")
        .limit(1000)
        .execute()
    )

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
    profile_id = os.getenv("PIGAI_PROFILE_ID", "00000000-0000-0000-0000-000000000001")

    res = (
        client.table("website_analysis")
        .select("url")
        .eq("profile_id", profile_id)
        .limit(10000)
        .execute()
    )
    return {row["url"] for row in (res.data or [])}


def run_batch(limit: int = BATCH_SIZE):
    """Analysiert bis zu `limit` Websites aus OSM-Daten."""
    from backend.analyze_website import analyze_and_score

    print(f"\n{'='*60}")
    print(f"PigAI Batch-Analyse (max. {limit} Websites)")
    print(f"{'='*60}")

    profile_id = os.getenv("PIGAI_PROFILE_ID", "00000000-0000-0000-0000-000000000001")
    print(f"Profil-ID: {profile_id}")
    print(f"Supabase-URL: {os.getenv('SUPABASE_URL', '(nicht gesetzt)')}")
    print(f"Gemini-Key: {'gesetzt' if os.getenv('GEMINI_API_KEY') else 'FEHLT!'}")
    print()

    all_urls: list[str] = []
    try:
        print("Schritt 1: Versuche RPC get_unanalyzed_urls ...")
        urls = _get_unanalyzed_urls_via_rpc(limit)
        if not urls:
            print("Schritt 2: Lade URLs aus osm_data (Fallback) ...")
            all_urls = _get_website_urls_from_osm(limit * 10)
            print(f"  {len(all_urls)} Website-URLs in osm_data gefunden")
            already = _get_already_analyzed()
            print(f"  {len(already)} davon bereits analysiert")
            urls = [u for u in all_urls if u not in already][:limit]
            print(f"  {len(urls)} neue URLs nach Filter")
        else:
            print(f"  RPC lieferte {len(urls)} neue URLs")
    except Exception as e:
        print(f"\nFehler beim Laden der OSM-Daten: {e}")
        import traceback
        traceback.print_exc()
        print("\nTipp: SUPABASE_URL und SUPABASE_SERVICE_KEY in backend/.env prüfen.")
        print("      Zuerst Overpass-Abfrage im Frontend ausführen, um osm_data zu füllen.")
        raise

    if not urls:
        print("\nKeine neuen Website-URLs gefunden.")
        if not all_urls:
            print("Tipp: Zuerst eine Overpass-Abfrage im Frontend ausführen, um OSM-Daten zu laden.")
        else:
            print(f"Alle {len(all_urls)} URLs wurden bereits analysiert.")
        return

    print(f"\n{len(urls)} neue Websites zu analysieren:\n")
    success_count = 0
    for i, url in enumerate(urls, 1):
        print(f"[{i}/{len(urls)}] {url}")
        try:
            result = analyze_and_score(url)
            print(f"  -> Score: {result['score']}/10 – {result.get('reasoning', '')[:60]}")
            success_count += 1
        except Exception as e:
            print(f"  -> Fehler: {e}")
            import traceback
            traceback.print_exc()
        if i < len(urls):
            time.sleep(DELAY_BETWEEN_REQUESTS_SEC)

    print(f"\nFertig. {success_count}/{len(urls)} Websites erfolgreich analysiert.")


if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else BATCH_SIZE
    run_batch(limit)
