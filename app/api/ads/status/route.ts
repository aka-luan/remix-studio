import { NextResponse } from "next/server";
import { adsStatus } from "@/lib/ads/ai";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(adsStatus());
}
