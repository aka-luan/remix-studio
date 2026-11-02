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
          <FileDrop name="sourceFile" accept="video/*" required prompt="Drop the video file, or click to choose" />
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
        <FileDrop
          name="demoFile"
          accept="video/*"
          required
          prompt="Drop your screen recording, or click to choose"
          hint="Plays right after the hook. A vertical phone recording looks best."
        />
      </fieldset>

      <fieldset>
        <legend>
          Creator photo <span className="muted">(optional)</span>
        </legend>
        <FileDrop
          name="avatarFile"
          accept="image/png,image/jpeg,image/webp"
          prompt="Drop a photo, or click to choose"
          hint="Used as the face of the hook. Leave empty to have a new person generated."
        />
      </fieldset>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Uploading…" : "Analyze video"}
      </button>
    </form>
  );
}

function FileDrop({
  name,
  accept,
  required,
  prompt,
  hint,
}: {
  name: string;
  accept: string;
  required?: boolean;
  prompt: string;
  hint?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <div className={`drop${file ? " drop-filled" : ""}${over ? " drop-over" : ""}`}>
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          onDragEnter={() => setOver(true)}
          onDragLeave={() => setOver(false)}
          onDrop={() => setOver(false)}
        />
        {file ? (
          <span className="drop-file">
            <strong>{file.name}</strong>
            <span className="muted">{formatSize(file.size)} · click to replace</span>
          </span>
        ) : (
          <span className="muted">{prompt}</span>
        )}
      </div>
      {hint && <small className="muted">{hint}</small>}
    </>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
