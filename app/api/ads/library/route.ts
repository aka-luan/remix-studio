import { handle } from "@/lib/ads/http";
import { libraryItems } from "@/lib/ads/service";

export const runtime = "nodejs";

export function GET() {
  return handle(libraryItems);
}
