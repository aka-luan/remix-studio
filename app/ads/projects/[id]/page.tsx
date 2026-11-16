"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { Brand, Project, Reference } from "@/lib/ads/types";
import { AdPreview, adsFile, ErrorBox, errorText, notifyChanged, StatusBanner, useResource } from "../../shared";
import { ConceptCard } from "./concept-card";

type Settings = Pick<Project, "name" | "audience" | "brief" | "referenceIds">;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const project = useResource<Project>(`/api/ads/projects/${id}`);
  const brand = useResource<Brand>("/api/ads/brand").data;
  const refs = useResource<Reference[]>("/api/ads/references").data;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const p = project.data;
  useEffect(() => {
    if (p && !settings) setSettings({ name: p.name, audience: p.audience, brief: p.brief, referenceIds: p.referenceIds });
  }, [p, settings]);

  if (!p || !brand || !settings) {
    return <div className="ads-page">{project.error ? <ErrorBox error={project.error} /> : <p className="muted">Loading…</p>}</div>;
  }

  const update = (next: Project) => {
    project.set(next);
    notifyChanged();
  };
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify({ name: p.name, audience: p.audience, brief: p.brief, referenceIds: p.referenceIds });

  async function run(label: string, fn: () => Promise<Project>) {
    setBusy(label);
    setError(null);
    try {
      update(await fn());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const saveSettings = () => run("settings", () => api<Project>(`/api/ads/projects/${id}`, { method: "PATCH", body: JSON.stringify(settings) }));
  const generate = async (count: number, blank = false) => {
    if (settingsDirty) await saveSettings();
    await run(blank ? "blank" : `gen${count}`, () => api<Project>(`/api/ads/projects/${id}/concepts`, { method: "POST", body: JSON.stringify({ count, blank }) }));
  };

  async function remove() {
    if (!confirm(`Delete project “${p!.name}” with all its concepts, images and exports?`)) return;
    try {
      await api(`/api/ads/projects/${id}`, { method: "DELETE" });
      notifyChanged();
      router.push("/ads");
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.message);
    }
  }

  const analyzed = refs?.filter((r) => r.analysis) ?? [];
  const creatives = p.concepts.filter((c) => c.status === "approved" && c.versions.length);
  const approved = p.concepts.filter((c) => c.status === "approved").length;

  return (
    <div className="ads-page">
      <header className="ads-head">
        <div>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.concepts.length} concepts · {approved} approved · {p.exports.length} PNG exported
          </p>
        </div>
        <button className="quiet danger small" onClick={remove}>
          Delete project
        </button>
      </header>
      <StatusBanner />
      <ErrorBox error={error} onDismiss={() => setError(null)} />

      <section className="panel form project-settings">
        <h2>Strategy brief</h2>
        <div className="row2">
          <label>
            Project name
            <input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
          </label>
          <label>
            Audience
            <select value={settings.audience} onChange={(e) => setSettings({ ...settings, audience: e.target.value })}>
              <option value="">All brand audiences (mix)</option>
              {brand.audiences.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Brief <small className="muted">Optional: season, offer you&apos;ve verified, angles to explore or avoid</small>
          <textarea rows={2} value={settings.brief} onChange={(e) => setSettings({ ...settings, brief: e.target.value })} />
        </label>
        <fieldset>
          <legend>
            Reference insights to use <small className="muted">({analyzed.length} analyzed)</small>
          </legend>
          {analyzed.length === 0 ? (
            <small className="muted">
              None yet. <Link href="/ads/references">Add reference ads</Link> to inform the concepts, or generate from the brand profile alone.
            </small>
          ) : (
            <div className="ref-pick">
              {analyzed.map((r) => {
                const on = settings.referenceIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ref-thumb tall${on ? " on" : ""}`}
                    aria-pressed={on}
                    title={r.analysis!.hook}
                    onClick={() => setSettings({ ...settings, referenceIds: on ? settings.referenceIds.filter((x) => x !== r.id) : [...settings.referenceIds, r.id] })}
                  >
                    <img src={adsFile(`references/${r.id}/${r.imageFile}`)} alt="" />
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="row-actions">
          <button className="primary" onClick={() => generate(1)} disabled={Boolean(busy)}>
            {busy === "gen1" ? "Writing…" : "Generate 1 concept"}
          </button>
          <button className="primary" onClick={() => generate(6)} disabled={Boolean(busy)}>
            {busy === "gen6" ? "Writing 6 concepts…" : "Generate 6 concepts"}
          </button>
          <button onClick={() => generate(1, true)} disabled={Boolean(busy)}>
            Write one by hand
          </button>
          {settingsDirty && (
            <button className="quiet" onClick={saveSettings} disabled={Boolean(busy)}>
              Save brief
            </button>
          )}
        </div>
      </section>

      {creatives.length > 0 && (
        <section>
          <h2>Creatives</h2>
          <ul className="creative-grid">
            {creatives.map((c) => (
              <li key={c.id}>
                <Link href={`/ads/projects/${p.id}/${c.id}`} className="creative-card">
                  <AdPreview brand={brand} concept={c} format="feed" width={200} />
                  <span className="concept-id">{c.id}</span>
                  <strong>{c.title}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Concepts</h2>
        {p.concepts.length === 0 && <p className="muted">Generate a concept to start. Review and approve it before any image is generated.</p>}
        <div className="concept-list">
          {p.concepts.map((c) => (
            <ConceptCard key={c.id} concept={c} brand={brand} project={p} onProject={update} />
          ))}
        </div>
      </section>
    </div>
  );
}
