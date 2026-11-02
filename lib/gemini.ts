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

// Two passes, because asking the model to swap the person inside a real photo is a face swap and gets blocked:
// first the scene without anyone in it, then a new person placed into that scene, matching the original pose.
export async function generateAvatar(opts: { prompt: string; styleFrame: string; creatorPhoto: string | null }): Promise<Buffer> {
  const frame = await imagePart(opts.styleFrame);
  const plate = await generateImage([
    {
      type: "text",
      text: "Remove the person and all overlaid text from this photo. Fill in the background naturally so it shows the empty scene. Keep the camera angle, framing, lighting and colors exactly the same.",
    },
    frame,
  ]);

  const identity = opts.creatorPhoto
    ? "The new person is the person in Image 3: keep their face and identity. Take only pose, expression and clothing from Image 2, nothing from Image 3."
    : "The new person is not the person in Image 2: same apparent gender and age range, but a clearly different face, hair color and hairstyle.";
  return generateImage([
    {
      type: "text",
      text: `Image 1 is an empty scene. Image 2 is a pose reference. Place a fictional adult into the Image 1 scene. Keep every pixel of Image 1's background as it is: same walls, objects, colors, lighting, camera angle and framing. Do not redraw, restyle or replace the scene. Match Image 2's position in frame, body pose, hand placement, gaze, facial expression and clothing. ${identity}\n\nDescription of the person only (ignore any setting or lighting it mentions; the scene comes from Image 1): ${opts.prompt}\n\nPhotorealistic vertical 9:16 phone frame. No text, captions, logos or watermarks.`,
    },
    { type: "image", mime_type: "image/jpeg", data: plate.toString("base64") },
    frame,
    ...(opts.creatorPhoto ? [await imagePart(opts.creatorPhoto)] : []),
  ]);
}

type ImageInput = { type: "text"; text: string } | Awaited<ReturnType<typeof imagePart>>;

async function generateImage(input: ImageInput[]): Promise<Buffer> {
  const interaction = await client().interactions.create({
    model: config.geminiImageModel(),
    input,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "2K" },
  }, { maxRetries: 0 });
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
