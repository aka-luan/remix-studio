import { handle, jsonBody } from "@/lib/ads/http";
import { UserError } from "@/lib/ads/service";
import { deleteProject, loadProject, updateProject } from "@/lib/ads/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_: Request, { params }: Ctx) {
  return handle(async () => {
    const p = await loadProject((await params).id);
    if (!p) throw new UserError("Project not found", 404);
    return p;
  });
}

export function PATCH(request: Request, { params }: Ctx) {
  return handle(async () => {
    const body = await jsonBody<{ name?: string; audience?: string; brief?: string; referenceIds?: string[] }>(request);
    const p = await updateProject((await params).id, (p) => ({
      ...p,
      name: body.name?.trim() || p.name,
      audience: body.audience?.trim() ?? p.audience,
      brief: body.brief?.trim() ?? p.brief,
      referenceIds: Array.isArray(body.referenceIds) ? body.referenceIds.map(String) : p.referenceIds,
    }));
    if (!p) throw new UserError("Project not found", 404);
    return p;
  });
}

export function DELETE(_: Request, { params }: Ctx) {
  return handle(async () => {
    await deleteProject((await params).id);
    return { ok: true };
  });
}
