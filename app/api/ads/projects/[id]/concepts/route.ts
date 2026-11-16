import { handle, jsonBody } from "@/lib/ads/http";
import { addConcepts } from "@/lib/ads/service";

export const runtime = "nodejs";

/** { count } generates concepts with the model; { blank: true } adds an empty one to write by hand. */
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const body = await jsonBody<{ count?: number; blank?: boolean }>(request);
    return addConcepts((await params).id, Number(body.count) || 1, Boolean(body.blank));
  });
}
