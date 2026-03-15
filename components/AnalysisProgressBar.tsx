"use client";

import { useEffect, useState } from "react";

export default function AnalysisProgressBar() {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    const onStart = () => setActiveCount((c) => c + 1);
    const onComplete = () => setActiveCount((c) => Math.max(0, c - 1));

    window.addEventListener("analysis-started", onStart);
    window.addEventListener("analysis-completed", onComplete);

    return () => {
      window.removeEventListener("analysis-started", onStart);
      window.removeEventListener("analysis-completed", onComplete);
    };
  }, []);

  if (activeCount === 0) return null;

  return (
    <>
      <div
        className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center gap-2 bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md"
        role="status"
        aria-live="polite"
      >
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-emerald-500">
          <div className="h-full w-1/2 bg-white/40 animate-analysis-progress" />
        </div>
        <span>Webseiten werden analysiert...</span>
      </div>
      <div className="h-10 shrink-0" aria-hidden />
    </>
  );
}
