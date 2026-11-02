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

export const TranscribedPlanSchema = PlanSchema.extend({
  transcript: z.string().describe("Verbatim transcript of any speech in the original, or (no speech)"),
});

export type TranscribedPlan = z.infer<typeof TranscribedPlanSchema>;

export function clampPlan<P extends Plan>(plan: P): P {
  const hookDurationSec = Math.min(10, Math.max(3, Math.round(plan.script.hookDurationSec)));
  return { ...plan, script: { ...plan.script, hookDurationSec } };
}

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
  plan?: TranscribedPlan;
  approvedAt?: string;
  avatarFile?: string;
  previousAvatarFile?: string;
  hookFile?: string;
  finalFile?: string;
  previousFinalFile?: string;
  built?: Partial<Record<StepName, Partial<Script>>>;
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
  { name: "hook", label: "Animate hook (Gemini Omni)", output: "hookFile" },
  { name: "assemble", label: "Stitch hook + demo (FFmpeg)", output: "finalFile" },
] as const satisfies readonly { name: string; label: string; output: keyof Remix }[];

export type StepName = (typeof STEPS)[number]["name"];

export const STEP_INPUTS = {
  avatar: ["avatarPrompt"],
  hook: ["motionPrompt", "hookDurationSec"],
  assemble: ["hookText", "hookDurationSec"],
} as const satisfies Partial<Record<StepName, readonly (keyof Script)[]>>;

export type ScriptStep = keyof typeof STEP_INPUTS;

const SCRIPT_STEPS = Object.keys(STEP_INPUTS) as ScriptStep[];

export function stepInputs(step: ScriptStep, script: Script): Partial<Script> {
  return Object.fromEntries(STEP_INPUTS[step].map((key) => [key, script[key]]));
}

export function isScriptStep(step: StepName): step is ScriptStep {
  return step in STEP_INPUTS;
}

export function staleFrom(remix: Remix, script: Script): { step: ScriptStep; fields: (keyof Script)[] } | null {
  for (const step of SCRIPT_STEPS) {
    const output = STEPS.find((s) => s.name === step)!.output;
    const built = remix.built?.[step] ?? (remix.plan && stepInputs(step, remix.plan.script));
    if (remix[output] === undefined || !built) continue;
    const fields = STEP_INPUTS[step].filter((key) => JSON.stringify(built[key]) !== JSON.stringify(script[key]));
    if (fields.length) return { step, fields };
  }
  return null;
}

export function backfillBuilt(remix: Remix): Remix {
  if (!remix.plan) return remix;
  const built = { ...remix.built };
  for (const step of SCRIPT_STEPS) {
    const output = STEPS.find((s) => s.name === step)!.output;
    if (remix[output] !== undefined && !built[step]) built[step] = stepInputs(step, remix.plan.script);
  }
  return { ...remix, built };
}

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
  if (from === "avatar" && remix.avatarFile) next.previousAvatarFile = remix.avatarFile;
  if (remix.finalFile) next.previousFinalFile = remix.finalFile;
  for (const step of STEPS.slice(index)) delete next[step.output];
  if (index <= STEPS.findIndex((s) => s.name === "plan")) delete next.approvedAt;
  return next;
}
