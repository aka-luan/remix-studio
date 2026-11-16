import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { adsPath } from "@/lib/ads/store";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const file = adsPath(parts.join("/"));
  if (!file) return new Response("Bad path", { status: 400 });
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const headers = new Headers({
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Content-Length": String(info.size),
    "Cache-Control": "no-store",
    // Uploaded SVGs must not run scripts when opened directly.
    "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:",
    "X-Content-Type-Options": "nosniff",
    // The preview iframe is sandboxed (opaque origin); uploaded fonts load in CORS mode.
    "Access-Control-Allow-Origin": "*",
  });
  if (new URL(request.url).searchParams.has("download")) headers.set("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}
