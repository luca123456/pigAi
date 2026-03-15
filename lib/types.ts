export type ProjectStatus =
  | "In Analyse"
  | "Website geprüft"
  | "Entwurf offen";

export type RequestStatus =
  | "E-Mail verschickt"
  | "Warten auf Antwort"
  | "Antwort erhalten";

export interface Project {
  id: string;
  name: string;
  city: string;
  category: string;
  status: ProjectStatus;
  score?: number;
  url?: string;
  lovable_project_url?: string | null;
  lovable_screenshot_path?: string | null;
}

export interface SentRequest {
  id: string;
  businessName: string;
  city: string;
  category: string;
  sentAt: string;
  status: RequestStatus;
}

export interface AnalysisResult {
  id?: number;
  url: string;
  score: number;
  reasoning: string;
  lovable_prompt: string;
  screenshot_path?: string | null;
  created_at?: string;
  timestamp: string;
}

export const CITIES = [
  "Berlin",
  "Hamburg",
  "München",
  "Köln",
  "Frankfurt",
] as const;

export const BUSINESS_TYPES = [
  "Café",
  "Friseur",
  "Zahnarzt",
  "Restaurant",
  "Fitnessstudio",
  "Bäckerei",
] as const;

export type CityOption = (typeof CITIES)[number];
export type BusinessTypeOption = (typeof BUSINESS_TYPES)[number];
