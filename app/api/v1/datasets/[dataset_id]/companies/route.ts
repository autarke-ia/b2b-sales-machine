import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { companyDto, listCompanies, parsePagination } from "@/server/services/companies";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const url = new URL(req.url);
    const { page, pageSize } = parsePagination(url);
    const result = await listCompanies(dataset, {
      q: url.searchParams.get("q") ?? undefined,
      segment: url.searchParams.get("segment") ?? undefined,
      uf: url.searchParams.get("uf") ?? undefined,
      icp_state: url.searchParams.get("icp_state") ?? undefined,
      page,
      pageSize,
      includeArchived: url.searchParams.get("include_archived") === "true",
    });
    return okJson(result.rows.map(companyDto), {
      pagination: { page: result.page, page_size: result.pageSize, total: result.total, total_pages: result.totalPages },
    }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
