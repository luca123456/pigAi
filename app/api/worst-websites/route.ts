import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/worst-websites – gibt die 3 schlechtesten analysierten Websites zurück
 */
export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Dedupliziert: nur die neueste Analyse pro URL, sortiert nach Score (aufsteigend)
    const { data, error } = await supabase
      .from("website_analysis")
      .select("*")
      .order("score", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    // Deduplizieren: nur die neueste Analyse pro URL behalten
    const seen = new Set<string>();
    const unique = (data ?? []).filter((row) => {
      if (seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    });

    const worst3 = unique.slice(0, 3);

    return NextResponse.json(worst3);
  } catch (error) {
    console.error("worst-websites Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden" },
      { status: 500 }
    );
  }
}
