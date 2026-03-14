"""
Test-Startdatei: Analyse läuft über die aktuellen Profil-Datenbanken (osm_data).
Holt Website-URLs aus Supabase osm_data (pro Profil) und analysiert sie mit OpenAI.
"""

import sys
from pathlib import Path

# Projektroot für Imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

from backend.config import BACKEND_DIR

load_dotenv(BACKEND_DIR / ".env")

from backend.batch_analyze import run_batch, BATCH_SIZE


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else BATCH_SIZE
    print("Analysiere Websites aus den Profil-Datenbanken (osm_data)...\n")
    run_batch(limit=limit)


if __name__ == "__main__":
    main()
