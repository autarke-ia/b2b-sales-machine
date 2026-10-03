import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { publishRuleset, rulesetDto } from "@/server/services/rules-write";
import { runIdempotent } from "@/server/http/idempotency";
import { z } from "zod";

const bodySchema = z.object({ expected_active_ruleset_id: z.string().uuid().nullable() }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; ruleset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, ruleset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const raw = await req.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const parsed = bodySchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw validation("expected_active_ruleset_id é obrigatório.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return await runIdempotent(req, session.user.id, raw, async () => {
      const result = await publishRuleset(dataset, ruleset_id, parsed.data.expected_active_ruleset_id, session.user.id);
      return {
        status: 200,
        body: { data: { ...rulesetDto(result.ruleset), dataset_revision: result.dataset_revision }, meta: { request_id: rid } },
        headers: { "X-Request-Id": rid },
      };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
