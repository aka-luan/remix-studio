import { z } from "zod";

export const AnalysisSchema = z.object({
  format: z.enum(["hook_demo", "text_on_screen", "talking_head", "other"]),
  hookEndsAtSec: z.number().describe("Second where the hook ends and the product demo begins"),
  originalOnScreenText: z.string().describe("Text overlaid on the hook, verbatim"),
  hookVisual: z.string().describe("What the viewer sees during the hook: person, setting, framing, emotion, motion"),
  demoSection: z.string().describe("How the product is shown after the hook"),
  whyItWorks: z.string(),
});

export const ScriptSchema = z.object({
  hookText: z.string().describe("On-screen hook text for the user's product, max ~12 words"),
  hookTextAlternatives: z.array(z.string()).describe("Three alternative hook texts"),
  avatarPrompt: z.string().describe("Image prompt for the opening frame: person, expression, setting, lighting, framing"),
  motionPrompt: z.string().describe("Image-to-video prompt: how the person moves and reacts over the hook"),
  hookDurationSec: z.number().describe("Hook length in seconds, 3 to 10"),
  caption: z.string().describe("Post caption"),
  hashtags: z.array(z.string()),
});

export const PlanSchema = z.object({ analysis: AnalysisSchema, script: ScriptSchema });

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Script = z.infer<typeof ScriptSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export type Frame = { file: string; t: number };

export type Remix = {
  id: string;
  createdAt: string;
  input: {
    sourceUrl: string | null;
    product: { name: string; description: string };
    demoFile: string;
    avatarRefFile: string | null;
  };
  source?: { videoFile: string; durationSec: number; frames: Frame[]; audioFile: string | null };
  plan?: Plan & { transcript: string };
  approvedAt?: string;
  avatarFile?: string;
  hookFile?: string;
  finalFile?: string;
  run: RunState;
};

export type RunState =
  | { state: "idle" }
  | { state: "running"; step: StepName; startedAt: string }
  | { state: "failed"; step: StepName; error: string };

export const STEPS = [
  { name: "ingest", label: "Download & extract frames", output: "source" },
  { name: "plan", label: "Analyze & write script", output: "plan" },
  { name: "avatar", label: "Generate avatar (Nano Banana)", output: "avatarFile" },
  { name: "hook", label: "Animate hook (Kling)", output: "hookFile" },
  { name: "assemble", label: "Stitch hook + demo (FFmpeg)", output: "finalFile" },
] as const satisfies readonly { name: string; label: string; output: keyof Remix }[];

export type StepName = (typeof STEPS)[number]["name"];

export const STEP_NAMES = STEPS.map((s) => s.name) as [StepName, ...StepName[]];

const REVIEW_GATE: StepName = "avatar";

export type Status =
  | { kind: "running"; step: StepName }
  | { kind: "failed"; step: StepName; error: string }
  | { kind: "needs-review" }
  | { kind: "ready"; step: StepName }
  | { kind: "done" };

export function nextStep(remix: Remix): StepName | null {
  return STEPS.find((s) => remix[s.output] === undefined)?.name ?? null;
}

export function status(remix: Remix): Status {
  if (remix.run.state === "running") return { kind: "running", step: remix.run.step };
  if (remix.run.state === "failed") return { kind: "failed", step: remix.run.step, error: remix.run.error };
  const step = nextStep(remix);
  if (step === null) return { kind: "done" };
  if (step === REVIEW_GATE && !remix.approvedAt) return { kind: "needs-review" };
  return { kind: "ready", step };
}

export function canAutoRun(remix: Remix): boolean {
  const s = status(remix);
  return s.kind === "ready";
}

export function resetFrom(remix: Remix, from: StepName): Remix {
  const index = STEPS.findIndex((s) => s.name === from);
  const next: Remix = { ...remix, run: { state: "idle" } };
  for (const step of STEPS.slice(index)) delete next[step.output];
  if (index <= STEPS.findIndex((s) => s.name === "plan")) delete next.approvedAt;
  return next;
}
