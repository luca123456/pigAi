"""
Supabase-Client via REST-API (httpx). Vermeidet das supabase-Paket,
da der lokale supabase/ Ordner es überschattet und die Installation Build-Tools braucht.
"""

import io
import os
from typing import Any

import httpx


def _headers() -> dict[str, str]:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL und SUPABASE_SERVICE_KEY in backend/.env setzen.")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _rest_url(path: str) -> str:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    return f"{url}/rest/v1/{path}"


def table_select(table: str, columns: str = "*", limit: int = 500) -> list[dict[str, Any]]:
    """SELECT von einer Tabelle."""
    with httpx.Client(timeout=30) as client:
        r = client.get(
            _rest_url(table),
            headers={**_headers(), "Accept": "application/json"},
            params={"select": columns, "limit": str(limit)},
        )
        r.raise_for_status()
        return r.json() if r.content else []


def table_insert(table: str, row: dict[str, Any]) -> None:
    """INSERT in eine Tabelle."""
    with httpx.Client(timeout=30) as client:
        r = client.post(
            _rest_url(table),
            headers=_headers(),
            json=row,
        )
        r.raise_for_status()


def storage_upload(bucket: str, path: str, data: bytes, content_type: str = "image/png") -> str:
    """Lädt eine Datei in Storage hoch. Gibt die öffentliche URL zurück."""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise ValueError("SUPABASE_URL und SUPABASE_SERVICE_KEY in backend/.env setzen.")

    upload_url = f"{url}/storage/v1/object/{bucket}/{path}"
    with httpx.Client(timeout=60) as client:
        r = client.post(
            upload_url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            content=data,
        )
        r.raise_for_status()

    return f"{url}/storage/v1/object/public/{bucket}/{path}"


class _SupabaseClient:
    """Minimaler Supabase-Client mit table() und storage API."""

    def table(self, name: str):
        return _TableProxy(name)

    @property
    def storage(self):
        return _StorageProxy()


class _TableProxy:
    def __init__(self, name: str):
        self._name = name

    def select(self, columns: str = "*"):
        return _SelectBuilder(self._name, columns)

    def insert(self, row: dict | list):
        rows = row if isinstance(row, list) else [row]
        for r in rows:
            table_insert(self._name, r)
        return _InsertResult()


class _InsertResult:
    def execute(self):
        pass


class _SelectBuilder:
    def __init__(self, table: str, columns: str):
        self._table = table
        self._columns = columns
        self._limit = 500

    def limit(self, n: int):
        self._limit = n
        return self

    def execute(self):
        data = table_select(self._table, self._columns, self._limit)
        return type("Response", (), {"data": data})()


class _StorageProxy:
    def from_(self, bucket: str):
        return _BucketProxy(bucket)


class _BucketProxy:
    def __init__(self, bucket: str):
        self._bucket = bucket

    def upload(self, path: str, file: io.BytesIO, file_options: dict | None = None):
        opts = file_options or {}
        content_type = opts.get("content-type", "image/png")
        storage_upload(self._bucket, path, file.read(), content_type)

    def get_public_url(self, path: str) -> str:
        url = os.getenv("SUPABASE_URL", "").rstrip("/")
        return f"{url}/storage/v1/object/public/{self._bucket}/{path}"


def get_client() -> _SupabaseClient:
    """Gibt einen minimalen Supabase-Client zurück (REST-API, kein pip-Paket)."""
    _headers()  # prüft Env
    return _SupabaseClient()
