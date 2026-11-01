import { NextResponse } from "next/server";
import { z } from "zod";
import { isRunning, runPipeline } from "@/lib/pipeline";
import { resetFrom, STEP_NAMES, type Remix } from "@/lib/remix";
import { updateRemix } from "@/lib/store";

export const runtime = "nodejs";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("redo"), from: z.enum(STEP_NAMES) }),
]);

function apply(remix: Remix, action: z.infer<typeof ActionSchema>): Remix {
  if (remix.run.state === "running") return remix;
  switch (action.action) {
    case "approve":
      return remix.plan ? { ...remix, approvedAt: new Date().toISOString() } : remix;
    case "retry":
      return remix.run.state === "failed" ? { ...remix, run: { state: "idle" } } : remix;
    case "redo":
      return resetFrom(remix, action.from);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const parsed = ActionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (isRunning(id)) return NextResponse.json({ error: "A step is already running." }, { status: 409 });

  const next = await updateRemix(id, (latest) => apply(latest, parsed.data));
  if (!next) return NextResponse.json({ error: "Remix not found" }, { status: 404 });
  void runPipeline(id);
  return NextResponse.json(next, { status: 202 });
}
