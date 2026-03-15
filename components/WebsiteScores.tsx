"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Loader2, RefreshCw } from "lucide-react";
import { useProfile } from "@/lib/profile-context";

type FoundBusiness = {
  url: string;
  name: string;
  score?: number;
  reasoning?: string;
  lovable_prompt?: string;
  screenshot_path?: string | null;
  analyzed: boolean;
  created_at?: string;
};

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
  const [allResults, setAllResults] = useState<FoundBusiness[]>([]);
  const [worst3Urls, setWorst3Urls] = useState<Set<string>>(() => new Set());
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(() => new Set());
  const results = useMemo(
    () =>
      allResults.filter(
        (r) => !worst3Urls.has(r.url) && !dismissedUrls.has(r.url)
      ),
    [allResults, worst3Urls, dismissedUrls]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [foundRes, worstRes] = await Promise.all([
        fetch(`/api/found-businesses?profileId=${encodeURIComponent(selectedProfileId)}`),
        fetch(`/api/worst-websites?profileId=${encodeURIComponent(selectedProfileId)}`),
      ]);
      if (!foundRes.ok) throw new Error("Fehler beim Laden");
      const data = await foundRes.json();
      const all = Array.isArray(data) ? data : [];
      setAllResults(all);

      const worstData = worstRes.ok ? await worstRes.json() : [];
      const urls = new Set(
        (Array.isArray(worstData) ? worstData : [])
          .sort((a: { score: number }, b: { score: number }) => a.score - b.score)
          .slice(0, 3)
          .map((w: { url: string }) => w.url)
      );
      setWorst3Urls(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      setAllResults([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ urls: string[]; dismissedUrls?: string[] }>).detail;
      const urls = detail?.urls ?? [];
      const dismissed = detail?.dismissedUrls ?? [];
      setWorst3Urls(new Set(urls));
      setDismissedUrls(new Set(dismissed));
    };
    window.addEventListener("worst3-urls", handler);
    return () => window.removeEventListener("worst3-urls", handler);
  }, []);

  const analyzeNext10 = async () => {
    setBatchAnalyzing(true);
    setAnalyzeMsg(null);
    window.dispatchEvent(new CustomEvent("analysis-started"));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10, profileId: selectedProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalyzeMsg(`Analyse abgeschlossen (${data.analyzed} Ergebnis)`);
      fetchResults();
    } catch (err) {
      setAnalyzeMsg(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBatchAnalyzing(false);
      window.dispatchEvent(new CustomEvent("analysis-completed"));
    }
  };

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    const handler = () => fetchResults();
    window.addEventListener("analysis-completed", handler);
    return () => window.removeEventListener("analysis-completed", handler);
  }, [fetchResults]);

  if (loading) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Alle gefundenen Betriebe
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Lade Betriebe...
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
            Alle gefundenen Betriebe
          </h2>
          <p className="mt-4 text-red-600 dark:text-red-400">{error}</p>
        </div>
      </section>
    );
  }

  if (results.length === 0) {
    return (
      <section id="results" className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Alle gefundenen Betriebe
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            Noch keine Betriebe gefunden. Fuehre oben eine Suche aus oder nutze die Sektion &quot;Eigene Webseiten analysieren&quot;.
          </p>
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Alle gefundenen Betriebe
            </h2>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {results.length} Betrieb{results.length !== 1 ? "e" : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <button
              type="button"
              onClick={analyzeNext10}
              disabled={batchAnalyzing}
              className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
            >
              {batchAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Die nächsten 10 analysieren
            </button>
            <button
              type="button"
              onClick={fetchResults}
              disabled={batchAnalyzing}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>
        {analyzeMsg && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{analyzeMsg}</p>
        )}

        <div className="mt-8 space-y-4">
          {results.map((item, i) =>
            item.analyzed ? (
              <div
                key={`${item.url}-${i}`}
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
                            {item.name} – {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                          {item.created_at && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {formatDate(item.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        <span
                          className={`text-2xl font-bold ${getScoreColor(item.score ?? 0)}`}
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
            ) : (
              <div
                key={`${item.url}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700">
                  <Globe className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                </div>
                <div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    {item.name} – {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Noch nicht analysiert
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
