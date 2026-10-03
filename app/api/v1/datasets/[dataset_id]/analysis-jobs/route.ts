import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, tooMany, validation } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";
import { createAnalysisJob, processAnalysisJob, type JobScope } from "@/server/services/ai-analysis";
import { runIdempotent } from "@/server/http/idempotency";

const SCOPES = new Set(["icp_gaps", "eligible_enrichment"]);

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const raw = await req.text();
    let body: { company_ids?: unknown; scope?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const unknown = Object.keys(body).filter((k) => k !== "company_ids" && k !== "scope");
    const scope = String(body.scope ?? "");
    if (unknown.length || !SCOPES.has(scope) || !Array.isArray(body.company_ids) || body.company_ids.some((c) => typeof c !== "string")) {
      throw validation("company_ids (array de UUID) e scope (icp_gaps|eligible_enrichment) são obrigatórios.", [
        { field: "scope", message: "icp_gaps ou eligible_enrichment" },
      ]);
    }
    const open = await prisma.analysisJob.count({
      where: { dataset_id: dataset.id, created_by: session.user.id, state: { in: ["queued", "running"] } },
    });
    if (open >= 2) throw tooMany(60);
    return await runIdempotent(req, session.user.id, raw, async () => {
      const job = await createAnalysisJob(dataset, body.company_ids as string[], scope as JobScope, session.user.id);
      // Fire-and-forget durável: itens estão no banco; o processamento segue
      // no processo Node (fixture é instantâneo). Falha de processo é recuperável
      // pelo retry; nunca bloqueia a resposta 202 (doc 03 §6).
      void processAnalysisJob(job.job_id).catch(() => undefined);
      return { status: 202, body: { data: job, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
