import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface AnalysisResult {
  id: number;
  url: string;
  score: number;
  reasoning: string;
  lovable_prompt: string;
  screenshot_path: string | null;
  created_at: string;
}

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseAnonKey?.trim()) {
      return NextResponse.json(
        {
          error:
            "Supabase nicht konfiguriert. In .env.local eintragen: NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY (aus Dashboard → Settings → API)",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const profileId =
      searchParams.get("profileId")?.trim() ||
      "00000000-0000-0000-0000-000000000001";

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    let { data, error } = await supabase
      .from("website_analysis")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase Fehler:", error);
      return NextResponse.json(
        { error: `Supabase: ${error.message} (Tabelle website_analysis existiert? Migration ausführen: npx supabase db push)` },
        { status: 500 }
      );
    }

    // Fallback: Wenn gewähltes Profil keine Ergebnisse hat, zeige Ergebnisse eines anderen Profils
    if ((data ?? []).length === 0) {
      const { data: fallbackData } = await supabase
        .from("website_analysis")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (fallbackData && fallbackData.length > 0) {
        const firstProfileId = fallbackData[0].profile_id as string;
        data = fallbackData.filter((r) => r.profile_id === firstProfileId);
      }
    }

    // Map to expected format (timestamp für Kompatibilität mit Frontend)
    const results: AnalysisResult[] = (data ?? []).map((row) => ({
      id: row.id,
      url: row.url,
      score: row.score,
      reasoning: row.reasoning,
      lovable_prompt: row.lovable_prompt,
      screenshot_path: row.screenshot_path ?? null,
      created_at: row.created_at,
      timestamp: row.created_at,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Fehler beim Laden der Ergebnisse:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der Ergebnisse" },
      { status: 500 }
    );
  }
}
