import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { listSuggestions } from "@/server/services/review";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const url = new URL(req.url);
    const rows = await listSuggestions(dataset, url.searchParams.get("company_id") ?? undefined, url.searchParams.get("state") ?? undefined);
    return okJson(rows, { pagination: { page: 1, page_size: rows.length, total: rows.length, total_pages: rows.length ? 1 : 0 } }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
