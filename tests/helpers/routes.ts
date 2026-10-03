/**
 * Helper de teste: invoca route handlers do Next.js diretamente (sem servidor),
 * com gerenciamento de cookie de sessão + CSRF — os contratos de HTTP ficam
 * idênticos aos do navegador. Rotas de negócio escrevem no banco dev real
 * (DATABASE_URL) exatamente como em produção.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const BASE = "http://localhost:3000/api/v1";

export interface SessionCtx {
  cookie: string;
  csrf: string;
}

/** Extrai o cookie `allya_session` dos Set-Cookie de uma resposta. */
export function sessionCookie(res: Response): string {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const raw = cookies.find((c) => c.startsWith("allya_session="));
  if (!raw) return "";
  return raw.split(";")[0]!;
}

// ctx.params intencionalmente `any` (contravariância): handlers reais tipam
// params com chaves específicas (ex.: dataset_id) e o helper injata Record.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

export interface CallOptions {
  method?: string;
  body?: unknown;
  session?: SessionCtx;
  origin?: string;
  csrf?: string | null;
  headers?: Record<string, string>;
}

/** Chama um handler com envelope de request montado como o runtime do Next faria. */
export async function call(
  handler: RouteHandler,
  path: string,
  opts: CallOptions = {},
  params: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = { origin: "http://localhost:3000", ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.session?.cookie) headers.cookie = opts.session.cookie;
  if (opts.session?.csrf && opts.csrf !== null) headers["x-csrf-token"] = opts.session.csrf;
  if (opts.csrf !== undefined && opts.csrf === null && opts.session) delete headers["x-csrf-token"];
  const req = new Request(BASE + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return handler(req, { params: Promise.resolve(params) });
}

/** Lê envelope JSON de sucesso. */
export async function ok<T = unknown>(res: Response): Promise<{ data: T; meta: Record<string, unknown> }> {
  if (res.status >= 400) throw new Error(`esperava 2xx, veio ${res.status}: ${await res.text()}`);
  return (await res.json()) as { data: T; meta: Record<string, unknown> };
}

/** Lê envelope de erro e devolve o code. */
export async function err(res: Response): Promise<{ status: number; code: string; error: unknown }> {
  const j = (await res.json()) as { error: { code: string }; request_id?: string };
  return { status: res.status, code: j.error.code, error: j.error };
}

/** Credenciais de dev do .env (SEED_USERS) — nunca hardcoded em teste. */
export function firstSeedUser(): { email: string; password: string } {
  const list = JSON.parse(process.env.SEED_USERS ?? "[]") as Array<{ email: string; password: string }>;
  if (!list.length) throw new Error("SEED_USERS ausente no .env — necessário para os testes de auth.");
  const { email, password } = list[0]!;
  return { email, password }; // só credenciais: login rejeita campos desconhecidos
}

/** Login via handler e devolve o contexto de sessão (cookie + csrf). */
export async function login(handler: RouteHandler, email?: string, password?: string): Promise<SessionCtx> {
  const u = email && password ? { email, password } : firstSeedUser();
  const res = await call(handler, "/auth/login", { method: "POST", body: u });
  if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  const csrf = ((await res.json()) as { data: { csrf_token: string } }).data.csrf_token;
  return { cookie: sessionCookie(res), csrf };
}

export const DEMO_DATASET = { id: "b98e393e-c607-51da-8840-b52becd582b6" };
