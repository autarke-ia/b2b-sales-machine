import type { Prisma, Ruleset } from "@prisma/client";
import { prisma, setActorContext } from "../db/prisma";
import { conflict, notFound, validation } from "../http/errors";
import { validateRuleConfig, type RuleConfig } from "../../domain/scoring";
import type { DatasetPayload } from "./datasets";

function rulesetDto(r: Ruleset) {
  return {
    id: r.id,
    dataset_id: r.dataset_id,
    status: r.status,
    config: r.config,
    base_ruleset_id: r.base_ruleset_id,
    version: r.version,
    created_at: r.created_at.toISOString(),
    created_by: r.created_by,
    published_at: r.published_at?.toISOString() ?? null,
    published_by: r.published_by ?? null,
    updated_at: r.updated_at?.toISOString() ?? null,
    updated_by: r.updated_by ?? null,
  };
}

export async function getActiveRuleset(dataset: DatasetPayload): Promise<Ruleset> {
  if (!dataset.active_ruleset_id) throw notFound("Base sem regra ativa.");
  const active = await prisma.ruleset.findUnique({ where: { id: dataset.active_ruleset_id } });
  if (!active) throw notFound("Regra ativa não encontrada.");
  return active;
}

/** Cria rascunho COMPLETO a partir da ativa (doc 03 §6): referenciando a linhagem;
 * o rascunho nunca pontua (INV-14). Config enviada substitui integralmente. */
export async function createDraft(
  dataset: DatasetPayload,
  config: unknown,
  userId: string,
): Promise<Ruleset> {
  let next: RuleConfig;
  if (config === undefined || config === null) {
    const active = await getActiveRuleset(dataset);
    next = structuredClone(active.config as unknown as RuleConfig);
  } else {
    if (typeof config !== "object" || config === null) {
      throw validation("config deve ser um objeto de regras completo.", [{ field: "config", message: "objeto" }]);
    }
    next = config as RuleConfig;
  }
  try {
    validateRuleConfig(next); // soma 100 por grupo, D03, bandas (RULE01)
  } catch (e) {
    throw validation((e as Error).message, [{ field: "config", message: (e as Error).message }]);
  }
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: userId, source: "manual" });
    return tx.ruleset.create({
      data: {
        dataset_id: dataset.id,
        status: "draft",
        config: next as unknown as Prisma.InputJsonValue,
        base_ruleset_id: dataset.active_ruleset_id,
        created_by: userId,
      },
    });
  });
}

/** Publicação (doc 02 §8, doc 07 §6): compara a ativa esperada (RULESET_CONFLICT),
 * versões publicadas são imutáveis, publicação muda a revisão da base. */
export async function publishRuleset(
  dataset: DatasetPayload,
  rulesetId: string,
  expectedActiveRulesetId: string | null,
  userId: string,
): Promise<{ ruleset: Ruleset; dataset_revision: number }> {
  return prisma.$transaction(async (tx) => {
    await setActorContext(tx, { actor_user_id: userId, source: "manual" });
    const draft = await tx.ruleset.findUnique({ where: { id: rulesetId } });
    if (!draft || draft.dataset_id !== dataset.id) throw notFound("Regra não encontrada nesta base.");
    if (draft.status === "published") throw conflict("RULESET_CONFLICT", "Versão já publicada — publique um novo rascunho.");
    const fresh = await tx.dataset.findUniqueOrThrow({ where: { id: dataset.id } });
    if (fresh.active_ruleset_id !== expectedActiveRulesetId) {
      throw conflict("RULESET_CONFLICT", "A regra ativa mudou desde a criação do rascunho. Revise as diferenças e publique de novo.", {
        expected_active_ruleset_id: expectedActiveRulesetId,
        current_active_ruleset_id: fresh.active_ruleset_id,
      });
    }
    const published = await tx.ruleset.update({
      where: { id: rulesetId },
      data: { status: "published", published_at: new Date(), published_by: userId, updated_at: new Date(), updated_by: userId },
    });
    const updatedDataset = await tx.dataset.update({
      where: { id: dataset.id },
      data: { active_ruleset_id: rulesetId, data_revision: { increment: 1 }, version: { increment: 1 }, updated_at: new Date(), updated_by: userId },
    });
    return { ruleset: published, dataset_revision: updatedDataset.data_revision };
  });
}

/** Histórico da linhagem (doc 04 §10): cadeia por base_ruleset_id, cronológico
 * descrescente; rascunhos irmãos não entram. */
export async function rulesetHistory(datasetId: string, rulesetId: string) {
  let current: Ruleset | null = await prisma.ruleset.findUnique({ where: { id: rulesetId } });
  if (!current || current.dataset_id !== datasetId) throw notFound("Regra não encontrada nesta base.");
  const chain: Ruleset[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    if (!current.base_ruleset_id) break;
    const parent: Ruleset | null = await prisma.ruleset.findUnique({ where: { id: current.base_ruleset_id } });
    current = parent && parent.dataset_id === datasetId && parent.status === "published" ? parent : null;
  }
  return chain.map(rulesetDto);
}

export { rulesetDto };
