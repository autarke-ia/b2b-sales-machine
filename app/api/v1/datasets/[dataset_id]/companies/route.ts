import type { NextResponse as NR } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireMutationContext, requireSession } from "@/server/http/guard";
import { badRequest, notFound, validation } from "@/server/http/errors";
import { prisma, setActorContext } from "@/server/db/prisma";
import { getDataset } from "@/server/services/datasets";
import { companyDto, listCompanies, parsePagination } from "@/server/services/companies";

const UFS = new Set(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);
const LEVELS = new Set(["low", "medium", "high"]);
const RENEWALS = new Set(["m0_3", "m4_6", "m7_12", "over_12"]);

/** POST — cria empresa (doc 01 §2.1): IDs legados, autoria da sessão, auditoria. */
export async function POST(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    const session = await requireMutationContext(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const raw = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
    } catch {
      throw badRequest("MALFORMED_REQUEST", "Corpo JSON inválido.");
    }
    const fieldErrors: Array<{ field: string; message: string }> = [];
    const allowed = new Set(["external_id", "name", "domain", "segment", "employees", "uf", "operates_in_brazil", "hr_structured", "has_benefits", "seeks_benefit_differentiation", "multi_region", "growth", "employer_branding", "retention_pain", "renewal_window", "renewed_24_plus", "operating_status", "source_label"]);
    for (const k of Object.keys(body)) if (!allowed.has(k)) fieldErrors.push({ field: k, message: "campo desconhecido" });
    if (typeof body.external_id !== "string" || !body.external_id.trim()) fieldErrors.push({ field: "external_id", message: "obrigatório" });
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 240) fieldErrors.push({ field: "name", message: "obrigatório (1–240)" });

    const data: Record<string, unknown> = {};
    const bools = new Set(["operates_in_brazil", "hr_structured", "has_benefits", "seeks_benefit_differentiation", "multi_region", "renewed_24_plus"]);
    const levels = new Set(["growth", "employer_branding", "retention_pain"]);
    for (const [k, v] of Object.entries(body)) {
      if (k === "external_id" || k === "name" || fieldErrors.some((f) => f.field === k)) continue;
      if (bools.has(k)) { if (v !== null && typeof v !== "boolean") fieldErrors.push({ field: k, message: "booleano ou null" }); else data[k] = v; }
      else if (levels.has(k)) { if (v !== null && !(typeof v === "string" && LEVELS.has(v))) fieldErrors.push({ field: k, message: "low/medium/high ou null" }); else data[k] = v; }
      else if (k === "renewal_window") { if (v !== null && !(typeof v === "string" && RENEWALS.has(v))) fieldErrors.push({ field: k, message: "janela ou null" }); else data[k] = v; }
      else if (k === "employees") { if (v !== null && !(Number.isInteger(v) && (v as number) >= 0)) fieldErrors.push({ field: k, message: "inteiro ≥ 0 ou null" }); else data[k] = v; }
      else if (k === "uf") { if (v !== null && !(typeof v === "string" && UFS.has(v))) fieldErrors.push({ field: k, message: "UF válida ou null" }); else data[k] = v; }
      else if (k === "domain") { if (v !== null && !(typeof v === "string" && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test((v as string).toLowerCase()))) fieldErrors.push({ field: k, message: "domínio inválido" }); else data[k] = (v as string).toLowerCase(); }
      else if (k === "operating_status") { if (v !== null && !(typeof v === "string" && ["active", "inactive"].includes(v))) fieldErrors.push({ field: k, message: "active/inactive ou null" }); else data[k] = v; }
      else if (k === "segment" || k === "source_label") { if (v !== null && !(typeof v === "string" && v.length <= 120)) fieldErrors.push({ field: k, message: "texto ≤ 120 ou null" }); else data[k] = v; }
    }
    if (fieldErrors.length) throw validation("Payload inválido.", fieldErrors);

    const created = await prisma.$transaction(async (tx) => {
      await setActorContext(tx, { actor_user_id: session.user.id, source: "manual", request_id: rid });
      const dupe = await tx.company.findUnique({ where: { dataset_id_external_id: { dataset_id: dataset.id, external_id: (body.external_id as string).trim() } } });
      if (dupe) throw validation("external_id já existe nesta base.", [{ field: "external_id", message: "duplicado" }]);
      const row = await tx.company.create({
        data: { dataset_id: dataset.id, external_id: (body.external_id as string).trim(), name: (body.name as string).trim(), ...data, is_synthetic: false, created_by: session.user.id },
      });
      await tx.dataset.update({ where: { id: dataset.id }, data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: session.user.id } });
      return row;
    });
    return okJson(companyDto(created), {}, rid, 201, { "X-Request-Id": rid });
  } catch (e) {
    return errorJson(e, rid);
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ dataset_id: string }> }): Promise<NR> {
  const rid = crypto.randomUUID();
  try {
    await requireSession(req);
    const { dataset_id } = await ctx.params;
    const dataset = await getDataset(dataset_id);
    if (!dataset) throw notFound("Base não encontrada.");

    const url = new URL(req.url);
    const { page, pageSize } = parsePagination(url);
    const result = await listCompanies(dataset, {
      q: url.searchParams.get("q") ?? undefined,
      segment: url.searchParams.get("segment") ?? undefined,
      uf: url.searchParams.get("uf") ?? undefined,
      icp_state: url.searchParams.get("icp_state") ?? undefined,
      page,
      pageSize,
      includeArchived: url.searchParams.get("include_archived") === "true",
    });
    return okJson(result.rows.map(companyDto), {
      pagination: { page: result.page, page_size: result.pageSize, total: result.total, total_pages: result.totalPages },
    }, rid);
  } catch (e) {
    return errorJson(e, rid);
  }
}
