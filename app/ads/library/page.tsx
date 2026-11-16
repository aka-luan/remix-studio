"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FORMATS, type LibraryItem } from "@/lib/ads/types";
import { adsFile, ErrorBox, useResource } from "../shared";

const unique = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();

export default function LibraryPage() {
  const items = useResource<LibraryItem[]>("/api/ads/library");
  const [audience, setAudience] = useState("");
  const [angle, setAngle] = useState("");
  const [format, setFormat] = useState("");
  const [projectId, setProjectId] = useState("");

  const all = items.data ?? [];
  const options = useMemo(
    () => ({
      audiences: unique(all.map((i) => i.audience)),
      angles: unique(all.map((i) => i.angle)),
      projects: [...new Map(all.map((i) => [i.projectId, i.projectName])).entries()],
    }),
    [all],
  );
  const shown = all.filter((i) => (!audience || i.audience === audience) && (!angle || i.angle === angle) && (!format || i.format === format) && (!projectId || i.projectId === projectId));

  return (
    <div className="ads-page">
      <header className="ads-head">
        <div>
          <h1>Creative library</h1>
          <p className="muted">Every exported PNG with its JSON metadata (concept ID, angle, copy, variant). Files live in data/ads/projects/*/exports.</p>
        </div>
      </header>
      <ErrorBox error={items.error} />

      <div className="filters">
        <select value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="Audience">
          <option value="">All audiences</option>
          {options.audiences.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={angle} onChange={(e) => setAngle(e.target.value)} aria-label="Angle">
          <option value="">All angles</option>
          {options.angles.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Format">
          <option value="">All formats</option>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {options.projects.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <span className="muted small-text">
          {shown.length} of {all.length}
        </span>
      </div>

      {items.data && all.length === 0 && <p className="muted">Nothing exported yet. Open a concept in the editor and export it.</p>}
      <ul className="lib-grid">
        {shown.map((i) => (
          <li key={i.id} className="panel lib-card">
            <a href={adsFile(i.file)} target="_blank" rel="noreferrer" className={`lib-img lib-${i.format}`}>
              <img src={adsFile(i.file)} alt={i.headline} loading="lazy" />
            </a>
            <div className="lib-body">
              <span className="concept-id">
                {i.conceptId} · {i.variant}
              </span>
              <strong>{i.title}</strong>
              <div className="chips">
                <span className="chip">{FORMATS.find((f) => f.id === i.format)?.label}</span>
                {i.angle && <span className="chip">{i.angle}</span>}
                {i.audience && <span className="chip">{i.audience}</span>}
              </div>
              <div className="export-links">
                <a href={adsFile(i.file, true)}>PNG</a>
                <a href={adsFile(i.metaFile)} target="_blank" rel="noreferrer">
                  JSON
                </a>
                <Link href={`/ads/projects/${i.projectId}/${i.conceptId}`}>Edit</Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
