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
}

export interface SentRequest {
  id: string;
  businessName: string;
  city: string;
  category: string;
  sentAt: string;
  status: RequestStatus;
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
