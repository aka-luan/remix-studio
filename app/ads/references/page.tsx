"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { Reference } from "@/lib/ads/types";
import { adsFile, AWARENESS_LABELS, ErrorBox, errorText, notifyChanged, StatusBanner, useResource } from "../shared";

export default function ReferencesPage() {
  const refs = useResource<Reference[]>("/api/ads/references");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function upload(files: FileList | File[]) {
    setError(null);
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setBusy(`Analyzing ${i + 1} of ${list.length}…`);
      const body = new FormData();
      body.set("image", file);
      body.set("note", note);
      try {
        const ref = await api<Reference>("/api/ads/references", { method: "POST", body });
        refs.set((r) => [ref, ...(r ?? [])]);
      } catch (err) {
        setError(`${file.name}: ${errorText(err)}`);
      }
    }
    setNote("");
    setBusy(null);
    notifyChanged();
  }

  async function reanalyze(id: string) {
    setBusy(id);
    setError(null);
    try {
      const ref = await api<Reference>(`/api/ads/references/${id}`, { method: "POST", body: "{}" });
      refs.set((r) => r?.map((x) => (x.id === id ? ref : x)) ?? null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this reference?")) return;
    await api(`/api/ads/references/${id}`, { method: "DELETE" });
    refs.set((r) => r?.filter((x) => x.id !== id) ?? null);
    notifyChanged();
  }

  return (
    <div className="ads-page">
      <header className="ads-head">
        <div>
          <h1>Reference ads</h1>
          <p className="muted">
            Upload screenshots of ads you collected yourself (nothing is scraped from the Meta Ad Library). Gemini describes each one; a screenshot can&apos;t show
            results, so “why it may work” is only a hypothesis. Only the written analysis feeds concept generation: reference images never reach the image model.
          </p>
        </div>
      </header>
      <StatusBanner />

      <div
        className={`panel ref-upload${over ? " drop-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
      >
        <div>
          <strong>Drop ad screenshots here</strong>
          <small className="muted">PNG, JPEG or WebP. Several at once is fine.</small>
        </div>
        <input placeholder="Optional note (where you saw it, why it caught your eye)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="button primary">
          {busy?.startsWith("Analyzing") ? busy : "Choose files"}
          <input type="file" accept=".png,.jpg,.jpeg,.webp" multiple hidden disabled={Boolean(busy)} onChange={(e) => e.target.files && upload(e.target.files)} />
        </label>
      </div>
      <ErrorBox error={error ?? refs.error} onDismiss={() => setError(null)} />

      {refs.data?.length === 0 && <p className="muted">No references yet. They&apos;re optional: concepts can be generated from the brand profile alone.</p>}
      <ul className="ref-grid">
        {refs.data?.map((r) => (
          <li key={r.id} className="panel ref-card">
            <a href={adsFile(`references/${r.id}/${r.imageFile}`)} target="_blank" rel="noreferrer" className="ref-img">
              <img src={adsFile(`references/${r.id}/${r.imageFile}`)} alt="Reference ad" />
            </a>
            <div className="ref-body">
              {r.note && <p className="muted small-text">Note: {r.note}</p>}
              {r.error && <p className="error small-text">Analysis failed: {r.error}</p>}
              {r.analysis ? (
                <>
                  <div className="chips">
                    <span className="chip">{AWARENESS_LABELS[r.analysis.awarenessStage]}</span>
                    {r.analyzedWithMock && <span className="chip chip-warn">mock analysis</span>}
                  </div>
                  <dl className="analysis">
                    <dt>Hook</dt>
                    <dd>{r.analysis.hook}</dd>
                    {r.analysis.headline && (
                      <>
                        <dt>Headline</dt>
                        <dd>{r.analysis.headline}</dd>
                      </>
                    )}
                    <dt>Composition</dt>
                    <dd>{r.analysis.composition}</dd>
                    <dt>Emotional appeal</dt>
                    <dd>{r.analysis.emotionalAppeal}</dd>
                    <dt>Value proposition</dt>
                    <dd>{r.analysis.valueProposition}</dd>
                    {r.analysis.cta && (
                      <>
                        <dt>CTA</dt>
                        <dd>{r.analysis.cta}</dd>
                      </>
                    )}
                    <dt>Why it may work (hypothesis)</dt>
                    <dd>{r.analysis.whyItMayWork}</dd>
                    <dt>Principles to borrow</dt>
                    <dd>
                      <ul className="bullets">
                        {r.analysis.takeaways.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </dd>
                  </dl>
                </>
              ) : (
                !r.error && <p className="muted">Not analyzed yet.</p>
              )}
              <div className="row-actions">
                <button className="small" onClick={() => reanalyze(r.id)} disabled={Boolean(busy)}>
                  {busy === r.id ? "Analyzing…" : r.analysis ? "Re-analyze" : "Analyze"}
                </button>
                <button className="small quiet danger" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
