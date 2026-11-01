import path from "node:path";
import { NextResponse } from "next/server";
import { reconcile, runPipeline } from "@/lib/pipeline";
import type { Remix } from "@/lib/remix";
import { listRemixes, newRemixId, saveRemix, writeArtifact } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const remixes = await Promise.all((await listRemixes()).map(reconcile));
  return NextResponse.json(remixes);
}

function fileField(form: FormData, name: string): File | null {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function textField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function extension(file: File, fallback: string): string {
  return path.extname(file.name).toLowerCase() || fallback;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const sourceUrl = textField(form, "sourceUrl");
  const sourceFile = fileField(form, "sourceFile");
  const demo = fileField(form, "demoFile");
  const avatarRef = fileField(form, "avatarFile");
  const product = { name: textField(form, "productName"), description: textField(form, "productDescription") };

  const problems = [
    !sourceUrl && !sourceFile && "Paste a TikTok/Instagram link or upload the source video.",
    sourceUrl && !/^https?:\/\//.test(sourceUrl) && "The source link must start with http:// or https://.",
    !product.name && "Give your product a name.",
    !product.description && "Describe what your product does.",
    !demo && "Upload a screen recording of your product demo.",
    avatarRef && ![".png", ".jpg", ".jpeg", ".webp"].includes(extension(avatarRef, "")) && "The creator photo must be a PNG, JPEG or WebP (iPhone HEIC photos: export as JPEG first).",
  ].filter(Boolean);
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 400 });

  const id = newRemixId();
  const save = async (file: File, name: string) => writeArtifact(id, name, new Uint8Array(await file.arrayBuffer()));

  const remix: Remix = {
    id,
    createdAt: new Date().toISOString(),
    input: {
      sourceUrl: sourceFile ? null : sourceUrl,
      product,
      demoFile: await save(demo!, `demo${extension(demo!, ".mp4")}`),
      avatarRefFile: avatarRef ? await save(avatarRef, `creator${extension(avatarRef, ".jpg")}`) : null,
    },
    run: { state: "idle" },
  };
  if (sourceFile) await save(sourceFile, "source.mp4");
  await saveRemix(remix);
  void runPipeline(id);
  return NextResponse.json({ id }, { status: 201 });
}
