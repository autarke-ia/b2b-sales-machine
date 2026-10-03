import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { getJob } from "@/server/services/ai-analysis";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; job_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, job_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    return okJson(await getJob(dataset, job_id), {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
