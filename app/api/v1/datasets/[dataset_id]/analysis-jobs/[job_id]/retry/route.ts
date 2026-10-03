import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { processAnalysisJob, retryJob } from "@/server/services/ai-analysis";
import { runIdempotent } from "@/server/http/idempotency";

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; job_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, job_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    return await runIdempotent(req, session.user.id, "", async () => {
      const next = await retryJob(dataset, job_id, session.user.id);
      void processAnalysisJob(next.job_id).catch(() => undefined);
      return { status: 202, body: { data: next, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
