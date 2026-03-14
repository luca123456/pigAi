"use client";

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
import WebsiteScores from "@/components/WebsiteScores";
import WorstWebsites from "@/components/WorstWebsites";
import Footer from "@/components/Footer";

export default function Home() {
  const stats = getStats(mockProjects, mockSentRequests);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />
      <main>
        <Hero />
        <StatsCards
          activeProjects={stats.activeProjects}
          requestsSent={stats.requestsSent}
          responsesReceived={stats.responsesReceived}
        />
        <CurrentProjects projects={mockProjects} />
        <SentRequests requests={mockSentRequests} />
        <WorstWebsites />
        <WebsiteScores />
      </main>
      <Footer />
    </div>
  );
}
