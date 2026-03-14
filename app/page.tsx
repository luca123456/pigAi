"use client";

import { useState, useCallback } from "react";
import { CITIES, BUSINESS_TYPES } from "@/lib/types";
import {
  mockProjects,
  mockSentRequests,
  getStats,
} from "@/lib/mock-data";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StatsCards from "@/components/StatsCards";
import CurrentProjects from "@/components/CurrentProjects";
import SentRequests from "@/components/SentRequests";
import Footer from "@/components/Footer";

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function Home() {
  const [city, setCity] = useState("");
  const [betriebsart, setBetriebsart] = useState("");

  const handleSearch = useCallback(() => {
    // Vorbereitet für spätere Backend-Suche
    console.log("Suche:", { city, betriebsart });
  }, [city, betriebsart]);

  const handleRandomize = useCallback(() => {
    setCity(pickRandom(CITIES));
    setBetriebsart(pickRandom(BUSINESS_TYPES));
  }, []);

  const stats = getStats(mockProjects, mockSentRequests);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />
      <main>
        <Hero
          city={city}
          betriebsart={betriebsart}
          onCityChange={setCity}
          onBetriebsartChange={setBetriebsart}
          onSearch={handleSearch}
          onRandomize={handleRandomize}
        />
        <StatsCards
          activeProjects={stats.activeProjects}
          requestsSent={stats.requestsSent}
          responsesReceived={stats.responsesReceived}
        />
        <CurrentProjects projects={mockProjects} />
        <SentRequests requests={mockSentRequests} />
      </main>
      <Footer />
    </div>
  );
}
