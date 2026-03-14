import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;

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
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === 429 || response.status === 503) {
        const delay =
          parseInt(response.headers.get("Retry-After") ?? "5", 10) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API: ${response.status} ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();
      if (!data.elements) throw new Error("Invalid Overpass response");
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError ?? new Error("Overpass API request failed");
}

const DEFAULT_QUERY = (s: number, w: number, n: number, e: number) => `
[out:json][timeout:90];
(
  node["amenity"="cafe"](${s},${w},${n},${e});
  node["amenity"="pharmacy"](${s},${w},${n},${e});
  way["amenity"="cafe"](${s},${w},${n},${e});
  way["amenity"="pharmacy"](${s},${w},${n},${e});
);
out body center geom;
`;

/**
 * POST /api/overpass – führt Overpass-Abfrage aus und speichert in Supabase
 * Body: { query?: string, south?, west?, north?, east? }
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
    const { query, south, west, north, east } = body;

    const s = parseFloat(south ?? 49.45);
    const w = parseFloat(west ?? 8.42);
    const n = parseFloat(north ?? 49.55);
    const e = parseFloat(east ?? 8.55);

    const overpassQuery =
      query?.trim() && query.includes("out")
        ? query.includes("[out:json]")
          ? query
          : `[out:json][timeout:90];\n${query}`
        : DEFAULT_QUERY(s, w, n, e);

    const overpassData = await fetchOverpass(overpassQuery);

    const rows = overpassData.elements
      .map(elementToRow)
      .filter((r): r is NonNullable<typeof r> => r !== null);

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

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.rpc("upsert_osm_data_bulk", {
        p_rows: batch,
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
