import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

/**
 * POST /api/analyze – startet die Batch-Analyse (Python-Backend)
 * Body (optional): { limit?: number, url?: string }
 *  - limit: Anzahl der zu analysierenden Websites (max 30)
 *  - url: einzelne URL analysieren
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { limit, url } = body;

    const projectRoot = process.cwd();
    const pythonCmd = process.platform === "win32" ? "python" : "python3";

    let command: string;
    if (url?.trim()) {
      command = `${pythonCmd} -m backend.analyze_website "${url.trim()}"`;
    } else {
      const n = Math.min(Math.max(parseInt(limit ?? "30", 10) || 30, 1), 30);
      command = `${pythonCmd} -m backend.batch_analyze ${n}`;
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 300_000,
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
        PYTHONIOENCODING: "utf-8",
      },
    });

    const output = (stdout + "\n" + stderr).trim();
    const scoreMatches = output.match(/Score:\s*(\d+)\/10/g);
    const analyzed = scoreMatches?.length ?? 0;

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
