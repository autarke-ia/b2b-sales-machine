import { NextResponse, type NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { badRequest, notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import {
  assertAsOfConsistent,
  getRankingSnapshot,
  parseAsOf,
  parseRankingFilters,
  rankingCsv,
  readRanking,
} from "@/server/services/assessments";

/** Exportação congelada: exige snapshot_id (doc 03 §7); exporta TODOS os resultados
 * filtrados do snapshot, sem paginação, com teto de 2.000 (limite de produto). */
export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const url = new URL(req.url);
    const snapshotIdParam = url.searchParams.get("snapshot_id");
    if (!snapshotIdParam) {
      throw badRequest("MALFORMED_REQUEST", "snapshot_id é obrigatório na exportação (consulte /ranking primeiro).");
    }
    const asOfParam = url.searchParams.get("as_of");
    const snapshot = await getRankingSnapshot(dataset, parseAsOf(null, dataset.default_as_of), snapshotIdParam, session.user.id);
    assertAsOfConsistent(snapshot, asOfParam);

    const filters = parseRankingFilters(url);
    const view = await readRanking(dataset, snapshot, filters);
    const csv = rankingCsv(view.rows.slice(0, 2000), snapshot.ruleset_id, snapshot.as_of.toISOString().slice(0, 10));
    return new NextResponse(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "X-Request-Id": rid },
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
