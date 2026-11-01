import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Remix } from "./remix";

const ROOT = path.join(process.cwd(), "data", "remixes");

export function remixDir(id: string): string {
  return path.join(ROOT, id);
}

export function artifactPath(id: string, file: string): string {
  return path.join(remixDir(id), path.basename(file));
}

export function newRemixId(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function saveRemix(remix: Remix): Promise<void> {
  const dir = remixDir(remix.id);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, "remix.json.tmp");
  await writeFile(tmp, JSON.stringify(remix, null, 2));
  await rename(tmp, path.join(dir, "remix.json"));
}

const locks: Map<string, Promise<unknown>> = ((globalThis as { __remixLocks?: Map<string, Promise<unknown>> }).__remixLocks ??= new Map());

export async function updateRemix(id: string, change: (current: Remix) => Remix): Promise<Remix | null> {
  const previous = locks.get(id) ?? Promise.resolve();
  const result = previous.then(async () => {
    const current = await loadRemix(id);
    if (!current) return null;
    const next = change(current);
    if (next !== current) await saveRemix(next);
    return next;
  });
  locks.set(id, result.catch(() => undefined));
  return result;
}

export async function loadRemix(id: string): Promise<Remix | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(remixDir(id), "remix.json"), "utf8")) as Remix;
  } catch {
    return null;
  }
}

export async function listRemixes(): Promise<Remix[]> {
  await mkdir(ROOT, { recursive: true });
  const ids = await readdir(ROOT);
  const remixes = await Promise.all(ids.map(loadRemix));
  return remixes.filter((r): r is Remix => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeArtifact(id: string, file: string, data: Uint8Array | string): Promise<string> {
  await mkdir(remixDir(id), { recursive: true });
  await writeFile(artifactPath(id, file), data);
  return path.basename(file);
}
