import type { Prisma, Company } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import { evaluate } from "../../domain/scoring";
import type { DatasetPayload } from "./datasets";
import { activeRules } from "./datasets";
import { companyDto, toEngineCompany } from "./companies";
import type { PatchChanges } from "./company-schema";

export interface MutationCtx {
  userId: string;
  requestId: string;
}

/**
 * PATCH versionado (doc 07 §4): UPDATE ... WHERE version=expected — nenhuma linha
 * afetada distingue not-found de conflito sem vazar dados de outra base. No-op
 * retorna o estado atual SEM incrementar versão nem gerar evento (CRUD03). A
 * edição incrementa input_revision da empresa e data_revision da base na MESMA
 * transação; o trigger grava o audit_event com before/after (INV-1).
 */
export async function patchCompany(
  dataset: DatasetPayload,
  recordId: string,
  expectedVersion: number,
  changes: PatchChanges,
  mctx: MutationCtx,
): Promise<Company> {
  const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) {
    throw validation("changes vazio é inválido — informe ao menos um campo.", [{ field: "changes", message: "vazio" }]);
  }

  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: mctx.userId, source: "manual", request_id: mctx.requestId });

    const current = await tx.company.findUnique({ where: { id: recordId } });
    if (!current || current.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
    if (current.archived_at) throw conflict("VERSION_CONFLICT", "Empresa arquivada — restaure antes de editar.", { archived: true });

    // No-op: mesmos valores efetivos → estado atual, sem versão nem evento.
    const effective = Object.entries(clean).filter(([k, v]) => (current as Record<string, unknown>)[k] !== v);
    if (effective.length === 0) return current;

    if (current.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de salvar.", {
        expected_version: expectedVersion,
        current_version: current.version,
      });
    }

    const updated = await tx.company.update({
      where: { id: recordId, dataset_id: dataset.id, version: expectedVersion },
      data: {
        ...clean,
        version: { increment: 1 },
        input_revision: { increment: 1 },
        updated_at: new Date(),
        updated_by: mctx.userId,
      },
    });
    await tx.dataset.update({
      where: { id: dataset.id },
      data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId },
    });
    return updated;
  });
}

/** Arquivar/restaurar (doc 07 §5): sem DELETE físico; external_id reservado. */
export async function archiveCompany(
  dataset: DatasetPayload,
  recordId: string,
  archived: boolean,
  expectedVersion: number,
  mctx: MutationCtx,
): Promise<Company> {
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: mctx.userId, source: "manual", request_id: mctx.requestId });
    const current = await tx.company.findUnique({ where: { id: recordId } });
    if (!current || current.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
    if (current.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de arquivar.", {
        expected_version: expectedVersion,
        current_version: current.version,
      });
    }
    const updated = await tx.company.update({
      where: { id: recordId },
      data: {
        archived_at: archived ? new Date() : null,
        version: { increment: 1 },
        input_revision: { increment: 1 },
        updated_at: new Date(),
        updated_by: mctx.userId,
      },
    });
    await tx.dataset.update({
      where: { id: dataset.id },
      data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId },
    });
    return updated;
  });
}

/** Histórico append-only por entidade/campo (doc 07 §2): before/after do trigger. */
export async function companyHistory(
  dataset: DatasetPayload,
  recordId: string,
  field: string | undefined,
  page: number,
  pageSize: number,
) {
  const company = await prisma.company.findUnique({ where: { id: recordId } });
  if (!company || company.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
  const where: Prisma.AuditEventWhereInput = {
    entity_type: "company",
    entity_id: recordId,
    dataset_id: dataset.id,
    ...(field ? { changed_fields: { array_contains: [field] } } : {}),
  };
  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({ where, orderBy: [{ occurred_at: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return {
    rows: events.map((e) => ({
      id: e.id,
      operation: e.operation,
      changed_fields: e.changed_fields,
      version_before: e.version_before,
      version_after: e.version_after,
      before: e.before,
      after: e.after,
      actor_user_id: e.actor_user_id,
      source: e.source,
      request_id: e.request_id,
      import_id: e.import_id,
      suggestion_id: e.suggestion_id,
      occurred_at: e.occurred_at.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export interface CompanyDetail {
  company: ReturnType<typeof companyDto>;
  assessment: {
    id: string;
    gate: ReturnType<typeof evaluate>["gate"];
    priority: ReturnType<typeof evaluate>["priority"];
    as_of: string;
    ruleset_id: string;
  };
  signals: unknown[];
  contacts: unknown[];
  opportunities: unknown[];
}

/** Detalhe + avaliação individual (doc 05 §5): mesma matemática do ranking —
 * reusa a assessment persistida pela cache key quando existe; senão computa e
 * persiste (determinístico, mesmo motor). */
export async function companyDetail(dataset: DatasetPayload, recordId: string, asOf: string): Promise<CompanyDetail> {
  const company = await prisma.company.findUnique({ where: { id: recordId } });
  if (!company || company.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
  const [signals, contacts, opportunities, rules] = await Promise.all([
    prisma.signal.findMany({ where: { company_id: recordId }, orderBy: [{ observed_on: "desc" }, { id: "asc" }] }),
    prisma.contact.findMany({ where: { company_id: recordId }, orderBy: [{ external_id: "asc" }] }),
    prisma.opportunity.findMany({ where: { company_id: recordId }, orderBy: [{ external_id: "asc" }] }),
    activeRules(dataset),
  ]);
  const asOfDate = new Date(asOf);
  const existing = await prisma.assessment.findFirst({
    where: {
      company_id: recordId,
      input_revision: company.input_revision,
      ruleset_id: dataset.active_ruleset_id!,
      as_of: asOfDate,
      dataset_revision: dataset.data_revision,
      review_revision: dataset.review_revision,
    },
    select: { id: true, payload: true },
  });

  let assessmentId = existing?.id ?? "";
  let payload = (existing?.payload ?? null) as ReturnType<typeof evaluate> | null;
  if (!payload) {
    payload = evaluate({
      company: toEngineCompany(company),
      signals: signals.map((s) => ({ ...s, strength: s.strength as "low" | "medium" | "high" })),
      contacts,
      opportunities,
      rules,
      as_of: asOf,
    });
    await prisma.assessment.createMany({
      data: [{
        dataset_id: dataset.id,
        company_id: recordId,
        input_revision: company.input_revision,
        ruleset_id: dataset.active_ruleset_id!,
        as_of: asOfDate,
        dataset_revision: dataset.data_revision,
        review_revision: dataset.review_revision,
        payload: payload as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
    const stored = await prisma.assessment.findFirst({
      where: { company_id: recordId, input_revision: company.input_revision, ruleset_id: dataset.active_ruleset_id!, as_of: asOfDate, dataset_revision: dataset.data_revision, review_revision: dataset.review_revision },
      select: { id: true },
    });
    assessmentId = stored?.id ?? "";
  }

  return {
    company: companyDto(company),
    assessment: {
      id: assessmentId,
      gate: payload.gate,
      priority: payload.priority,
      as_of: asOf,
      ruleset_id: dataset.active_ruleset_id!,
    },
    signals: signals.map((s) => ({
      id: s.id, external_id: s.external_id, signal_type: s.signal_type, evidence_text: s.evidence_text,
      strength: s.strength, observed_on: s.observed_on?.toISOString().slice(0, 10) ?? null,
      source_name: s.source_name, source_url: s.source_url, source_allowed: s.source_allowed,
      archived_at: s.archived_at?.toISOString() ?? null,
    })),
    contacts: contacts.map((c) => ({
      id: c.id, external_id: c.external_id, full_name: c.full_name, job_title: c.job_title,
      channel_type: c.channel_type, channel_value: c.channel_value, origin: c.origin,
      decision_maker_identified: c.decision_maker_identified, is_professional_public: c.is_professional_public,
      source_allowed: c.source_allowed, archived_at: c.archived_at?.toISOString() ?? null,
    })),
    opportunities: opportunities.map((o) => ({
      id: o.id, external_id: o.external_id, result: o.result,
      closed_on: o.closed_on?.toISOString().slice(0, 10) ?? null,
      segment_at_close: o.segment_at_close, cycle_days: o.cycle_days,
      estimated_ticket_cents: o.estimated_ticket_cents !== null ? Number(o.estimated_ticket_cents) : null,
      reason: o.reason, sponsor: o.sponsor, origin: o.origin,
    })),
  };
}
