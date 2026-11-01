import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import { config } from "./config";
import { PLAN_SYSTEM, planRequest } from "./prompt";
import { clampPlan, PlanSchema, type Frame, type Plan } from "./remix";

export async function planWithClaude(input: {
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
    system: PLAN_SYSTEM,
    output_config: { format: betaZodOutputFormat(PlanSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Original video, ${input.durationSec.toFixed(1)}s long. Sampled frames:` },
          ...frameBlocks,
          {
            type: "text",
            text: `Transcript of the original's audio:\n${input.transcript || "(no speech)"}\n\n${planRequest(input.product)}`,
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
  return clampPlan(response.parsed_output);
}
