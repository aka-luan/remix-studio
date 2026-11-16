"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { claimWarnings } from "@/lib/ads/claims";
import { dimensions, screenshotFor, versionFor } from "@/lib/ads/templates";
import { ASPECTS, FORMATS, TEMPLATES, type Aspect, type Brand, type Concept, type ExportRecord, type FormatId, type Layout, type Project } from "@/lib/ads/types";
import { AdPreview, adsFile, ErrorBox, errorText, notifyChanged, StatusBanner, useResource } from "../../../shared";

type Draft = Pick<Concept, "headline" | "supportingCopy" | "cta" | "primaryText" | "imagePrompt" | "layout">;
const toDraft = (c: Concept): Draft => ({ headline: c.headline, supportingCopy: c.supportingCopy, cta: c.cta, primaryText: c.primaryText, imagePrompt: c.imagePrompt, layout: c.layout });

const PREVIEW_HEIGHT = 720;

export default function EditorPage() {
  const { id, cid } = useParams<{ id: string; cid: string }>();
  const project = useResource<Project>(`/api/ads/projects/${id}`);
  const brand = useResource<Brand>("/api/ads/brand").data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [format, setFormat] = useState<FormatId>("feed");
  const [formats, setFormats] = useState<FormatId[]>(["feed", "story", "square"]);
  const [aspect, setAspect] = useState<Aspect>("4:5");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [lastExport, setLastExport] = useState<ExportRecord[] | null>(null);
  const lastSaved = useRef<string>("");
  const latest = useRef<string>("");

  const concept = project.data?.concepts.find((c) => c.id === cid);
  useEffect(() => {
    if (concept && !draft) {
      setDraft(toDraft(concept));
      lastSaved.current = JSON.stringify(toDraft(concept));
    }
  }, [concept, draft]);

  // Leaving the editor (link, back button, closing the tab) must not drop an edit still waiting for autosave.
  useEffect(() => {
    const url = `/api/ads/projects/${id}/concepts/${cid}`;
    const flushPending = () => {
      if (latest.current && latest.current !== lastSaved.current) {
        void fetch(url, { method: "PATCH", body: latest.current, keepalive: true });
        lastSaved.current = latest.current;
      }
    };
    window.addEventListener("pagehide", flushPending);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      flushPending();
    };
  }, [id, cid]);

  // Autosave edits shortly after typing stops.
  useEffect(() => {
    if (!draft) return;
    const body = JSON.stringify(draft);
    latest.current = body;
    if (body === lastSaved.current) return;
    setSaveState("pending");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        project.set(await api<Project>(`/api/ads/projects/${id}/concepts/${cid}`, { method: "PATCH", body }));
        lastSaved.current = body;
        setSaveState("saved");
      } catch (err) {
        setSaveState("error");
        setError(errorText(err));
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, id, cid]);

  if (!project.data || !brand || !draft) return <div className="ads-page">{project.error ? <ErrorBox error={project.error} /> : <p className="muted">Loading…</p>}</div>;
  if (!concept) return <div className="ads-page">Concept not found. <Link href={`/ads/projects/${id}`}>Back to project</Link></div>;

  const live: Concept = { ...concept, ...draft };
  const setLayout = (patch: Partial<Layout>) => setDraft({ ...draft, layout: { ...draft.layout, ...patch } });
  const { width: W, height: H } = dimensions(format);
  const previewWidth = Math.min(560, Math.round((PREVIEW_HEIGHT * W) / H));
  const version = versionFor(live, format);
  const fmtAspect = FORMATS.find((f) => f.id === format)!.aspect;
  const warnings = claimWarnings(live, brand);
  const screenshots = brand.assets.filter((a) => a.kind === "screenshot");
  const exports = project.data.exports.filter((e) => e.conceptId === cid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function flush() {
    const body = JSON.stringify(draft);
    if (body === lastSaved.current) return;
    project.set(await api<Project>(`/api/ads/projects/${id}/concepts/${cid}`, { method: "PATCH", body }));
    lastSaved.current = body;
    setSaveState("saved");
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await flush();
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const generate = () =>
    run("image", async () => {
      project.set(await api<Project>(`/api/ads/projects/${id}/concepts/${cid}/images`, { method: "POST", body: JSON.stringify({ aspect }) }));
      notifyChanged();
    });

  const selectVersion = (vid: string) =>
    run("select", async () => {
      project.set(await api<Project>(`/api/ads/projects/${id}/concepts/${cid}`, { method: "PATCH", body: JSON.stringify({ selectedVersionId: vid }) }));
    });

  const exportPngs = () =>
    run("export", async () => {
      const res = await api<{ project: Project; exports: ExportRecord[] }>(`/api/ads/projects/${id}/concepts/${cid}/export`, { method: "POST", body: JSON.stringify({ formats }) });
      project.set(res.project);
      setLastExport(res.exports);
      notifyChanged();
    });

  return (
    <div className="ads-page editor">
      <header className="ads-head">
        <div>
          <Link href={`/ads/projects/${id}`} className="back">
            ← {project.data.name}
          </Link>
          <h1>
            <span className="concept-id">{concept.id}</span> {concept.title}
          </h1>
          <p className="muted">
            {concept.angle} · {concept.audience} · {concept.status === "approved" ? "approved" : "draft"}
          </p>
        </div>
        <span className={`muted small-text save-${saveState}`}>
          {saveState === "saving" ? "Saving…" : saveState === "pending" ? "Editing…" : saveState === "error" ? "Not saved" : "All changes saved"}
        </span>
      </header>
      <StatusBanner />
      <ErrorBox error={error} onDismiss={() => setError(null)} />

      <div className="editor-grid">
        <div className="editor-stage">
          <div className="tabs" role="tablist">
            {FORMATS.map((f) => (
              <button key={f.id} role="tab" aria-selected={format === f.id} className={format === f.id ? "on" : ""} onClick={() => setFormat(f.id)}>
                {f.label}
                <small>
                  {f.width}×{f.height}
                </small>
              </button>
            ))}
          </div>
          <div className="stage">
            <AdPreview brand={brand} concept={live} format={format} width={previewWidth} />
            {format === "story" && <div className="safe-zones" style={{ width: previewWidth }} aria-hidden />}
          </div>
          <p className="muted small-text stage-note">
            Exact HTML that Playwright renders at {W}×{H}.{" "}
            {version && `This format uses background V${version.n} (${version.aspect}). `}
            {version && version.aspect !== fmtAspect && `Background is ${version.aspect} and is cropped to fit; generate a ${fmtAspect} version for this format.`}
            {format === "story" && " Shaded bands mark the areas Stories UI covers."}
          </p>
        </div>

        <div className="editor-controls">
          <section className="panel form">
            <h2>Copy</h2>
            <label>
              Headline
              <textarea rows={2} value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
            </label>
            <label>
              Supporting copy
              <textarea rows={2} value={draft.supportingCopy} onChange={(e) => setDraft({ ...draft, supportingCopy: e.target.value })} />
            </label>
            <label>
              CTA
              <input value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
            </label>
            <label>
              Primary text <small className="muted">Shown above the ad in Meta; saved to the JSON metadata</small>
              <textarea rows={4} value={draft.primaryText} onChange={(e) => setDraft({ ...draft, primaryText: e.target.value })} />
            </label>
            {warnings.length > 0 && (
              <div className="notice warn-box">
                <ul className="bullets">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel form">
            <h2>Layout</h2>
            <div className="template-pick" role="radiogroup" aria-label="Template">
              {TEMPLATES.map((t) => (
                <button key={t.id} role="radio" aria-checked={draft.layout.template === t.id} className={draft.layout.template === t.id ? "on" : ""} onClick={() => setLayout({ template: t.id })}>
                  <span className={`tpl-icon tpl-${t.id}`} aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="row2">
              <label>
                Logo
                <select value={draft.layout.logo} onChange={(e) => setLayout({ logo: e.target.value as Layout["logo"] })}>
                  <option value="top-left">Top left</option>
                  <option value="top-center">Top center</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom">Under the copy</option>
                  <option value="none">Hidden</option>
                </select>
              </label>
              <label>
                CTA style
                <select value={draft.layout.ctaStyle} onChange={(e) => setLayout({ ctaStyle: e.target.value as Layout["ctaStyle"] })}>
                  <option value="pill">Pill</option>
                  <option value="solid">Solid</option>
                  <option value="outline">Outline</option>
                </select>
              </label>
            </div>
            {draft.layout.template === "overlay" && (
              <label>
                Photo darkening: {draft.layout.scrim}%
                <input type="range" min={0} max={100} value={draft.layout.scrim} onChange={(e) => setLayout({ scrim: Number(e.target.value) })} />
              </label>
            )}
            {draft.layout.template === "showcase" && (
              <label>
                Product screenshot
                {screenshots.length ? (
                  <select value={screenshotFor(brand, live) ?? ""} onChange={(e) => setLayout({ screenshotFile: e.target.value || null })}>
                    {screenshots.map((s) => (
                      <option key={s.file} value={s.file}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <small className="muted">
                    No screenshots yet. <Link href="/ads/brand">Upload real product screenshots</Link> in the brand profile.
                  </small>
                )}
              </label>
            )}
          </section>

          <section className="panel form">
            <h2>Background</h2>
            {concept.status !== "approved" && <p className="notice">Approve this concept on the project page before generating images.</p>}
            {concept.versions.length > 0 && (
              <div className="versions">
                {concept.versions.map((v) => (
                  <button key={v.id} className={`version${v.id === concept.selectedVersionId ? " on" : ""}`} onClick={() => selectVersion(v.id)} title={v.prompt}>
                    <img src={adsFile(v.file)} alt={`Version ${v.n}`} />
                    <span>
                      V{v.n} · {v.aspect}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <label>
              Image prompt <small className="muted">The no-text rule and brand palette are always added</small>
              <textarea rows={4} value={draft.imagePrompt} onChange={(e) => setDraft({ ...draft, imagePrompt: e.target.value })} />
            </label>
            <div className="gen-row">
              <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Aspect ratio">
                {ASPECTS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <button className="primary small" onClick={generate} disabled={Boolean(busy) || concept.status !== "approved"}>
                {busy === "image" ? "Generating…" : concept.versions.length ? "Generate new version" : "Generate image"}
              </button>
            </div>
          </section>

          <section className="panel form">
            <h2>Export</h2>
            <div className="format-checks">
              {FORMATS.map((f) => (
                <label key={f.id} className="check">
                  <input
                    type="checkbox"
                    checked={formats.includes(f.id)}
                    onChange={(e) => setFormats(e.target.checked ? [...formats, f.id] : formats.filter((x) => x !== f.id))}
                  />
                  {f.label} <small className="muted">{f.width}×{f.height}</small>
                </label>
              ))}
            </div>
            <button className="primary" onClick={exportPngs} disabled={Boolean(busy) || !formats.length}>
              {busy === "export" ? "Rendering PNGs…" : `Export ${formats.length} PNG${formats.length === 1 ? "" : "s"} + JSON`}
            </button>
            {lastExport && <p className="ok small-text">Exported {lastExport.length} file(s) to data/ads/projects/{id}/exports.</p>}
            {exports.length > 0 && (
              <ul className="export-list">
                {exports.map((e) => (
                  <li key={e.id}>
                    <a href={adsFile(e.file)} target="_blank" rel="noreferrer" className="export-thumb">
                      <img src={adsFile(e.file)} alt="" />
                    </a>
                    <div>
                      <strong>{e.format}</strong> <span className="muted">{e.variant}</span>
                      <small className="muted">{new Date(e.createdAt).toLocaleString()}</small>
                    </div>
                    <span className="export-links">
                      <a href={adsFile(e.file, true)}>PNG</a>
                      <a href={adsFile(e.metaFile)} target="_blank" rel="noreferrer">
                        JSON
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
