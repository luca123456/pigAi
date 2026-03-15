import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function nameFromUrl(url: string): string {
  try {
    const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const name = host.split(".")[0] || host;
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
  } catch {
    return url;
  }
}

function buildOsmMap(osmRows: { tags?: Record<string, string> }[]): Map<string, { city: string; category: string }> {
  const map = new Map<string, { city: string; category: string }>();
  for (const row of osmRows) {
    const tags = row.tags ?? {};
    const url = tags.website || tags["contact:website"] || "";
    if (!url || !url.startsWith("http")) continue;
    const city = tags["addr:city"] || tags["addr:place"] || tags["addr:suburb"] || "";
    const category = tags.amenity || tags.shop || "";
    if (city || category) {
      map.set(url, { city, category });
    }
  }
  return map;
}

/**
 * GET /api/sent-requests – Outreach bereits gesendet (outreach_sent_at gesetzt)
 * Query: ?profileId=uuid
 */
export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url ?? "");
    const profileId =
      searchParams.get("profileId")?.trim() ||
      "00000000-0000-0000-0000-000000000001";

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    let { data, error } = await supabase
      .from("website_analysis")
      .select("id, url, outreach_sent_at, profile_id")
      .eq("profile_id", profileId)
      .not("outreach_sent_at", "is", null)
      .order("outreach_sent_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    if ((data ?? []).length === 0) {
      const { data: fallbackData } = await supabase
        .from("website_analysis")
        .select("id, url, outreach_sent_at, profile_id")
        .not("outreach_sent_at", "is", null)
        .order("outreach_sent_at", { ascending: false })
        .limit(100);
      if (fallbackData && fallbackData.length > 0) {
        const firstProfileId = fallbackData[0].profile_id as string;
        data = fallbackData.filter((r) => r.profile_id === firstProfileId);
      }
    }

    let osmMap = new Map<string, { city: string; category: string }>();
    try {
      const { data: osmData } = await supabase
        .from("osm_data")
        .select("tags")
        .eq("profile_id", profileId);
      osmMap = buildOsmMap((osmData ?? []) as { tags?: Record<string, string> }[]);
    } catch {
      // osm_data might not have profile_id in older setups
    }

    const requests = (data ?? []).map((row) => {
      const sentAt = row.outreach_sent_at as string;
      const osm = osmMap.get(row.url);
      return {
        id: String(row.id),
        businessName: nameFromUrl(row.url),
        city: osm?.city ?? "",
        category: osm?.category ?? "",
        sentAt: sentAt ? new Date(sentAt).toISOString().slice(0, 10) : "",
        status: "E-Mail verschickt" as const,
      };
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("sent-requests Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden" },
      { status: 500 }
    );
  }
}
