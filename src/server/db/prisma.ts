import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Singleton do Prisma (runtime da API usa a credencial restrita b2bsm_app —
 * sem DDL, sem escrita na trilha; as grants estão na migration 0001).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export interface ActorContext {
  actor_user_id: string;
  source: "manual" | "import" | "ai_acceptance" | "seed" | "system";
  request_id?: string;
  import_id?: string;
  suggestion_id?: string;
}

/**
 * Injeta o contexto de ator NO CONTEXTO LOCAL da transação (doc 04 §4): os
 * triggers de auditoria leem essas GUCs. `set_config(..., true)` com `is_local`
 * morre com a transação — nunca vaza para o pool.
 */
export async function setActorContext(tx: Prisma.TransactionClient, actor: ActorContext): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.actor_user_id', ${actor.actor_user_id}, true),
    set_config('app.source', ${actor.source}, true),
    set_config('app.request_id', ${actor.request_id ?? ""}, true),
    set_config('app.import_id', ${actor.import_id ?? ""}, true),
    set_config('app.suggestion_id', ${actor.suggestion_id ?? ""}, true)`;
}
