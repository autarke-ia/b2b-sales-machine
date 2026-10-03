import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { archiveRelated } from "@/server/services/related-write";
import { z } from "zod";

const KIND = "signals" as const;
const bodySchema = z.object({ archived: z.boolean(), expected_version: z.number().int().min(1) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string; record_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id, record_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    let parsedJson: unknown;
    try {
      parsedJson = await req.json();
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const parsed = bodySchema.safeParse(parsedJson);
    if (!parsed.success) throw validation("Payload inválido.", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
    const updated = await archiveRelated(dataset, KIND, record_id, parsed.data.archived, parsed.data.expected_version, {
      userId: session.user.id, requestId: rid,
    });
    return okJson(updated, {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
