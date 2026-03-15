import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function hasValidWebsite(url: string): boolean {
  const u = (url || "").trim();
  if (!u || !u.startsWith("http")) return false;
  const lower = u.toLowerCase();
  return !SOCIAL_MEDIA_DOMAINS.some((d) => lower.includes(d));
}

function nameFromUrl(url: string): string {
  try {
    const host = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const name = host.split(".")[0] || host;
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
  } catch {
    return url;
  }
}

export interface FoundBusiness {
  url: string;
  name: string;
  score?: number;
  reasoning?: string;
  lovable_prompt?: string;
  screenshot_path?: string | null;
  analyzed: boolean;
  created_at?: string;
}

/**
 * GET /api/found-businesses – alle gefundenen Betriebe aus osm_data, mit website_analysis verknüpft
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

    const { data: osmRows, error: osmError } = await supabase
      .from("osm_data")
      .select("tags, updated_at")
      .eq("profile_id", profileId)
      .order("updated_at", { ascending: false });

    if (osmError) {
      return NextResponse.json(
        { error: `Supabase osm_data: ${osmError.message}` },
        { status: 500 }
      );
    }

    const urlToBusiness = new Map<string, { name: string; updated_at: string }>();
    for (const row of osmRows ?? []) {
      const tags = (row.tags as Record<string, string>) ?? {};
      const url = (tags.website || tags["contact:website"] || "").trim();
      if (!url || !hasValidWebsite(url)) continue;
      if (urlToBusiness.has(url)) continue;
      const name = tags.name || nameFromUrl(url);
      urlToBusiness.set(url, {
        name,
        updated_at: row.updated_at ?? "",
      });
    }

    const urls = Array.from(urlToBusiness.keys()).slice(0, 50);

    if (urls.length === 0) {
      return NextResponse.json([]);
    }

    const { data: analyses, error: analysisError } = await supabase
      .from("website_analysis")
      .select("url, score, reasoning, lovable_prompt, screenshot_path, created_at")
      .eq("profile_id", profileId)
      .in("url", urls)
      .order("score", { ascending: true })
      .order("created_at", { ascending: false });

    if (analysisError) {
      return NextResponse.json(
        { error: `Supabase website_analysis: ${analysisError.message}` },
        { status: 500 }
      );
    }

    const analysisByUrl = new Map<string, { score: number; reasoning: string; lovable_prompt: string; screenshot_path: string | null; created_at: string }>();
    for (const a of analyses ?? []) {
      if (!analysisByUrl.has(a.url)) {
        analysisByUrl.set(a.url, {
          score: a.score,
          reasoning: a.reasoning ?? "",
          lovable_prompt: a.lovable_prompt ?? "",
          screenshot_path: a.screenshot_path ?? null,
          created_at: a.created_at ?? "",
        });
      }
    }

    const analyzed: FoundBusiness[] = [];
    const notAnalyzed: FoundBusiness[] = [];

    for (const url of urls) {
      const meta = urlToBusiness.get(url)!;
      const analysis = analysisByUrl.get(url);
      if (analysis) {
        analyzed.push({
          url,
          name: meta.name,
          score: analysis.score,
          reasoning: analysis.reasoning,
          lovable_prompt: analysis.lovable_prompt,
          screenshot_path: analysis.screenshot_path,
          analyzed: true,
          created_at: analysis.created_at,
        });
      } else {
        notAnalyzed.push({
          url,
          name: meta.name,
          analyzed: false,
        });
      }
    }

    analyzed.sort((a, b) => (a.score ?? 10) - (b.score ?? 10));
    const result = [...analyzed, ...notAnalyzed];

    return NextResponse.json(result);
  } catch (error) {
    console.error("found-businesses Fehler:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden" },
      { status: 500 }
    );
  }
}
