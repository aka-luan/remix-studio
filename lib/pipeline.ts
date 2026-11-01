import { readdir, rm } from "node:fs/promises";
import { planWithClaude } from "./claude";
import { config } from "./config";
import { animateHook, generateAvatar, planWithGemini, transcribe } from "./gemini";
import { assemble, downloadVideo, extractAudio, extractFrames, probe } from "./media";
import { canAutoRun, nextStep, type Remix, type StepName, type TranscribedPlan } from "./remix";
import { artifactPath, remixDir, updateRemix, writeArtifact } from "./store";

type Runner = (remix: Remix) => Promise<Partial<Remix>>;

const PLANNERS: Record<"gemini" | "claude", (remix: Remix) => Promise<TranscribedPlan>> = {
  gemini: (remix) =>
    planWithGemini({ video: artifactPath(remix.id, remix.source!.videoFile), product: remix.input.product }),
  async claude(remix) {
    const source = remix.source!;
    const transcript = source.audioFile ? await transcribe(artifactPath(remix.id, source.audioFile)) : "";
    const plan = await planWithClaude({
      dir: (f) => artifactPath(remix.id, f),
      frames: source.frames,
      durationSec: source.durationSec,
      transcript,
      product: remix.input.product,
    });
    return { ...plan, transcript };
  },
};

const RUNNERS: Record<StepName, Runner> = {
  async ingest(remix) {
    const dir = remixDir(remix.id);
    for (const f of await readdir(dir)) if (/^(frame-\d+\.jpg|source-audio\.mp3)$/.test(f)) await rm(artifactPath(remix.id, f));
    const videoFile = remix.input.sourceUrl ? await downloadVideo(remix.input.sourceUrl, dir) : "source.mp4";
    const video = artifactPath(remix.id, videoFile);
    const { durationSec, hasAudio } = await probe(video);
    const frames = await extractFrames(video, dir, durationSec);
    const audioFile = hasAudio ? await extractAudio(video, dir) : null;
    return { source: { videoFile, durationSec, frames, audioFile } };
  },

  async plan(remix) {
    return { plan: await PLANNERS[config.planner()](remix) };
  },

  async avatar(remix) {
    const styleFrame = styleFrameFor(remix);
    const png = await generateAvatar({
      prompt: remix.plan!.script.avatarPrompt,
      styleFrame: artifactPath(remix.id, styleFrame),
      creatorPhoto: remix.input.avatarRefFile ? artifactPath(remix.id, remix.input.avatarRefFile) : null,
    });
    return { avatarFile: await writeArtifact(remix.id, "avatar.png", png) };
  },

  async hook(remix) {
    const script = remix.plan!.script;
    const mp4 = await animateHook({
      image: artifactPath(remix.id, remix.avatarFile!),
      prompt: script.motionPrompt,
      durationSec: script.hookDurationSec,
    });
    return { hookFile: await writeArtifact(remix.id, "hook.mp4", mp4) };
  },

  async assemble(remix) {
    const finalFile = await assemble({
      dir: remixDir(remix.id),
      hook: remix.hookFile!,
      demo: remix.input.demoFile,
      hookText: remix.plan!.script.hookText,
      hookDurationSec: remix.plan!.script.hookDurationSec,
    });
    return { finalFile };
  },
};

function styleFrameFor(remix: Remix): string {
  const frames = remix.source!.frames;
  return frames.reduce((best, f) => (Math.abs(f.t - 1) < Math.abs(best.t - 1) ? f : best)).file;
}

const running: Set<string> = ((globalThis as { __remixRunning?: Set<string> }).__remixRunning ??= new Set());

export function isRunning(id: string): boolean {
  return running.has(id);
}

export async function runPipeline(id: string): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    for (;;) {
      let step = null as StepName | null;
      const claimed = await updateRemix(id, (current) => {
        if (!canAutoRun(current)) return current;
        step = nextStep(current)!;
        return { ...current, run: { state: "running", step, startedAt: new Date().toISOString() } };
      });
      if (!claimed || step === null) return;
      const current: StepName = step;
      try {
        const output = await RUNNERS[current](claimed);
        await updateRemix(id, (latest) => ({ ...latest, ...output, run: { state: "idle" } }));
      } catch (err) {
        console.error(`[remix ${id}] ${current} failed`, err);
        const error = err instanceof Error ? err.message : String(err);
        await updateRemix(id, (latest) => ({ ...latest, run: { state: "failed", step: current, error } }));
      }
    }
  } catch (err) {
    console.error(`[remix ${id}] pipeline error`, err);
  } finally {
    running.delete(id);
  }
}

export async function reconcile(remix: Remix): Promise<Remix> {
  if (running.has(remix.id)) return remix;
  if (canAutoRun(remix)) {
    void runPipeline(remix.id);
    return remix;
  }
  if (remix.run.state !== "running") return remix;
  const updated = await updateRemix(remix.id, (latest) =>
    latest.run.state === "running" && !running.has(latest.id)
      ? { ...latest, run: { state: "failed", step: latest.run.step, error: "Interrupted (the server stopped mid-step). Retry to continue." } }
      : latest,
  );
  return updated ?? remix;
}
