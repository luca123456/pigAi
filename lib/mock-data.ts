import type { Project, SentRequest } from "./types";

export const mockProjects: Project[] = [
  {
    id: "1",
    name: "Kaffeebar Mitte",
    city: "Berlin",
    category: "Café",
    status: "In Analyse",
    score: 35,
  },
  {
    id: "2",
    name: "Salon Schön",
    city: "Hamburg",
    category: "Friseur",
    status: "Website geprüft",
    score: 70,
  },
  {
    id: "3",
    name: "Dr. Müller Zahnarzt",
    city: "München",
    category: "Zahnarzt",
    status: "Entwurf offen",
    score: 90,
  },
  {
    id: "4",
    name: "La Trattoria",
    city: "Köln",
    category: "Restaurant",
    status: "In Analyse",
    score: 20,
  },
  {
    id: "5",
    name: "Fit & Aktiv",
    city: "Frankfurt",
    category: "Fitnessstudio",
    status: "Website geprüft",
    score: 55,
  },
];

export const mockSentRequests: SentRequest[] = [
  {
    id: "r1",
    businessName: "Backstube Schmidt",
    city: "Berlin",
    category: "Bäckerei",
    sentAt: "2025-03-10",
    status: "Warten auf Antwort",
  },
  {
    id: "r2",
    businessName: "Café am See",
    city: "Hamburg",
    category: "Café",
    sentAt: "2025-03-08",
    status: "Antwort erhalten",
  },
  {
    id: "r3",
    businessName: "Haarstudio Elegant",
    city: "München",
    category: "Friseur",
    sentAt: "2025-03-12",
    status: "E-Mail verschickt",
  },
  {
    id: "r4",
    businessName: "Pizzeria Roma",
    city: "Köln",
    category: "Restaurant",
    sentAt: "2025-03-05",
    status: "Antwort erhalten",
  },
];

export function getStats(projects: Project[], requests: SentRequest[]) {
  const activeProjects = projects.length;
  const requestsSent = requests.length;
  const responsesReceived = requests.filter(
    (r) => r.status === "Antwort erhalten"
  ).length;
  return { activeProjects, requestsSent, responsesReceived };
}
