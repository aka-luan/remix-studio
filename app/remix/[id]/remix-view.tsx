"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, fileUrl, statusLabel } from "@/lib/client";
import { staleFrom, status, STEPS, type Remix, type Script, type ScriptStep, type StepName } from "@/lib/remix";

type Action = { action: "approve" } | { action: "retry" } | { action: "redo"; from: StepName };

const REDO: Record<ScriptStep, { label: string; reruns: string; cost: string }> = {
  avatar: { label: "New avatar", reruns: "avatar, hook clip, and stitch", cost: "about $0.55 of Gemini usage" },
  hook: { label: "Re-animate", reruns: "hook clip and stitch", cost: "one Omni Flash clip" },
  assemble: { label: "Re-stitch", reruns: "stitch only", cost: "free, runs locally" },
};

const FIELD_LABELS: Partial<Record<keyof Script, string>> = {
  avatarPrompt: "avatar prompt",
  motionPrompt: "motion",
  hookDurationSec: "hook length",
  hookText: "hook text",
};

const sameScript = (a: Script | undefined, b: Script | undefined) => JSON.stringify(a) === JSON.stringify(b);

const draftKey = (id: string) => `remix-studio:draft:${id}`;

function readDraft(id: string): { base: Script; draft: Script } | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "null");
  } catch {
    return null;
  }
}

export function RemixView({ id }: { id: string }) {
  const router = useRouter();
  const [remix, setRemix] = useState<Remix | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Script | null>(null);
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingDemo, setUploadingDemo] = useState(false);
  const demoInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<Remix>(`/api/remixes/${id}`);
      setRemix(next);
      setLoadError(null);
      return next;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setLoadError(err instanceof Error ? err.message : String(err));
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

  const saved = remix?.plan?.script;
  useEffect(() => {
    if (!saved || draft !== null) return;
    const stored = readDraft(id);
    const restore = stored !== null && sameScript(stored.base, saved) && !sameScript(stored.draft, saved);
    setDraft(restore ? stored.draft : saved);
    setRestored(restore);
  }, [id, saved, draft]);

  const dirty = draft !== null && saved !== undefined && !sameScript(draft, saved);
  useEffect(() => {
    if (draft === null || !saved) return;
    if (dirty) localStorage.setItem(draftKey(id), JSON.stringify({ base: saved, draft }));
    else localStorage.removeItem(draftKey(id));
  }, [id, draft, saved, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (missing) return <p>Remix not found. <Link href="/">Back to library</Link></p>;
  if (!remix) {
    return loadError ? (
      <div className="error-box" role="alert">
        <p>Couldn&apos;t load this remix: {loadError}</p>
        <button className="primary" onClick={load}>
          Retry
        </button>
      </div>
    ) : (
      <p className="muted">Loading…</p>
    );
  }

  const s = status(remix);
  const busy = s.kind === "running" || s.kind === "ready";
  const stale = draft ? staleFrom(remix, draft) : null;

  async function saveScript(): Promise<boolean> {
    if (!draft || !dirty) return true;
    setSaving(true);
    try {
      setRemix(await api<Remix>(`/api/remixes/${id}`, { method: "PATCH", body: JSON.stringify({ script: draft }) }));
      setRestored(false);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setSaving(false);
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

  async function replaceDemo(file: File) {
    setError(null);
    if (!(await saveScript())) return;
    const body = new FormData();
    body.set("demoFile", file);
    setUploadingDemo(true);
    try {
      setRemix(await api<Remix>(`/api/remixes/${id}/demo`, { method: "POST", body }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingDemo(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this remix and all its files?")) return;
    await api(`/api/remixes/${id}`, { method: "DELETE" });
    router.push("/");
  }

  const hasOutput = Boolean(remix.finalFile || remix.previousFinalFile || remix.hookFile || remix.avatarFile || remix.previousAvatarFile);
  const stepIndex = s.kind === "running" || s.kind === "failed" || s.kind === "ready" ? STEPS.findIndex((x) => x.name === s.step) : -1;
  const saveStatus = saving
    ? "Saving…"
    : dirty
      ? restored
        ? "Restored unsaved edits from your last visit. Not saved yet."
        : "Unsaved changes. Kept on this device until you save."
      : "All changes saved.";
  const redoOptions = (Object.keys(REDO) as ScriptStep[]).filter(
    (step) => remix[STEPS.find((x) => x.name === step)!.output] !== undefined,
  );

  return (
    <div className={`remix${hasOutput ? " remix-has-output" : ""}${s.kind === "needs-review" ? " remix-needs-review" : ""}`}>
      <Link
        href="/"
        className="back"
        onClick={(e) => {
          if (dirty && !confirm("You have unsaved script edits. They stay on this device but are not saved. Leave anyway?")) e.preventDefault();
        }}
      >
        ← Library
      </Link>
      <div className="remix-head">
        <div className="remix-title">
          <h1>{remix.input.product.name}</h1>
          <span className={`pill pill-${s.kind}`}>{statusLabel(s)}</span>
        </div>
        <button className="quiet danger" onClick={remove} disabled={busy}>
          Delete
        </button>
      </div>

      <p className="steps-caption">
        {stepIndex >= 0
          ? `Step ${stepIndex + 1} of ${STEPS.length} · ${STEPS[stepIndex].label}`
          : s.kind === "needs-review"
            ? `Step 3 of ${STEPS.length} · Review the script, then generate`
            : `All ${STEPS.length} steps done`}
      </p>
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
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>

      {loadError && (
        <div className="notice" role="status">
          <p>Couldn&apos;t reach the server. Showing the last loaded version.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {s.kind === "failed" && (
        <div className="error-box" role="alert">
          <p>{s.error}</p>
          <button className="primary" onClick={() => act({ action: "retry" })}>
            Retry
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="remix-grid">
        <section className="panel panel-original">
          <h2>Original</h2>
          {remix.source ? (
            <video src={fileUrl(remix, remix.source.videoFile)} controls playsInline className="phone" />
          ) : (
            <p className="muted">Downloading…</p>
          )}
          {remix.plan && (
            <details className="analysis-wrap" open={s.kind !== "needs-review"}>
              <summary>Analysis</summary>
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
            </details>
          )}
        </section>

        <section className="panel panel-script">
          <h2>Your script</h2>
          {draft ? (
            <ScriptEditor script={draft} onChange={setDraft} />
          ) : (
            <p className="muted">The script is written after the original has been watched and analyzed.</p>
          )}
          {draft && (
            <>
              {stale && (
                <div className="notice" role="status">
                  <p>
                    <strong>Video needs updating.</strong> The current video doesn&apos;t use your new{" "}
                    {stale.fields.map((f) => FIELD_LABELS[f]).join(" or ")}. {REDO[stale.step].label} reruns the{" "}
                    {REDO[stale.step].reruns}, {REDO[stale.step].cost}.
                  </p>
                  <button className="primary" disabled={busy || saving} onClick={() => act({ action: "redo", from: stale.step })}>
                    {dirty ? `Save & ${REDO[stale.step].label.toLowerCase()}` : REDO[stale.step].label}
                  </button>
                </div>
              )}
              <div className="actions actions-script">
                {s.kind === "needs-review" && (
                  <button className="primary" disabled={saving} onClick={() => act({ action: "approve" })}>
                    Generate video
                  </button>
                )}
                <button
                  className={s.kind !== "needs-review" && dirty && !stale ? "primary" : undefined}
                  onClick={saveScript}
                  disabled={!dirty || busy || saving}
                >
                  Save script
                </button>
                <small className="muted" role="status">
                  {saveStatus}
                </small>
              </div>
              {s.kind === "needs-review" && (
                <small className="muted">Generating costs about $0.55 of Gemini usage: one Nano Banana image and one Omni Flash clip.</small>
              )}
            </>
          )}
        </section>

        <section className="panel panel-result">
          <h2>Remix</h2>
          {remix.finalFile ? (
            <>
              <video src={fileUrl(remix, remix.finalFile)} controls playsInline className="phone" />
              <div className="actions">
                <a className="button primary" href={fileUrl(remix, remix.finalFile, true)}>
                  Download MP4
                </a>
                {remix.plan && <CopyCaption script={remix.plan.script} />}
              </div>
            </>
          ) : remix.previousFinalFile ? (
            <>
              <video src={fileUrl(remix, remix.previousFinalFile)} controls playsInline className="phone" />
              <p className="muted">
                {busy ? "Previous version. The new one is being generated." : "Previous version. The new one hasn't finished."}
              </p>
              <div className="actions">
                <a className="button" href={fileUrl(remix, remix.previousFinalFile, true)}>
                  Download previous MP4
                </a>
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

          {redoOptions.length > 0 && (
            <div className="redo">
              <p className="redo-title">
                Not quite right? Redo one step. The steps after it run again, and the current video stays downloadable until
                the new one is done.
              </p>
              <div className="redo-buttons">
                {redoOptions.map((step) => (
                  <button key={step} disabled={busy} onClick={() => act({ action: "redo", from: step })}>
                    {REDO[step].label}
                  </button>
                ))}
              </div>
              <ul className="redo-costs">
                {redoOptions.map((step) => (
                  <li key={step}>
                    <strong>{REDO[step].label}</strong> reruns the {REDO[step].reruns}, {REDO[step].cost}.
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="redo">
            <p className="redo-title">
              {remix.finalFile ? "New demo recording? Swap it in and the video is re-stitched." : "Wrong demo recording? Swap it in before stitching."}
            </p>
            <div className="redo-buttons">
              <a className="button" href={fileUrl(remix, remix.input.demoFile)} target="_blank" rel="noreferrer">
                Current demo
              </a>
              <button disabled={busy || uploadingDemo} onClick={() => demoInput.current?.click()}>
                {uploadingDemo ? "Uploading…" : "Replace demo"}
              </button>
              <input
                ref={demoInput}
                type="file"
                accept="video/*"
                hidden
                aria-label="Replace demo recording"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) replaceDemo(file);
                }}
              />
            </div>
          </div>
          {remix.avatarFile && remix.hookFile && (
            <div className="thumbs">
              <a href={fileUrl(remix, remix.avatarFile)} target="_blank" rel="noreferrer">
                <img src={fileUrl(remix, remix.avatarFile)} alt="" />
                <span>Avatar frame</span>
              </a>
              <a href={fileUrl(remix, remix.hookFile)} target="_blank" rel="noreferrer">
                <video src={`${fileUrl(remix, remix.hookFile)}#t=0.1`} preload="metadata" muted playsInline />
                <span>Hook clip</span>
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
        <textarea
          rows={2}
          value={script.hashtags.join(" ")}
          onChange={(e) => set("hashtags", e.target.value.split(/[ \n]/))}
        />
      </label>
    </div>
  );
}

function CopyCaption({ script }: { script: Script }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      onClick={async () => {
        const tags = script.hashtags.filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`));
        await navigator.clipboard.writeText(`${script.caption}\n\n${tags.join(" ")}`);
        setCopied(true);
      }}
    >
      {copied ? "Copied ✓" : "Copy caption"}
    </button>
  );
}
