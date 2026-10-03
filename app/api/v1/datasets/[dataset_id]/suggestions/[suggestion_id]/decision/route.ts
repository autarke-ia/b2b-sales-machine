import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { decideSuggestion } from "@/server/services/review";
import { runIdempotent } from "@/server/http/idempotency";
import { z } from "zod";

const bodySchema = z
  .object({
    action: z.enum(["accept", "reject", "defer"]),
    expected_company_version: z.number().int().min(1),
    expected_suggestion_version: z.number().int().min(1),
    note: z.string().trim().max(600).nullish(),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; suggestion_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, suggestion_id } = await ctx.params;
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
      throw validation("Payload inválido.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return await runIdempotent(req, session.user.id, raw, async () => {
      const result = await decideSuggestion(
        dataset,
        suggestion_id,
        parsed.data.action,
        parsed.data.expected_company_version,
        parsed.data.expected_suggestion_version,
        session.user.id,
        rid,
        parsed.data.note ?? null,
      );
      return { status: 200, body: { data: result, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
