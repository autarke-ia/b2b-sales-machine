import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";
import { rulesetDto } from "@/server/services/rules-write";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; ruleset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, ruleset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const ruleset = await prisma.ruleset.findUnique({ where: { id: ruleset_id } });
    if (!ruleset || ruleset.dataset_id !== dataset.id) throw notFound("Regra não encontrada nesta base.");
    return okJson(rulesetDto(ruleset), {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
