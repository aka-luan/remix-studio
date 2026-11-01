import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isRunning, reconcile } from "@/lib/pipeline";
import { ScriptSchema } from "@/lib/remix";
import { loadRemix, remixDir, updateRemix } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Remix not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const remix = await loadRemix((await params).id);
  return remix ? NextResponse.json(await reconcile(remix)) : notFound();
}

export async function PATCH(request: Request, { params }: Ctx) {
  const id = (await params).id;
  const parsed = ScriptSchema.safeParse((await request.json()).script);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (isRunning(id)) return NextResponse.json({ error: "Wait for the current step to finish before editing." }, { status: 409 });
  const updated = await updateRemix(id, (latest) => (latest.plan ? { ...latest, plan: { ...latest.plan, script: parsed.data } } : latest));
  return updated?.plan ? NextResponse.json(updated) : notFound();
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const remix = await loadRemix((await params).id);
  if (!remix) return notFound();
  if (isRunning(remix.id)) return NextResponse.json({ error: "Wait for the current step to finish before deleting." }, { status: 409 });
  await rm(remixDir(remix.id), { recursive: true, force: true });
  return new NextResponse(null, { status: 204 });
}
