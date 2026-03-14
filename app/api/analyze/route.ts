import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/analyze – startet die Batch-Analyse (Python-Backend)
 * Body (optional): { limit?: number, url?: string }
 *  - limit: Anzahl der zu analysierenden Websites (Standard 10, max 30)
 *  - url: einzelne URL analysieren
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { limit, url, profileId } = body;

    const profileUuid =
      typeof profileId === "string" && profileId.trim()
        ? profileId.trim()
        : "00000000-0000-0000-0000-000000000001";

    const projectRoot = process.cwd();
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    let command: string;
    if (url?.trim()) {
      command = `${pythonCmd} -m backend.analyze_website "${url.trim()}"`;
    } else {
      const n = Math.min(Math.max(parseInt(limit ?? "10", 10) || 10, 1), 30);
      command = `${pythonCmd} -m backend.batch_analyze ${n}`;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 300_000,
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
        PYTHONIOENCODING: "utf-8",
        PIGAI_PROFILE_ID: profileUuid,
      },
    });

    const output = (stdout + "\n" + stderr).trim();
    const scoreMatches = output.match(/Score:\s*(\d+)\/10/g);
    const bewertungMatches = output.match(/Bewertung:\s*(\d+)\/10/g);
    const summaryMatch = output.match(/Fertig\.\s*(\d+)\/(\d+)\s*Websites erfolgreich analysiert\./);
    const analyzedFromSummary = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;
    const analyzed = Math.max(
      analyzedFromSummary,
      scoreMatches?.length ?? 0,
      bewertungMatches?.length ?? 0
    );

    const noSuccess =
      analyzed === 0 &&
      /keine neuen website-urls gefunden|openai_api_key fehlt|fehler|traceback|exception/i.test(output);

    if (noSuccess) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Keine Website wurde analysiert. Prüfe OPENAI_API_KEY und ob neue OSM-URLs vorhanden sind.",
          output: output.slice(-2000),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analyzed,
      output: output.slice(-2000),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Analyse-Fehler:", msg);
    return NextResponse.json(
      { success: false, error: msg.slice(0, 500) },
      { status: 500 }
    );
  }
}
