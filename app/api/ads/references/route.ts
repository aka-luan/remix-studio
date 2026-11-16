import path from "node:path";
import { analyzeReference } from "@/lib/ads/ai";
import { fileField, handle, textField } from "@/lib/ads/http";
import { UserError } from "@/lib/ads/service";
import { listReferences, loadBrand, newId, saveReference, updateReference } from "@/lib/ads/store";
import type { Reference } from "@/lib/ads/types";
import { adsStatus } from "@/lib/ads/ai";

export const runtime = "nodejs";

export function GET() {
  return handle(listReferences);
}

/** Upload a screenshot of an ad and analyze it right away. Screenshots are only ever sent to the text/vision model. */
export function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const image = fileField(form, "image");
    const ext = image ? path.extname(image.name).toLowerCase() : "";
    if (!image || ![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) throw new UserError("Upload a PNG, JPEG or WebP screenshot of the ad.");
    const ref: Reference = { id: newId(), createdAt: new Date().toISOString(), imageFile: `ad${ext}`, note: textField(form, "note"), analysis: null };
    await saveReference(ref, { name: ref.imageFile, data: new Uint8Array(await image.arrayBuffer()) });
    try {
      const analysis = await analyzeReference(ref, await loadBrand());
      return await updateReference(ref.id, (r) => ({ ...r, analysis, analyzedWithMock: adsStatus().mock, error: undefined }));
    } catch (err) {
      return await updateReference(ref.id, (r) => ({ ...r, error: err instanceof Error ? err.message : String(err) }));
    }
  });
}
