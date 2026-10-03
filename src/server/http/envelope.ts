import { NextResponse } from "next/server";
import { HttpError } from "./errors";

export type Meta = Record<string, unknown>;

export function requestId(): string {
  return crypto.randomUUID();
}

export function okJson<T>(data: T, meta: Meta, rid: string, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ data, meta: { ...meta, request_id: rid } }, { status, headers: { "X-Request-Id": rid, ...headers } });
}

export function noContent(rid: string, headers?: Record<string, string>): NextResponse {
  return new NextResponse(null, { status: 204, headers: { "X-Request-Id": rid, ...headers } });
}

export function errorJson(e: unknown, rid: string): NextResponse {
  if (e instanceof HttpError) {
    const headers: Record<string, string> = { "X-Request-Id": rid };
    if (e.status === 429 && e.details && "retry_after_seconds" in e.details) {
      headers["Retry-After"] = String(Math.ceil(Number(e.details.retry_after_seconds)));
    }
    return NextResponse.json(
      { error: { code: e.code, message: e.message, field_errors: e.fieldErrors ?? [], details: e.details ?? {} }, request_id: rid },
      { status: e.status, headers },
    );
  }
  console.error(`[internal] request_id=${rid}`, e instanceof Error ? e.message : e);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Erro interno. Informe o request_id ao suporte.", field_errors: [], details: {} }, request_id: rid },
    { status: 500, headers: { "X-Request-Id": rid } },
  );
}

/** Envolve um handler: gera request_id, propaga em erros tipados. */
export function route<Args extends unknown[]>(handler: (rid: string, ...args: Args) => Promise<NextResponse>) {
  return async (...args: Args): Promise<NextResponse> => {
    const rid = requestId();
    try {
      return await handler(rid, ...args);
    } catch (e) {
      return errorJson(e, rid);
    }
  };
}
