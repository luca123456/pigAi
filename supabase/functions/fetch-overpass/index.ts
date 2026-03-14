// Supabase Edge Function: fetch-overpass
// Fetches geographic data from OpenStreetMap Overpass API and stores in Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_RATE_LIMIT_STATUS = 429;
const OVERPASS_TOO_MANY_REQUESTS_STATUS = 503;
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 3;

// =============================================================================
// Overpass API Response Interfaces
// =============================================================================

interface OverpassBounds {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassWayGeometryPoint {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  geometry?: OverpassWayGeometryPoint[];
  bounds?: OverpassBounds;
}

interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  members?: unknown[];
}

type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

interface OverpassResponse {
  version: number;
  generator: string;
  osm3s?: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

// =============================================================================
// Database Row Interface
// =============================================================================

interface OsmDataRow {
  id: number;
  element_type: string;
  tags: Record<string, string>;
  location: string | null; // EWKT format: SRID=4326;POINT(lon lat)
}

// =============================================================================
// Helper: Convert Overpass element to database row
// =============================================================================

function elementToRow(element: OverpassElement): OsmDataRow | null {
  const tags = element.tags ?? {};
  const elementType = element.type;

  let location: string | null = null;

  if (element.type === "node") {
    location = `SRID=4326;POINT(${element.lon} ${element.lat})`;
  } else if (element.type === "way") {
    if (element.center) {
      location = `SRID=4326;POINT(${element.center.lon} ${element.center.lat})`;
    } else if (element.geometry && element.geometry.length > 0) {
      // Use centroid of way geometry - build LINESTRING and get centroid
      const coords = element.geometry
        .map((p) => `${p.lon} ${p.lat}`)
        .join(", ");
      const first = element.geometry[0];
      const last = element.geometry[element.geometry.length - 1];
      if (first.lat === last.lat && first.lon === last.lon && element.geometry.length >= 4) {
        location = `SRID=4326;POLYGON((${coords}))`;
      } else {
        location = `SRID=4326;LINESTRING(${coords})`;
      }
    }
  } else if (element.type === "relation") {
    if (element.center) {
      location = `SRID=4326;POINT(${element.center.lon} ${element.center.lat})`;
    }
  }

  return {
    id: element.id,
    element_type: elementType,
    tags,
    location,
  };
}

// =============================================================================
// Helper: Fetch from Overpass API with retry on rate limit
// =============================================================================

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (response.status === OVERPASS_RATE_LIMIT_STATUS || response.status === OVERPASS_TOO_MANY_REQUESTS_STATUS) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS;
        console.warn(`Overpass API rate limited (${response.status}). Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }

      const data: OverpassResponse = await response.json();

      if (!data.elements) {
        throw new Error("Invalid Overpass response: missing elements array");
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(`Attempt ${attempt} failed: ${lastError.message}. Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw lastError ?? new Error("Overpass API request failed after retries");
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req: Request) => {
  // CORS headers for browser invocation
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    let overpassQuery: string;

    // Custom Overpass QL via POST body (JSON: { query: "..." })
    let body: { query?: string; south?: number; west?: number; north?: number; east?: number } = {};
    if (req.method === "POST") {
      try {
        body = (await req.json()) ?? {};
      } catch {
        body = {};
      }
    }

    const customQuery = body?.query?.trim();
    if (req.method === "POST" && customQuery) {
      // Custom Overpass QL from frontend
      overpassQuery = customQuery.includes("[out:json]")
        ? customQuery
        : `[out:json][timeout:90];\n${customQuery}`;
    } else {
      // Default query with bbox params (GET or POST without custom query)
      const south = parseFloat(String(url.searchParams.get("south") ?? body?.south ?? "49.45"));
      const west = parseFloat(String(url.searchParams.get("west") ?? body?.west ?? "8.42"));
      const north = parseFloat(String(url.searchParams.get("north") ?? body?.north ?? "49.55"));
      const east = parseFloat(String(url.searchParams.get("east") ?? body?.east ?? "8.55"));
      overpassQuery = `
[out:json][timeout:90];
(
  node["amenity"="cafe"](${south},${west},${north},${east});
  node["amenity"="pharmacy"](${south},${west},${north},${east});
  way["amenity"="cafe"](${south},${west},${north},${east});
  way["amenity"="pharmacy"](${south},${west},${north},${east});
);
out body center geom;
`;
    }

    console.log("Fetching from Overpass API...");
    const overpassData = await fetchOverpass(overpassQuery);

    const rows: OsmDataRow[] = [];
    for (const element of overpassData.elements) {
      const row = elementToRow(element);
      if (row && row.location) {
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No elements with location data found",
          inserted: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Upsert via RPC (handles EWKT -> geometry conversion in Postgres)
    const BATCH_SIZE = 100;
    let totalUpserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
        id: r.id,
        element_type: r.element_type,
        tags: r.tags,
        location: r.location,
      }));

      const { data, error } = await supabase.rpc("upsert_osm_data_bulk", {
        p_rows: batch,
      });

      if (error) {
        throw new Error(`Database upsert failed: ${error.message}`);
      }
      totalUpserted += data ?? batch.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Upserted ${totalUpserted} OSM elements`,
        inserted: totalUpserted,
        totalElements: overpassData.elements.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("fetch-overpass error:", message);

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
