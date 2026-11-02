"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, fileUrl, statusLabel } from "@/lib/client";
import { status, STEPS, type Remix, type Script, type StepName } from "@/lib/remix";

type Action = { action: "approve" } | { action: "retry" } | { action: "redo"; from: StepName };

export function RemixView({ id }: { id: string }) {
  const router = useRouter();
  const [remix, setRemix] = useState<Remix | null>(null);
  const [missing, setMissing] = useState(false);
  const [draft, setDraft] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<Remix>(`/api/remixes/${id}`);
      setRemix(next);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      return undefined;
    }
  }, [id]);

  const kind = remix ? status(remix).kind : null;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await load();
      if (cancelled) return;
      const k = next && status(next).kind;
      if (next === undefined || k === "running" || k === "ready") timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, kind]);

  useEffect(() => {
    if (remix?.plan && draft === null) setDraft(remix.plan.script);
  }, [remix?.plan, draft]);

  if (missing) return <p>Remix not found. <Link href="/">Back to library</Link></p>;
  if (!remix) return <p className="muted">Loading…</p>;

  const s = status(remix);
  const busy = s.kind === "running" || s.kind === "ready";
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(remix.plan?.script);

  async function saveScript(): Promise<boolean> {
    if (!draft || !dirty) return true;
    try {
      setRemix(await api<Remix>(`/api/remixes/${id}`, { method: "PATCH", body: JSON.stringify({ script: draft }) }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function act(action: Action) {
    setError(null);
    if (!(await saveScript())) return;
    try {
      setRemix(await api<Remix>(`/api/remixes/${id}/run`, { method: "POST", body: JSON.stringify(action) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove() {
    if (!confirm("Delete this remix and all its files?")) return;
    await api(`/api/remixes/${id}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="remix">
      <div className="remix-head">
        <div>
          <Link href="/" className="muted">
            ← Library
          </Link>
          <h1>{remix.input.product.name}</h1>
          <span className={`pill pill-${s.kind}`}>{statusLabel(s)}</span>
        </div>
        <button className="link danger" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>

      <ol className="steps">
        {STEPS.map((step) => {
          const done = remix[step.output] !== undefined;
          const state =
            s.kind === "running" && s.step === step.name
              ? "running"
              : s.kind === "failed" && s.step === step.name
                ? "failed"
                : done
                  ? "done"
                  : "pending";
          return (
            <li key={step.name} className={`step step-${state}`}>
              {step.label}
            </li>
          );
        })}
      </ol>

      {s.kind === "failed" && (
        <div className="error-box">
          <p>{s.error}</p>
          <button className="primary" onClick={() => act({ action: "retry" })}>
            Retry
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <div className="remix-grid">
        <section className="panel">
          <h2>Original</h2>
          {remix.source ? (
            <video src={fileUrl(remix, remix.source.videoFile)} controls playsInline className="phone" />
          ) : (
            <p className="muted">Downloading…</p>
          )}
          {remix.plan && (
            <dl className="analysis">
              <dt>Format</dt>
              <dd>{remix.plan.analysis.format.replace(/_/g, " ")}</dd>
              <dt>Hook (0–{remix.plan.analysis.hookEndsAtSec}s)</dt>
              <dd>{remix.plan.analysis.hookVisual}</dd>
              <dt>On-screen text</dt>
              <dd>“{remix.plan.analysis.originalOnScreenText}”</dd>
              <dt>Demo</dt>
              <dd>{remix.plan.analysis.demoSection}</dd>
              <dt>Why it works</dt>
              <dd>{remix.plan.analysis.whyItWorks}</dd>
              {remix.plan.transcript && remix.plan.transcript !== "(no speech)" && (
                <>
                  <dt>Transcript</dt>
                  <dd>{remix.plan.transcript}</dd>
                </>
              )}
            </dl>
          )}
        </section>

        <section className="panel">
          <h2>Your script</h2>
          {draft ? (
            <ScriptEditor script={draft} onChange={setDraft} />
          ) : (
            <p className="muted">Claude writes the script after watching the original.</p>
          )}
          {draft && (
            <div className="actions">
              {s.kind === "needs-review" ? (
                <button className="primary" onClick={() => act({ action: "approve" })}>
                  Generate video
                </button>
              ) : (
                <button onClick={saveScript} disabled={!dirty || busy}>
                  {dirty ? "Save script" : "Saved"}
                </button>
              )}
              {s.kind === "needs-review" && (
                <small className="muted">About $0.55 of Gemini usage: one Nano Banana image and one Omni Flash clip.</small>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Remix</h2>
          {remix.finalFile ? (
            <>
              <video src={fileUrl(remix, remix.finalFile)} controls playsInline className="phone" />
              <div className="actions">
                <a className="button primary" href={fileUrl(remix, remix.finalFile, true)}>
                  Download MP4
                </a>
                {remix.plan && (
                  <button
                    onClick={() => {
                      const { caption, hashtags } = remix.plan!.script;
                      navigator.clipboard.writeText(`${caption}\n\n${hashtags.filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`);
                    }}
                  >
                    Copy caption
                  </button>
                )}
              </div>
            </>
          ) : remix.hookFile ? (
            <video src={fileUrl(remix, remix.hookFile)} controls playsInline className="phone" />
          ) : remix.avatarFile || remix.previousAvatarFile ? (
            <>
              <img src={fileUrl(remix, (remix.avatarFile ?? remix.previousAvatarFile)!)} alt="Generated avatar" className="phone" />
              {!remix.avatarFile && <p className="muted">Previous avatar. A replacement has not been generated yet.</p>}
            </>
          ) : (
            <p className="muted">Approve the script to generate the hook.</p>
          )}

          {remix.avatarFile && (
            <div className="redo">
              <span className="muted">Not quite right?</span>
              <button disabled={busy} onClick={() => act({ action: "redo", from: "avatar" })}>
                New avatar
              </button>
              {remix.hookFile && (
                <button disabled={busy} onClick={() => act({ action: "redo", from: "hook" })}>
                  Re-animate hook
                </button>
              )}
              {remix.finalFile && (
                <button disabled={busy} onClick={() => act({ action: "redo", from: "assemble" })}>
                  Re-stitch with new text
                </button>
              )}
            </div>
          )}
          {remix.avatarFile && remix.hookFile && (
            <div className="thumbs">
              <a href={fileUrl(remix, remix.avatarFile)} target="_blank">
                <img src={fileUrl(remix, remix.avatarFile)} alt="Avatar frame" />
              </a>
              <a href={fileUrl(remix, remix.hookFile)} target="_blank">
                <video src={fileUrl(remix, remix.hookFile)} muted playsInline />
              </a>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ScriptEditor({ script, onChange }: { script: Script; onChange: (s: Script) => void }) {
  const set = <K extends keyof Script>(key: K, value: Script[K]) => onChange({ ...script, [key]: value });
  return (
    <div className="form">
      <label>
        Hook text (on screen)
        <textarea rows={2} value={script.hookText} onChange={(e) => set("hookText", e.target.value)} />
      </label>
      <div className="chips">
        {script.hookTextAlternatives.map((alt) => (
          <button key={alt} type="button" className="chip" onClick={() => set("hookText", alt)}>
            {alt}
          </button>
        ))}
      </div>
      <label>
        Avatar (first frame)
        <textarea rows={4} value={script.avatarPrompt} onChange={(e) => set("avatarPrompt", e.target.value)} />
      </label>
      <label>
        Motion
        <textarea rows={3} value={script.motionPrompt} onChange={(e) => set("motionPrompt", e.target.value)} />
      </label>
      <label>
        Hook length: {script.hookDurationSec}s
        <input
          type="range"
          min={3}
          max={10}
          value={script.hookDurationSec}
          onChange={(e) => set("hookDurationSec", Number(e.target.value))}
        />
      </label>
      <label>
        Caption
        <textarea rows={3} value={script.caption} onChange={(e) => set("caption", e.target.value)} />
      </label>
      <label>
        Hashtags
        <input
          value={script.hashtags.join(" ")}
          onChange={(e) => set("hashtags", e.target.value.split(" "))}
        />
      </label>
    </div>
  );
}
