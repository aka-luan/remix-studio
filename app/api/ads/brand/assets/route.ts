import { rm } from "node:fs/promises";
import path from "node:path";
import { fileField, handle, textField } from "@/lib/ads/http";
import { UserError } from "@/lib/ads/service";
import { adsPath, saveAsset, shortId, updateBrand } from "@/lib/ads/store";
import type { AssetKind } from "@/lib/ads/types";

export const runtime = "nodejs";

const ALLOWED: Record<AssetKind, string[]> = {
  logo: [".png", ".jpg", ".jpeg", ".webp", ".svg"],
  screenshot: [".png", ".jpg", ".jpeg", ".webp"],
  photo: [".png", ".jpg", ".jpeg", ".webp"],
  font: [".woff2", ".woff", ".ttf", ".otf"],
};

export function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const kind = textField(form, "kind") as AssetKind;
    const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!ALLOWED[kind]) throw new UserError("Unknown asset type.");
    if (!files.length) throw new UserError("Choose a file to upload.");
    const added: { file: string; label: string }[] = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED[kind].includes(ext)) throw new UserError(`${file.name}: ${kind} files must be ${ALLOWED[kind].join(", ")}.`);
      if (file.size > 15 * 1024 * 1024) throw new UserError(`${file.name} is larger than 15 MB.`);
      const label = textField(form, "label") || path.basename(file.name, ext);
      added.push({ file: await saveAsset(`${kind}-${shortId()}${ext}`, new Uint8Array(await file.arrayBuffer())), label });
    }
    return updateBrand((b) => ({
      ...b,
      assets: [...b.assets, ...added.map((a) => ({ ...a, kind, addedAt: new Date().toISOString() }))],
      logoFile: kind === "logo" ? added[0].file : b.logoFile,
    }));
  });
}

export function DELETE(request: Request) {
  return handle(async () => {
    const file = new URL(request.url).searchParams.get("file") ?? "";
    const full = file.startsWith("assets/") ? adsPath(file) : null;
    if (!full) throw new UserError("Bad asset path.");
    const brand = await updateBrand((b) => ({ ...b, assets: b.assets.filter((a) => a.file !== file), logoFile: b.logoFile === file ? null : b.logoFile }));
    await rm(full, { force: true });
    return brand;
  });
}
