"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, statusLabel, thumbnail } from "@/lib/client";
import { status, type Remix } from "@/lib/remix";

export function Library() {
  const [remixes, setRemixes] = useState<Remix[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cancelled = useRef(false);

  const load = useCallback(async () => {
    let list: Remix[] | null = null;
    try {
      list = await api<Remix[]>("/api/remixes");
      if (cancelled.current) return;
      setRemixes(list);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(load, list?.some((r) => r.run.state === "running") ? 3000 : 15000);
  }, []);

  useEffect(() => {
    cancelled.current = false;
    load();
    return () => {
      cancelled.current = true;
      clearTimeout(timer.current);
    };
  }, [load]);

  if (remixes === null) {
    return error ? (
      <div className="error-box" role="alert">
        <p>Couldn&apos;t load your remixes: {error}</p>
        <button className="primary" onClick={load}>
          Retry
        </button>
      </div>
    ) : (
      <p className="muted">Loading…</p>
    );
  }

  return (
    <>
      {error && (
        <div className="notice" role="status">
          <p>Couldn&apos;t refresh the library. Showing what was last loaded.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {remixes.length === 0 ? (
        <p className="muted">Your remixes will show up here.</p>
      ) : (
        <ul className="library">
          {remixes.map((remix) => {
            const s = status(remix);
            const thumb = thumbnail(remix);
            return (
              <li key={remix.id}>
                <Link href={`/remix/${remix.id}`} className="card">
                  <div className="thumb">{thumb && <img src={thumb} alt="" />}</div>
                  <div className="card-body">
                    <strong>{remix.plan?.script.hookText ?? remix.input.product.name}</strong>
                    <span className="muted">
                      {remix.input.product.name} · {new Date(remix.createdAt).toLocaleDateString()}
                    </span>
                    <span className={`pill pill-${s.kind}`}>{statusLabel(s)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
