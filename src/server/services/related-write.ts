import type { Prisma } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import type { DatasetPayload } from "./datasets";
import type { MutationCtx } from "./company-write";

/**
 * CRUD versionado dos relacionados (doc 01 §2.2–2.4, doc 07 §4-5) — mesmas
 * invariantes de companies: guarda de versão no UPDATE (P2025→409), no-op sem
 * evento, escrita bloqueada com pai arquivado (CRUD05), input_revision da
 * empresa em sinais/contatos, data_revision da base em toda escrita.
 */
type RelatedKind = "signals" | "contacts" | "opportunities";

const MODEL = {
  signals: "signal",
  contacts: "contact",
  opportunities: "opportunity",
} as const;

const DATE_FIELDS: Record<RelatedKind, Set<string>> = {
  signals: new Set(["observed_on"]),
  contacts: new Set([]),
  opportunities: new Set(["closed_on"]),
};

const BIGINT_FIELDS: Record<RelatedKind, Set<string>> = {
  signals: new Set([]),
  contacts: new Set([]),
  opportunities: new Set(["estimated_ticket_cents"]),
};

export async function assertWritableParent(dataset: DatasetPayload, companyId: string): Promise<void> {
  const parent = await prisma.company.findUnique({ where: { id: companyId }, select: { archived_at: true, dataset_id: true } });
  if (!parent || parent.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
  if (parent.archived_at) throw validation("Empresa arquivada — restaure antes de editar seus registros.");
}

export async function createRelated(
  dataset: DatasetPayload,
  kind: RelatedKind,
  data: Record<string, unknown>,
  mctx: MutationCtx,
): Promise<Record<string, unknown>> {
  const parentExt = String(data.company_external_id);
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: mctx.userId, source: "manual", request_id: mctx.requestId });
    const parent = await tx.company.findUnique({ where: { dataset_id_external_id: { dataset_id: dataset.id, external_id: parentExt } } });
    if (!parent) throw notFound(`Empresa ${parentExt} não encontrada nesta base.`);
    if (parent.archived_at) throw validation("Empresa arquivada — restaure antes de criar registros relacionados.");

    const { company_external_id: _parentExt, external_id, ...fields } = data;
    void _parentExt; // resolvido para company_id acima
    const clean = serializeFields(kind, fields);
    const model = MODEL[kind] as "signal";
    const creators = tx as unknown as Record<string, { create: (a: unknown) => Promise<Record<string, unknown>> }>;
    try {
      const created = await creators[model].create({
        data: {
          dataset_id: dataset.id,
          company_id: parent.id,
          external_id: String(external_id),
          ...clean,
          is_synthetic: false,
          created_by: mctx.userId,
        },
      });
      if (kind !== "opportunities") {
        await tx.company.update({ where: { id: parent.id }, data: { input_revision: { increment: 1 } } });
      }
      await tx.dataset.update({ where: { id: dataset.id }, data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId } });
      return serializeRow(created) as Record<string, unknown>;
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        throw validation(`external_id já existe nesta base: ${String(external_id)}`, [{ field: "external_id", message: "duplicado" }]);
      }
      throw e;
    }
  });
}

export async function patchRelated(
  dataset: DatasetPayload,
  kind: RelatedKind,
  recordId: string,
  expectedVersion: number,
  changes: Record<string, unknown>,
  mctx: MutationCtx,
): Promise<Record<string, unknown>> {
  const model = MODEL[kind] as "signal";
  const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) {
    throw validation("changes vazio é inválido.", [{ field: "changes", message: "vazio" }]);
  }
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: mctx.userId, source: "manual", request_id: mctx.requestId });
    const current = (await (tx as unknown as Record<string, { findUnique: (a: never) => Promise<Record<string, unknown> | null> }>)[model].findUnique({
      where: { id: recordId },
    } as never)) as Record<string, unknown> | null;
    if (!current || current.dataset_id !== dataset.id) throw notFound("Registro não encontrado nesta base.");
    if (current.archived_at) throw validation("Registro arquivado — restaure antes de editar.");
    const parent = await tx.company.findUnique({ where: { id: current.company_id as string }, select: { archived_at: true } });
    if (parent?.archived_at) throw validation("Empresa arquivada — restaure antes de editar seus registros.");

    const sameValue = (a: unknown, b: unknown) =>
      a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
    const effective = Object.entries(serializeFields(kind, clean)).filter(([k, v]) => !sameValue(current[k], v));
    if (effective.length === 0) return serializeRow(current) as Record<string, unknown>;
    if (current.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de salvar.", {
        expected_version: expectedVersion,
        current_version: current.version as number,
      });
    }

    const updated = await (tx as unknown as Record<string, { update: (a: never) => Promise<Record<string, unknown>> }>)[model]
      .update({
        where: { id: recordId, dataset_id: dataset.id, version: expectedVersion },
        data: {
          ...serializeFields(kind, clean),
          version: { increment: 1 },
          updated_at: new Date(),
          updated_by: mctx.userId,
        },
      } as never)
      .catch(async (e) => {
        if ((e as { code?: string }).code === "P2025") {
          const now = await (tx as unknown as Record<string, { findUnique: (a: never) => Promise<{ version: number } | null> }>)[model].findUnique({ where: { id: recordId } } as never);
          throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de salvar.", {
            expected_version: expectedVersion,
            current_version: now?.version ?? expectedVersion + 1,
          });
        }
        throw e;
      });
    if (kind !== "opportunities") {
      await tx.company.update({ where: { id: current.company_id as string }, data: { input_revision: { increment: 1 } } });
    }
    await tx.dataset.update({ where: { id: dataset.id }, data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId } });
    return serializeRow(updated) as Record<string, unknown>;
  });
}

export async function archiveRelated(
  dataset: DatasetPayload,
  kind: RelatedKind,
  recordId: string,
  archived: boolean,
  expectedVersion: number,
  mctx: MutationCtx,
): Promise<Record<string, unknown>> {
  const model = MODEL[kind] as "signal";
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: mctx.userId, source: "manual", request_id: mctx.requestId });
    const current = (await (tx as unknown as Record<string, { findUnique: (a: never) => Promise<Record<string, unknown> | null> }>)[model].findUnique({
      where: { id: recordId },
    } as never)) as Record<string, unknown> | null;
    if (!current || current.dataset_id !== dataset.id) throw notFound("Registro não encontrado nesta base.");
    const parentArch = await tx.company.findUnique({ where: { id: current.company_id as string }, select: { archived_at: true } });
    if (parentArch?.archived_at) throw validation("Empresa arquivada — restaure antes de alterar seus registros.");
    if (archived === Boolean(current.archived_at)) return serializeRow(current) as Record<string, unknown>;
    if (current.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de arquivar.", {
        expected_version: expectedVersion,
        current_version: current.version as number,
      });
    }
    const updated = await (tx as unknown as Record<string, { update: (a: never) => Promise<Record<string, unknown>> }>)[model]
      .update({
        where: { id: recordId, dataset_id: dataset.id, version: expectedVersion },
        data: { archived_at: archived ? new Date() : null, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId },
      } as never)
      .catch(async (e) => {
        if ((e as { code?: string }).code === "P2005" || (e as { code?: string }).code === "P2025") {
          throw conflict("VERSION_CONFLICT", "O registro mudou. Atualize os dados antes de arquivar.", {
            expected_version: expectedVersion,
          });
        }
        throw e;
      });
    if (kind !== "opportunities") {
      await tx.company.update({ where: { id: current.company_id as string }, data: { input_revision: { increment: 1 } } });
    }
    await tx.dataset.update({ where: { id: dataset.id }, data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: mctx.userId } });
    return serializeRow(updated) as Record<string, unknown>;
  });
}

export async function relatedHistory(
  dataset: DatasetPayload,
  kind: RelatedKind,
  recordId: string,
  field: string | undefined,
  page: number,
  pageSize: number,
) {
  const entityType = MODEL[kind];
  const where: Prisma.AuditEventWhereInput = {
    entity_type: entityType,
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

/** Serialização pública: BigInt → number (JSON.stringify lança em BigInt). */
export function serializeRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "bigint" ? Number(v) : v;
  return out;
}

/** Datas ISO → Date e centavos → BigInt para o Prisma. */
function serializeFields(kind: RelatedKind, fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (DATE_FIELDS[kind].has(k) && typeof v === "string" && v !== "") { out[k] = new Date(`${v}T00:00:00Z`); continue; }
    if (BIGINT_FIELDS[kind].has(k) && typeof v === "number") { out[k] = BigInt(v); continue; }
    out[k] = v;
  }
  return out;
}
