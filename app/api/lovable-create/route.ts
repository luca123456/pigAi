import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function isValidLovableUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const normalized = url.trim().toLowerCase();
  return normalized.startsWith("https://") || normalized.startsWith("http://");
}

/**
 * POST /api/lovable-create – startet Lovable-Generierung per Playwright
 * Body: { website_analysis_id: number }
 * Gibt { lovable_project_url } zurück
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

    const projectRoot = process.cwd();
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const command = `${pythonCmd} -m backend.lovable_create ${website_analysis_id}`;

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 600_000,
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
        PYTHONIOENCODING: "utf-8",
      },
    });

    const output = stdout.trim();
    const lines = output.split("\n").filter(Boolean);
    const lastLine = lines[lines.length - 1] || "{}";

    let result;
    try {
      result = JSON.parse(lastLine);
    } catch {
      console.error("lovable-create: stdout nicht JSON-parsebar:", output);
      return NextResponse.json(
        { error: "Lovable-Ergebnis konnte nicht gelesen werden." },
        { status: 500 }
      );
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    if (!isValidLovableUrl(result.lovable_project_url)) {
      return NextResponse.json(
        { error: "Keine gültige Lovable-URL erhalten." },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("lovable-create Fehler:", msg);
    return NextResponse.json(
      { error: msg.slice(0, 500) },
      { status: 500 }
    );
  }
}
