import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s, 32s
const MAX_DELAY_MS = 60_000;

/** fetchWithRetry: Exponential backoff + Retry-After + jitter für 429/503 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { maxRetries?: number }
): Promise<Response> {
  const maxRetries = init?.maxRetries ?? MAX_RETRIES;
  const { maxRetries: _omit, ...fetchInit } = init ?? {};

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(input, fetchInit);

    if (response.status !== 429 && response.status !== 503) {
      return response;
    }

    if (attempt === maxRetries) {
      console.warn(`[fetchWithRetry] 429/503 nach ${maxRetries} Versuchen. Abbruch.`);
      return response;
    }

    const retryAfterHeader = response.headers.get("Retry-After");
    let delayMs: number;

    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      delayMs = Number.isNaN(parsed) ? BASE_DELAY_MS * Math.pow(2, attempt - 1) : parsed * 1000;
      console.warn(
        `[fetchWithRetry] 429/503. Retry-After: ${retryAfterHeader}s. Warte ${delayMs}ms (Versuch ${attempt}/${maxRetries}).`
      );
    } else {
      delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      console.warn(
        `[fetchWithRetry] 429/503. Kein Retry-After. Exponential Backoff: ${delayMs}ms (Versuch ${attempt}/${maxRetries}).`
      );
    }

    const jitter = Math.random() * 0.25 * delayMs;
    const totalDelay = delayMs + jitter;
    console.warn(`[fetchWithRetry] Warte ${Math.round(totalDelay)}ms vor Retry...`);

    await new Promise((r) => setTimeout(r, totalDelay));
  }

  return fetch(input, fetchInit);
}

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
}

interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
}

type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

interface OverpassResponse {
  elements: OverpassElement[];
}

/** Social-Media- und andere Nicht-Website-Domains ausschließen */
const SOCIAL_MEDIA_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "snapchat.com",
  "whatsapp.com",
  "telegram.me",
  "t.me",
  "xing.com",
  "tripadvisor.",
  "google.com/maps",
  "maps.google",
  "goo.gl/maps",
];

function hasValidWebsite(tags: Record<string, string>): boolean {
  const url = (tags.website || tags["contact:website"] || "").trim();
  if (!url || !url.startsWith("http")) return false;
  const lower = url.toLowerCase();
  return !SOCIAL_MEDIA_DOMAINS.some((d) => lower.includes(d));
}

function elementToRow(
  element: OverpassElement
): { id: number; element_type: string; tags: Record<string, string>; location: string } | null {
  const tags = element.tags ?? {};
  if (!hasValidWebsite(tags)) return null;
  let location: string | null = null;

  if (element.type === "node") {
    location = `SRID=4326;POINT(${element.lon} ${element.lat})`;
  } else if (element.type === "way") {
    if (element.center) {
      location = `SRID=4326;POINT(${element.center.lon} ${element.center.lat})`;
    } else if (element.geometry?.length) {
      const coords = element.geometry.map((p) => `${p.lon} ${p.lat}`).join(", ");
      const first = element.geometry[0];
      const last = element.geometry[element.geometry.length - 1];
      if (
        first.lat === last.lat &&
        first.lon === last.lon &&
        element.geometry.length >= 4
      ) {
        location = `SRID=4326;POLYGON((${coords}))`;
      } else {
        location = `SRID=4326;LINESTRING(${coords})`;
      }
    }
  } else if (element.type === "relation" && element.center) {
    location = `SRID=4326;POINT(${element.center.lon} ${element.center.lat})`;
  }

  if (!location) return null;

  return {
    id: element.id,
    element_type: element.type,
    tags,
    location,
  };
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  const response = await fetchWithRetry(OVERPASS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    maxRetries: MAX_RETRIES,
  });

  if (!response.ok) {
    throw new Error(`Overpass API: ${response.status} ${response.statusText}`);
  }

  const data: OverpassResponse = await response.json();
  if (!data.elements) throw new Error("Invalid Overpass response");
  return data;
}

/** OSM-Mapping: Art des Betriebs → Overpass-Tags */
const BETRIEBSART_OSM: Record<string, { amenity?: string; shop?: string }> = {
  Café: { amenity: "cafe" },
  Restaurant: { amenity: "restaurant" },
  Bäckerei: { amenity: "bakery" },
  Friseur: { shop: "hairdresser" },
  Zahnarzt: { amenity: "dentist" },
  Fitnessstudio: { amenity: "fitness_centre" },
};

function buildOverpassQuery(
  centerLat: number,
  centerLon: number,
  radiusM: number,
  betriebsart?: string
): string {
  const filters: string[] = [];
  if (betriebsart?.trim() && BETRIEBSART_OSM[betriebsart.trim()]) {
    const osm = BETRIEBSART_OSM[betriebsart.trim()];
    if (osm.amenity) {
      filters.push(
        `node["amenity"="${osm.amenity}"](around:${radiusM},${centerLat},${centerLon});`,
        `way["amenity"="${osm.amenity}"](around:${radiusM},${centerLat},${centerLon});`
      );
    }
    if (osm.shop) {
      filters.push(
        `node["shop"="${osm.shop}"](around:${radiusM},${centerLat},${centerLon});`,
        `way["shop"="${osm.shop}"](around:${radiusM},${centerLat},${centerLon});`
      );
    }
  }
  if (filters.length === 0) {
    filters.push(
      `node["amenity"="cafe"](around:${radiusM},${centerLat},${centerLon});`,
      `node["amenity"="restaurant"](around:${radiusM},${centerLat},${centerLon});`,
      `node["amenity"="pharmacy"](around:${radiusM},${centerLat},${centerLon});`,
      `node["amenity"="bakery"](around:${radiusM},${centerLat},${centerLon});`,
      `node["amenity"="hotel"](around:${radiusM},${centerLat},${centerLon});`,
      `node["shop"](around:${radiusM},${centerLat},${centerLon});`,
      `way["amenity"="cafe"](around:${radiusM},${centerLat},${centerLon});`,
      `way["amenity"="restaurant"](around:${radiusM},${centerLat},${centerLon});`,
      `way["amenity"="pharmacy"](around:${radiusM},${centerLat},${centerLon});`,
      `way["amenity"="bakery"](around:${radiusM},${centerLat},${centerLon});`,
      `way["amenity"="hotel"](around:${radiusM},${centerLat},${centerLon});`,
      `way["shop"](around:${radiusM},${centerLat},${centerLon});`
    );
  }
  return `[out:json][timeout:90];
(
  ${filters.join("\n  ")}
);
out body center geom;
`;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(
    `${NOMINATIM_URL}?format=json&q=${encodeURIComponent(address)}&limit=1`,
    { headers: { "User-Agent": "pigAi/1.0" } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  return { lat: parseFloat(first.lat), lon: parseFloat(first.lon) };
}

/**
 * POST /api/overpass – führt Overpass-Abfrage aus und speichert in Supabase
 * Body: { address: string, radius?: number, betriebsart?: string } – Adresse wird geocodiert
 */
export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
      return NextResponse.json(
        {
          error:
            "Supabase nicht konfiguriert. SUPABASE_SERVICE_ROLE_KEY oder NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local eintragen.",
        },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { address, radius, betriebsart, profileId } = body;

    const addressStr = typeof address === "string" ? address.trim() : "";
    if (!addressStr) {
      return NextResponse.json(
        { error: "Adresse fehlt." },
        { status: 400 }
      );
    }

    const coords = await geocodeAddress(addressStr);
    if (!coords) {
      return NextResponse.json(
        { error: "Adresse konnte nicht gefunden werden. Bitte prüfen." },
        { status: 400 }
      );
    }

    const radiusM = Math.min(50000, Math.max(100, parseInt(radius ?? 2000, 10) || 2000));
    const overpassQuery = buildOverpassQuery(coords.lat, coords.lon, radiusM, betriebsart);

    const overpassData = await fetchOverpass(overpassQuery);

    const rows = overpassData.elements
      .map(elementToRow)
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 50);

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine Elemente mit Koordinaten gefunden",
        inserted: 0,
        totalElements: overpassData.elements.length,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const BATCH_SIZE = 100;
    let totalUpserted = 0;

    const profileUuid =
      typeof profileId === "string" && profileId.trim()
        ? profileId.trim()
        : "00000000-0000-0000-0000-000000000001";

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.rpc("upsert_osm_data_bulk", {
        p_rows: batch,
        p_profile_id: profileUuid,
      });

      if (error) {
        return NextResponse.json(
          {
            error: `Supabase: ${error.message}. Migration ausführen: npx supabase db push`,
          },
          { status: 500 }
        );
      }
      totalUpserted += data ?? batch.length;
    }

    return NextResponse.json({
      success: true,
      message: `${totalUpserted} Elemente gespeichert`,
      inserted: totalUpserted,
      totalElements: overpassData.elements.length,
    });
  } catch (error) {
    console.error("Overpass API Fehler:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Fehler bei der Overpass-Abfrage",
      },
      { status: 500 }
    );
  }
}
