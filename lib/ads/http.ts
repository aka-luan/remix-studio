import { NextResponse } from "next/server";
import { errorStatus } from "./service";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (err) {
    const status = errorStatus(err);
    if (status >= 500) console.error("[ads]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
  }
}

export async function jsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function fileField(form: FormData, name: string): File | null {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

export function textField(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
