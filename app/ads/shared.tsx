"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { dimensions, renderAdHtml, templateInputFor } from "@/lib/ads/templates";
import type { AdsStatus, Brand, Concept, FormatId } from "@/lib/ads/types";

export const adsFile = (rel: string, download = false) => `/api/ads/files/${rel.split("/").map(encodeURIComponent).join("/")}${download ? "?download" : ""}`;

const CHANGED = "ads:changed";
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

export function useOnChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(CHANGED, fn);
    return () => window.removeEventListener(CHANGED, fn);
  }, [fn]);
}

/** Loads JSON from an API route; `reload` re-fetches, `set` replaces the value locally. */
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [url]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload, set: setData };
}

export function useAdsStatus() {
  return useResource<AdsStatus>("/api/ads/status").data;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The same HTML template Playwright renders, scaled down in an iframe. */
export function AdPreview({ brand, concept, format, width }: { brand: Brand; concept: Concept; format: FormatId; width: number }) {
  const { width: W, height: H } = dimensions(format);
  const scale = width / W;
  const html = renderAdHtml(templateInputFor(brand, concept, format, (rel) => adsFile(rel)));
  return (
    <div className="ad-preview" style={{ width, height: Math.round(H * scale) }}>
      <iframe
        title={`${concept.id} ${format} preview`}
        srcDoc={html}
        sandbox=""
        tabIndex={-1}
        style={{ width: W, height: H, transform: `scale(${scale})` }}
      />
    </div>
  );
}

export function StatusBanner() {
  const status = useAdsStatus();
  if (!status?.mock) return null;
  return (
    <div className="notice ads-mock" role="status">
      <p>
        <strong>Mock mode.</strong> {status.reason}. Concepts, analyses and images are placeholders, so nothing is billed. Export still renders real PNGs.
      </p>
    </div>
  );
}

export function ErrorBox({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <p>{error}</p>
      {onDismiss && (
        <button className="quiet" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

export const AWARENESS_LABELS: Record<string, string> = {
  unaware: "Unaware",
  "problem-aware": "Problem aware",
  "solution-aware": "Solution aware",
  "product-aware": "Product aware",
  "most-aware": "Most aware",
};
