import { handle, jsonBody } from "@/lib/ads/http";
import { exportConcept } from "@/lib/ads/service";
import type { FormatId } from "@/lib/ads/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export function POST(request: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  return handle(async () => {
    const { id, cid } = await params;
    const body = await jsonBody<{ formats?: FormatId[] }>(request);
    return exportConcept(id, cid, body.formats ?? ["feed", "story", "square"]);
  });
}
