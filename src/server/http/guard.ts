import { forbidden, unauthenticated } from "./errors";
import { csrfMatches, sessionFromCookieClassified, type AuthenticatedSession } from "../auth/session";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Origem permitida: APP_ORIGIN (mesmo domínio por proxy/rewrite — doc 00 §4). */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // chamada non-browser (curl/testes) não envia Origin
  const allowed = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return origin.replace(/\/$/, "") === allowed.replace(/\/$/, "");
}

export function assertOrigin(req: Request): void {
  if (!originAllowed(req)) throw forbidden("ORIGIN_NOT_ALLOWED", "Origem não permitida para esta operação.");
}

export async function requireSession(req: Request): Promise<AuthenticatedSession> {
  const result = await sessionFromCookieClassified(req);
  if (result.kind !== "ok") {
    if (result.kind === "expired") throw unauthenticated("SESSION_EXPIRED", "Sessão expirada. Entre novamente.");
    throw unauthenticated();
  }
  return result.ctx;
}

/** Sessão + CSRF + Origin para toda mutação autenticada (doc 03 §2, INV-12). */
export async function requireMutationContext(req: Request): Promise<AuthenticatedSession> {
  assertOrigin(req);
  const ctx = await requireSession(req);
  if (!csrfMatches(ctx.session, req.headers.get("x-csrf-token"))) {
    throw forbidden("CSRF_INVALID", "Token CSRF ausente ou inválido. Recupere a sessão e repita conscientemente.");
  }
  return ctx;
}

export { MUTATING };
