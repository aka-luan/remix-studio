"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, statusLabel, thumbnail } from "@/lib/client";
import { status, type Remix } from "@/lib/remix";

export function Library() {
  const [remixes, setRemixes] = useState<Remix[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const list = await api<Remix[]>("/api/remixes").catch(() => null);
      if (cancelled) return;
      if (list) setRemixes(list);
      timer = setTimeout(load, list?.some((r) => r.run.state === "running") ? 3000 : 15000);
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (remixes === null) return <p className="muted">Loading…</p>;
  if (remixes.length === 0) return <p className="muted">Your remixes will show up here.</p>;

  return (
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
  );
}
