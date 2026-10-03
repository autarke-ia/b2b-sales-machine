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

/** Hash canônico (doc 03 §4): JSON re-serializado com chaves ordenadas — o mesmo
 * payload lógico produz o mesmo hash mesmo com ordem/espaços diferentes. */
function canonicalHash(raw: string, contentType: string | null): string {
  if (contentType?.includes("application/json")) {
    try {
      const sorted = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(sorted);
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sorted(v)]),
          );
        }
        return value;
      };
      return createHash("sha256").update(JSON.stringify(sorted(JSON.parse(raw)))).digest("hex");
    } catch {
      // JSON inválido cai no hash bruto — a rota rejeitará o body antes do efeito.
    }
  }
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Idempotência de POST de negócio (doc 03 §4): mesma chave+payload reproduz a
 * resposta original; payload divergente é 409; concorrente recebe 409 "em
 * processamento". Falha dentro de `fn` LIBERA a chave (delete) — erro de
 * validação não envenena a chave por 24h. Conclusão na MESMA transação do efeito.
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
  const payloadHash = canonicalHash(rawBody, req.headers.get("content-type"));

  const existing = await prisma.idempotencyRecord.findUnique({
    where: { user_id_method_route_key: { user_id: userId, method: req.method, route, key } },
  });
  if (existing && existing.expires_at.getTime() > Date.now()) {
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
  if (existing) {
    // Expirada: remove para reprocessar — sem isto o UNIQUE transformaria o TTL
    // em 409 eterno para a mesma chave.
    await prisma.idempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined);
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
  }).catch(async (e) => {
    // Corrida: a concorrente inseriu primeiro — trata como existente (409 processing).
    if ((e as { code?: string }).code === "P2002") {
      throw conflict("IDEMPOTENCY_CONFLICT", "Ação com esta chave já está em processamento.", { key });
    }
    throw e;
  });

  let result: IdempotentResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      const r = await fn(tx, record.id);
      await tx.idempotencyRecord.update({
        where: { id: record.id },
        data: { status: "completed", result: r as unknown as Prisma.InputJsonValue },
      });
      return r;
    });
  } catch (e) {
    // Falha (validação/SQL): libera a chave para retry consciente com o mesmo payload.
    await prisma.idempotencyRecord.delete({ where: { id: record.id } }).catch(() => undefined);
    throw e;
  }

  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
