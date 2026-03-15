import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/outreach-sent – markiert Outreach als gesendet (nur einmal klickbar)
 * Body: { website_analysis_id: number, profileId?: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { website_analysis_id } = body;

    if (typeof website_analysis_id !== "number") {
      return NextResponse.json(
        { error: "website_analysis_id (number) erforderlich." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl?.trim() || !supabaseKey?.trim()) {
      return NextResponse.json(
        { error: "Supabase nicht konfiguriert." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
      .from("website_analysis")
      .update({ outreach_sent_at: new Date().toISOString() })
      .eq("id", website_analysis_id);

    if (error) {
      console.error("outreach-sent Fehler:", error);
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("outreach-sent Fehler:", msg);
    return NextResponse.json(
      { error: msg.slice(0, 500) },
      { status: 500 }
    );
  }
}
