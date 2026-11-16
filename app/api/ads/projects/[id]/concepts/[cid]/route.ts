import { handle, jsonBody } from "@/lib/ads/http";
import { deleteConcept, patchConcept } from "@/lib/ads/service";
import type { Concept } from "@/lib/ads/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; cid: string }> };

export function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, cid } = await params;
    return patchConcept(id, cid, await jsonBody<Partial<Concept>>(request));
  });
}

export function DELETE(_: Request, { params }: Ctx) {
  return handle(async () => {
    const { id, cid } = await params;
    return deleteConcept(id, cid);
  });
}
