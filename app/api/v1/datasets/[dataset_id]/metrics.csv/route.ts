import { NextResponse, type NextResponse as NR } from "next/server";
import { errorJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { notFound } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { metricsCsv } from "@/server/services/metrics";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const csv = await metricsCsv(dataset);
    return new NextResponse(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "X-Request-Id": rid } });
  } catch (e) {
    return errorJson(e, rid);
  }
}
