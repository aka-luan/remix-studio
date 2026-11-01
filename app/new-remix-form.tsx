"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

const PRODUCT_KEY = "remix-studio:product";

export function NewRemixForm() {
  const router = useRouter();
  const [useUpload, setUseUpload] = useState(false);
  const [product, setProduct] = useState({ name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PRODUCT_KEY);
    if (saved) setProduct(JSON.parse(saved));
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    localStorage.setItem(PRODUCT_KEY, JSON.stringify(product));
    try {
      const { id } = await api<{ id: string }>("/api/remixes", { method: "POST", body: new FormData(event.currentTarget) });
      router.push(`/remix/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="form">
      <fieldset>
        <legend>Source video</legend>
        {useUpload ? (
          <input type="file" name="sourceFile" accept="video/*" required />
        ) : (
          <input type="url" name="sourceUrl" placeholder="https://www.tiktok.com/@someone/video/…" required />
        )}
        <button type="button" className="link" onClick={() => setUseUpload(!useUpload)}>
          {useUpload ? "Paste a link instead" : "Download blocked? Upload the video file instead"}
        </button>
      </fieldset>

      <fieldset>
        <legend>Your product</legend>
        <input
          name="productName"
          placeholder="Product name"
          value={product.name}
          onChange={(e) => setProduct({ ...product, name: e.target.value })}
          required
        />
        <textarea
          name="productDescription"
          rows={4}
          placeholder="What it does, who it's for, the one thing people love about it"
          value={product.description}
          onChange={(e) => setProduct({ ...product, description: e.target.value })}
          required
        />
      </fieldset>

      <fieldset>
        <legend>Demo screen recording</legend>
        <input type="file" name="demoFile" accept="video/*" required />
        <small className="muted">Plays right after the hook. A vertical phone recording looks best.</small>
      </fieldset>

      <fieldset>
        <legend>
          Creator photo <span className="muted">(optional)</span>
        </legend>
        <input type="file" name="avatarFile" accept="image/png,image/jpeg,image/webp" />
        <small className="muted">Used as the face of the hook. Leave empty to have a new person generated.</small>
      </fieldset>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Uploading…" : "Analyze video"}
      </button>
    </form>
  );
}
