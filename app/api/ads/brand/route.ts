import { handle, jsonBody } from "@/lib/ads/http";
import { UserError } from "@/lib/ads/service";
import { loadBrand, updateBrand } from "@/lib/ads/store";
import type { Brand } from "@/lib/ads/types";

export const runtime = "nodejs";

export function GET() {
  return handle(loadBrand);
}

const HEX = /^#[\da-f]{6}$/i;
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : undefined);

export function PUT(request: Request) {
  return handle(async () => {
    const body = await jsonBody<Partial<Brand>>(request);
    if (body.colors && Object.values(body.colors).some((c) => !HEX.test(String(c)))) throw new UserError("Colors must be 6-digit hex values like #7c3aed.");
    return updateBrand((b) => ({
      ...b,
      name: body.name?.trim() || b.name,
      website: body.website?.trim() ?? b.website,
      productDescription: body.productDescription?.trim() ?? b.productDescription,
      audiences: list(body.audiences) ?? b.audiences,
      language: body.language?.trim() ?? b.language,
      tone: body.tone?.trim() ?? b.tone,
      features: list(body.features) ?? b.features,
      pricing: body.pricing?.trim() ?? b.pricing,
      colors: body.colors ? { ...b.colors, ...body.colors } : b.colors,
      fonts: body.fonts ? { heading: body.fonts.heading?.trim() || b.fonts.heading, body: body.fonts.body?.trim() || b.fonts.body } : b.fonts,
      logoFile: body.logoFile === null || (typeof body.logoFile === "string" && b.assets.some((a) => a.file === body.logoFile)) ? body.logoFile : b.logoFile,
    }));
  });
}
