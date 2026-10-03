import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { startSession } from "@/server/services/metrics";
import { runIdempotent } from "@/server/http/idempotency";
import { z } from "zod";

const bodySchema = z.object({ company_id: z.string().uuid(), mode: z.enum(["manual", "assisted"]) }).strict();

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const { listSessions } = await import("@/server/services/metrics");
    return okJson(await listSessions(dataset), {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id } = await ctx.params;
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
      const created = await startSession(dataset, parsed.data.company_id, parsed.data.mode, session.user.id);
      return { status: 201, body: { data: created, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
