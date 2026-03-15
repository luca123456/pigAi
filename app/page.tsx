"use client";

import { useCallback, useEffect, useState } from "react";
import { getStats } from "@/lib/mock-data";
import type { Project, SentRequest } from "@/lib/types";
import { useProfile } from "@/lib/profile-context";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import StatsCards from "@/components/StatsCards";
import CurrentProjects from "@/components/CurrentProjects";
import SentRequests from "@/components/SentRequests";
import WebsiteScores from "@/components/WebsiteScores";
import WorstWebsites from "@/components/WorstWebsites";
import OwnWebsiteSection from "@/components/OwnWebsiteSection";
import Footer from "@/components/Footer";

export default function Home() {
  const { selectedProfileId } = useProfile();
  const [projects, setProjects] = useState<Project[]>([]);
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjectsAndRequests = useCallback(() => {
    const profileId = selectedProfileId || "00000000-0000-0000-0000-000000000001";
    Promise.all([
      fetch(`/api/projects?profileId=${encodeURIComponent(profileId)}`).then((r) =>
        r.ok ? r.json() : []
      ),
      fetch(`/api/sent-requests?profileId=${encodeURIComponent(profileId)}`).then((r) =>
        r.ok ? r.json() : []
      ),
    ])
      .then(([proj, req]) => {
        setProjects(Array.isArray(proj) ? proj : []);
        setSentRequests(Array.isArray(req) ? req : []);
      })
      .catch(() => {
        setProjects([]);
        setSentRequests([]);
      })
      .finally(() => setLoading(false));
  }, [selectedProfileId]);

  useEffect(() => {
    fetchProjectsAndRequests();
  }, [fetchProjectsAndRequests]);

  useEffect(() => {
    const handler = () => fetchProjectsAndRequests();
    window.addEventListener("projects-updated", handler);
    return () => window.removeEventListener("projects-updated", handler);
  }, [fetchProjectsAndRequests]);

  const stats = getStats(projects, sentRequests);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />
      <main>
        <Hero />
        <OwnWebsiteSection />
        <StatsCards
          activeProjects={stats.activeProjects}
          requestsSent={stats.requestsSent}
        />
        <CurrentProjects projects={loading ? [] : projects} />
        <SentRequests requests={loading ? [] : sentRequests} />
        <WorstWebsites />
        <WebsiteScores />
      </main>
      <Footer />
    </div>
  );
}
