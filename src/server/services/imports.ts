import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import { validateRuleConfig, type RuleConfig } from "../../domain/scoring";
import {
  NormalizeError,
  clean,
  isFormulaCell,
  normalizeBool,
  normalizeDate,
  normalizeHeader,
  normalizeInt,
  normalizeLevel,
  normalizeRenewal,
  normalizeStatus,
  parseCsvLine,
  stripBom,
  detectSeparator,
} from "../../domain/normalize";
import type { DatasetPayload } from "./datasets";
import rulesDefault from "../../../contracts/rules-default-v1.json";

export type ImportTargetName = "companies" | "signals" | "contacts" | "opportunities" | "icp_rules" | "priority_rules" | "disqualifiers";

const UFS = new Set(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);

/** Coluna → normalizador. `required` marca colunas obrigatórias na linha. */
interface ColumnSpec {
  canonical: string;
  aliases?: string[];
  required?: boolean;
  normalize?: (v: string) => unknown;
}

const boolOrNull = (v: string) => (v === "" ? null : normalizeBool(v));
const text = (max: number) => (v: string) => (v === "" ? null : clean(v).slice(0, max));
const intOrNull = (min: number) => (v: string) => (v === "" ? null : normalizeInt(v, { min }));

const TARGETS: Record<ImportTargetName, { columns: ColumnSpec[]; idColumn: string }> = {
  companies: {
    idColumn: "external_id",
    columns: [
      { canonical: "external_id", aliases: ["id empresa"], required: true, normalize: (v) => clean(v) },
      { canonical: "name", aliases: ["empresa"], required: true, normalize: (v) => clean(v).slice(0, 240) },
      { canonical: "domain", aliases: ["domínio fictício", "dominio ficticio"], normalize: (v) => { const d = text(253)(v); if (d === null) return null; if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) throw new NormalizeError("INVALID_DOMAIN", `Domínio inválido: "${v}"`); return d; } },
      { canonical: "segment", aliases: ["segmento"], normalize: text(120) },
      { canonical: "employees", aliases: ["colaboradores"], normalize: intOrNull(0) },
      { canonical: "uf", normalize: (v) => { const u = clean(v).toUpperCase(); if (v === "") return null; if (!UFS.has(u)) throw new NormalizeError("INVALID_UF", `UF inválida: "${v}"`); return u; } },
      { canonical: "operates_in_brazil", normalize: boolOrNull },
      { canonical: "hr_structured", aliases: ["rh estruturado"], normalize: boolOrNull },
      { canonical: "has_benefits", normalize: boolOrNull },
      { canonical: "seeks_benefit_differentiation", normalize: boolOrNull },
      { canonical: "multi_region", aliases: ["multi-região", "multi-regiao"], normalize: boolOrNull },
      { canonical: "growth", aliases: ["sinal crescimento"], normalize: normalizeLevel },
      { canonical: "employer_branding", normalize: normalizeLevel },
      { canonical: "retention_pain", aliases: ["dor retenção", "dor retencao"], normalize: normalizeLevel },
      { canonical: "renewal_window", aliases: ["renovação provável", "renovacao provavel"], normalize: normalizeRenewal },
      { canonical: "renewed_24_plus", normalize: boolOrNull },
      { canonical: "operating_status", aliases: ["status"], normalize: normalizeStatus },
      { canonical: "source_label", aliases: ["fonte permitida"], normalize: text(120) },
    ],
  },
  signals: {
    idColumn: "external_id",
    columns: [
      { canonical: "external_id", normalize: (v) => clean(v) },
      { canonical: "company_external_id", aliases: ["id empresa"], required: true, normalize: (v) => clean(v) },
      { canonical: "signal_type", aliases: ["tipo sinal"], required: true, normalize: (v) => clean(v).slice(0, 120) },
      { canonical: "evidence_text", aliases: ["evidência fictícia", "evidencia ficticia"], required: true, normalize: (v) => clean(v).slice(0, 6000) },
      { canonical: "strength", aliases: ["força", "forca"], required: true, normalize: (v) => { const l = normalizeLevel(v); if (l === null) throw new NormalizeError("INVALID_STRENGTH", "Força é obrigatória"); return l; } },
      { canonical: "observed_on", aliases: ["data"], normalize: normalizeDate },
      { canonical: "source_name", aliases: ["fonte"], normalize: text(120) },
      { canonical: "source_url", aliases: ["url fictícia", "url ficticia"], normalize: text(2048) },
      { canonical: "source_allowed", aliases: ["fonte permitida"], normalize: boolOrNull },
      { canonical: "is_synthetic", normalize: boolOrNull },
    ],
  },
  contacts: {
    idColumn: "external_id",
    columns: [
      { canonical: "external_id", normalize: (v) => clean(v) },
      { canonical: "company_external_id", aliases: ["id empresa"], required: true, normalize: (v) => clean(v) },
      { canonical: "full_name", aliases: ["contato fictício", "contato ficticio"], normalize: text(240) },
      { canonical: "job_title", aliases: ["cargo provável", "cargo provavel"], normalize: text(240) },
      { canonical: "channel_type", aliases: ["tipo canal"], required: true, normalize: (v) => { const t = clean(v).toLowerCase(); const ok = ["institutional_site","generic_corporate_email","professional_profile","corporate_phone","company_contact_page","other_public"]; if (!ok.includes(t)) throw new NormalizeError("INVALID_CHANNEL", `Tipo de canal inválido: "${v}"`); return t; } },
      { canonical: "channel_value", aliases: ["canal/contato fictício", "canal/contato ficticio"], required: true, normalize: (v) => clean(v).slice(0, 512) },
      { canonical: "origin", aliases: ["origem"], normalize: text(120) },
      { canonical: "decision_maker_identified", aliases: ["decisor identificado?"], normalize: boolOrNull },
      { canonical: "is_professional_public", normalize: boolOrNull },
      { canonical: "source_allowed", aliases: ["fonte permitida"], normalize: boolOrNull },
      { canonical: "is_synthetic", normalize: boolOrNull },
    ],
  },
  opportunities: {
    idColumn: "external_id",
    columns: [
      { canonical: "external_id", aliases: ["id oportunidade"], required: true, normalize: (v) => clean(v) },
      { canonical: "company_external_id", aliases: ["id empresa"], required: true, normalize: (v) => clean(v) },
      { canonical: "result", aliases: ["resultado"], required: true, normalize: (v) => { const r = clean(v).toLowerCase(); const ok = ["won", "lost", "negotiating"]; if (!ok.includes(r)) throw new NormalizeError("INVALID_RESULT", `Resultado inválido: "${v}" (won/lost/negotiating)`); return r; } },
      { canonical: "closed_on", normalize: normalizeDate },
      { canonical: "segment_at_close", normalize: text(120) },
      { canonical: "cycle_days", aliases: ["ciclo (dias)"], normalize: intOrNull(0) },
      { canonical: "estimated_ticket_cents", aliases: ["ticket estimado"], normalize: (v) => (v === "" ? null : normalizeInt(v, { min: 0 })) },
      { canonical: "reason", aliases: ["motivo/status"], normalize: text(600) },
      { canonical: "sponsor", aliases: ["sponsor/decisor"], normalize: text(240) },
      { canonical: "origin", aliases: ["origem"], normalize: text(120) },
      { canonical: "is_synthetic", normalize: boolOrNull },
    ],
  },
  icp_rules: {
    idColumn: "criterion_id",
    columns: [
      { canonical: "criterion_id", required: true, normalize: (v) => clean(v) },
      { canonical: "weight", aliases: ["peso"], required: true, normalize: (v) => normalizeInt(v, { min: 0, max: 100 }) },
      { canonical: "required", aliases: ["obrigatório", "obrigatorio"], normalize: boolOrNull },
    ],
  },
  priority_rules: {
    idColumn: "criterion_id",
    columns: [
      { canonical: "criterion_id", required: true, normalize: (v) => clean(v) },
      { canonical: "weight", aliases: ["peso"], required: true, normalize: (v) => normalizeInt(v, { min: 0, max: 100 }) },
    ],
  },
  disqualifiers: {
    idColumn: "rule_id",
    columns: [
      { canonical: "rule_id", required: true, normalize: (v) => clean(v).toUpperCase() },
      { canonical: "enabled", aliases: ["habilitado"], required: true, normalize: normalizeBool },
      { canonical: "min_employees", normalize: intOrNull(0) },
      { canonical: "penalty_points", normalize: intOrNull(0) },
    ],
  },
};

const RULE_TARGETS = new Set(["icp_rules", "priority_rules", "disqualifiers"]);

export interface RowIssue {
  row: number;
  field?: string;
  message: string;
}

export interface PreviewCounts {
  create: number;
  update: number;
  ignore: number;
  error: number;
}

export interface ImportPreviewResult {
  import_id: string;
  status: "previewed" | "invalid";
  target: ImportTargetName;
  merge_policy: "fill_missing" | "overwrite_non_null";
  sha256: string;
  dataset_revision: number;
  counts: PreviewCounts;
  errors: RowIssue[];
  warnings: RowIssue[];
  preview: Array<{ row: number; action: "create" | "update" | "ignore"; external_id?: string }>;
  rules_draft_id: string | null;
  expires_at: string;
}

const NULL_SENTINEL = "__NULL__";

/** Prévia de importação (doc 01 §6): nada é gravado além do lote/linhas/proveniência. */
export async function createImportPreview(
  dataset: DatasetPayload,
  fileBody: string,
  fileName: string,
  target: ImportTargetName,
  mergePolicy: "fill_missing" | "overwrite_non_null",
  userId: string,
): Promise<ImportPreviewResult> {
  const spec = TARGETS[target] ?? null;
  if (!spec) throw validation(`target inválido: ${target}`);

  const text = stripBom(fileBody);
  const known = new Set<string>();
  for (const col of spec.columns) {
    known.add(col.canonical);
    for (const a of col.aliases ?? []) known.add(normalizeHeader(a));
  }
  let separator: string;
  try {
    separator = detectSeparator(text, (h) => known.has(h));
  } catch {
    // Cabeçalho com coluna desconhecida: mantém a prévia (invalid) com os erros
    // por coluna em vez de recusar o arquivo inteiro sem diagnóstico (IMP03).
    const first = text.split("\n")[0] ?? "";
    separator = (first.split(";").length > first.split(",").length ? ";" : ",");
  }
  const lines = text.split(/\r?\n/).filter((l, i) => l.trim() !== "" || i === 0);
  const header = parseCsvLine(lines[0]!, separator).map(normalizeHeader);

  const aliasIndex = new Map<string, ColumnSpec>();
  for (const col of spec.columns) {
    aliasIndex.set(col.canonical, col);
    for (const a of col.aliases ?? []) aliasIndex.set(normalizeHeader(a), col);
  }
  const colAt: Array<{ index: number; spec: ColumnSpec }> = [];
  const issues: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  header.forEach((h, i) => {
    const col = aliasIndex.get(h);
    if (!col) issues.push({ row: 1, field: h, message: `Coluna desconhecida: "${h}"` });
    else colAt.push({ index: i, spec: col });
  });
  for (const col of spec.columns) {
    if (col.required && !colAt.some((c) => c.spec === col)) {
      issues.push({ row: 1, field: col.canonical, message: `Coluna obrigatória ausente: ${col.canonical}` });
    }
  }

  if (lines.length - 1 > 10_000) {
    issues.push({ row: 1, message: `Arquivo com ${lines.length - 1} linhas de dados — o limite é 10.000 por arquivo.` });
  }

  const rows: Array<{ row: number; data: Record<string, unknown> }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!, separator);
    const data: Record<string, unknown> = {};
    for (const { index, spec: col } of colAt) {
      const raw = cells[index] ?? "";
      if (clean(raw) === NULL_SENTINEL) { data[col.canonical] = NULL_SENTINEL; continue; }
      if (isFormulaCell(raw)) {
        issues.push({ row: i + 1, field: col.canonical, message: `Célula de fórmula rejeitada (linha ${i + 1}): "${raw.slice(0, 30)}"` });
        continue;
      }
      try {
        data[col.canonical] = col.normalize ? col.normalize(raw) : clean(raw);
      } catch (e) {
        const msg = e instanceof NormalizeError ? e.message : `Valor inválido em ${col.canonical}`;
        issues.push({ row: i + 1, field: col.canonical, message: msg });
      }
    }
    for (const dateField of ["observed_on", "closed_on"]) {
      const v = data[dateField];
      if (typeof v === "string" && v > dataset.default_as_of.toISOString().slice(0, 10)) {
        warnings.push({ row: i + 1, field: dateField, message: `Data futura (${v}) preservada; não pontua recência.` });
      }
    }
    rows.push({ row: i + 1, data });
  }

  // Regras importadas: valida e gera RASCUNHO completo (nunca publica — IMP09).
  let rulesDraftId: string | null = null;
  if (RULE_TARGETS.has(target) && issues.length === 0) {
    try {
      buildDraftRules(target, rows.map((r) => r.data));
      rulesDraftId = null; // o rascunho é criado no commit; a prévia não altera cadastro
    } catch (e) {
      issues.push({ row: 1, message: e instanceof Error ? e.message : "Regras inválidas" });
    }
  }

  // Contagens por ação (contra o banco atual) — só quando estrutura é válida.
  const counts: PreviewCounts = { create: 0, update: 0, ignore: 0, error: issues.filter((x) => x.row > 1).length };
  const preview: ImportPreviewResult["preview"] = [];
  if (issues.length === 0) {
    await classifyRows(dataset, target, spec, rows, mergePolicy, counts, preview, warnings, issues);
    if (target === "companies") {
      const existing = await prisma.company.count({ where: { dataset_id: dataset.id } });
      if (existing + counts.create > 2_000) issues.push({ row: 1, message: `Base excederia 2.000 empresas (${existing} + ${counts.create}).` });
    } else if (target === "signals" || target === "contacts" || target === "opportunities") {
      const existing =
        target === "signals"
          ? await prisma.signal.count({ where: { dataset_id: dataset.id } })
          : target === "contacts"
            ? await prisma.contact.count({ where: { dataset_id: dataset.id } })
            : await prisma.opportunity.count({ where: { dataset_id: dataset.id } });
      if (existing + counts.create > 20_000) issues.push({ row: 1, message: `Base excederia 20.000 registros (${existing} + ${counts.create}).` });
    }
  }

  const sha256 = createHash("sha256").update(fileBody).digest("hex");
  const expires = new Date(Date.now() + 24 * 3600_000);
  // Mesmo conteúdo reimportado é no-op (doc 01 §7): reusa o source_file.
  const sourceFile = await prisma.sourceFile.upsert({
    where: { dataset_id_sha256: { dataset_id: dataset.id, sha256 } },
    update: {},
    create: { dataset_id: dataset.id, sha256, size_bytes: BigInt(fileBody.length), original_name: clean(fileName).slice(0, 200), storage_path: `import:${sha256.slice(0, 16)}`, received_by: userId },
  });
  const batch = await prisma.importBatch.create({
    data: {
      dataset_id: dataset.id,
      source_file_id: sourceFile.id,
      target,
      merge_policy: mergePolicy,
      expected_version: 1,
      expected_data_revision: dataset.data_revision,
      status: issues.length === 0 ? "previewed" : "invalid",
      counts: { ...counts, warnings: warnings.length } as unknown as Prisma.InputJsonValue,
      expires_at: expires,
      created_by: userId,
    },
  });
  if (rows.length || issues.length) {
    await prisma.importRow.createMany({
      data: [
        ...rows.map((r) => ({
          import_id: batch.id,
          row_number: r.row,
          normalized: r.data as Prisma.InputJsonValue,
          action: counts.error && issues.some((x) => x.row === r.row) ? "error" : undefined,
          errors: issues.filter((x) => x.row === r.row).length
            ? (issues.filter((x) => x.row === r.row) as unknown as Prisma.InputJsonValue)
            : undefined,
        })),
      ],
    });
  }

  return {
    import_id: batch.id,
    status: batch.status === "previewed" ? "previewed" : "invalid",
    target,
    merge_policy: mergePolicy,
    sha256,
    dataset_revision: dataset.data_revision,
    counts,
    errors: issues.slice(0, 100),
    warnings: warnings.slice(0, 100),
    preview: preview.slice(0, 100),
    rules_draft_id: rulesDraftId,
    expires_at: expires.toISOString(),
  };
}

async function classifyRows(
  dataset: DatasetPayload,
  target: ImportTargetName,
  spec: { idColumn: string },
  rows: Array<{ row: number; data: Record<string, unknown> }>,
  mergePolicy: "fill_missing" | "overwrite_non_null",
  counts: PreviewCounts,
  preview: ImportPreviewResult["preview"],
  warnings: RowIssue[],
  issues: RowIssue[],
): Promise<void> {
  if (RULE_TARGETS.has(target)) {
    counts.update = rows.length;
    preview.push({ row: 1, action: "update" });
    return;
  }
  const isCompany = target === "companies";
  const externalIds = rows.map((r) => String(r.data[spec.idColumn] ?? "")).filter(Boolean);
  const parents = new Set<string>();
  if (!isCompany) {
    const ids = [...new Set(rows.map((r) => String(r.data.company_external_id ?? "")))];
    const found = await prisma.company.findMany({ where: { dataset_id: dataset.id, external_id: { in: ids } }, select: { external_id: true } });
    found.forEach((f) => parents.add(f.external_id));
  }
  const existing = isCompany
    ? await prisma.company.findMany({ where: { dataset_id: dataset.id, external_id: { in: externalIds } }, select: { external_id: true } })
    : [];
  const existingIds = new Set(existing.map((e) => e.external_id));

  const seen = new Set<string>();
  for (const r of rows) {
    const id = String(r.data[spec.idColumn] ?? "");
    if (isCompany && !id) {
      // sem external_id em companies: só permitimos com name? Spec exige ID — erro.
      counts.error++;
      continue;
    }
    if (!isCompany) {
      const parent = String(r.data.company_external_id ?? "");
      if (!parents.has(parent) && !existingIds.has(parent)) {
        // Relação com empresa inexistente e não criada no lote → lote inválido (IMP04).
        issues.push({ row: r.row, field: "company_external_id", message: `Empresa referenciada não existe nem é criada no lote: ${parent}` });
        counts.error++;
        continue;
      }
    }
    if (id && seen.has(id)) {
      warnings.push({ row: r.row, message: `Duplicata de ${spec.idColumn} ${id} no arquivo — ignorada` });
      counts.ignore++;
      preview.push({ row: r.row, action: "ignore", external_id: id });
      continue;
    }
    if (id) seen.add(id);
    const exists = existingIds.has(id);
    if (!exists) {
      counts.create++;
      preview.push({ row: r.row, action: "create", external_id: id });
    } else if (mergePolicy === "overwrite_non_null") {
      counts.update++;
      preview.push({ row: r.row, action: "update", external_id: id });
    } else {
      // fill_missing: update só se houver campo null a preencher — contagem aproximada
      counts.update++;
      preview.push({ row: r.row, action: "update", external_id: id });
    }
  }
}

function buildDraftRules(target: ImportTargetName, rows: Array<Record<string, unknown>>): RuleConfig {
  const config: RuleConfig = structuredClone(rulesDefault as unknown as RuleConfig);
  if (target === "icp_rules") {
    const weights: Record<string, number> = {};
    const required: string[] = [];
    for (const r of rows) {
      const id = String(r.criterion_id);
      if (!(id in config.icp.weights)) throw new NormalizeError("UNKNOWN_CRITERION", `Critério ICP desconhecido: ${id}`);
      if (weights[id] !== undefined) throw new NormalizeError("DUPLICATE_CRITERION", `Critério duplicado: ${id}`);
      weights[id] = Number(r.weight);
      if (r.required === true) required.push(id);
    }
    for (const id of Object.keys(config.icp.weights)) if (weights[id] === undefined) {
      throw new NormalizeError("MISSING_CRITERION", `Critério ausente no arquivo: ${id} (grupo precisa ser completo)`);
    }
    config.icp.weights = weights;
    config.icp.required_criteria = required;
  } else if (target === "priority_rules") {
    const weights: Record<string, number> = {};
    for (const r of rows) {
      const id = String(r.criterion_id);
      if (!(id in config.priority.weights)) throw new NormalizeError("UNKNOWN_CRITERION", `Critério de prioridade desconhecido: ${id}`);
      if (weights[id] !== undefined) throw new NormalizeError("DUPLICATE_CRITERION", `Critério duplicado: ${id}`);
      weights[id] = Number(r.weight);
    }
    for (const id of Object.keys(config.priority.weights)) if (weights[id] === undefined) {
      throw new NormalizeError("MISSING_CRITERION", `Critério ausente no arquivo: ${id}`);
    }
    config.priority.weights = weights;
  } else {
    for (const r of rows) {
      const id = String(r.rule_id);
      const d = (config.disqualifiers as Record<string, { enabled?: boolean; min_employees?: number; penalty_points?: number }>)[id];
      if (!d) throw new NormalizeError("UNKNOWN_RULE", `Desqualificador desconhecido: ${id}`);
      if (id === "D03" && r.enabled === false) throw new NormalizeError("D03_CANNOT_BE_DISABLED", "D03 não pode ser desativado");
      d.enabled = r.enabled === true;
      if (r.min_employees !== null && r.min_employees !== undefined) d.min_employees = Number(r.min_employees);
      if (r.penalty_points !== null && r.penalty_points !== undefined) d.penalty_points = Number(r.penalty_points);
    }
  }
  validateRuleConfig(config); // soma 100 por grupo, D03, bandas — falha cedo (RULE01)
  return config;
}

export interface CommitResult {
  import_id: string;
  applied: { create: number; update: number; ignore: number };
  rules_draft_id: string | null;
  dataset_revision: number;
}

/** Commit atômico (doc 01 §6): tudo ou nada; obsolescência por revisão da base. */
export async function commitImport(
  dataset: DatasetPayload,
  importId: string,
  expectedDatasetRevision: number,
  userId: string,
  confirmOverwrite = false,
): Promise<CommitResult> {
  const batch = await prisma.importBatch.findUnique({ where: { id: importId }, include: { rows: true } });
  if (!batch || batch.dataset_id !== dataset.id) throw notFound("Importação não encontrada nesta base.");
  if (batch.status === "invalid") throw validation("Prévia inválida — commit indisponível. Corrija o arquivo e gere nova prévia.");
  if (batch.merge_policy === "overwrite_non_null" && !confirmOverwrite) {
    throw validation("overwrite_non_null exige confirm_overwrite=true explícito.", [
      { field: "confirm_overwrite", message: "obrigatório para sobrescrever valores existentes" },
    ]);
  }
  if (batch.status === "committed") throw conflict("ACTION_ALREADY_RESOLVED", "Importação já confirmada.");
  if (batch.expires_at.getTime() < Date.now()) throw conflict("IMPORT_PREVIEW_STALE", "Prévia expirada (24h). Gere uma nova.");
  const fresh = await prisma.dataset.findUniqueOrThrow({ where: { id: dataset.id } });
  if (fresh.data_revision !== expectedDatasetRevision) {
    throw conflict("IMPORT_PREVIEW_STALE", "A base mudou desde a prévia. Gere uma nova prévia.", {
      expected_dataset_revision: expectedDatasetRevision,
      current_dataset_revision: fresh.data_revision,
    });
  }

  const target = batch.target as ImportTargetName;
  const rows = batch.rows
    .filter((r) => !(r.errors as unknown[] | null)?.length)
    .sort((a, b) => a.row_number - b.row_number)
    .map((r) => ({ row: r.row_number, data: r.normalized as Record<string, unknown> }));

  return prisma.$transaction(async (tx) => {
    // Serializa commits do mesmo lote (finder P1: TOCTOU) — revalida sob lock.
    await tx.$queryRaw`SELECT id FROM import_batches WHERE id = ${importId}::uuid FOR UPDATE`;
    const locked = await tx.importBatch.findUnique({ where: { id: importId } });
    if (locked && (locked.status === "committed" || locked.status === "invalid")) {
      throw conflict(locked.status === "committed" ? "ACTION_ALREADY_RESOLVED" : "VALIDATION_ERROR",
        locked.status === "committed" ? "Importação já confirmada." : "Prévia inválida — commit indisponível.");
    }
    await setActorContext(tx, { actor_user_id: userId, source: "import", import_id: importId });
    const counts = { create: 0, update: 0, ignore: 0 };
    let rulesDraftId: string | null = null;

    if (RULE_TARGETS.has(target)) {
      const config = buildDraftRules(target, rows.map((r) => r.data));
      const draft = await tx.ruleset.create({
        data: {
          dataset_id: dataset.id,
          status: "draft",
          config: config as unknown as Prisma.InputJsonValue,
          base_ruleset_id: fresh.active_ruleset_id,
          created_by: userId,
        },
      });
      rulesDraftId = draft.id;
      counts.update = rows.length;
    } else if (target === "companies") {
      for (const r of rows) {
        const data = r.data;
        const existing = await tx.company.findUnique({
          where: { dataset_id_external_id: { dataset_id: dataset.id, external_id: String(data.external_id) } },
        });
        const fields = fieldsFromRow(data, ["external_id"], "companies");
        if (!existing) {
          await tx.company.create({
            data: {
              dataset_id: dataset.id,
              external_id: String(data.external_id),
              name: String(data.name ?? data.external_id),
              ...fields,
              is_synthetic: false,
              created_by: userId,
            },
          });
          counts.create++;
        } else {
          const changes = await changesForUpdate(tx, "company", existing.id, fields, batch.merge_policy as string);
          if (Object.keys(changes).length === 0) { counts.ignore++; continue; }
          await tx.company.update({
            where: { id: existing.id, dataset_id: dataset.id, version: existing.version },
            data: {
              ...changes,
              version: { increment: 1 },
              input_revision: { increment: 1 },
              updated_at: new Date(),
              updated_by: userId,
            },
          });
          counts.update++;
        }
      }
    } else {
      // Relacionados: FK composta resolve a empresa; identidade estável por external_id.
      const model = target === "signals" ? tx.signal : target === "contacts" ? tx.contact : tx.opportunity;
      for (const r of rows) {
        const data = r.data;
        const parent = await tx.company.findUnique({
          where: { dataset_id_external_id: { dataset_id: dataset.id, external_id: String(data.company_external_id) } },
        });
        if (!parent || parent.archived_at) {
          throw validation(`Empresa ${String(data.company_external_id)} não encontrada/arquivada — lote não aplicado (linha ${r.row}).`);
        }
        const externalId = data.external_id ? String(data.external_id) : contentFingerprint(target, data);
        const existing = await (model as typeof tx.signal).findUnique({
          where: { dataset_id_external_id: { dataset_id: dataset.id, external_id: externalId } } as never,
        });
        const fields = fieldsFromRow(data, ["external_id", "company_external_id", "company_id", "is_synthetic"], target);
        if ("is_synthetic" in data && data.is_synthetic === null) delete (fields as Record<string, unknown>).is_synthetic;
        if (!existing) {
          await (model as typeof tx.signal).create({
            data: {
              dataset_id: dataset.id,
              company_id: parent.id,
              external_id: externalId,
              ...fields,
              is_synthetic: data.is_synthetic === true,
              created_by: userId,
            } as never,
          });
          counts.create++;
        } else {
          const changes = await changesForUpdate(tx, target, existing.id, fields, batch.merge_policy as string);
          if (Object.keys(changes).length === 0) { counts.ignore++; continue; }
          await (model as typeof tx.signal).update({
            where: { id: existing.id, version: existing.version } as never,
            data: {
              ...changes,
              version: { increment: 1 },
              updated_at: new Date(),
              updated_by: userId,
            } as never,
          });
          counts.update++;
          if (target !== "opportunities") {
            await tx.company.update({ where: { id: parent.id }, data: { input_revision: { increment: 1 } } });
          }
        }
      }
    }

    await tx.dataset.update({
      where: { id: dataset.id },
      data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: userId },
    });
    await tx.importBatch.update({ where: { id: importId }, data: { status: "committed", committed_at: new Date() } });
    return {
      import_id: importId,
      applied: counts,
      rules_draft_id: rulesDraftId,
      dataset_revision: fresh.data_revision + 1,
    };
  });
}

const MODEL_TABLE = { company: "company", signals: "signal", contacts: "contact", opportunities: "opportunity" } as const;

/** Campos aplicáveis por política: fill_missing só preenche null/unknown;
 * overwrite_non_null sobrescreve não-vazios; branco NUNCA apaga; __NULL__ só em
 * overwrite e vira null explícito (doc 01 §7). */
async function changesForUpdate(
  tx: Prisma.TransactionClient,
  target: keyof typeof MODEL_TABLE | string,
  recordId: string,
  fields: Record<string, unknown>,
  policy: string,
): Promise<Record<string, unknown>> {
  const table = (MODEL_TABLE as Record<string, "company" | "signal" | "contact" | "opportunity">)[target];
  const current = await (tx as unknown as Record<string, { findUnique: (a: { where: { id: string } }) => Promise<Record<string, unknown>> }>)[table].findUnique({ where: { id: recordId } });
  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const cur = (current as Record<string, unknown>)[k];
    if (v === null) continue; // branco nunca apaga
    if (v === NULL_SENTINEL) {
      if (policy === "overwrite_non_null" && cur !== null) changes[k] = null;
      continue;
    }
    if (cur === null || cur === undefined) changes[k] = v;
    else if (k === "operating_status" && cur === "unknown") changes[k] = v;
    else if (policy === "overwrite_non_null" && cur !== v) changes[k] = v;
  }
  return changes;
}

function fieldsFromRow(data: Record<string, unknown>, skip: string[], target?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const dateFields = new Set<string>();
  if (target === "signals") dateFields.add("observed_on");
  if (target === "opportunities") dateFields.add("closed_on");
  for (const [k, v] of Object.entries(data)) {
    if (skip.includes(k) || v === undefined) continue;
    if (dateFields.has(k) && typeof v === "string") { out[k] = new Date(`${v}T00:00:00Z`); continue; }
    if (target === "opportunities" && k === "estimated_ticket_cents" && typeof v === "number") { out[k] = BigInt(v); continue; }
    out[k] = v;
  }
  return out;
}

/** Identidade estável do conteúdo para relacionados sem external_id (doc 01 §7). */
function contentFingerprint(target: string, data: Record<string, unknown>): string {
  const relevant = Object.entries(data).filter(([k]) => k !== "external_id").sort(([a], [b]) => a.localeCompare(b));
  const payload = `${target}|${relevant.map(([k, v]) => `${k}=${String(v)}`).join("|")}`;
  return `IMP-${createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}
