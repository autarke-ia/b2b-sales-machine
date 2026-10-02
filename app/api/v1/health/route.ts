import { NextResponse } from "next/server";

/**
 * Healthcheck sem revelar conexão, segredos ou estado de banco (doc 04 §9).
 * Verificação de dependências fica em rotas de diagnóstico separadas, autenticadas.
 */
export function GET() {
  return NextResponse.json(
    {
      data: { status: "ok", service: "b2b-sales-machine", contract: "1.0.0" },
      meta: { request_id: crypto.randomUUID() },
    },
    { headers: { "X-Request-Id": crypto.randomUUID() } },
  );
}
