"use client";

import { useState } from "react";
import { Loader2, Play, Search } from "lucide-react";
import { useProfile } from "@/lib/profile-context";

export default function OwnWebsiteSection() {
  const { selectedProfileId } = useProfile();
  const [singleUrl, setSingleUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);

  const analyzeUrl = async () => {
    const url = singleUrl.trim();
    if (!url) return;
    setAnalyzing(true);
    setAnalyzeMsg(null);
    window.dispatchEvent(new CustomEvent("analysis-started"));
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, profileId: selectedProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
      setAnalyzeMsg(`Analyse abgeschlossen (${data.analyzed} Ergebnis)`);
      setSingleUrl("");
    } catch (err) {
      setAnalyzeMsg(err instanceof Error ? err.message : "Fehler");
    } finally {
      setAnalyzing(false);
      window.dispatchEvent(new CustomEvent("analysis-completed"));
    }
  };

  return (
    <section className="border-b border-zinc-200 px-4 py-12 dark:border-zinc-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Eigene Webseiten analysieren
        </h2>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Domain oder URL eingeben – Webseite wird bewertet (Score 1–10) und erscheint in der Liste unten.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <input
            type="url"
            value={singleUrl}
            onChange={(e) => setSingleUrl(e.target.value)}
            placeholder="https://example.com oder example.de"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            onKeyDown={(e) => e.key === "Enter" && analyzeUrl()}
          />
          <button
            type="button"
            onClick={analyzeUrl}
            disabled={analyzing || !singleUrl.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {analyzing ? "Analysiere..." : "Bewerten"}
          </button>
        </div>
        {analyzeMsg && (
          <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{analyzeMsg}</p>
        )}
      </div>
    </section>
  );
}
