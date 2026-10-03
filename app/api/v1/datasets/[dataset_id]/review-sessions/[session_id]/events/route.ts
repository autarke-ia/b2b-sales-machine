import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { sessionEvent } from "@/server/services/metrics";
import { runIdempotent } from "@/server/http/idempotency";
import { z } from "zod";

const bodySchema = z
  .object({
    event: z.enum(["pause", "resume", "complete", "abandon"]),
    expected_version: z.number().int().min(1),
    expected_input_revision: z.number().int().min(1).nullish(),
    interrupted: z.boolean().optional(),
  })
  .strict();

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; session_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, session_id } = await ctx.params;
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
    if (parsed.data.event !== "complete" && parsed.data.interrupted !== undefined) {
      throw validation("interrupted só é aceito em complete.", [{ field: "interrupted", message: "somente em complete" }]);
    }
    return await runIdempotent(req, session.user.id, raw, async () => {
      const updated = await sessionEvent(
        dataset,
        session_id,
        parsed.data.event,
        parsed.data.expected_version,
        parsed.data.expected_input_revision ?? null,
        parsed.data.interrupted ?? false,
        session.user.id,
        rid,
      );
      return { status: 200, body: { data: updated, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
