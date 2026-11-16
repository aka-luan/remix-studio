import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { adsPath } from "./store";
import { dimensions, renderAdHtml, type TemplateInput } from "./templates";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

/** setContent runs on about:blank, where file:// and relative URLs silently fail, so every asset is inlined. */
export async function dataUri(rel: string): Promise<string> {
  const file = adsPath(rel);
  if (!file) throw new Error(`Bad asset path: ${rel}`);
  const mime = MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream";
  return `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
}

const g = globalThis as { __adsBrowser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  const existing = g.__adsBrowser && (await g.__adsBrowser.catch(() => null));
  if (existing?.isConnected()) return existing;
  g.__adsBrowser = chromium.launch({ headless: true }).catch(async (err) => {
    // Fall back to the system Edge if Playwright's Chromium isn't installed.
    try {
      return await chromium.launch({ headless: true, channel: "msedge" });
    } catch {
      throw new Error(`Could not start a browser for rendering. Run "npx playwright-core install chromium". (${(err as Error).message})`);
    }
  });
  return g.__adsBrowser;
}

export async function renderPng(input: TemplateInput): Promise<Buffer> {
  const { width, height } = dimensions(input.format);
  const context = await (await browser()).newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    // Google Fonts may be unreachable offline; render with fallbacks rather than failing.
    await page.setContent(renderAdHtml(input), { waitUntil: "load", timeout: 20_000 }).catch(() => undefined);
    await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 8000))]);
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
    });
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
  } finally {
    await context.close();
  }
}
