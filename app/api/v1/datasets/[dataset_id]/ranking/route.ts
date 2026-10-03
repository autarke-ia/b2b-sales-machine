import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { parsePagination } from "@/server/services/companies";
import {
  assertAsOfConsistent,
  getRankingSnapshot,
  parseAsOf,
  parseRankingFilters,
  readRanking,
} from "@/server/services/assessments";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const url = new URL(req.url);
    const asOfParam = url.searchParams.get("as_of");
    const snapshotIdParam = url.searchParams.get("snapshot_id");
    const asOf = parseAsOf(asOfParam, dataset.default_as_of);
    const snapshot = await getRankingSnapshot(dataset, asOf, snapshotIdParam, session.user.id);
    assertAsOfConsistent(snapshot, asOfParam);

    const filters = parseRankingFilters(url);
    const view = await readRanking(dataset, snapshot, filters);
    const { page, pageSize } = parsePagination(url);
    const start = (page - 1) * pageSize;
    const rows = view.rows.slice(start, start + pageSize);

    return okJson(rows, {
      pagination: { page, page_size: pageSize, total: view.total, total_pages: Math.ceil(view.total / pageSize) },
      snapshot_id: snapshot.id,
      dataset_revision: snapshot.data_revision,
      ruleset_id: snapshot.ruleset_id,
      as_of: snapshot.as_of.toISOString().slice(0, 10),
      current_dataset_revision: dataset.data_revision,
      is_stale: view.isStale,
    }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
