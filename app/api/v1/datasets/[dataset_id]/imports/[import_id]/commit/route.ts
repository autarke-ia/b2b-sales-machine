import type { NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { commitImport } from "@/server/services/imports";
import { runIdempotent } from "@/server/http/idempotency";

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; import_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, import_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const unknownKeys = Object.keys(body).filter((k) => k !== "expected_dataset_revision" && k !== "confirm_overwrite");
    const revision = Number(body.expected_dataset_revision);
    if (unknownKeys.length || !Number.isInteger(revision) || revision < 1) {
      throw validation("expected_dataset_revision (inteiro) é obrigatório; campos desconhecidos são rejeitados.", [
        { field: "expected_dataset_revision", message: "inteiro ≥ 1" },
      ]);
    }

    return await runIdempotent(req, session.user.id, raw, async (tx, recordId) => {
      void tx; void recordId; // commit é transação própria e atômica
      const result = await commitImport(dataset, import_id, revision, session.user.id, body.confirm_overwrite === true);
      return { status: 200, body: { data: result, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
