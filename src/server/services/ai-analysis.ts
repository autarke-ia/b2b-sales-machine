import type { Prisma } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import {
  ProviderError,
  SUGGESTIBLE_FIELDS,
  computeRelation,
  fixtureProposals,
  valueMatchesField,
  type ProviderCompanyInput,
  type ProviderSignalInput,
  type RawProposal,
} from "../../domain/suggestion/heuristics";
import type { DatasetPayload } from "./datasets";
import { evaluate } from "../../domain/scoring";
import { toEngineCompany } from "./companies";
import { activeRules } from "./datasets";

const PROMPT_VERSION = "fixture-heuristics-v1";
const MAX_SIGNALS = 50;

export type JobScope = "icp_gaps" | "eligible_enrichment";

interface JobItemOutcome {
  suggestionsCreated: number;
}

/** Cria o job durável (202 após persistência — doc 03 §6). Scope define o
 * universo: pending p/ icp_gaps, in p/ eligible_enrichment; demais viram
 * skipped com motivo, sem exploração automática de contas out. */
export async function createAnalysisJob(
  dataset: DatasetPayload,
  companyIds: string[],
  scope: JobScope,
  userId: string,
): Promise<{ job_id: string; requested: number }> {
  if (!companyIds.length || companyIds.length > 100) {
    throw validation("Envie entre 1 e 100 company_ids explícitos.", [{ field: "company_ids", message: "1–100" }]);
  }
  const companies = await prisma.company.findMany({ where: { dataset_id: dataset.id, id: { in: companyIds } } });
  if (companies.length !== companyIds.length) throw notFound("Empresa do lote não encontrada nesta base.");
  const rules = await activeRules(dataset);
  const asOf = dataset.default_as_of.toISOString().slice(0, 10);

  const skipReasons = new Map<string, string>();
  for (const c of companies) {
    const gate = evaluate({ company: toEngineCompany(c), rules, as_of: asOf }).gate;
    if (scope === "icp_gaps" && gate.state !== "pending") skipReasons.set(c.id, `scope=icp_gaps exige pending; estado atual ${gate.state}`);
    if (scope === "eligible_enrichment" && gate.state !== "in") skipReasons.set(c.id, `scope=eligible_enrichment exige in; estado atual ${gate.state}`);
  }

  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: userId, source: "system" });
    const job = await tx.analysisJob.create({
      data: {
        dataset_id: dataset.id,
        scope,
        requested: companyIds.length,
        model: process.env.AI_PROVIDER === "fixture" ? "fixture" : process.env.AI_MODEL ?? null,
        prompt_version: PROMPT_VERSION,
        created_by: userId,
        items: {
          create: companyIds.map((id) => ({
            company_id: id,
            state: skipReasons.has(id) ? "skipped" : "queued",
            error: skipReasons.has(id) ? { reason: skipReasons.get(id) } as unknown as Prisma.InputJsonValue : undefined,
          })),
        },
      },
      include: { items: true },
    });
    return { job_id: job.id, requested: companyIds.length };
  });
}

/** Processa os itens queued do job. Durável: itens em erro/lease podem ser
 * reprocessados; a publicação de sugestões é deduplicada por fingerprint. */
export async function processAnalysisJob(jobId: string): Promise<void> {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId }, include: { items: true } });
  if (!job || (job.state !== "queued" && job.state !== "running")) return;

  await prisma.analysisJob.update({ where: { id: jobId }, data: { state: "running" } });
  let processed = 0;
  let failed = 0;
  const skipped = 0;

  for (;;) {
    const item = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM analysis_job_items
        WHERE job_id = ${jobId}::uuid AND (state = 'queued' OR (state = 'running' AND lease_until < now()))
        ORDER BY company_id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return null;
      const claimed = await tx.analysisJobItem.update({
        where: { id: rows[0]!.id },
        data: { state: "running", lease_until: new Date(Date.now() + 5 * 60_000), attempts: { increment: 1 } },
      });
      return claimed;
    });
    if (!item) break;

    try {
      const outcome = await processItem(job.dataset_id, jobId, item.company_id);
      await prisma.analysisJobItem.update({
        where: { id: item.id },
        data: { state: "succeeded", result: { suggestions: outcome.suggestionsCreated } as unknown as Prisma.InputJsonValue, lease_until: null },
      });
      processed++;
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : "PROVIDER_ERROR";
      const message = e instanceof Error ? e.message : String(e);
      await prisma.analysisJobItem.update({
        where: { id: item.id },
        data: { state: "failed", error: { code, message } as unknown as Prisma.InputJsonValue, lease_until: null },
      });
      failed++;
    }
  }

  // Estado final deriva dos ESTADOS PERSISTIDOS (o job pode ter sido processado
  // concorrentemente pela ignição fire-and-forget da rota — contadores de loop
  // não são a verdade).
  const [succeeded, failedCount, skippedCount, total] = await Promise.all([
    prisma.analysisJobItem.count({ where: { job_id: jobId, state: "succeeded" } }),
    prisma.analysisJobItem.count({ where: { job_id: jobId, state: "failed" } }),
    prisma.analysisJobItem.count({ where: { job_id: jobId, state: "skipped" } }),
    prisma.analysisJobItem.count({ where: { job_id: jobId } }),
  ]);
  void processed; void failed; void skipped;
  const settled = succeeded + failedCount + skippedCount;
  const state = settled === total ? (failedCount > 0 ? (succeeded + skippedCount > 0 ? "partial_failed" : "failed") : "completed") : "running";
  await prisma.analysisJob.update({ where: { id: jobId }, data: { state, processed: succeeded, failed: failedCount, skipped: skippedCount, updated_at: new Date() } });
}

async function processItem(datasetId: string, jobId: string, companyId: string): Promise<JobItemOutcome> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const allSignals = await prisma.signal.findMany({
    where: { dataset_id: datasetId, company_id: companyId, archived_at: null, source_allowed: true },
    orderBy: [{ observed_on: "desc" }, { id: "asc" }],
  });
  const truncated = allSignals.length > MAX_SIGNALS;
  const signals = allSignals.slice(0, MAX_SIGNALS);

  const provider = getProvider();
  const companyInput: ProviderCompanyInput = { id: company.id, external_id: company.external_id, fields: company as unknown as Record<string, unknown> };
  const signalsInput: ProviderSignalInput[] = signals.map((s) => ({
    id: s.id,
    version: s.version,
    evidence_text: s.evidence_text,
    signal_type: s.signal_type,
    observed_on: s.observed_on?.toISOString().slice(0, 10) ?? null,
  }));
  const raw = await provider.analyze(companyInput, signalsInput);

  let created = 0;
  for (const p of raw) {
    const suggestion = await validateAndPersist(datasetId, jobId, company, signals, p, truncated);
    if (suggestion) created++;
  }
  return { suggestionsCreated: created };
}

function getProvider() {
  const kind = process.env.AI_PROVIDER ?? "fixture";
  if (kind === "fixture") {
    return {
      name: "fixture",
      analyze: async (c: ProviderCompanyInput, s: ProviderSignalInput[]) => fixtureProposals(c, s),
    };
  }
  return {
    name: kind,
    analyze: async (): Promise<RawProposal[]> => {
      // Sem chave configurada a falha é EXPLÍCITA (doc 03 §8): nunca simular
      // "IA real". O adaptador OpenAI-compatible entra aqui quando houver chave.
      if (!process.env.AI_API_KEY) {
        throw new ProviderError("AI_KEY_MISSING", `AI_PROVIDER=${kind} sem AI_API_KEY configurada.`);
      }
      throw new ProviderError("AI_ADAPTER_NOT_IMPLEMENTED", "Adaptador openai-compatible ainda não implementado — use AI_PROVIDER=fixture.");
    },
  };
}

/** Validações do doc 06 §4-5 ANTES de publicar (INV-10): campo permitido,
 * tipo correto, quote literal contida no sinal citado, sinal da própria
 * empresa; relação RECALCULADA server-side; fingerprint deduplica. */
async function validateAndPersist(
  datasetId: string,
  jobId: string,
  company: Prisma.CompanyGetPayload<Record<string, never>>,
  signals: Prisma.SignalGetPayload<Record<string, never>>[],
  p: RawProposal,
  truncated: boolean,
): Promise<boolean> {
  if (!(SUGGESTIBLE_FIELDS as readonly string[]).includes(p.field)) return false;
  if (!valueMatchesField(p.field, p.value)) return false;
  const signal = signals.find((s) => s.id === p.signal_id);
  if (!signal) return false;
  if (!p.quote || p.quote.length < 8 || !signal.evidence_text.includes(p.quote)) return false;

  const current = (company as unknown as Record<string, unknown>)[p.field] ?? null;
  const relation = computeRelation(p.field, p.value, current);
  if (relation === "inconclusive" && p.value !== null) return false;

  const fingerprint = `${company.id}|${p.field}|${String(p.value)}|${p.signal_id}|${p.quote}`;
  try {
    await prisma.suggestion.create({
      data: {
        dataset_id: datasetId,
        company_id: company.id,
        job_id: jobId,
        field: p.field,
        current_value: current as Prisma.InputJsonValue,
        proposed_value: p.value as Prisma.InputJsonValue,
        relation,
        confidence: p.confidence,
        rationale: p.rationale,
        evidence: [
          {
            signal_id: signal.id,
            signal_version: signal.version,
            quote: p.quote,
            observed_on: signal.observed_on?.toISOString().slice(0, 10) ?? null,
            coverage_truncated: truncated || undefined,
          },
        ] as unknown as Prisma.InputJsonValue,
        base_company_version: company.version,
        fingerprint,
        created_by: company.created_by,
      },
    });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false; // duplicada no fingerprint — dedupe
    throw e;
  }
}

export async function getJob(dataset: DatasetPayload, jobId: string) {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId }, include: { items: { orderBy: { company_id: "asc" } } } });
  if (!job || job.dataset_id !== dataset.id) throw notFound("Job não encontrado nesta base.");
  return {
    job_id: job.id,
    scope: job.scope,
    state: job.state,
    requested: job.requested,
    processed: job.processed,
    failed: job.failed,
    skipped: job.skipped,
    model: job.model,
    prompt_version: job.prompt_version,
    items: job.items.map((i) => ({
      company_id: i.company_id,
      state: i.state,
      attempts: i.attempts,
      error: i.error,
      result: i.result,
    })),
    created_at: job.created_at.toISOString(),
  };
}

/** Retry: novo job APENAS com os itens que falharam (doc 03 §8). */
export async function retryJob(dataset: DatasetPayload, jobId: string, userId: string) {
  const job = await prisma.analysisJob.findUnique({ where: { id: jobId }, include: { items: true } });
  if (!job || job.dataset_id !== dataset.id) throw notFound("Job não encontrado nesta base.");
  if (job.state !== "partial_failed" && job.state !== "failed" && job.state !== "running") {
    throw conflict("INVALID_STATE_TRANSITION", `Retry disponível apenas para jobs parcial/totalmente falhos (estado atual: ${job.state}).`);
  }
  const failedIds = job.items.filter((i) => i.state === "failed" || i.state === "running").map((i) => i.company_id);
  if (!failedIds.length) throw conflict("INVALID_STATE_TRANSITION", "Nenhum item falhou neste job.");
  const next = await createAnalysisJob(dataset, failedIds, job.scope as JobScope, userId);
  await prisma.analysisJob.update({ where: { id: next.job_id }, data: { retry_of_job_id: jobId } });
  return next;
}
