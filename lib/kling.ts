import { klingai, type KlingAIVideoModelOptions } from "@ai-sdk/klingai";
import { experimental_generateVideo as generateVideo } from "ai";
import { readFile } from "node:fs/promises";
import { config } from "./config";

export async function animateHook(opts: { image: string; prompt: string; durationSec: number }): Promise<Uint8Array> {
  config.requireKling();
  const { videos } = await generateVideo({
    model: klingai.video(config.klingModel()),
    prompt: { image: await readFile(opts.image), text: opts.prompt },
    duration: Math.round(opts.durationSec),
    poll: { timeoutMs: 15 * 60_000 },
    providerOptions: {
      klingai: {
        mode: config.klingMode(),
        sound: "off",
        negativePrompt: "text, captions, subtitles, watermark, logo, distorted face, extra fingers, morphing",
      } satisfies KlingAIVideoModelOptions,
    },
  });
  if (!videos[0]) throw new Error("Kling returned no video");
  return videos[0].uint8Array;
}
