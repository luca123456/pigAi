"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, RefreshCw, Loader2, Play } from "lucide-react";
import { useProfile } from "@/lib/profile-context";
import type { AnalysisResult } from "@/lib/types";

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getScoreColor(score: number) {
  if (score >= 7) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function WebsiteScores() {
  const { selectedProfileId } = useProfile();
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [singleUrl, setSingleUrl] = useState("");

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/results?profileId=${encodeURIComponent(selectedProfileId)}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  const analyzeUrl = async () => {
    if (!singleUrl.trim()) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: singleUrl.trim(), profileId: selectedProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalyzeMsg(`Analyse abgeschlossen (${data.analyzed} Ergebnis)`);
      setSingleUrl("");
      fetchResults();
    } catch (err) {
      setAnalyzeMsg(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (loading) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Website-Bewertungen
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Lade Bewertungen...
          </p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Website-Bewertungen
          </h2>
          <p className="mt-4 text-red-600 dark:text-red-400">{error}</p>
        </div>
      </section>
    );
  }

  const urlInput = (
    <div className="flex gap-2">
      <input
        type="url"
        value={singleUrl}
        onChange={(e) => setSingleUrl(e.target.value)}
        placeholder="https://example.com"
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        onKeyDown={(e) => e.key === "Enter" && analyzeUrl()}
      />
      <button
        type="button"
        onClick={analyzeUrl}
        disabled={analyzing || !singleUrl.trim()}
        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {analyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {analyzing ? "Analysiere..." : "Analysieren"}
      </button>
    </div>
  );

  if (results.length === 0) {
    return (
      <section id="results" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Website-Bewertungen
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Noch keine Bewertungen. Analysiere eine Website:
          </p>
          <div className="mt-4 max-w-xl">{urlInput}</div>
          {analyzeMsg && (
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{analyzeMsg}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="results" className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Website-Bewertungen
            </h2>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Bewertungen von OpenAI (visuelle Qualität 1–10) &middot; {results.length} Ergebnis{results.length !== 1 ? "se" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchResults}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <RefreshCw className="h-4 w-4" />
            Aktualisieren
          </button>
        </div>

        <div className="mt-4 max-w-xl">{urlInput}</div>
        {analyzeMsg && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{analyzeMsg}</p>
        )}

        <div className="mt-8 space-y-4">
          {[...results].reverse().map((item, i) => (
            <div
              key={item.id ?? `${item.url}-${item.timestamp}-${i}`}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-1 gap-4">
                  {item.screenshot_path && (
                    <a
                      href={item.screenshot_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                    >
                      <img
                        src={item.screenshot_path}
                        alt={`Screenshot ${item.url}`}
                        className="h-24 w-40 rounded-lg border border-zinc-200 object-cover dark:border-zinc-600"
                      />
                    </a>
                  )}
                  <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-700">
                      <Globe className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                    </div>
                    <div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                      >
                        {item.url}
                      </a>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(item.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <span
                      className={`text-2xl font-bold ${getScoreColor(item.score)}`}
                    >
                      {item.score}/10
                    </span>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {item.reasoning}
                    </p>
                  </div>
                  </div>
                </div>
              </div>
              {item.lovable_prompt && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    Lovable-Prompt anzeigen
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {item.lovable_prompt}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
