import { adsStatus, AiError, buildImagePrompt, generateConcepts, generateImage } from "./ai";
import { dataUri, renderPng } from "./render";
import { listProjects, listReferences, loadBrand, loadProject, newId, shortId, updateProject, writeProjectFile } from "./store";
import { screenshotFor, templateInputFor, versionFor } from "./templates";
import {
  FORMATS,
  PLACEMENTS,
  type Aspect,
  type Concept,
  type ConceptDraft,
  type ExportMetadata,
  type ExportRecord,
  type FormatId,
  type LibraryItem,
  type Project,
} from "./types";

export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function errorStatus(err: unknown): number {
  if (err instanceof UserError) return err.status;
  if (err instanceof AiError) return 502;
  return 500;
}

export function newProject(input: { name: string; audience: string; brief: string; referenceIds: string[] }): Project {
  return { id: newId(), createdAt: new Date().toISOString(), conceptSeq: 0, concepts: [], exports: [], ...input };
}

function conceptFrom(draft: ConceptDraft, project: Project, seq: number, mock: boolean, screenshot: string | null): Concept {
  return {
    ...draft,
    id: `${project.id.slice(-6).toUpperCase()}-C${String(seq).padStart(2, "0")}`,
    status: "draft",
    createdAt: new Date().toISOString(),
    mock,
    imageRefs: [],
    versions: [],
    selectedVersionId: null,
    layout: {
      template: draft.useScreenshot && screenshot ? "showcase" : "overlay",
      logo: "top-left",
      screenshotFile: null,
      ctaStyle: "pill",
      scrim: 60,
    },
  };
}

export function blankDraft(audience: string): ConceptDraft {
  return {
    title: "Novo conceito",
    angle: "",
    audience,
    awarenessStage: "problem-aware",
    hook: "",
    visualDescription: "",
    imagePrompt: "",
    headline: "Título do anúncio",
    supportingCopy: "",
    primaryText: "",
    cta: "Saiba mais",
    hypothesis: "",
    useScreenshot: false,
  };
}

export async function addConcepts(projectId: string, count: number, blank = false): Promise<Project> {
  const project = await loadProject(projectId);
  if (!project) throw new UserError("Project not found", 404);
  const brand = await loadBrand();
  let drafts: ConceptDraft[];
  if (blank) drafts = [blankDraft(project.audience)];
  else {
    const refs = (await listReferences()).filter((r) => project.referenceIds.includes(r.id));
    drafts = await generateConcepts({
      brand,
      references: refs,
      audience: project.audience,
      brief: project.brief,
      count: Math.max(1, Math.min(6, count)),
      avoid: project.concepts.map((c) => c.angle).filter(Boolean),
    });
  }
  const mock = !blank && adsStatus().mock;
  const shot = brand.assets.find((a) => a.kind === "screenshot")?.file ?? null;
  const updated = await updateProject(projectId, (p) => {
    let seq = p.conceptSeq;
    const concepts = drafts.map((d) => conceptFrom(d, p, ++seq, mock, shot));
    return { ...p, conceptSeq: seq, concepts: [...p.concepts, ...concepts] };
  });
  return updated!;
}

const EDITABLE: (keyof Concept)[] = [
  "title", "angle", "audience", "awarenessStage", "hook", "visualDescription", "imagePrompt", "headline",
  "supportingCopy", "primaryText", "cta", "hypothesis", "useScreenshot", "status", "imageRefs", "selectedVersionId", "layout",
];

export async function patchConcept(projectId: string, conceptId: string, patch: Partial<Concept>): Promise<Project> {
  const updated = await updateProject(projectId, (p) => {
    const i = p.concepts.findIndex((c) => c.id === conceptId);
    if (i < 0) throw new UserError("Concept not found", 404);
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => EDITABLE.includes(k as keyof Concept)));
    const next = { ...p.concepts[i], ...clean } as Concept;
    if (patch.layout) next.layout = { ...p.concepts[i].layout, ...patch.layout };
    if (next.selectedVersionId && !next.versions.some((v) => v.id === next.selectedVersionId)) throw new UserError("Unknown image version");
    const concepts = [...p.concepts];
    concepts[i] = next;
    return { ...p, concepts };
  });
  if (!updated) throw new UserError("Project not found", 404);
  return updated;
}

export async function deleteConcept(projectId: string, conceptId: string): Promise<Project> {
  const updated = await updateProject(projectId, (p) => ({ ...p, concepts: p.concepts.filter((c) => c.id !== conceptId) }));
  if (!updated) throw new UserError("Project not found", 404);
  return updated;
}

/** Generates one new background version. Only approved concepts may spend image credits. */
export async function generateVersion(projectId: string, conceptId: string, opts: { aspect: Aspect; prompt?: string }): Promise<Project> {
  const project = await loadProject(projectId);
  const concept = project?.concepts.find((c) => c.id === conceptId);
  if (!project || !concept) throw new UserError("Concept not found", 404);
  if (concept.status !== "approved") throw new UserError("Approve the concept before generating images.");
  const brand = await loadBrand();
  const valid = new Set(brand.assets.map((a) => a.file));
  const refs = concept.imageRefs.filter((f) => valid.has(f) && !/\.(svg|ttf|otf|woff2?)$/i.test(f));
  // The no-text and palette rules are always appended, even to a custom prompt.
  const prompt = buildImagePrompt({ ...concept, imagePrompt: opts.prompt?.trim() || concept.imagePrompt }, brand, opts.aspect, refs.length > 0);
  const n = Math.max(0, ...concept.versions.map((v) => v.n)) + 1;
  const image = await generateImage({ prompt, aspect: opts.aspect, refs, brand, seedLabel: `${concept.id}-${n}-${Date.now()}` });
  const file = await writeProjectFile(projectId, "images", `${concept.id}-v${n}-${shortId()}${image.ext}`, image.data);
  const version = { id: shortId(), n, file, prompt, aspect: opts.aspect, createdAt: new Date().toISOString(), mock: image.mock };
  const updated = await updateProject(projectId, (p) => ({
    ...p,
    concepts: p.concepts.map((c) => (c.id === conceptId ? { ...c, versions: [...c.versions, version], selectedVersionId: version.id } : c)),
  }));
  return updated!;
}

export async function exportConcept(projectId: string, conceptId: string, formats: FormatId[]): Promise<{ project: Project; exports: ExportRecord[] }> {
  const project = await loadProject(projectId);
  const concept = project?.concepts.find((c) => c.id === conceptId);
  if (!project || !concept) throw new UserError("Concept not found", 404);
  if (!concept.headline.trim()) throw new UserError("Add a headline before exporting.");
  const brand = await loadBrand();
  const wanted = FORMATS.filter((f) => formats.includes(f.id));
  if (!wanted.length) throw new UserError("Pick at least one format.");

  const files = [...concept.versions.map((v) => v.file), brand.logoFile, screenshotFor(brand, concept), ...brand.assets.filter((a) => a.kind === "font").map((a) => a.file)].filter(
    (f): f is string => Boolean(f),
  );
  const inlined = new Map(await Promise.all(files.map(async (f) => [f, await dataUri(f)] as const)));
  const status = adsStatus();

  const records: ExportRecord[] = [];
  for (const f of wanted) {
    const version = versionFor(concept, f.id);
    const variant = `V${version?.n ?? 0}-${concept.layout.template}`;
    const png = await renderPng(templateInputFor(brand, concept, f.id, (rel) => inlined.get(rel) ?? ""));
    const base = `${concept.id}-${variant}-${f.id}`;
    const meta: ExportMetadata = {
      conceptId: concept.id,
      projectId: project.id,
      projectName: project.name,
      variant,
      format: { id: f.id, width: f.width, height: f.height, placement: PLACEMENTS[f.id] },
      title: concept.title,
      angle: concept.angle,
      audience: concept.audience,
      awarenessStage: concept.awarenessStage,
      copy: { hook: concept.hook, headline: concept.headline, supportingCopy: concept.supportingCopy, primaryText: concept.primaryText, cta: concept.cta },
      hypothesis: concept.hypothesis,
      template: concept.layout.template,
      image: { versionId: version?.id ?? null, prompt: version?.prompt ?? null, mock: version?.mock ?? false, model: version && !version.mock ? status.imageModel : null },
      language: "pt-BR",
      exportedAt: new Date().toISOString(),
    };
    records.push({
      id: shortId(),
      conceptId: concept.id,
      versionId: version?.id ?? null,
      variant,
      format: f.id,
      file: await writeProjectFile(projectId, "exports", `${base}.png`, png),
      metaFile: await writeProjectFile(projectId, "exports", `${base}.json`, JSON.stringify(meta, null, 2)),
      createdAt: meta.exportedAt,
    });
  }
  const updated = await updateProject(projectId, (p) => ({
    ...p,
    exports: [...p.exports.filter((e) => !records.some((r) => r.file === e.file)), ...records],
  }));
  return { project: updated!, exports: records };
}

export async function libraryItems(): Promise<LibraryItem[]> {
  const projects = await listProjects();
  return projects
    .flatMap((p) =>
      p.exports.map((e) => {
        const c = p.concepts.find((x) => x.id === e.conceptId);
        return { ...e, projectId: p.id, projectName: p.name, title: c?.title ?? e.conceptId, angle: c?.angle ?? "", audience: c?.audience ?? "", headline: c?.headline ?? "" };
      }),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
