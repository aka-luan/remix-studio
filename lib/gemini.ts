import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "./config";
import { PLAN_SYSTEM, planRequest } from "./prompt";
import { clampPlan, TranscribedPlanSchema, type TranscribedPlan } from "./remix";

function client() {
  return new GoogleGenAI({ apiKey: config.geminiApiKey(), httpOptions: { timeout: 15 * 60_000 } });
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function imagePart(file: string) {
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()] ?? "image/jpeg";
  return { type: "image" as const, mime_type: mime, data: (await readFile(file)).toString("base64") };
}

async function waitUntilActive(ai: GoogleGenAI, name: string): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    const file = await ai.files.get({ name });
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED") throw new Error(`Gemini could not process ${name}: ${file.error?.message ?? "unknown error"}`);
    if (Date.now() > deadline) throw new Error(`Timed out waiting for Gemini to process ${name}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export async function transcribe(audioFile: string): Promise<string> {
  const interaction = await client().interactions.create({
    model: config.geminiTextModel(),
    input: [
      { type: "text", text: "Transcribe the speech in this audio verbatim. If there is no speech (only music or noise), reply with exactly: (no speech)" },
      { type: "audio", mime_type: "audio/mp3", data: (await readFile(audioFile)).toString("base64") },
    ],
  });
  return interaction.output_text?.trim() ?? "";
}

const PLAN_JSON_SCHEMA = (() => {
  const { $schema: _, ...schema } = z.toJSONSchema(TranscribedPlanSchema) as Record<string, unknown>;
  return schema;
})();

export async function planWithGemini(input: { video: string; product: { name: string; description: string } }): Promise<TranscribedPlan> {
  const ai = client();
  const uploaded = await ai.files.upload({ file: input.video, config: { mimeType: "video/mp4" } });
  await waitUntilActive(ai, uploaded.name!);

  const interaction = await ai.interactions.create({
    model: config.geminiTextModel(),
    system_instruction: PLAN_SYSTEM,
    input: [
      { type: "video", uri: uploaded.uri!, mime_type: "video/mp4" },
      { type: "text", text: `This is the original video. Transcribe any speech, then:\n\n${planRequest(input.product)}` },
    ],
    response_format: { type: "text", mime_type: "application/json", schema: PLAN_JSON_SCHEMA },
  });

  let json: unknown;
  try {
    json = JSON.parse(interaction.output_text ?? "");
  } catch {
    throw new Error("Gemini returned a script that could not be read. Retry to try again.");
  }
  const parsed = TranscribedPlanSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Gemini returned an incomplete script (${parsed.error.issues[0]?.message}). Retry to try again.`);
  return clampPlan(parsed.data);
}

export async function generateAvatar(opts: { prompt: string; styleFrame: string; creatorPhoto: string | null }): Promise<Buffer> {
  const instructions = opts.creatorPhoto
    ? `Image 1 is the creator: keep their face and identity exactly. Image 2 is a composition and mood reference from another video only; do not copy that person.`
    : `The image is a composition and mood reference from another video only; do not copy that person. Invent a new, distinct person.`;
  const input = [
    {
      type: "text" as const,
      text: `${instructions}\n\nCreate a photorealistic vertical 9:16 frame that looks like it was filmed on a phone for TikTok: ${opts.prompt}\n\nNo text, captions, logos or watermarks in the image.`,
    },
    ...(opts.creatorPhoto ? [await imagePart(opts.creatorPhoto)] : []),
    await imagePart(opts.styleFrame),
  ];

  const interaction = await client().interactions.create({
    model: config.geminiImageModel(),
    input,
    response_format: { type: "image", mime_type: "image/png", aspect_ratio: "9:16", image_size: "2K" },
  });
  const data = interaction.output_image?.data;
  if (!data) throw new Error(`Nano Banana returned no image${interaction.output_text ? `: ${interaction.output_text}` : ""}`);
  return Buffer.from(data, "base64");
}

export async function animateHook(opts: { image: string; prompt: string; durationSec: number }): Promise<Uint8Array> {
  const ai = client();
  const seconds = Math.round(opts.durationSec);
  const interaction = await ai.interactions.create({
    model: config.geminiVideoModel(),
    input: [
      await imagePart(opts.image),
      {
        type: "text",
        text: `Use this image as the first frame of a ${seconds}-second vertical phone video. [0-${seconds}s] ${opts.prompt} One continuous handheld shot. No dialogue, no on-screen text, no captions.`,
      },
    ],
    response_format: { type: "video", aspect_ratio: "9:16", resolution: "720p", delivery: "uri" },
  });

  const video = interaction.output_video;
  if (video?.data) return Buffer.from(video.data, "base64");
  const fileId = video?.uri?.match(/files\/([\w-]+)/)?.[1];
  if (!video?.uri || !fileId) throw new Error(`Gemini returned no video${interaction.output_text ? `: ${interaction.output_text}` : ""}`);

  await waitUntilActive(ai, `files/${fileId}`);
  const res = await fetch(video.uri, { headers: { "x-goog-api-key": config.geminiApiKey() } });
  if (!res.ok) throw new Error(`Downloading the hook video failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}
