import { NextResponse } from "next/server";

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host === "[::1]") return true;
  if (host.startsWith("127.")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function injectBaseTag(html: string, baseHref: string): string {
  const cleaned = html.replace(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    ""
  );
  const baseTag = `<base href="${baseHref}">`;

  if (/<head[^>]*>/i.test(cleaned)) {
    return cleaned.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
  }
  return `<!doctype html><head>${baseTag}</head><body>${cleaned}</body>`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("url")?.trim();

    if (!target) {
      return NextResponse.json({ error: "url query parameter fehlt." }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return NextResponse.json({ error: "Ungültige URL." }, { status: 400 });
    }

    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Nur https URLs erlaubt." }, { status: 400 });
    }
    if (parsed.hostname === "lovable.dev" && parsed.pathname.startsWith("/projects/")) {
      return NextResponse.json(
        {
          error:
            "lovable.dev/projects URL ist nicht embed-faehig. Bitte eine oeffentliche Preview-URL verwenden.",
        },
        { status: 400 }
      );
    }
    if (isBlockedHostname(parsed.hostname)) {
      return NextResponse.json({ error: "Diese URL ist nicht erlaubt." }, { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Preview konnte nicht geladen werden (${upstream.status}).` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "";
    const html = await upstream.text();
    const finalUrl = upstream.url || parsed.toString();

    if (!contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "Preview-Ziel liefert kein HTML." },
        { status: 415 }
      );
    }

    const withBase = injectBaseTag(html, finalUrl);

    return new NextResponse(withBase, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Preview-Proxy Fehler: ${msg}` }, { status: 500 });
  }
}

