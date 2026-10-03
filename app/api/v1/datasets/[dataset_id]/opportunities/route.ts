import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";
import { parsePagination } from "@/server/services/companies";
import { createRelated } from "@/server/services/related-write";
import { opportunityCreateSchema } from "@/server/services/related-schema";
import { runIdempotent } from "@/server/http/idempotency";

const KIND = "opportunities" as const;

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const url = new URL(req.url);
    const { page, pageSize } = parsePagination(url);
    const companyId = url.searchParams.get("company_id") ?? undefined;
    const where: Record<string, unknown> = { dataset_id: dataset.id };
    if (url.searchParams.get("include_archived") !== "true") where.archived_at = null;
    if (companyId) where.company_id = companyId;
    const model = prisma.opportunity;
    const [total, rows] = await Promise.all([
      model.count({ where }),
      model.findMany({ where, orderBy: [{ external_id: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return okJson(rows, {
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    }, rid);
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
    const parsed = opportunityCreateSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw validation("Payload inválido.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    return await runIdempotent(req, session.user.id, raw, async (tx, recordId) => {
      void tx; void recordId;
      const created = await createRelated(dataset, KIND, parsed.data as Record<string, unknown>, {
        userId: session.user.id, requestId: rid,
      });
      return { status: 201, body: { data: created, meta: { request_id: rid } }, headers: { "X-Request-Id": rid } };
    });
  } catch (e) {
    return errorJson(e, rid);
  }
}
