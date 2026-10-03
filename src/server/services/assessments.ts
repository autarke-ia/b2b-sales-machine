import type { Prisma, RankingSnapshot } from "@prisma/client";
import { evaluate, rankRows, type Assessment, type RuleConfig } from "../../domain/scoring";
import { prisma } from "../db/prisma";
import { badRequest, notFound, validation } from "../http/errors";
import type { DatasetPayload } from "./datasets";
import { activeRules } from "./datasets";
import { toEngineCompany } from "./companies";

export interface RankingRow {
  rank: number;
  company_id: string;
  external_id: string;
  name: string;
  segment: string | null;
  uf: string | null;
  employees: number | null;
  assessment: AssessmentDto;
  has_public_channel: boolean;
  has_decision_maker: boolean;
  pending_suggestions: number;
}

export interface AssessmentDto {
  id: string;
  company_id: string;
  company_version: number;
  input_revision: number;
  dataset_revision: number;
  ruleset_id: string;
  as_of: string;
  calculated_at: string;
  gate: Assessment["gate"];
  priority: Assessment["priority"];
}

export interface RankingFilters {
  q?: string;
  segment?: string;
  uf?: string;
  band?: string;
  decisor?: boolean;
  employees_min?: number;
  employees_max?: number;
}

export interface RankingReadResult {
  snapshotId: string;
  rows: RankingRow[];
  total: number;
  filtersApplied: RankingFilters;
  isStale: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CSV_HEADER = "rank,external_id,name,segment,uf,employees,priority_score,priority_min,priority_max,priority_band,review_status,ruleset_id,as_of";

export function parseAsOf(value: string | null, fallback: Date): string {
  if (value === null) return fallback.toISOString().slice(0, 10);
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
    throw validation("as_of deve ser uma data ISO YYYY-MM-DD válida.", [{ field: "as_of", message: "formato inválido" }]);
  }
  return value;
}

export function parseRankingFilters(url: URL): RankingFilters {
  const f: RankingFilters = {};
  const q = url.searchParams.get("q");
  if (q) f.q = q;
  for (const k of ["segment", "uf", "band"] as const) {
    const v = url.searchParams.get(k);
    if (v) f[k] = v;
  }
  if (f.band && !["high", "medium", "low"].includes(f.band)) {
    throw validation("band inválido.", [{ field: "band", message: "use high, medium ou low" }]);
  }
  const decisor = url.searchParams.get("decisor");
  if (decisor !== null) f.decisor = decisor === "true";
  for (const [key, param] of [["employees_min", "employees_min"], ["employees_max", "employees_max"]] as const) {
    const v = url.searchParams.get(param);
    if (v !== null) {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw validation(`${key} deve ser inteiro ≥ 0.`, [{ field: key, message: "inteiro ≥ 0" }]);
      f[key] = n;
    }
  }
  return f;
}

function rowMatchesFilters(row: RankingRow, f: RankingFilters): boolean {
  if (!row.assessment.priority) return false; // INV-6: linha de ranking é sempre 'in' com prioridade
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (!row.name.toLowerCase().includes(needle) && !row.external_id.toLowerCase().includes(needle)) return false;
  }
  if (f.segment && row.segment !== f.segment) return false;
  if (f.uf && row.uf !== f.uf) return false;
  if (f.band && row.assessment.priority.band !== f.band) return false;
  if (f.decisor !== undefined && row.has_decision_maker !== f.decisor) return false;
  if (f.employees_min !== undefined && (row.employees === null || row.employees < f.employees_min)) return false;
  if (f.employees_max !== undefined && (row.employees === null || row.employees > f.employees_max)) return false;
  return true;
}

interface DatasetEvaluation {
  assessments: Map<string, Assessment>;
  flags: Map<string, { has_public_channel: boolean; has_decision_maker: boolean }>;
  pendingCounts: Map<string, number>;
}

async function evaluateDatasetFull(dataset: DatasetPayload, rules: RuleConfig, asOf: string): Promise<DatasetEvaluation> {
  const [companies, signals, contacts, opportunities] = await Promise.all([
    prisma.company.findMany({ where: { dataset_id: dataset.id } }),
    prisma.signal.findMany({ where: { dataset_id: dataset.id } }),
    prisma.contact.findMany({ where: { dataset_id: dataset.id } }),
    prisma.opportunity.findMany({ where: { dataset_id: dataset.id } }),
  ]);

  const engineSignals = signals.map((s) => ({ ...s, strength: s.strength as "low" | "medium" | "high" }));
  const engineCompanies = companies.map(toEngineCompany);

  const assessments = new Map<string, Assessment>();
  for (const c of engineCompanies) {
    assessments.set(
      c.id,
      evaluate({ company: c, signals: engineSignals, contacts, opportunities, rules, as_of: asOf }),
    );
  }

  const flags = new Map<string, { has_public_channel: boolean; has_decision_maker: boolean }>();
  for (const c of companies) {
    const own = contacts.filter((x) => x.company_id === c.id && !x.archived_at);
    flags.set(c.id, {
      has_public_channel: own.some((x) => x.source_allowed === true),
      has_decision_maker: own.some(
        (x) =>
          x.source_allowed === true &&
          x.is_professional_public === true &&
          x.decision_maker_identified === true &&
          !!x.full_name?.trim() &&
          !!x.job_title?.trim() &&
          !!x.channel_value?.trim(),
      ),
    });
  }

  const pending = await prisma.suggestion.groupBy({
    by: ["company_id"],
    where: { dataset_id: dataset.id, state: { in: ["pending", "deferred"] }, relation: { not: "inconclusive" } },
    _count: { _all: true },
  });
  const pendingCounts = new Map(pending.map((p) => [p.company_id, p._count._all]));

  return { assessments, flags, pendingCounts };
}

type SnapshotRow = RankingSnapshot;

function staleCheck(snapshot: SnapshotRow, dataset: DatasetPayload): boolean {
  return (
    snapshot.data_revision !== dataset.data_revision ||
    snapshot.review_revision !== dataset.review_revision ||
    snapshot.ruleset_id !== dataset.active_ruleset_id
  );
}

/** Consulta/cria o snapshot do ranking (doc 02 §9; INV-6/7/8). */
export async function getRankingSnapshot(dataset: DatasetPayload, asOf: string, snapshotId: string | null, userId: string): Promise<SnapshotRow> {
  if (snapshotId) {
    const snap = await prisma.rankingSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snap || snap.dataset_id !== dataset.id) throw notFound("Snapshot não encontrado nesta base.");
    return snap;
  }
  const existing = await prisma.rankingSnapshot.findUnique({
    where: {
      dataset_id_data_revision_review_revision_ruleset_id_as_of: {
        dataset_id: dataset.id,
        data_revision: dataset.data_revision,
        review_revision: dataset.review_revision,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: new Date(asOf),
      },
    },
  });
  if (existing) return existing;
  return materializeSnapshot(dataset, asOf, userId);
}

async function materializeSnapshot(dataset: DatasetPayload, asOf: string, userId: string): Promise<SnapshotRow> {
  const rules = await activeRules(dataset);
  const evaluation = await evaluateDatasetFull(dataset, rules, asOf);
  const companies = await prisma.company.findMany({ where: { dataset_id: dataset.id } });
  const byId = new Map(companies.map((c) => [c.id, c]));
  const calculatedAt = new Date();

  // rankRows precisa das linhas ranqueáveis com o assessment do motor.
  const rankable = companies
    .map((c) => ({ company: c, assessment: evaluation.assessments.get(c.id)! }))
    .filter((r) => r.assessment.gate.state === "in")
    .map((r) => ({ company_id: r.company.id, external_id: r.company.external_id, assessment: r.assessment }));
  // rankRows preserva campos extras do input (company_id) através do genérico R.
  const rankedRows = rankRows(rankable);
  const asOfDate = new Date(asOf);

  // Assessments + snapshot na MESMA transação: artefato derivado nunca órfão.
  const assessmentId = await prisma.$transaction(async (tx) => {
    await tx.assessment.createMany({
      data: companies.map((c) => ({
        dataset_id: dataset.id,
        company_id: c.id,
        input_revision: c.input_revision,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: asOfDate,
        dataset_revision: dataset.data_revision,
        review_revision: dataset.review_revision,
        payload: evaluation.assessments.get(c.id)! as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    const stored = await tx.assessment.findMany({
      where: {
        dataset_id: dataset.id,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: asOfDate,
        dataset_revision: dataset.data_revision,
        review_revision: dataset.review_revision,
      },
      select: { id: true, company_id: true, input_revision: true },
    });
    return new Map(stored.map((s) => [`${s.company_id}:${s.input_revision}`, s.id]));
  });

  const rows: RankingRow[] = rankedRows.map((r) => {
    const company = byId.get(r.company_id)!;
    const assessment = evaluation.assessments.get(company.id)!;
    const flags = evaluation.flags.get(company.id)!;
    return {
      rank: r.rank,
      company_id: company.id,
      external_id: company.external_id,
      name: company.name,
      segment: company.segment,
      uf: company.uf,
      employees: company.employees,
      assessment: {
        id: assessmentId.get(`${company.id}:${company.input_revision}`) ??
          (() => {
            throw new Error(`SNAPSHOT_INCONSISTENT: assessment ausente para ${company.external_id}`);
          })(),
        company_id: company.id,
        company_version: company.version,
        input_revision: company.input_revision,
        dataset_revision: dataset.data_revision,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: asOf,
        calculated_at: calculatedAt.toISOString(),
        gate: assessment.gate,
        priority: assessment.priority!,
      },
      has_public_channel: flags.has_public_channel,
      has_decision_maker: flags.has_decision_maker,
      pending_suggestions: evaluation.pendingCounts.get(company.id) ?? 0,
    };
  });
  try {
    return await prisma.rankingSnapshot.create({
      data: {
        dataset_id: dataset.id,
        data_revision: dataset.data_revision,
        review_revision: dataset.review_revision,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: asOfDate,
        rows: rows as unknown as Prisma.InputJsonValue,
        created_by: userId,
      },
    });
  } catch (e) {
    // Corrida de primeira materialização (dois GETs simultâneos): o UNIQUE da
    // cache key elege um vencedor — reusa em vez de 500 (INV-7/8 preservados).
    if ((e as { code?: string }).code === "P2002") {
      const winner = await prisma.rankingSnapshot.findUnique({
        where: {
          dataset_id_data_revision_review_revision_ruleset_id_as_of: {
            dataset_id: dataset.id,
            data_revision: dataset.data_revision,
            review_revision: dataset.review_revision,
            ruleset_id: dataset.active_ruleset_id!,
            as_of: asOfDate,
          },
        },
      });
      if (winner) return winner;
    }
    throw e;
  }
}

export interface RankingView {
  snapshot: SnapshotRow;
  rows: RankingRow[];
  total: number;
  isStale: boolean;
}

export async function readRanking(dataset: DatasetPayload, snapshot: SnapshotRow, filters: RankingFilters): Promise<RankingView> {
  const all = snapshot.rows as unknown as RankingRow[];
  const rows = filters.q || filters.segment || filters.uf || filters.band || filters.decisor !== undefined || filters.employees_min !== undefined || filters.employees_max !== undefined
    ? all.filter((r) => rowMatchesFilters(r, filters))
    : all;
  return { snapshot, rows, total: rows.length, isStale: staleCheck(snapshot, dataset) };
}

/** Confere as_of contra o snapshot congelado (doc 03 §7). */
export function assertAsOfConsistent(snapshot: SnapshotRow, asOfParam: string | null): void {
  if (asOfParam === null) return;
  const snapDate = snapshot.as_of.toISOString().slice(0, 10);
  if (asOfParam !== snapDate) {
    throw badRequest("MALFORMED_REQUEST", `as_of=${asOfParam} contradiz o snapshot (${snapDate}).`);
  }
}

/** Célula CSV neutralizada contra injeção de fórmula (doc 07 §8). */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  const dangerous = /^[=+\-@\t\r]/.test(s);
  const needsQuote = dangerous || /[",\n;]/.test(s);
  const safe = dangerous ? `'${s}` : s;
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function rankingCsv(rows: RankingRow[], rulesetId: string, asOf: string): string {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    const p = r.assessment.priority;
    if (!p) continue; // INV-6: ranking só contém 'in'; defesa contra payload corrompido
    lines.push(
      [
        r.rank,
        r.external_id,
        r.name,
        r.segment,
        r.uf,
        r.employees,
        p.score.toFixed(2),
        p.score_min.toFixed(2),
        p.score_max.toFixed(2),
        p.band,
        p.status,
        rulesetId,
        asOf,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
