import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import { config } from "./config";
import { PlanSchema, type Frame, type Plan } from "./remix";

const SYSTEM = `You are a short-form video strategist for app and startup marketing on TikTok and Instagram Reels.

You are shown a video that is already performing well for another brand. Your job is to remix it for the user's product: keep what makes the original work (the hook's emotion, pacing, framing and text style) and swap in the user's product.

The remix will be produced like this:
1. An image model generates the opening frame of a person, from your avatarPrompt (and a reference photo of the creator if the user gave one).
2. An image-to-video model animates that frame for hookDurationSec seconds, from your motionPrompt. No dialogue: the person reacts, gestures or looks at the camera, and the on-screen text carries the message.
3. Your hookText is burned on screen over the hook, then the user's own screen recording of the product demo plays.

Write for that pipeline:
- hookText: punchy, native to TikTok, lowercase is fine, no hashtags, no emojis unless the original used them. Mirror the original's structure (e.g. "POV:", "me after...", a bold claim, a relatable pain) but about the user's product and audience.
- avatarPrompt: a photorealistic vertical smartphone frame. Describe the person (age range, look, clothing), expression, setting, lighting and camera framing so it matches the original's vibe. Describe a new person; never ask to reproduce the person in the original video. No text in the image.
- motionPrompt: concrete motion over the clip (facial expression change, gesture, small handheld camera movement). Keep it to one continuous shot.
- hookDurationSec: match the original hook length, clamped to 3-10 seconds.
- caption and hashtags: ready to paste into TikTok/Instagram.`;

export async function planRemix(input: {
  dir: (file: string) => string;
  frames: Frame[];
  durationSec: number;
  transcript: string;
  product: { name: string; description: string };
}): Promise<Plan> {
  config.requireAnthropic();
  const client = new Anthropic();

  const frameBlocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const frame of input.frames) {
    frameBlocks.push({ type: "text", text: `Frame at ${frame.t.toFixed(1)}s` });
    frameBlocks.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: (await readFile(input.dir(frame.file))).toString("base64") },
    });
  }

  const response = await client.beta.messages
    .parse({
    model: config.claudeModel(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: betaZodOutputFormat(PlanSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Original video, ${input.durationSec.toFixed(1)}s long. Sampled frames:` },
          ...frameBlocks,
          {
            type: "text",
            text: `Transcript of the original's audio:\n${input.transcript || "(no speech)"}\n\nMy product: ${input.product.name}\n${input.product.description}\n\nAnalyze the original, then write the remix script.`,
          },
        ],
      },
    ],
  })
    .catch((err: unknown) => {
      if (err instanceof Anthropic.APIError) throw new Error(`Claude API error ${err.status ?? ""}: ${err.message}`);
      if (err instanceof Anthropic.AnthropicError) throw new Error(`Claude returned a script that could not be read (${err.message}). Retry to try again.`);
      throw err;
    });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to write this remix. Try rewording the product description.");
  if (!response.parsed_output) throw new Error(`Claude returned no usable plan (stop reason: ${response.stop_reason})`);
  const plan = response.parsed_output;
  return { ...plan, script: { ...plan.script, hookDurationSec: Math.min(10, Math.max(3, Math.round(plan.script.hookDurationSec))) } };
}
