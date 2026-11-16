import { adsStatus, analyzeReference } from "@/lib/ads/ai";
import { handle, jsonBody } from "@/lib/ads/http";
import { UserError } from "@/lib/ads/service";
import { deleteReference, loadBrand, loadReference, updateReference } from "@/lib/ads/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Re-run the analysis (optionally with a new note). */
export function POST(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const body = await jsonBody<{ note?: string }>(request);
    const ref = await loadReference(id);
    if (!ref) throw new UserError("Reference not found", 404);
    const withNote = typeof body.note === "string" ? { ...ref, note: body.note.trim() } : ref;
    const analysis = await analyzeReference(withNote, await loadBrand());
    return updateReference(id, (r) => ({ ...r, note: withNote.note, analysis, analyzedWithMock: adsStatus().mock, error: undefined }));
  });
}

export function DELETE(_: Request, { params }: Ctx) {
  return handle(async () => {
    await deleteReference((await params).id);
    return { ok: true };
  });
}
