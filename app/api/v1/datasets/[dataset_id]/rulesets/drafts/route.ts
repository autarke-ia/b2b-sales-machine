import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { createDraft, rulesetDto } from "@/server/services/rules-write";
import { runIdempotent } from "@/server/http/idempotency";

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const raw = await req.text();
    let body: { config?: unknown } = {};
    if (raw.trim() !== "") {
      try {
        body = JSON.parse(raw) as { config?: unknown };
      } catch {
        throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
      }
    }
    return await runIdempotent(req, session.user.id, raw, async () => {
      const draft = await createDraft(dataset, body.config, session.user.id);
      return { status: 201, body: { data: rulesetDto(draft), meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
