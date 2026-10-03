import type { Company, Prisma } from "@prisma/client";
import { evaluate, type Assessment, type Level, type RuleConfig } from "../../domain/scoring";
import { prisma } from "../db/prisma";
import { validation } from "../http/errors";
import type { DatasetPayload } from "./datasets";
import { activeRules } from "./datasets";

type CompanyRow = Company;

/** DTO público de Company (campos nullable SEMPRE explícitos — doc 01 §1). */
export function companyDto(c: CompanyRow) {
  return {
    id: c.id,
    dataset_id: c.dataset_id,
    version: c.version,
    created_at: c.created_at.toISOString(),
    created_by: c.created_by,
    updated_at: c.updated_at?.toISOString() ?? null,
    updated_by: c.updated_by ?? null,
    archived_at: c.archived_at?.toISOString() ?? null,
    external_id: c.external_id,
    name: c.name,
    domain: c.domain,
    segment: c.segment,
    employees: c.employees,
    uf: c.uf,
    hr_structured: c.hr_structured,
    multi_region: c.multi_region,
    growth: c.growth,
    employer_branding: c.employer_branding,
    retention_pain: c.retention_pain,
    renewal_window: c.renewal_window,
    source_label: c.source_label,
    operating_status: c.operating_status,
    input_revision: c.input_revision,
    operates_in_brazil: c.operates_in_brazil,
    has_benefits: c.has_benefits,
    seeks_benefit_differentiation: c.seeks_benefit_differentiation,
    renewed_24_plus: c.renewed_24_plus,
    is_synthetic: c.is_synthetic,
  };
}

/** Empresa no formato do motor (enum casts — o Prisma devolve os mesmos valores). */
export function toEngineCompany(c: CompanyRow) {
  return {
    ...c,
    growth: c.growth as Level | null,
    employer_branding: c.employer_branding as Level | null,
    retention_pain: c.retention_pain as Level | null,
    renewal_window: c.renewal_window as "m0_3" | "m4_6" | "m7_12" | "over_12" | null,
    operating_status: c.operating_status as "active" | "inactive" | "unknown",
  };
}

/** Gate de UMA empresa (só campos da própria empresa — sinais/contatos só afetam prioridade). */
export function gateFor(company: CompanyRow, rules: RuleConfig): Assessment["gate"] {
  return evaluate({ company: toEngineCompany(company), rules, as_of: "1970-01-01" }).gate;
}

export interface ListParams {
  q?: string;
  segment?: string;
  uf?: string;
  icp_state?: string;
  page: number;
  pageSize: number;
  includeArchived: boolean;
}

export interface ListResult {
  rows: CompanyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Listagem com filtros AND (doc 03 §5): q substring case-insensitive em
 * nome/external_id; uf/segment exatos; icp_state avaliado pelo motor sobre os
 * defaults ativos. O gate é computado sobre TODAS as candidatas antes de
 * paginar (120 contas: custo trivial e correto — nunca pagina antes do filtro).
 */
export async function listCompanies(dataset: DatasetPayload, p: ListParams): Promise<ListResult> {
  if (p.icp_state && !["in", "out", "pending"].includes(p.icp_state)) {
    throw validation("icp_state inválido.", [{ field: "icp_state", message: "use in, out ou pending" }]);
  }
  const where: Prisma.CompanyWhereInput = { dataset_id: dataset.id };  if (!p.includeArchived) where.archived_at = null;
  if (p.uf) where.uf = p.uf;
  if (p.segment) where.segment = p.segment;
  if (p.q) {
    where.OR = [
      { name: { contains: p.q, mode: "insensitive" } },
      { external_id: { contains: p.q, mode: "insensitive" } },
    ];
  }

  let rows = await prisma.company.findMany({ where, orderBy: [{ external_id: "asc" }, { id: "asc" }] });
  if (p.icp_state) {
    const rules = await activeRules(dataset);
    rows = rows.filter((c) => gateFor(c, rules).state === p.icp_state);
  }
  const total = rows.length;
  const totalPages = Math.ceil(total / p.pageSize);
  const start = (p.page - 1) * p.pageSize;
  return { rows: rows.slice(start, start + p.pageSize), total, page: p.page, pageSize: p.pageSize, totalPages };
}

export function parsePagination(url: URL): { page: number; pageSize: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const rawSize = Number(url.searchParams.get("page_size") ?? "25") || 25;
  const pageSize = Math.min(100, Math.max(1, rawSize));
  return { page, pageSize };
}
