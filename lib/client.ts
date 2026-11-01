import { STEPS, type Remix, type Status, type StepName } from "./remix";

export function fileUrl(remix: Remix, file: string, download = false): string {
  return `/api/remixes/${remix.id}/files/${encodeURIComponent(file)}${download ? "?download" : ""}`;
}

export function thumbnail(remix: Remix): string | null {
  const file = remix.avatarFile ?? remix.source?.frames.find((f) => f.t >= 1)?.file ?? remix.source?.frames[0]?.file;
  return file ? fileUrl(remix, file) : null;
}

const stepLabel = (step: StepName) => STEPS.find((s) => s.name === step)!.label;

export function statusLabel(s: Status): string {
  switch (s.kind) {
    case "running":
      return `${stepLabel(s.step)}…`;
    case "failed":
      return `Failed: ${stepLabel(s.step)}`;
    case "needs-review":
      return "Script ready for review";
    case "ready":
      return "Queued";
    case "done":
      return "Done";
  }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}
