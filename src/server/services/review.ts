import type { Prisma } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import type { DatasetPayload } from "./datasets";

/** Decisão humana sobre sugestão (doc 06 §6-8): transacional, idempotente,
 * com staleness CAMPO A CAMPO — mudança em campo independente não invalida
 * a proposta (REV05), mudança no campo-alvo ou na evidência sim (REV04/06). */
export async function decideSuggestion(
  dataset: DatasetPayload,
  suggestionId: string,
  action: "accept" | "reject" | "defer",
  expectedCompanyVersion: number,
  expectedSuggestionVersion: number,
  userId: string,
  requestId: string,
  note: string | null = null,
): Promise<{ suggestion: ReturnType<typeof suggestionDto>; company_changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    // Sem lock pessimista inicial (finder P1-1: markStale em tx própria na MESMA
    // linha auto-deadlockava por 5s). A serialização vem dos guards de versão +
    // UPDATE condicional abaixo — corrida dupla converge para 409, não 500.
    const sugg = await tx.suggestion.findUnique({ where: { id: suggestionId } });
    if (!sugg || sugg.dataset_id !== dataset.id) throw notFound("Sugestão não encontrada nesta base.");
    if (sugg.state === "accepted" || sugg.state === "rejected" || sugg.state === "stale") {
      throw conflict("ACTION_ALREADY_RESOLVED", `Sugestão já resolvida (${sugg.state}).`);
    }
    if (sugg.version !== expectedSuggestionVersion) {
      throw conflict("SUGGESTION_STALE", "A sugestão mudou desde a leitura. Reanalise.", {
        expected_suggestion_version: expectedSuggestionVersion,
        current_suggestion_version: sugg.version,
      });
    }
    if (sugg.relation === "inconclusive" && action === "accept") {
      throw validation("Sugestão inconclusiva não oferece aceite — adiue ou rejeite.", [{ field: "action", message: "inconclusive" }]);
    }

    const company = await tx.company.findUniqueOrThrow({ where: { id: sugg.company_id } });
    if (company.version !== expectedCompanyVersion) {
      throw conflict("SUGGESTION_STALE", "A empresa mudou desde a análise. Reanalise a sugestão.", {
        expected_company_version: expectedCompanyVersion,
        current_company_version: company.version,
      });
    }
    // Staleness campo-a-campo: auditoria desde base_company_version — o
    // campo-alvo mudou (mesmo revertido) => stale (REV04); outro campo => ok (REV05).
    const tampered = await tx.auditEvent.findFirst({
      where: {
        entity_type: "company",
        entity_id: sugg.company_id,
        version_after: { gt: sugg.base_company_version },
        changed_fields: { array_contains: [sugg.field] },
      },
    });
    if (tampered) {
      await markStale(suggestionId, userId);
      throw conflict("SUGGESTION_STALE", `O campo ${sugg.field} mudou após a análise. Reanalise.`, { field: sugg.field });
    }
    // Evidências citadas continuam ativas, permitidas e nas mesmas versões (REV06).
    const evidence = sugg.evidence as Array<{ signal_id: string; signal_version: number }>;
    for (const ev of evidence ?? []) {
      const sig = await tx.signal.findUnique({ where: { id: ev.signal_id } });
      if (!sig || sig.archived_at || sig.source_allowed !== true || sig.version !== ev.signal_version) {
        await markStale(suggestionId, userId);
        throw conflict("SUGGESTION_STALE", "A evidência citada mudou ou foi arquivada. Reanalise.", { signal_id: ev.signal_id });
      }
    }

    const openSession = await tx.reviewSession.findFirst({
      where: { dataset_id: dataset.id, company_id: sugg.company_id, user_id: userId, state: { in: ["active", "paused"] } },
      select: { id: true },
    });
    await tx.reviewDecision.create({
      data: {
        suggestion_id: suggestionId,
        user_id: userId,
        action,
        idempotency_key: `${requestId}`,
        note,
        ...(openSession ? { review_session_id: openSession.id } : {}),
      },
    });
    await tx.suggestion
      .update({
        // Guard de versão+estado no UPDATE: dois decides simultâneos → o segundo
        // afeta 0 linhas (P2025) e vira 409 honesto.
        where: { id: suggestionId, version: expectedSuggestionVersion },
        data: { state: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "deferred", version: { increment: 1 }, updated_at: new Date(), updated_by: userId },
      })
      .catch(async (e) => {
        if ((e as { code?: string }).code === "P2025") {
          throw conflict("SUGGESTION_STALE", "A sugestão mudou desde a leitura. Reanalise.", {});
        }
        throw e;
      });

    let companyChanged = false;
    if (action === "accept") {
      const current = (company as unknown as Record<string, unknown>)[sugg.field] ?? null;
      const proposed = sugg.proposed_value;
      if (proposed !== null && proposed !== undefined && String(proposed) !== String(current)) {
        await setActorContext(tx, { actor_user_id: userId, source: "ai_acceptance", request_id: requestId, suggestion_id: suggestionId });
        await tx.company.update({
          where: { id: company.id, dataset_id: dataset.id, version: company.version },
          data: {
            [sugg.field]: proposed,
            version: { increment: 1 },
            input_revision: { increment: 1 },
            updated_at: new Date(),
            updated_by: userId,
          } as never,
        });
        await tx.dataset.update({
          where: { id: dataset.id },
          data: { data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: userId },
        });
        companyChanged = true;
      }
      // Confirmação de valor igual: decisão registrada, SEM update fictício (REV03).
    }

    // Decisões movem a revisão interna (rótulos reviewed/pendências — doc 07 §6).
    await tx.dataset.update({ where: { id: dataset.id }, data: { review_revision: { increment: 1 } } });

    const fresh = await tx.suggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    return { suggestion: suggestionDto(fresh), company_changed: companyChanged };
  });
}

/** Transição -> stale persistida em transação PRÓPRIA: o throw de SUGGESTION_STALE
 * na transação principal reverteria a marcação se compartilhassem o escopo. */
async function markStale(suggestionId: string, userId: string): Promise<void> {
  await prisma.suggestion.update({ where: { id: suggestionId }, data: { state: "stale", version: { increment: 1 }, updated_at: new Date(), updated_by: userId } });
}

export function suggestionDto(s: Prisma.SuggestionGetPayload<Record<string, never>>) {
  return {
    id: s.id,
    dataset_id: s.dataset_id,
    company_id: s.company_id,
    job_id: s.job_id,
    field: s.field,
    current_value: s.current_value,
    proposed_value: s.proposed_value,
    relation: s.relation,
    confidence: s.confidence,
    rationale: s.rationale,
    evidence: s.evidence,
    base_company_version: s.base_company_version,
    state: s.state,
    version: s.version,
    created_at: s.created_at.toISOString(),
  };
}

/** can_accept honesto (doc 05 §5): relação acionável + evidências vivas. */
export async function listSuggestions(dataset: DatasetPayload, companyId: string | undefined, state: string | undefined) {
  if (state && !["pending", "accepted", "rejected", "deferred", "stale"].includes(state)) {
    throw validation("state inválido.", [{ field: "state", message: "enum desconhecido" }]);
  }
  const rows = await prisma.suggestion.findMany({
    where: {
      dataset_id: dataset.id,
      ...(companyId ? { company_id: companyId } : {}),
      ...(state ? { state: state as never } : {}),
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    take: 200,
  });
  const out = [];
  for (const s of rows) {
    let canAccept = (s.state === "pending" || s.state === "deferred") && s.relation !== "inconclusive";
    let blockedReason: string | null = canAccept ? null : s.state !== "pending" && s.state !== "deferred" ? `already_${s.state}` : "inconclusive";
    if (canAccept) {
      const evidence = s.evidence as Array<{ signal_id: string; signal_version: number }>;
      for (const ev of evidence ?? []) {
        const sig = await prisma.signal.findUnique({ where: { id: ev.signal_id } });
        if (!sig || sig.archived_at || sig.source_allowed !== true || sig.version !== ev.signal_version) {
          canAccept = false;
          blockedReason = "evidence_changed";
          break;
        }
      }
    }
    out.push({ ...suggestionDto(s), can_accept: canAccept, blocked_reason: blockedReason });
  }
  return out;
}
