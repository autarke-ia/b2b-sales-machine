import type { Prisma } from "@prisma/client";
import rulesDefault from "../../../contracts/rules-default-v1.json";
import { setActorContext, prisma } from "../db/prisma";
import { validation } from "../http/errors";
import type { RuleConfig } from "../../domain/scoring";

import type { Dataset } from "@prisma/client";

export type DatasetPayload = Dataset;

export function datasetDto(d: DatasetPayload) {
  return {
    id: d.id,
    name: d.name,
    kind: d.kind,
    version: d.version,
    data_revision: d.data_revision,
    review_revision: d.review_revision,
    default_as_of: d.default_as_of.toISOString().slice(0, 10),
    active_ruleset_id: d.active_ruleset_id,
    created_at: d.created_at.toISOString(),
    created_by: d.created_by,
    updated_at: d.updated_at?.toISOString() ?? null,
    updated_by: d.updated_by ?? null,
  };
}

export async function listDatasets() {
  const rows = await prisma.dataset.findMany({ orderBy: { created_at: "asc" } });
  return rows.map(datasetDto);
}

export async function getDataset(id: string): Promise<DatasetPayload | null> {
  return prisma.dataset.findUnique({ where: { id } });
}

/** Cria base vazia com ruleset default publicado (rascunho não pontua — INV-14). */
export async function createDataset(userId: string, name: string, tx: Prisma.TransactionClient): Promise<string> {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > 120) {
    throw validation("Nome da base deve ter entre 1 e 120 caracteres.", [{ field: "name", message: "tamanho inválido" }]);
  }
  await setActorContext(tx, { actor_user_id: userId, source: "manual" });
  const dataset = await tx.dataset.create({
    data: { name: clean, kind: "user", default_as_of: new Date(), created_by: userId },
  });
  const ruleset = await tx.ruleset.create({
    data: {
      dataset_id: dataset.id,
      status: "published",
      config: rulesDefault as unknown as Prisma.InputJsonValue,
      created_by: userId,
      published_at: new Date(),
      published_by: userId,
    },
  });
  await tx.dataset.update({ where: { id: dataset.id }, data: { active_ruleset_id: ruleset.id } });
  return dataset.id;
}

export async function activeRules(dataset: DatasetPayload): Promise<RuleConfig> {
  if (!dataset.active_ruleset_id) throw new Error(`Dataset ${dataset.id} sem ruleset ativo.`);
  const ruleset = await prisma.ruleset.findUniqueOrThrow({ where: { id: dataset.active_ruleset_id } });
  return ruleset.config as unknown as RuleConfig;
}
