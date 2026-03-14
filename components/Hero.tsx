"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useProfile } from "@/lib/profile-context";
import { CITIES, BUSINESS_TYPES } from "@/lib/types";

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const DEFAULT_RADIUS = 2000;

export default function Hero() {
  const { selectedProfileId } = useProfile();
  const [address, setAddress] = useState("Mannheim");
  const [betriebsart, setBetriebsart] = useState("");
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; inserted?: number; error?: string } | null>(null);

  const handleSearch = useCallback(async () => {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/overpass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          radius,
          betriebsart: betriebsart || undefined,
          profileId: selectedProfileId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } finally {
      setLoading(false);
    }
  }, [address, betriebsart, radius, selectedProfileId]);

  const handleRandomize = useCallback(() => {
    setAddress(pickRandom(CITIES));
    setBetriebsart(pickRandom(BUSINESS_TYPES));
  }, []);

  return (
    <section id="search" className="border-b border-zinc-200 bg-zinc-50/50 px-4 py-16 dark:border-zinc-800 dark:bg-zinc-900/30 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl lg:text-6xl">
          Lead-Suche für lokale Betriebe
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
          Stadt oder Adresse eingeben – Lokale Geschäfte mit Website werden geladen
          und analysiert.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-3">
          <div className="flex flex-1 flex-col gap-2 text-left sm:max-w-[200px]">
            <label htmlFor="address" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Stadt oder Adresse
            </label>
            <input
              id="address"
              type="text"
              placeholder="Berlin, Mannheim"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 text-left sm:max-w-[160px]">
            <label htmlFor="betriebsart" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Art des Betriebs
            </label>
            <select
              id="betriebsart"
              value={betriebsart}
              onChange={(e) => setBetriebsart(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-500"
            >
              <option value="">Alle</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-2 text-left sm:max-w-[100px]">
            <label htmlFor="radius" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Umkreis (m)
            </label>
            <input
              id="radius"
              type="number"
              min={100}
              max={50000}
              step={100}
              value={radius}
              onChange={(e) => setRadius(Math.max(100, parseInt(e.target.value, 10) || 1000))}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !address.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Suchen
          </button>
          <button
            type="button"
            onClick={handleRandomize}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Zufallsgenerator
          </button>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-xl px-4 py-3 ${
              result.success
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
            }`}
          >
            {result.success ? (
              <p>
                {result.inserted !== undefined
                  ? `${result.inserted} Betriebe mit Website gefunden und gespeichert.`
                  : "Abfrage erfolgreich."}
              </p>
            ) : (
              <p>{result.error}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
