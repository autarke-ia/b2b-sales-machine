import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { runIdempotent } from "@/server/http/idempotency";
import { createDataset, datasetDto, listDatasets } from "@/server/services/datasets";
import { parsePagination } from "@/server/services/companies";
import { validation } from "@/server/http/errors";

export async function GET(req: Request): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { page, pageSize } = parsePagination(new URL(req.url));
    const all = await listDatasets();
    const start = (page - 1) * pageSize;
    return okJson(all.slice(start, start + pageSize), {
      pagination: { page, page_size: pageSize, total: all.length, total_pages: Math.ceil(all.length / pageSize) },
    }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}

export async function POST(req: Request): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const ctx = await requireMutationContext(req);
    // Body lido UMA vez: o hash de idempotência usa a string crua (single-use body).
    const raw = await req.text();
    const body = JSON.parse(raw) as { name?: unknown };
    if (typeof body.name !== "string") {
      throw validation("name é obrigatório (string).", [{ field: "name", message: "obrigatório" }]);
    }
    return await runIdempotent(req, ctx.user.id, raw, async (tx) => {
      const id = await createDataset(ctx.user.id, body.name as string, tx);
      const created = await tx.dataset.findUniqueOrThrow({ where: { id } });
      return { status: 201, body: { data: datasetDto(created), meta: { request_id: rid } } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
