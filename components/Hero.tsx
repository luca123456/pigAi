"use client";

interface HeroProps {
  city: string;
  betriebsart: string;
  onCityChange: (value: string) => void;
  onBetriebsartChange: (value: string) => void;
  onSearch: () => void;
  onRandomize: () => void;
}

export default function Hero({
  city,
  betriebsart,
  onCityChange,
  onBetriebsartChange,
  onSearch,
  onRandomize,
}: HeroProps) {
  return (
    <section className="border-b border-zinc-200 bg-zinc-50/50 px-4 py-16 dark:border-zinc-800 dark:bg-zinc-900/30 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl lg:text-6xl">
          Lead-Suche für lokale Betrieben
        </h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
          Finden Sie passende Betriebe in Ihrer Stadt – nach Kategorie filtern,
          Projekte verwalten und Anfragen im Blick behalten.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-center sm:gap-3">
          <div className="flex flex-1 flex-col gap-2 text-left sm:max-w-[200px]">
            <label
              htmlFor="city"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Stadt
            </label>
            <input
              id="city"
              type="text"
              placeholder="Berlin"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 text-left sm:max-w-[200px]">
            <label
              htmlFor="betriebsart"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Art des Betriebs
            </label>
            <input
              id="betriebsart"
              type="text"
              placeholder="Café"
              value={betriebsart}
              onChange={(e) => onBetriebsartChange(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 shadow-sm transition focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <button
            type="button"
            onClick={onSearch}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Suchen
          </button>
          <button
            type="button"
            onClick={onRandomize}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            Zufallsgenerator
          </button>
        </div>
      </div>
    </section>
  );
}
