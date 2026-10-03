import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";

/** Consulta de prévia/importação (doc 03 §5): status, contagens e expiração. */
export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; import_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, import_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const batch = await prisma.importBatch.findUnique({
      where: { id: import_id },
      include: { rows: { orderBy: { row_number: "asc" }, take: 100 } },
    });
    if (!batch || batch.dataset_id !== dataset.id) throw notFound("Importação não encontrada nesta base.");
    const expired = batch.expires_at.getTime() < Date.now();
    return okJson(
      {
        import_id: batch.id,
        status: batch.status === "previewed" && expired ? "expired" : batch.status,
        target: batch.target,
        merge_policy: batch.merge_policy,
        counts: batch.counts,
        committed_at: batch.committed_at?.toISOString() ?? null,
        expires_at: batch.expires_at.toISOString(),
        rows: batch.rows.map((r) => ({
          row: r.row_number,
          action: r.action,
          normalized: r.normalized,
          errors: r.errors,
        })),
      },
      {},
      rid,
    );
  } catch (e) {
    return errorJson(e, rid);
  }
}
