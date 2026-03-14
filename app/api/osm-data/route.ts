import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface OsmDataRow {
  id: number;
  element_type: string;
  tags: Record<string, string>;
  location: unknown;
  created_at?: string;
}

/**
 * GET /api/osm-data – lädt OSM-Daten aus Supabase
 * Query: ?limit=100&element_type=node
 */
export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      return NextResponse.json(
        {
          error:
            "Supabase nicht konfiguriert. In .env.local: NEXT_PUBLIC_SUPABASE_ANON_KEY eintragen (Dashboard → Settings → API)",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url ?? "");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 1000);
    const elementType = searchParams.get("element_type");
    const profileId =
      searchParams.get("profileId")?.trim() ||
      "00000000-0000-0000-0000-000000000001";

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const table = "osm_data_with_coords";
    let query = supabase
      .from(table)
      .select("profile_id, id, element_type, tags, lat, lon, created_at, updated_at")
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (elementType && ["node", "way", "relation"].includes(elementType)) {
      query = query.eq("element_type", elementType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase osm_data_with_coords Fehler:", error);
      // Fallback: osm_data ohne Koordinaten, falls View nicht existiert
      const fallback = supabase
        .from("osm_data")
        .select("profile_id, id, element_type, tags, created_at")
        .eq("profile_id", profileId)
        .not("location", "is", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      const q = elementType ? fallback.eq("element_type", elementType) : fallback;
      const { data: d2, error: e2 } = await q;
      if (e2) {
        console.error("Supabase osm_data Fehler:", e2);
        return NextResponse.json(
          { error: `Supabase: ${e2.message} (Migration ausführen: npx supabase db push)` },
          { status: 500 }
        );
      }
      return NextResponse.json((d2 ?? []).map((r) => ({ ...r, lat: null, lon: null })));
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("osm-data API Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der OSM-Daten" },
      { status: 500 }
    );
  }
}
