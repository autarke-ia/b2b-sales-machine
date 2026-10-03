/**
 * Seed idempotente do dataset demo (doc 01 §8). Identidades estáveis (UUIDs do fixture),
 * transação única com contexto de ator LOCAL (doc 04 §4), nunca reset destrutivo no boot.
 * Os timestamps fixos do fixture são preservados de propósito: estabilizam testes e a
 * proveniência registrada em source_locations.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash as argon2Hash } from "@node-rs/argon2";
import { Prisma, PrismaClient } from "@prisma/client";

export const TECHNICAL_ACTOR_ID = "3ae34d02-69bc-5ec2-ba0a-c4122d3bb5c9";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"));

interface SeedCounts {
  companies: number;
  signals: number;
  contacts: number;
  opportunities: number;
}

export async function seedDemo(prisma: PrismaClient): Promise<{ noop: boolean; counts?: SeedCounts }> {
  const demo = readJson("seed/normalized-demo.json");
  const rules = readJson("contracts/rules-default-v1.json");
  const datasetId: string = demo.dataset.id;
  const expected: SeedCounts = {
    companies: demo.companies.length,
    signals: demo.signals.length,
    contacts: demo.contacts.length,
    opportunities: demo.opportunities.length,
  };

  const existing = await prisma.dataset.findUnique({
    where: { id: datasetId },
    select: {
      _count: { select: { companies: true, signals: true, contacts: true, opportunities: true } },
    },
  });
  if (
    existing &&
    existing._count.companies === expected.companies &&
    existing._count.signals === expected.signals &&
    existing._count.contacts === expected.contacts &&
    existing._count.opportunities === expected.opportunities
  ) {
    return { noop: true };
  }

  await prisma.$transaction(async (tx) => {
    // Ator técnico de carga e origem injetados no contexto LOCAL da transação (INV-1).
    await tx.$executeRaw`SELECT set_config('app.actor_user_id', ${TECHNICAL_ACTOR_ID}, true), set_config('app.source', 'seed', true)`;

    await tx.user.upsert({
      where: { id: TECHNICAL_ACTOR_ID },
      update: {},
      create: {
        id: TECHNICAL_ACTOR_ID,
        email: "technical-seed@internal.invalid",
        name: "Ator técnico de carga (seed)",
        password_hash: await argon2Hash(randomUUID()),
        active: false,
        is_technical: true,
      },
    });

    // Regras default como ruleset publicado v1 (INV-14: rascunho nunca pontua).
    const ruleset = await tx.ruleset.create({
      data: {
        dataset_id: datasetId,
        status: "published",
        config: rules,
        created_by: TECHNICAL_ACTOR_ID,
        published_at: new Date(),
        published_by: TECHNICAL_ACTOR_ID,
      },
    });

    await tx.dataset.create({
      data: {
        id: datasetId,
        name: demo.dataset.name,
        kind: "demo",
        version: demo.dataset.version,
        data_revision: demo.dataset.data_revision,
        default_as_of: new Date(demo.dataset.default_as_of),
        active_ruleset_id: ruleset.id,
        created_by: TECHNICAL_ACTOR_ID,
      },
    });

    // Campos @db.Date vêm do fixture como "YYYY-MM-DD" (date-only); o Prisma 6 exige
    // DateTime ISO-8601 / Date. Coerção na carga — o fixture é insumo imutável (não é
    // editado). Companies/contacts não têm campo @db.Date; só signals.observed_on e
    // opportunities.closed_on precisam da conversão (default_as_of já é convertido acima).
    const toDbDate = (v: unknown): Date | null => (typeof v === "string" && v !== "" ? new Date(v) : null);

    await tx.company.createMany({ data: demo.companies, skipDuplicates: true });
    await tx.signal.createMany({
      data: (demo.signals as Prisma.SignalCreateManyInput[]).map((s) => ({ ...s, observed_on: toDbDate(s.observed_on) })),
      skipDuplicates: true,
    });
    await tx.contact.createMany({ data: demo.contacts, skipDuplicates: true });
    await tx.opportunity.createMany({
      data: (demo.opportunities as Prisma.OpportunityCreateManyInput[]).map((o) => ({ ...o, closed_on: toDbDate(o.closed_on) })),
      skipDuplicates: true,
    });

    // Proveniência do arquivo de origem (hash conferível, INV-13: nenhum segredo aqui).
    const xlsx = readFileSync(path.join(root, "seed", "allya-case-original.xlsx"));
    await tx.sourceFile.create({
      data: {
        dataset_id: datasetId,
        sha256: createHash("sha256").update(xlsx).digest("hex"),
        size_bytes: BigInt(xlsx.byteLength),
        original_name: "allya-case-original.xlsx",
        storage_path: "seed/allya-case-original.xlsx",
        received_by: TECHNICAL_ACTOR_ID,
      },
    });
  });

  return { noop: false, counts: expected };
}

export interface SeedUser {
  email: string;
  name: string;
  password: string;
}

/** Usuários pré-cadastrados de desenvolvimento — credenciais só via SEED_USERS (INV-13). */
export async function seedUsers(prisma: PrismaClient): Promise<string[]> {
  const raw = process.env.SEED_USERS;
  if (!raw) return [];
  const list = JSON.parse(raw) as SeedUser[];
  const created: string[] = [];
  for (const u of list) {
    if (!u.email || !u.name || !u.password) throw new Error("SEED_USERS inválido: email/name/password obrigatórios.");
    await prisma.user.upsert({
      where: { email: u.email.toLowerCase() },
      update: {},
      create: {
        email: u.email.toLowerCase(),
        name: u.name,
        password_hash: await argon2Hash(u.password),
      },
    });
    created.push(u.email.toLowerCase());
  }
  return created;
}
