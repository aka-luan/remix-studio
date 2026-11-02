import { rm } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isRunning, runPipeline } from "@/lib/pipeline";
import { resetFrom, type Remix } from "@/lib/remix";
import { artifactPath, loadRemix, updateRemix, writeArtifact } from "@/lib/store";

export const runtime = "nodejs";

function swapDemo(remix: Remix, demoFile: string): Remix {
  if (remix.run.state === "running") return remix;
  const next = { ...remix, input: { ...remix.input, demoFile } };
  const stitchFailed = remix.run.state === "failed" && remix.run.step === "assemble";
  return next.finalFile || stitchFailed ? resetFrom(next, "assemble") : next;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const remix = await loadRemix(id);
  if (!remix) return NextResponse.json({ error: "Remix not found" }, { status: 404 });
  if (isRunning(id)) return NextResponse.json({ error: "Wait for the current step to finish before replacing the demo." }, { status: 409 });

  const demo = (await request.formData()).get("demoFile");
  if (!(demo instanceof File) || demo.size === 0) return NextResponse.json({ error: "Choose a demo video to upload." }, { status: 400 });

  const ext = path.extname(demo.name).toLowerCase() || ".mp4";
  const demoFile = await writeArtifact(id, `demo-${Date.now()}${ext}`, new Uint8Array(await demo.arrayBuffer()));
  let oldDemo = null as string | null;
  const next = await updateRemix(id, (latest) => {
    oldDemo = latest.input.demoFile;
    return swapDemo(latest, demoFile);
  });
  if (next?.input.demoFile !== demoFile) {
    await rm(artifactPath(id, demoFile), { force: true });
    return NextResponse.json({ error: "Wait for the current step to finish before replacing the demo." }, { status: 409 });
  }
  if (oldDemo) await rm(artifactPath(id, oldDemo), { force: true });
  void runPipeline(id);
  return NextResponse.json(next);
}
