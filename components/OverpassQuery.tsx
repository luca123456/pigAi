"use client";

import { useState, useCallback, useEffect } from "react";
import { MapPin, Play, RefreshCw, Loader2, ChevronDown } from "lucide-react";

const DEFAULT_QUERY = `[out:json][timeout:90];
(
  node["amenity"="cafe"]({{bbox}});
  node["amenity"="pharmacy"]({{bbox}});
  way["amenity"="cafe"]({{bbox}});
  way["amenity"="pharmacy"]({{bbox}});
);
out body center geom;`;

const MANNHEIM_BBOX = { south: 49.45, west: 8.42, north: 49.55, east: 8.55 };

interface OsmRow {
  id: number;
  element_type: string;
  tags: Record<string, string>;
  lat: number | null;
  lon: number | null;
  created_at?: string;
}

export default function OverpassQuery() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [bbox, setBbox] = useState(MANNHEIM_BBOX);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; inserted?: number; error?: string } | null>(null);
  const [osmData, setOsmData] = useState<OsmRow[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const replaceBbox = (q: string) => {
    const { south, west, north, east } = bbox;
    return q.replace(/\{\{bbox\}\}/g, `${south},${west},${north},${east}`);
  };

  const runQuery = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const finalQuery = replaceBbox(query);
      const res = await fetch("/api/overpass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: finalQuery,
          ...bbox,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setResult(data);
      if (data.success) {
        fetchOsmData();
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } finally {
      setLoading(false);
    }
  }, [query, bbox]);

  const fetchOsmData = useCallback(async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const res = await fetch("/api/osm-data?limit=200");
      const data = await res.json();
      if (res.ok) {
        setOsmData(Array.isArray(data) ? data : []);
      } else {
        setDataError(data?.error || "Fehler beim Laden");
        setOsmData([]);
      }
    } catch {
      setDataError("Netzwerkfehler");
      setOsmData([]);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    fetchOsmData();
  }, [fetchOsmData]);

  return (
    <section id="overpass" className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-md dark:border-zinc-700 dark:bg-zinc-800/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Overpass Turbo Abfrage
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                OpenStreetMap-Daten abfragen und in Supabase speichern
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-md dark:border-zinc-700 dark:bg-zinc-800/50">
            {/* Bounding Box */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Süd</span>
                <input
                  type="number"
                  step="0.01"
                  value={bbox.south}
                  onChange={(e) => setBbox((b) => ({ ...b, south: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">West</span>
                <input
                  type="number"
                  step="0.01"
                  value={bbox.west}
                  onChange={(e) => setBbox((b) => ({ ...b, west: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Nord</span>
                <input
                  type="number"
                  step="0.01"
                  value={bbox.north}
                  onChange={(e) => setBbox((b) => ({ ...b, north: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Ost</span>
                <input
                  type="number"
                  step="0.01"
                  value={bbox.east}
                  onChange={(e) => setBbox((b) => ({ ...b, east: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
            </div>

            {/* Overpass QL */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Overpass QL ({"{{bbox}}"} wird durch den Bounding Box ersetzt)
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={12}
                className="mt-1 block w-full rounded-lg border border-zinc-300 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder={'[out:json][timeout:90]; node["amenity"="cafe"]({{bbox}}); out body;'}
              />
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={runQuery}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Abfrage ausführen
              </button>
              <button
                type="button"
                onClick={fetchOsmData}
                disabled={loadingData}
                className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
              >
                {loadingData ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Daten laden
              </button>
            </div>

            {/* Result */}
            {result && (
              <div
                className={`rounded-lg p-4 ${
                  result.success
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
                }`}
              >
                {result.success ? (
                  <p>
                    {result.inserted !== undefined
                      ? `${result.inserted} Elemente in Supabase gespeichert.`
                      : "Abfrage erfolgreich."}
                  </p>
                ) : (
                  <p>{result.error}</p>
                )}
              </div>
            )}

            {/* OSM Data Table */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Gespeicherte OSM-Daten ({osmData.length})
              </h3>
              {dataError && (
                <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">{dataError}</p>
              )}
              {osmData.length === 0 && !dataError ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Keine Daten. Führe eine Abfrage aus oder klicke auf &quot;Daten laden&quot;.
                </p>
              ) : osmData.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Keine Daten geladen.
                </p>
              ) : (
                <div className="max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                      <tr>
                        <th className="px-4 py-2">Typ</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2">Tags</th>
                        <th className="px-4 py-2">Koordinaten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {osmData.map((row) => (
                        <tr
                          key={`${row.id}-${row.element_type}`}
                          className="border-t border-zinc-200 dark:border-zinc-700"
                        >
                          <td className="px-4 py-2">{row.element_type}</td>
                          <td className="px-4 py-2 font-medium">
                            {row.tags?.name ?? "–"}
                          </td>
                          <td className="max-w-xs truncate px-4 py-2 text-zinc-500">
                            {row.tags
                              ? Object.entries(row.tags)
                                  .slice(0, 3)
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(", ") || "–"
                              : "–"}
                          </td>
                          <td className="px-4 py-2 text-zinc-500">
                            {row.lat != null && row.lon != null
                              ? `${row.lat.toFixed(4)}, ${row.lon.toFixed(4)}`
                              : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
