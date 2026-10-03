import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { getDataset } from "@/server/services/datasets";
import { companyDto } from "@/server/services/companies";
import { companyDetail, patchCompany } from "@/server/services/company-write";
import { patchBodySchema } from "@/server/services/company-schema";
import { parseAsOf } from "@/server/services/assessments";

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string; record_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id, record_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");
    const url = new URL(req.url);
    const asOf = parseAsOf(url.searchParams.get("as_of"), dataset.default_as_of);
    const detail = await companyDetail(dataset, record_id, asOf);
    return okJson({ ...detail.company, assessment: detail.assessment, signals: detail.signals, contacts: detail.contacts, opportunities: detail.opportunities }, {}, rid);
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
    const parsed = patchBodySchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw validation(
        "Payload inválido.",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
    }
    const updated = await patchCompany(dataset, record_id, parsed.data.expected_version, parsed.data.changes, {
      userId: session.user.id,
      requestId: rid,
    });
    return okJson(companyDto(updated), {}, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
