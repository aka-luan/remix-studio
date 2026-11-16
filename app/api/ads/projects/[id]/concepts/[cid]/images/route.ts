import { handle, jsonBody } from "@/lib/ads/http";
import { generateVersion, UserError } from "@/lib/ads/service";
import { ASPECTS, type Aspect } from "@/lib/ads/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export function POST(request: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  return handle(async () => {
    const { id, cid } = await params;
    const body = await jsonBody<{ aspect?: Aspect; prompt?: string }>(request);
    const aspect = body.aspect ?? "4:5";
    if (!ASPECTS.includes(aspect)) throw new UserError("Unsupported aspect ratio.");
    return generateVersion(id, cid, { aspect, prompt: body.prompt });
  });
}
