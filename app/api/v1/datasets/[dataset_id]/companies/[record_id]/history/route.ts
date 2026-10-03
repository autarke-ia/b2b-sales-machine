import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { companyHistory } from "@/server/services/company-write";
import { parsePagination } from "@/server/services/companies";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; record_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, record_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const url = new URL(req.url);
    const { page, pageSize } = parsePagination(url);
    const result = await companyHistory(dataset, record_id, url.searchParams.get("field") ?? undefined, page, pageSize);
    return okJson(result.rows, {
      pagination: { page: result.page, page_size: result.pageSize, total: result.total, total_pages: result.totalPages },
    }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
