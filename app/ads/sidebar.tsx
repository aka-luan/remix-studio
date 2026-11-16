"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { Brand, Project } from "@/lib/ads/types";
import { adsFile, errorText, notifyChanged, useAdsStatus, useOnChanged, useResource } from "./shared";

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const status = useAdsStatus();
  const brand = useResource<Brand>("/api/ads/brand");
  const projects = useResource<Project[]>("/api/ads/projects");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useOnChanged(projects.reload);
  useOnChanged(brand.reload);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await api<Project>("/api/ads/projects", {
        method: "POST",
        body: JSON.stringify({ name: name || `Campanha ${new Date().toLocaleDateString("pt-BR")}`, audience: brand.data?.audiences[0] ?? "" }),
      });
      setName("");
      setCreating(false);
      notifyChanged();
      router.push(`/ads/projects/${p.id}`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const nav = (href: string, label: string, exact = false) => (
    <Link href={href} className={`side-link${(exact ? path === href : path.startsWith(href)) ? " active" : ""}`}>
      {label}
    </Link>
  );

  return (
    <aside className="ads-side">
      <div className="side-brand">
        <div className="side-logo">
          {brand.data?.logoFile ? <img src={adsFile(brand.data.logoFile)} alt="" /> : <span style={{ background: brand.data?.colors.primary }}>{brand.data?.name.slice(0, 1) ?? "·"}</span>}
        </div>
        <div>
          <strong>{brand.data?.name ?? "Brand"}</strong>
          <span className={`mode ${status?.mock ? "mode-mock" : "mode-live"}`}>{status ? (status.mock ? "Mock mode" : "Gemini live") : "…"}</span>
        </div>
      </div>

      <nav className="side-nav">
        {nav("/ads", "Overview", true)}
        {nav("/ads/brand", "Brand profile")}
        {nav("/ads/references", "References")}
        {nav("/ads/library", "Creative library")}
      </nav>

      <div className="side-section">
        <div className="side-head">
          <span>Projects</span>
          <button className="quiet small" onClick={() => setCreating((c) => !c)} aria-expanded={creating}>
            {creating ? "Cancel" : "+ New"}
          </button>
        </div>
        {creating && (
          <form onSubmit={create} className="side-new">
            <input autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="primary small" type="submit">
              Create
            </button>
          </form>
        )}
        {error && <p className="error small-text">{error}</p>}
        {projects.data?.length === 0 && !creating && <p className="muted small-text">No projects yet.</p>}
        <ul className="side-projects">
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link href={`/ads/projects/${p.id}`} className={`side-link${path.startsWith(`/ads/projects/${p.id}`) ? " active" : ""}`}>
                <span>{p.name}</span>
                <small>
                  {p.concepts.length} concepts · {p.exports.length} PNG
                </small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
