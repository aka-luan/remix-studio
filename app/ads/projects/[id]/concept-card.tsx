"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { claimWarnings } from "@/lib/ads/claims";
import { ASPECTS, type Aspect, type Brand, type Concept, type ConceptDraft, type Project } from "@/lib/ads/types";
import { AdPreview, adsFile, AWARENESS_LABELS, errorText } from "../../shared";

type Fields = Pick<ConceptDraft, "title" | "angle" | "audience" | "awarenessStage" | "hook" | "visualDescription" | "imagePrompt" | "headline" | "supportingCopy" | "primaryText" | "cta" | "hypothesis">;
const FIELD_KEYS: (keyof Fields)[] = ["title", "angle", "audience", "awarenessStage", "hook", "visualDescription", "imagePrompt", "headline", "supportingCopy", "primaryText", "cta", "hypothesis"];
const pick = (c: Concept): Fields => Object.fromEntries(FIELD_KEYS.map((k) => [k, c[k]])) as Fields;

export function ConceptCard({ concept, brand, project, onProject }: { concept: Concept; brand: Brand; project: Project; onProject: (p: Project) => void }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Fields>(() => pick(concept));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>("4:5");
  const base = `/api/ads/projects/${project.id}/concepts/${concept.id}`;

  const shown = editing ? fields : pick(concept);
  const warnings = claimWarnings(shown, brand);
  const approved = concept.status === "approved";
  const exports = project.exports.filter((e) => e.conceptId === concept.id).length;
  const refCandidates = brand.assets.filter((a) => a.kind === "photo" || a.kind === "screenshot" || (a.kind === "logo" && !a.file.endsWith(".svg")));

  async function run(label: string, fn: () => Promise<Project>) {
    setBusy(label);
    setError(null);
    try {
      onProject(await fn());
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const patch = (body: Partial<Concept>) => api<Project>(base, { method: "PATCH", body: JSON.stringify(body) });

  async function save() {
    if (await run("save", () => patch(fields))) setEditing(false);
  }

  async function setStatus(status: Concept["status"]) {
    if (await run(status, () => patch(editing ? { ...fields, status } : { status }))) setEditing(false);
  }

  const toggleRef = (file: string) =>
    run("refs", () => patch({ imageRefs: concept.imageRefs.includes(file) ? concept.imageRefs.filter((f) => f !== file) : [...concept.imageRefs, file] }));

  const generate = () => run("image", () => api<Project>(`${base}/images`, { method: "POST", body: JSON.stringify({ aspect }) }));

  async function remove() {
    if (!confirm(`Delete concept ${concept.id}?`)) return;
    await run("delete", () => api<Project>(base, { method: "DELETE" }));
  }

  const input = (k: keyof Fields, label: string, rows = 0) => (
    <label key={k}>
      {label}
      {rows ? (
        <textarea rows={rows} value={String(fields[k])} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
      ) : (
        <input value={String(fields[k])} onChange={(e) => setFields({ ...fields, [k]: e.target.value })} />
      )}
    </label>
  );

  return (
    <article className={`panel concept concept-${concept.status}`}>
      <header className="concept-head">
        <div>
          <span className="concept-id">{concept.id}</span>
          <h3>{shown.title}</h3>
          <div className="chips">
            {shown.angle && <span className="chip">{shown.angle}</span>}
            {shown.audience && <span className="chip">{shown.audience}</span>}
            <span className="chip">{AWARENESS_LABELS[shown.awarenessStage]}</span>
            {concept.mock && <span className="chip chip-warn">mock</span>}
          </div>
        </div>
        <span className={`pill ${approved ? "pill-done" : "pill-needs-review"}`}>{approved ? "Approved" : "Draft"}</span>
      </header>

      {editing ? (
        <div className="form concept-form">
          <div className="row2">
            {input("title", "Title")}
            {input("angle", "Angle")}
          </div>
          <div className="row2">
            <label>
              Audience
              <input list={`aud-${concept.id}`} value={fields.audience} onChange={(e) => setFields({ ...fields, audience: e.target.value })} />
              <datalist id={`aud-${concept.id}`}>
                {brand.audiences.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <label>
              Awareness stage
              <select value={fields.awarenessStage} onChange={(e) => setFields({ ...fields, awarenessStage: e.target.value as Fields["awarenessStage"] })}>
                {Object.entries(AWARENESS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {input("hook", "Hook", 2)}
          {input("headline", "Headline (on image)")}
          {input("supportingCopy", "Supporting copy (on image)", 2)}
          {input("cta", "CTA")}
          {input("primaryText", "Primary text (above the ad in Meta)", 4)}
          {input("visualDescription", "Visual description", 2)}
          {input("imagePrompt", "Image prompt (English, no text in image)", 3)}
          {input("hypothesis", "Hypothesis to test", 2)}
        </div>
      ) : (
        <div className="concept-body">
          <p className="concept-hook">“{concept.hook || "No hook yet"}”</p>
          <dl className="analysis">
            <dt>Headline</dt>
            <dd>{concept.headline}</dd>
            {concept.supportingCopy && (
              <>
                <dt>Supporting copy</dt>
                <dd>{concept.supportingCopy}</dd>
              </>
            )}
            <dt>CTA</dt>
            <dd>{concept.cta}</dd>
            <dt>Primary text</dt>
            <dd className="pre">{concept.primaryText || "—"}</dd>
            <dt>Visual</dt>
            <dd>{concept.visualDescription || "—"}</dd>
            <dt>Hypothesis</dt>
            <dd>{concept.hypothesis || "—"}</dd>
          </dl>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="notice warn-box">
          <p>
            <strong>Check claims:</strong>
          </p>
          <ul className="bullets">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="row-actions">
        {editing ? (
          <>
            <button className="primary small" onClick={save} disabled={Boolean(busy)}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            <button
              className="small"
              onClick={() => {
                setFields(pick(concept));
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            className="small"
            onClick={() => {
              setFields(pick(concept));
              setEditing(true);
            }}
          >
            Edit
          </button>
        )}
        {approved ? (
          <button className="small quiet" onClick={() => setStatus("draft")} disabled={Boolean(busy)}>
            Back to draft
          </button>
        ) : (
          <button className="small primary" onClick={() => setStatus("approved")} disabled={Boolean(busy)}>
            {editing ? "Save & approve" : "Approve"}
          </button>
        )}
        <button className="small quiet danger" onClick={remove} disabled={Boolean(busy)}>
          Delete
        </button>
      </div>

      {approved && (
        <section className="concept-images">
          <div className="concept-images-head">
            <strong>Images</strong>
            <span className="muted small-text">Text-free backgrounds from Nano Banana. Copy is overlaid in HTML.</span>
          </div>
          {refCandidates.length > 0 && (
            <div className="ref-pick">
              <span className="small-text muted">Image references:</span>
              {refCandidates.map((a) => (
                <button
                  key={a.file}
                  className={`ref-thumb${concept.imageRefs.includes(a.file) ? " on" : ""}`}
                  onClick={() => toggleRef(a.file)}
                  title={`${a.label} (${a.kind})`}
                  aria-pressed={concept.imageRefs.includes(a.file)}
                  disabled={Boolean(busy)}
                >
                  <img src={adsFile(a.file)} alt={a.label} />
                </button>
              ))}
            </div>
          )}
          <div className="gen-row">
            <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Image aspect ratio">
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a} {a === "4:5" ? "(feed)" : a === "9:16" ? "(stories)" : "(square)"}
                </option>
              ))}
            </select>
            <button className="primary small" onClick={generate} disabled={Boolean(busy)}>
              {busy === "image" ? "Generating…" : concept.versions.length ? "New version" : "Generate image"}
            </button>
          </div>
          {concept.versions.length > 0 && (
            <div className="concept-creative">
              <AdPreview brand={brand} concept={concept} format="feed" width={220} />
              <div className="version-col">
                <div className="versions">
                  {concept.versions.map((v) => (
                    <button
                      key={v.id}
                      className={`version${v.id === concept.selectedVersionId ? " on" : ""}`}
                      onClick={() => run("select", () => patch({ selectedVersionId: v.id }))}
                      title={`Version ${v.n} · ${v.aspect}${v.mock ? " · mock" : ""}`}
                    >
                      <img src={adsFile(v.file)} alt={`Version ${v.n}`} />
                      <span>V{v.n}</span>
                    </button>
                  ))}
                </div>
                <Link className="button primary small" href={`/ads/projects/${project.id}/${concept.id}`}>
                  Open editor →
                </Link>
                {exports > 0 && <small className="muted">{exports} PNG exported</small>}
              </div>
            </div>
          )}
        </section>
      )}
    </article>
  );
}
