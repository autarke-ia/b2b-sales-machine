import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { conflict, validation } from "./errors";

const TTL_HOURS = 24;

export interface IdempotentResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Idempotência de POST de negócio (doc 03 §4): a chave identifica
 * (usuário, método, rota, ação); repetição com o MESMO payload reproduz a resposta
 * original (header x-idempotent-replay); payload divergente é 409. O registro é
 * concluído na MESMA transação do efeito (`fn` recebe o tx e o id do registro).
 *
 * Durabilidade: o registro 'processing' entra primeiro (UNIQUE — a concorrente
 * ganha conflito imediato); se o processo morrer antes do commit do efeito, o
 * registro expira em 24h. Efeitos externos ficam em job durável (Fase 4).
 */
export async function runIdempotent(
  req: Request,
  userId: string,
  rawBody: string,
  fn: (tx: Prisma.TransactionClient, recordId: string) => Promise<IdempotentResult>,
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 16 || key.length > 100) {
    throw validation("Idempotency-Key obrigatória (16–100 caracteres) para esta ação.", [
      { field: "Idempotency-Key", message: "fora do formato 16–100 caracteres" },
    ]);
  }
  const route = new URL(req.url).pathname;
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { user_id_method_route_key: { user_id: userId, method: req.method, route, key } },
  });
  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      throw conflict("IDEMPOTENCY_CONFLICT", "Chave de idempotência já usada com outro payload.", { key });
    }
    if (existing.status === "completed") {
      const stored = existing.result as unknown as IdempotentResult;
      return NextResponse.json(stored.body, {
        status: stored.status,
        headers: { "x-idempotent-replay": "true", ...(stored.headers ?? {}) },
      });
    }
    throw conflict("IDEMPOTENCY_CONFLICT", "Ação com esta chave já está em processamento.", { key, state: existing.status });
  }

  const record = await prisma.idempotencyRecord.create({
    data: {
      user_id: userId,
      method: req.method,
      route,
      key,
      payload_hash: payloadHash,
      expires_at: new Date(Date.now() + TTL_HOURS * 3600_000),
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    const r = await fn(tx, record.id);
    await tx.idempotencyRecord.update({
      where: { id: record.id },
      data: { status: "completed", result: r as unknown as Prisma.InputJsonValue },
    });
    return r;
  });

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
