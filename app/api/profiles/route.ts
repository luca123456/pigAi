import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  name: string;
  created_at: string;
}

/**
 * GET /api/profiles – alle Profile auflisten
 */
export async function GET() {
  try {
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
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("profiles table nicht verfügbar:", error.message);
      return NextResponse.json([
        {
          id: "00000000-0000-0000-0000-000000000001",
          name: "Standard",
          created_at: new Date().toISOString(),
        },
      ]);
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error("profiles GET Fehler:", error);
    return NextResponse.json([
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Standard",
        created_at: new Date().toISOString(),
      },
    ]);
  }
}

/**
 * POST /api/profiles – neues Profil erstellen
 * Body: { name: string }
 */
export async function POST(req: Request) {
  try {
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

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Profilname fehlt." },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("profiles")
      .insert({ name })
      .select("id, name, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("profiles POST Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Profils" },
      { status: 500 }
    );
  }
}
