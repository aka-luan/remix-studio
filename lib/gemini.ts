import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

function client() {
  return new GoogleGenAI({ apiKey: config.geminiApiKey() });
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function imagePart(file: string) {
  const mime = IMAGE_MIME[path.extname(file).toLowerCase()] ?? "image/jpeg";
  return { type: "image" as const, mime_type: mime, data: (await readFile(file)).toString("base64") };
}

export async function transcribe(audioFile: string): Promise<string> {
  const interaction = await client().interactions.create({
    model: config.geminiTranscribeModel(),
    input: [
      { type: "text", text: "Transcribe the speech in this audio verbatim. If there is no speech (only music or noise), reply with exactly: (no speech)" },
      { type: "audio", mime_type: "audio/mp3", data: (await readFile(audioFile)).toString("base64") },
    ],
  });
  return interaction.output_text?.trim() ?? "";
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
