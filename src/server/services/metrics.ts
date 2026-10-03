import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import type { DatasetPayload } from "./datasets";

/** Cronometragem server-side (doc 03 §9, doc 08 §9): o relógio do navegador é
 * projeção; acumulação vem de last_resumed_at/now no servidor. */
export async function startSession(dataset: DatasetPayload, companyId: string, mode: "manual" | "assisted", userId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.dataset_id !== dataset.id) throw notFound("Empresa não encontrada nesta base.");
  const existing = await prisma.reviewSession.findFirst({
    where: { user_id: userId, company_id: companyId, state: { in: ["active", "paused"] } },
  });
  if (existing) {
    throw conflict("REVIEW_SESSION_ACTIVE", "Você já tem uma sessão aberta para esta empresa.", { session_id: existing.id });
  }
  try {
    await prisma.$transaction(async (tx) => {
      await setActorContext(tx, { actor_user_id: userId, source: "system" });
      await tx.reviewSession.create({ data: { dataset_id: dataset.id, company_id: companyId, user_id: userId, mode } });
    });
  } catch (e) {
    // O índice parcial unique (uma sessão aberta por usuário/empresa) decide a
    // corrida que o findFirst-then-create não decide (finder P2-7).
    if ((e as { code?: string }).code === "P2002") {
      throw conflict("REVIEW_SESSION_ACTIVE", "Você já tem uma sessão aberta para esta empresa.");
    }
    throw e;
  }
  const created = await prisma.reviewSession.findFirstOrThrow({
    where: { dataset_id: dataset.id, company_id: companyId, user_id: userId },
    orderBy: { started_at: "desc" },
  });
  return sessionDto(created);
}

export function sessionDto(s: {
  id: string;
  dataset_id: string;
  company_id: string;
  user_id: string;
  mode: string;
  state: string;
  active_seconds: number;
  wall_seconds: number | null;
  started_at: Date;
  last_resumed_at: Date;
  finished_at: string | Date | null;
  timing_quality: string;
  input_revision_at_complete: number | null;
  version: number;
}) {
  return {
    id: s.id,
    dataset_id: s.dataset_id,
    company_id: s.company_id,
    user_id: s.user_id,
    mode: s.mode,
    state: s.state,
    active_seconds: s.active_seconds,
    wall_seconds: s.wall_seconds,
    started_at: s.started_at.toISOString(),
    last_resumed_at: s.last_resumed_at.toISOString(),
    finished_at: s.finished_at ? new Date(s.finished_at).toISOString() : null,
    timing_quality: s.timing_quality,
    input_revision_at_complete: s.input_revision_at_complete,
    version: s.version,
  };
}

export async function sessionEvent(
  dataset: DatasetPayload,
  sessionId: string,
  event: "pause" | "resume" | "complete" | "abandon",
  expectedVersion: number,
  expectedInputRevision: number | null,
  interrupted: boolean,
  userId: string,
  requestId: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM review_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
    const s = await tx.reviewSession.findUnique({ where: { id: sessionId } });
    if (!s || s.dataset_id !== dataset.id) throw notFound("Sessão não encontrada nesta base.");
    if (s.user_id !== userId) throw notFound("Sessão não encontrada nesta base.");
    if (s.state === "completed" || s.state === "abandoned") {
      throw conflict("INVALID_STATE_TRANSITION", `Sessão já encerrada (${s.state}).`);
    }
    if (s.version !== expectedVersion) {
      throw conflict("VERSION_CONFLICT", "A sessão mudou. Recarregue.", { current_version: s.version });
    }
    const now = new Date();
    // Pausas não contam (doc 08 §9): delta só do intervalo ATIVO corrente.
    const activeDelta = s.state === "active" ? Math.floor((now.getTime() - s.last_resumed_at.getTime()) / 1000) : 0;
    let next: Partial<typeof s> = {};
    switch (event) {
      case "pause":
        if (s.state !== "active") throw conflict("INVALID_STATE_TRANSITION", "Só sessão ativa pausa.");
        next = { state: "paused", active_seconds: s.active_seconds + activeDelta, version: s.version + 1 };
        break;
      case "resume":
        if (s.state !== "paused") throw conflict("INVALID_STATE_TRANSITION", "Só sessão pausada retoma.");
        next = { state: "active", last_resumed_at: now, version: s.version + 1 };
        break;
      case "complete": {
        if (expectedInputRevision === null || !Number.isInteger(expectedInputRevision)) {
          throw validation("complete exige expected_input_revision (a versão das entradas que você validou).", [
            { field: "expected_input_revision", message: "obrigatório em complete" },
          ]);
        }
        const company = await tx.company.findUniqueOrThrow({ where: { id: s.company_id } });
        if (company.input_revision !== expectedInputRevision) {
          throw conflict("VERSION_CONFLICT", "As entradas mudaram desde o início — recarregue antes de concluir.", {
            current_input_revision: company.input_revision,
            expected_input_revision: expectedInputRevision,
          });
        }
        next = {
          state: "completed",
          active_seconds: s.active_seconds + activeDelta,
          wall_seconds: Math.floor((now.getTime() - s.started_at.getTime()) / 1000),
          finished_at: now,
          timing_quality: interrupted ? "interrupted" : "complete",
          input_revision_at_complete: expectedInputRevision,
          version: s.version + 1,
        };
        break;
      }
      case "abandon":
        next = { state: "abandoned", finished_at: now, version: s.version + 1 };
        break;
    }
    await tx.reviewSessionEvent.create({
      data: { session_id: sessionId, event, expected_version: expectedVersion, payload: { request_id: requestId, interrupted: interrupted || undefined } as never },
    });
    const updated = await tx.reviewSession.update({ where: { id: sessionId }, data: next as never });
    if (event === "complete") {
      await tx.dataset.update({ where: { id: dataset.id }, data: { review_revision: { increment: 1 } } });
    }
    return sessionDto(updated);
  });
}

export async function listSessions(dataset: DatasetPayload) {
  const rows = await prisma.reviewSession.findMany({ where: { dataset_id: dataset.id }, orderBy: { started_at: "desc" }, take: 100 });
  return rows.map(sessionDto);
}

/** Métricas (doc 08 §9): amostra válida = completed com timing_quality=complete;
 * agregados null quando não há observação — JAMAIS zero como "ótimo". */
export async function getMetrics(dataset: DatasetPayload) {
  const [sessions, decisions, suggestions] = await Promise.all([
    prisma.reviewSession.findMany({ where: { dataset_id: dataset.id } }),
    prisma.reviewDecision.findMany({
      where: { suggestion: { dataset_id: dataset.id } },
      include: { suggestion: { select: { relation: true, field: true } } },
    }),
    prisma.suggestion.groupBy({
      by: ["state"],
      where: { dataset_id: dataset.id },
      _count: { _all: true },
    }),
  ]);

  const valid = sessions.filter((s) => s.state === "completed" && s.timing_quality === "complete");
  const activeSeconds = valid.map((s) => s.active_seconds).sort((a, b) => a - b);
  const avg = activeSeconds.length ? activeSeconds.reduce((a, b) => a + b, 0) / activeSeconds.length : null;
  const median = activeSeconds.length
    ? activeSeconds.length % 2
      ? activeSeconds[(activeSeconds.length - 1) / 2]!
      : (activeSeconds[activeSeconds.length / 2 - 1]! + activeSeconds[activeSeconds.length / 2]!) / 2
    : null;

  // Estado FINAL por sugestão (última decisão vence; defer→accept conta 1x
  // accept) e inconclusivas fora do denominador (doc 08 §9).
  const latestBySuggestion = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) {
    const prev = latestBySuggestion.get(d.suggestion_id);
    if (!prev || prev.occurred_at.getTime() <= d.occurred_at.getTime()) latestBySuggestion.set(d.suggestion_id, d);
  }
  const byRelation: Record<string, { accepted: number; rejected: number; deferred: number }> = {};
  let accepted = 0;
  let rejected = 0;
  let deferred = 0;
  for (const d of latestBySuggestion.values()) {
    if (d.suggestion.relation === "inconclusive") continue;
    const bucket = (byRelation[d.suggestion.relation] ??= { accepted: 0, rejected: 0, deferred: 0 });
    bucket[d.action === "accept" ? "accepted" : d.action === "reject" ? "rejected" : "deferred"]++;
    if (d.action === "accept") accepted++;
    else if (d.action === "reject") rejected++;
    else deferred++;
  }
  const actionable = accepted + rejected;

  const stateCounts = Object.fromEntries(suggestions.map((g) => [g.state, g._count._all]));
  const pendingActionable = await prisma.suggestion.count({
    where: { dataset_id: dataset.id, state: { in: ["pending", "deferred"] }, relation: { not: "inconclusive" } },
  });

  return {
    sessions: {
      total: sessions.length,
      completed_valid: valid.length,
      interrupted: sessions.filter((s) => s.timing_quality === "interrupted").length,
      abandoned: sessions.filter((s) => s.state === "abandoned").length,
      average_active_seconds: avg,
      median_active_seconds: median,
      denominator: valid.length,
    },
    decisions: {
      accepted,
      rejected,
      deferred,
      by_relation: byRelation,
      acceptance_rate: actionable ? accepted / actionable : null,
      denominator: actionable,
      pending_actionable: pendingActionable,
    },
    suggestions: stateCounts,
  };
}

const CSV_HEADER = "row_type,dataset_id,company_id,user_id,session_id,suggestion_id,mode,state,relation,decision,started_at,finished_at,active_seconds,wall_seconds,timing_quality,occurred_at,input_revision";

export async function metricsCsv(dataset: DatasetPayload): Promise<string> {
  const [sessions, decisions] = await Promise.all([
    prisma.reviewSession.findMany({ where: { dataset_id: dataset.id }, orderBy: { started_at: "asc" } }),
    prisma.reviewDecision.findMany({
      where: { suggestion: { dataset_id: dataset.id } },
      orderBy: { occurred_at: "asc" },
      include: { suggestion: { select: { company_id: true, relation: true } } },
    }),
  ]);
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_HEADER];
  for (const s of sessions) {
    lines.push(
      ["session", dataset.id, s.company_id, s.user_id, s.id, "", s.mode, s.state, "", "", s.started_at.toISOString(), s.finished_at?.toISOString() ?? "", s.active_seconds, s.wall_seconds ?? "", s.timing_quality, s.started_at.toISOString(), s.input_revision_at_complete ?? ""]
        .map(cell)
        .join(","),
    );
  }
  for (const d of decisions) {
    const s = d.suggestion;
    const sess = sessions.find((x) => x.id === d.review_session_id) ?? sessions.find((x) => x.company_id === s.company_id && x.user_id === d.user_id && x.started_at.getTime() <= d.occurred_at.getTime() && (!x.finished_at || x.finished_at.getTime() >= d.occurred_at.getTime()));
    lines.push(
      ["decision", dataset.id, s.company_id, d.user_id, sess?.id ?? "", d.suggestion_id, sess?.mode ?? "unassigned", "", s.relation, d.action, "", "", "", "", "", d.occurred_at.toISOString(), ""]
        .map(cell)
        .join(","),
    );
  }
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}
