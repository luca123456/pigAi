"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, ExternalLink, Wand2, RefreshCw, Loader2, Copy, Check, Play } from "lucide-react";
import { useProfile } from "@/lib/profile-context";

interface WorstSite {
  id: number;
  url: string;
  score: number;
  reasoning: string;
  lovable_prompt: string;
  screenshot_path: string | null;
  created_at: string;
}

function getScoreBadge(score: number) {
  if (score <= 3)
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (score <= 5)
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
}

export default function WorstWebsites() {
  const { selectedProfileId } = useProfile();
  const [sites, setSites] = useState<WorstSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const fetchWorst = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/worst-websites?profileId=${encodeURIComponent(selectedProfileId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setSites(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    fetchWorst();
  }, [fetchWorst]);

  const startAnalysis = async (limit = 10) => {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, profileId: selectedProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalyzeMsg(`${data.analyzed} Website(s) analysiert`);
      fetchWorst();
    } catch (err) {
      setAnalyzeMsg(err instanceof Error ? err.message : "Fehler bei der Analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  const copyPrompt = (site: WorstSite) => {
    navigator.clipboard.writeText(site.lovable_prompt);
    setCopiedId(site.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const worstScore = sites.length > 0 ? Math.min(...sites.map((s) => s.score)) : 0;
  const worst3TooGood = sites.length >= 3 && worstScore >= 5;

  const analyzeButton = (
    <button
      type="button"
      onClick={() => startAnalysis(10)}
      disabled={analyzing}
      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
    >
      {analyzing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      {analyzing ? "Analyse läuft..." : "Analyse starten (10 Websites)"}
    </button>
  );

  const analyzeNext10Button = sites.length > 0 && (
    <button
      type="button"
      onClick={() => startAnalysis(10)}
      disabled={analyzing}
      className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-60"
      title="Analysiere die nächsten 10 Websites aus den OSM-Daten."
    >
      {analyzing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      Nächste 10 analysieren
    </button>
  );

  if (loading) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Schlechteste Websites
          </h2>
          <p className="mt-4 flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade Bewertungen...
          </p>
        </div>
      </section>
    );
  }

  if (sites.length === 0) {
    return (
      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Schlechteste Websites
          </h2>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            {error || "Noch keine analysierten Websites. Starte die Batch-Analyse:"}
          </p>
          <div className="mt-4">{analyzeButton}</div>
          {analyzeMsg && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{analyzeMsg}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              Schlechteste Websites
            </h2>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              Die 3 Websites mit dem niedrigsten Score. Sollen sie verbessert werden?
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {analyzeButton}
            {analyzeNext10Button}
            <button
              type="button"
              onClick={fetchWorst}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <RefreshCw className="h-4 w-4" />
              Aktualisieren
            </button>
          </div>
        </div>
        {analyzeMsg && (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{analyzeMsg}</p>
        )}
        {worst3TooGood && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Die schlechtesten Websites sind noch relativ gut (Score ≥5). Nutze „Nächste 10 analysieren“, um weitere zu finden.
          </p>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
          {sites.map((site, idx) => (
            <div
              key={site.id}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              {/* Screenshot */}
              {site.screenshot_path ? (
                <a
                  href={site.screenshot_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <img
                    src={site.screenshot_path}
                    alt={`Screenshot ${site.url}`}
                    className="h-48 w-full object-cover object-top"
                  />
                </a>
              ) : (
                <div className="flex h-48 items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                  <span className="text-sm text-zinc-400">Kein Screenshot</span>
                </div>
              )}

              {/* Content */}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-zinc-400">
                      #{idx + 1}
                    </span>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-center gap-1 truncate font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {site.url.replace(/^https?:\/\/(www\.)?/, "")}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-lg font-bold ${getScoreBadge(site.score)}`}
                  >
                    {site.score}/10
                  </span>
                </div>

                <p className="mt-3 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {site.reasoning}
                </p>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <a
                    href={`https://lovable.dev?prompt=${encodeURIComponent(site.lovable_prompt)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                  >
                    <Wand2 className="h-4 w-4" />
                    Verbessern
                  </a>
                  <button
                    type="button"
                    onClick={() => copyPrompt(site)}
                    className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                    title="Lovable-Prompt kopieren"
                  >
                    {copiedId === site.id ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
