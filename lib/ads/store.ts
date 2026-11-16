import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Brand, Project, Reference } from "./types";

export const ADS_ROOT = path.join(process.cwd(), "data", "ads");
const BRAND_FILE = path.join(ADS_ROOT, "brand.json");
export const ASSETS_DIR = path.join(ADS_ROOT, "assets");
const REFS_DIR = path.join(ADS_ROOT, "references");
const PROJECTS_DIR = path.join(ADS_ROOT, "projects");

const SAFE_ID = /^[\w-]+$/;

export function newId(): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${crypto.randomUUID().slice(0, 6)}`;
}

export const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

/** Resolves a path relative to data/ads, refusing anything that escapes it. */
export function adsPath(rel: string): string | null {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p === "." || p.includes(":"))) return null;
  const full = path.resolve(ADS_ROOT, ...parts);
  return full.startsWith(ADS_ROOT + path.sep) ? full : null;
}

async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${shortId()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

const locks: Map<string, Promise<unknown>> = ((globalThis as { __adsLocks?: Map<string, Promise<unknown>> }).__adsLocks ??= new Map());

function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const result = (locks.get(key) ?? Promise.resolve()).then(fn);
  locks.set(key, result.catch(() => undefined));
  return result;
}

// ---------- Brand ----------

// Only facts stated in the product brief. Pricing is left empty on purpose: add it once verified.
export const DEFAULT_BRAND: Brand = {
  name: "MandaFoto",
  website: "https://mandafoto.com.br",
  productDescription:
    "Plataforma de compartilhamento de fotos para eventos. O organizador cria um álbum, os convidados escaneiam um QR code e enviam fotos e vídeos, sem baixar aplicativo e sem criar conta.",
  audiences: ["Noivos e casamentos", "Festas de aniversário"],
  language: "Português do Brasil",
  tone: "Caloroso, simples e celebrativo. Fala direto com quem organiza a festa, sem exageros.",
  features: [
    "O organizador cria um álbum para o evento",
    "Convidados enviam fotos e vídeos escaneando um QR code",
    "Convidados não precisam baixar aplicativo",
    "Convidados não precisam criar conta",
    "Galeria compartilhada com as fotos de todos",
    "Telão de fotos ao vivo durante o evento",
  ],
  pricing: "",
  colors: { primary: "#7c3aed", secondary: "#1e1b4b", accent: "#f59e0b", background: "#faf7f2", text: "#1b1a17" },
  fonts: { heading: "Fraunces", body: "Inter" },
  logoFile: null,
  assets: [],
  updatedAt: new Date(0).toISOString(),
};

export async function loadBrand(): Promise<Brand> {
  const saved = await readJson<Partial<Brand>>(BRAND_FILE);
  return saved ? { ...DEFAULT_BRAND, ...saved, colors: { ...DEFAULT_BRAND.colors, ...saved.colors }, fonts: { ...DEFAULT_BRAND.fonts, ...saved.fonts } } : DEFAULT_BRAND;
}

export function updateBrand(change: (b: Brand) => Brand): Promise<Brand> {
  return locked("brand", async () => {
    const next = { ...change(await loadBrand()), updatedAt: new Date().toISOString() };
    await writeJson(BRAND_FILE, next);
    return next;
  });
}

export async function saveAsset(name: string, data: Uint8Array): Promise<string> {
  await mkdir(ASSETS_DIR, { recursive: true });
  await writeFile(path.join(ASSETS_DIR, name), data);
  return `assets/${name}`;
}

// ---------- References ----------

const refFile = (id: string) => path.join(REFS_DIR, id, "reference.json");

export async function loadReference(id: string): Promise<Reference | null> {
  return SAFE_ID.test(id) ? readJson<Reference>(refFile(id)) : null;
}

export async function listReferences(): Promise<Reference[]> {
  await mkdir(REFS_DIR, { recursive: true });
  const refs = await Promise.all((await readdir(REFS_DIR)).map(loadReference));
  return refs.filter((r): r is Reference => r !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveReference(ref: Reference, image?: { name: string; data: Uint8Array }): Promise<void> {
  if (image) {
    await mkdir(path.join(REFS_DIR, ref.id), { recursive: true });
    await writeFile(path.join(REFS_DIR, ref.id, image.name), image.data);
  }
  await writeJson(refFile(ref.id), ref);
}

export function updateReference(id: string, change: (r: Reference) => Reference): Promise<Reference | null> {
  return locked(`ref:${id}`, async () => {
    const current = await loadReference(id);
    if (!current) return null;
    const next = change(current);
    await writeJson(refFile(id), next);
    return next;
  });
}

export async function deleteReference(id: string): Promise<void> {
  if (SAFE_ID.test(id)) await rm(path.join(REFS_DIR, id), { recursive: true, force: true });
}

export const referenceImagePath = (r: Reference) => `references/${r.id}/${r.imageFile}`;

// ---------- Projects ----------

export const projectDir = (id: string) => path.join(PROJECTS_DIR, id);
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

export async function loadProject(id: string): Promise<Project | null> {
  return SAFE_ID.test(id) ? readJson<Project>(projectFile(id)) : null;
}

export async function listProjects(): Promise<Project[]> {
  await mkdir(PROJECTS_DIR, { recursive: true });
  const projects = await Promise.all((await readdir(PROJECTS_DIR)).map(loadProject));
  return projects.filter((p): p is Project => p !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveProject(p: Project): Promise<void> {
  await writeJson(projectFile(p.id), p);
}

export function updateProject(id: string, change: (p: Project) => Project | Promise<Project>): Promise<Project | null> {
  return locked(`project:${id}`, async () => {
    const current = await loadProject(id);
    if (!current) return null;
    const next = await change(current);
    if (next !== current) await saveProject(next);
    return next;
  });
}

export async function deleteProject(id: string): Promise<void> {
  if (SAFE_ID.test(id)) await rm(projectDir(id), { recursive: true, force: true });
}

/** Writes a file into a project subfolder and returns its path relative to data/ads. */
export async function writeProjectFile(id: string, sub: "images" | "exports", name: string, data: Uint8Array | string): Promise<string> {
  const dir = path.join(projectDir(id), sub);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, path.basename(name)), data);
  return `projects/${id}/${sub}/${path.basename(name)}`;
}
