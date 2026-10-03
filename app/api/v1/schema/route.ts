import { NextResponse } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { fieldCatalogData } from "@/server/services/catalog";

export async function GET(req: Request): Promise<NextResponse> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    return okJson(fieldCatalogData(), {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
