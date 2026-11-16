"use client";

import Link from "next/link";
import type { Brand, Project, Reference } from "@/lib/ads/types";
import { StatusBanner, useAdsStatus, useResource } from "./shared";

export function Overview() {
  const status = useAdsStatus();
  const brand = useResource<Brand>("/api/ads/brand").data;
  const refs = useResource<Reference[]>("/api/ads/references").data;
  const projects = useResource<Project[]>("/api/ads/projects").data;

  const concepts = projects?.reduce((n, p) => n + p.concepts.length, 0) ?? 0;
  const approved = projects?.reduce((n, p) => n + p.concepts.filter((c) => c.status === "approved").length, 0) ?? 0;
  const pngs = projects?.reduce((n, p) => n + p.exports.length, 0) ?? 0;
  const brandSaved = brand && brand.updatedAt > new Date(0).toISOString();

  const steps = [
    { href: "/ads/brand", title: "Brand profile", body: "Product facts, verified features, colors, fonts, logo and real screenshots.", done: Boolean(brandSaved), meta: brandSaved ? `${brand!.features.length} verified features · ${brand!.assets.length} assets` : "Prefilled for MandaFoto. Review it." },
    { href: "/ads/references", title: "Reference ads", body: "Upload screenshots of ads you found. Gemini describes the hook, angle and a hypothesis.", done: (refs?.length ?? 0) > 0, meta: `${refs?.length ?? 0} references (optional)` },
    { href: projects?.[0] ? `/ads/projects/${projects[0].id}` : "/ads", title: "Concepts", body: "Create a project in the sidebar, generate concepts, edit and approve them.", done: approved > 0, meta: `${concepts} concepts · ${approved} approved` },
    { href: projects?.[0] ? `/ads/projects/${projects[0].id}` : "/ads", title: "Images & composition", body: "Nano Banana makes text-free photos. Copy, logo and CTA are composed in HTML.", done: pngs > 0, meta: `${pngs} PNGs exported` },
    { href: "/ads/library", title: "Library", body: "Every export with its JSON metadata, filterable by audience, angle and format.", done: pngs > 0, meta: "" },
  ];

  return (
    <div className="ads-page">
      <header className="ads-head">
        <div>
          <h1>Ad Studio</h1>
          <p className="muted">Static Meta ads for {brand?.name ?? "your brand"}: Feed 1080×1350, Stories 1080×1920 and Square 1080×1080.</p>
        </div>
      </header>
      <StatusBanner />
      <ol className="ads-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? "done" : ""}>
            <span className="step-n">{s.done ? "✓" : i + 1}</span>
            <Link href={s.href}>
              <strong>{s.title}</strong>
              <span>{s.body}</span>
              {s.meta && <small className="muted">{s.meta}</small>}
            </Link>
          </li>
        ))}
      </ol>
      {status && (
        <p className="muted small-text">
          Text model <code>{status.textModel}</code> · image model <code>{status.imageModel}</code>. API keys stay on the server in <code>.env.local</code>.
        </p>
      )}
    </div>
  );
}
