"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AssetKind, Brand } from "@/lib/ads/types";
import { adsFile, ErrorBox, errorText, notifyChanged, useResource } from "../shared";

type Form = Omit<Brand, "audiences" | "features"> & { audiences: string; features: string };

const toForm = (b: Brand): Form => ({ ...b, audiences: b.audiences.join("\n"), features: b.features.join("\n") });
const split = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

const ASSET_KINDS: { kind: AssetKind; title: string; hint: string; accept: string }[] = [
  { kind: "logo", title: "Logo", hint: "PNG with transparency or SVG. The selected one is placed on every ad.", accept: ".png,.jpg,.jpeg,.webp,.svg" },
  { kind: "screenshot", title: "Product screenshots", hint: "Real screens of the product. Used in the “Product screenshot” template, never redrawn by AI.", accept: ".png,.jpg,.jpeg,.webp" },
  { kind: "photo", title: "Brand photos", hint: "Your own photos. Can be sent to Nano Banana as style references.", accept: ".png,.jpg,.jpeg,.webp" },
  { kind: "font", title: "Font files", hint: "Optional. The file label must match the font name below; otherwise Google Fonts is used.", accept: ".woff2,.woff,.ttf,.otf" },
];

export default function BrandPage() {
  const brand = useResource<Brand>("/api/ads/brand");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<AssetKind | null>(null);

  useEffect(() => {
    if (brand.data && !form) setForm(toForm(brand.data));
  }, [brand.data, form]);

  if (!form || !brand.data) return <div className="ads-page">{brand.error ? <ErrorBox error={brand.error} /> : <p className="muted">Loading…</p>}</div>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const editable = ({ assets: _a, logoFile: _l, updatedAt: _u, ...rest }: Form) => JSON.stringify(rest);
  const dirty = editable(toForm(brand.data)) !== editable(form);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api<Brand>("/api/ads/brand", { method: "PUT", body: JSON.stringify({ ...form, audiences: split(form.audiences), features: split(form.features) }) });
      brand.set(next);
      setForm(toForm(next));
      setSavedAt(new Date().toLocaleTimeString());
      notifyChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function upload(kind: AssetKind, files: FileList | null, label?: string) {
    if (!files?.length) return;
    const body = new FormData();
    body.set("kind", kind);
    if (label) body.set("label", label);
    for (const f of files) body.append("file", f);
    setUploading(kind);
    setError(null);
    try {
      const next = await api<Brand>("/api/ads/brand/assets", { method: "POST", body });
      brand.set(next);
      setForm((f) => (f ? { ...f, assets: next.assets, logoFile: next.logoFile } : f));
      notifyChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(null);
    }
  }

  async function removeAsset(file: string) {
    if (!confirm("Remove this asset?")) return;
    try {
      const next = await api<Brand>(`/api/ads/brand/assets?file=${encodeURIComponent(file)}`, { method: "DELETE" });
      brand.set(next);
      setForm((f) => (f ? { ...f, assets: next.assets, logoFile: next.logoFile } : f));
      notifyChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function chooseLogo(file: string | null) {
    try {
      const next = await api<Brand>("/api/ads/brand", { method: "PUT", body: JSON.stringify({ logoFile: file }) });
      brand.set(next);
      setForm((f) => (f ? { ...f, logoFile: next.logoFile } : f));
      notifyChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="ads-page" onSubmit={save}>
      <header className="ads-head">
        <div>
          <h1>Brand profile</h1>
          <p className="muted">Everything the strategist and the templates are allowed to use. Concepts can only claim what is listed under verified features.</p>
        </div>
        <div className="head-actions">
          <span className="muted small-text">{saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved ${savedAt}` : ""}</span>
          <button className="primary" type="submit" disabled={!dirty || saving}>
            Save profile
          </button>
        </div>
      </header>
      <ErrorBox error={error} onDismiss={() => setError(null)} />

      <div className="brand-grid">
        <section className="panel form">
          <h2>Product</h2>
          <div className="row2">
            <label>
              Name
              <input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label>
              Website
              <input value={form.website} onChange={(e) => set("website", e.target.value)} />
            </label>
          </div>
          <label>
            Product description
            <textarea rows={4} value={form.productDescription} onChange={(e) => set("productDescription", e.target.value)} />
          </label>
          <label>
            Target audiences <small className="muted">One per line</small>
            <textarea rows={3} value={form.audiences} onChange={(e) => set("audiences", e.target.value)} />
          </label>
          <div className="row2">
            <label>
              Language
              <input value={form.language} onChange={(e) => set("language", e.target.value)} />
            </label>
            <label>
              Tone of voice
              <input value={form.tone} onChange={(e) => set("tone", e.target.value)} />
            </label>
          </div>
        </section>

        <section className="panel form">
          <h2>Verified claims</h2>
          <label>
            Verified features <small className="muted">One per line. The only product claims ads may make.</small>
            <textarea rows={8} value={form.features} onChange={(e) => set("features", e.target.value)} />
          </label>
          <label>
            Verified pricing <small className="muted">Leave empty and ads never mention price, plans, discounts or “free”.</small>
            <textarea rows={2} value={form.pricing} placeholder="e.g. copy the exact pricing from mandafoto.com.br once checked" onChange={(e) => set("pricing", e.target.value)} />
          </label>
          <p className="muted small-text">No testimonials, user counts or performance numbers are ever generated. Copy is also scanned for numbers, prices and superlatives that aren&apos;t in these facts.</p>
        </section>

        <section className="panel form">
          <h2>Look</h2>
          <div className="swatches">
            {(Object.keys(form.colors) as (keyof Brand["colors"])[]).map((k) => (
              <label key={k} className="swatch">
                <span className="swatch-name">{k}</span>
                <span className="swatch-row">
                  <input type="color" value={form.colors[k]} onChange={(e) => set("colors", { ...form.colors, [k]: e.target.value })} />
                  <input value={form.colors[k]} onChange={(e) => set("colors", { ...form.colors, [k]: e.target.value })} spellCheck={false} />
                </span>
              </label>
            ))}
          </div>
          <div className="row2">
            <label>
              Heading font <small className="muted">Google Fonts name</small>
              <input value={form.fonts.heading} onChange={(e) => set("fonts", { ...form.fonts, heading: e.target.value })} />
            </label>
            <label>
              Body font
              <input value={form.fonts.body} onChange={(e) => set("fonts", { ...form.fonts, body: e.target.value })} />
            </label>
          </div>
          <div className="type-sample" style={{ background: form.colors.secondary }}>
            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(form.fonts.heading)}:wght@700&family=${encodeURIComponent(form.fonts.body)}:wght@500&display=swap`} />
            <strong style={{ fontFamily: `"${form.fonts.heading}", serif` }}>Todas as fotos da festa</strong>
            <span style={{ fontFamily: `"${form.fonts.body}", sans-serif` }}>Os convidados enviam pelo QR code.</span>
            <em style={{ background: form.colors.accent }}>Criar álbum</em>
          </div>
        </section>

        <section className="panel form brand-assets">
          <h2>Assets</h2>
          {ASSET_KINDS.map(({ kind, title, hint, accept }) => {
            const items = form.assets.filter((a) => a.kind === kind);
            return (
              <div key={kind} className="asset-group">
                <div className="asset-head">
                  <div>
                    <strong>{title}</strong>
                    <small className="muted">{hint}</small>
                  </div>
                  <label className="button small">
                    {uploading === kind ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept={accept}
                      multiple={kind !== "logo"}
                      hidden
                      onChange={(e) => {
                        const label = kind === "font" ? prompt("Font family name (as used in the font fields)", form.fonts.heading) ?? undefined : undefined;
                        upload(kind, e.target.files, label);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {items.length > 0 && (
                  <ul className="asset-list">
                    {items.map((a) => (
                      <li key={a.file} className={form.logoFile === a.file ? "selected" : ""}>
                        {kind === "font" ? <span className="font-chip">Aa</span> : <img src={adsFile(a.file)} alt={a.label} />}
                        <span className="asset-label" title={a.label}>
                          {a.label}
                        </span>
                        <span className="asset-actions">
                          {kind === "logo" && (
                            <button type="button" className="quiet small" onClick={() => chooseLogo(form.logoFile === a.file ? null : a.file)}>
                              {form.logoFile === a.file ? "In use" : "Use"}
                            </button>
                          )}
                          <button type="button" className="quiet small danger" onClick={() => removeAsset(a.file)} aria-label={`Remove ${a.label}`}>
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {kind === "logo" && !form.logoFile && <small className="muted">No logo selected: ads show the brand name as a wordmark.</small>}
              </div>
            );
          })}
        </section>
      </div>
    </form>
  );
}
