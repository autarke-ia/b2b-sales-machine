import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";
import { patchRelated } from "@/server/services/related-write";
import { versionedBody, opportunityPatchSchema } from "@/server/services/related-schema";

const KIND = "opportunities" as const;

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; record_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, record_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const row = await prisma.opportunity.findUnique({ where: { id: record_id } });
    if (!row || row.dataset_id !== dataset.id) throw notFound("Oportunidade não encontrada nesta base.");
    return okJson(row, {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ dataset_id: string; record_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, record_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const raw = await req.text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const parsed = versionedBody(opportunityPatchSchema).safeParse(parsedJson);
    if (!parsed.success) {
      throw validation("Payload inválido.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    }
    const updated = await patchRelated(dataset, KIND, record_id, parsed.data.expected_version, parsed.data.changes as Record<string, unknown>, {
      userId: session.user.id, requestId: rid,
    });
    return okJson(updated, {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
