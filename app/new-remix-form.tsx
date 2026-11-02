"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
          <FileDrop name="sourceFile" label="Source video file" accept="video/*" required prompt="Drop the video file, or click to choose" />
        ) : (
          <label>
            Video link
            <input type="url" name="sourceUrl" placeholder="https://www.tiktok.com/@someone/video/…" required />
          </label>
        )}
        <button type="button" className="link" onClick={() => setUseUpload(!useUpload)}>
          {useUpload ? "Paste a link instead" : "Download blocked? Upload the video file instead"}
        </button>
      </fieldset>

      <fieldset>
        <legend>Your product</legend>
        <label>
          Product name
          <input
            name="productName"
            value={product.name}
            onChange={(e) => setProduct({ ...product, name: e.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            name="productDescription"
            rows={4}
            placeholder="What it does, who it's for, the one thing people love about it"
            value={product.description}
            onChange={(e) => setProduct({ ...product, description: e.target.value })}
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Demo screen recording</legend>
        <FileDrop
          name="demoFile"
          label="Demo screen recording"
          accept="video/*"
          showFit
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
          label="Creator photo (optional)"
          accept="image/png,image/jpeg,image/webp"
          prompt="Drop a photo, or click to choose"
          hint="Used as the face of the hook. Leave empty to have a new person generated."
        />
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary" disabled={submitting}>
        {submitting ? "Uploading…" : "Analyze video"}
      </button>
    </form>
  );
}

type Media = { durationSec?: number; width: number; height: number };

function FileDrop({
  name,
  label,
  accept,
  required,
  prompt,
  hint,
  showFit,
}: {
  name: string;
  label: string;
  accept: string;
  required?: boolean;
  prompt: string;
  hint?: string;
  showFit?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    setMedia(null);
    if (!file) return setUrl(null);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  function clear() {
    if (input.current) input.current.value = "";
    setFile(null);
  }

  const isVideo = file?.type.startsWith("video/");
  const landscape = media !== null && media.width > media.height;
  const details = [
    file && formatSize(file.size),
    media?.durationSec !== undefined && formatDuration(media.durationSec),
    media && `${landscape ? "Landscape" : media.width === media.height ? "Square" : "Portrait"} ${media.width}×${media.height}`,
  ].filter(Boolean);

  return (
    <>
      <div className={`drop${file ? " drop-filled" : ""}${over ? " drop-over" : ""}`}>
        <input
          ref={input}
          type="file"
          name={name}
          accept={accept}
          required={required}
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          onDragEnter={() => setOver(true)}
          onDragLeave={() => setOver(false)}
          onDrop={() => setOver(false)}
        />
        {file ? (
          <span className="drop-file">
            <strong>{file.name}</strong>
            <span className="muted">{details.join(" · ")} · click to replace</span>
          </span>
        ) : (
          <span className="muted">{prompt}</span>
        )}
      </div>
      {file && url && (
        <div className="drop-preview">
          {isVideo ? (
            <video
              src={url}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) =>
                setMedia({ durationSec: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : undefined, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
              }
            />
          ) : (
            <img
              src={url}
              alt={`${label} preview`}
              onLoad={(e) => setMedia({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            />
          )}
          <div className="drop-preview-info">
            {showFit && media && (
              <small className={landscape ? "warn" : "muted"}>
                {landscape
                  ? "Landscape recording. It is shrunk to fit the 9:16 video, with black bars above and below, as previewed here."
                  : "Previewed in the 9:16 frame of the final video."}
              </small>
            )}
            <button type="button" className="quiet" onClick={clear}>
              Remove
            </button>
          </div>
        </div>
      )}
      {hint && (
        <small className="muted" id={hintId}>
          {hint}
        </small>
      )}
    </>
  );
}

function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
