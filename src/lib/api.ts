/**
 * Client da API no navegador (doc 05 §11): único ponto de transporte; cookie de
 * sessão é HttpOnly (o navegador carrega), CSRF vive em memória (nunca storage) e
 * é recuperado de /auth/session após reload. 401 → login preservando retorno;
 * nunca recalcula score — o servidor é a fonte (INV-14/do-not).
 */

export interface Envelope<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function paginationOf(res: Envelope<unknown>): Pagination {
  return res.meta.pagination as Pagination;
}

export function apiPagination(res: Envelope<unknown>): Pagination & { pageSize: number } {
  const p = paginationOf(res);
  return { ...p, pageSize: p.page_size };
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

let csrfToken: string | null = null;
let currentUser: { id: string; name: string; email: string } | null = null;

export function user() {
  return currentUser;
}

/** Recupera sessão+CSRF (após reload) — 401 sobe para o caller redirecionar. */
export async function ensureSession(): Promise<{ id: string; name: string; email: string } | null> {
  const res = await fetch("/api/v1/auth/session", { credentials: "same-origin" });
  if (res.status === 401) return null;
  if (!res.ok) throw (await errorFrom(res));
  const body = (await res.json()) as Envelope<{ user: typeof currentUser; csrf_token: string }>;
  csrfToken = body.data.csrf_token;
  currentUser = body.data.user;
  return currentUser;
}

async function errorFrom(res: Response): Promise<ApiError> {
  const j = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    | null;
  return {
    status: res.status,
    code: j?.error?.code ?? "UNKNOWN",
    message: j?.error?.message ?? `Erro HTTP ${res.status}`,
    details: j?.error?.details ?? {},
  };
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string; _csrfRetry?: boolean } = {},
): Promise<Envelope<T>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;
  if (csrfToken && init.method && init.method !== "GET") headers["x-csrf-token"] = csrfToken;

  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    credentials: "same-origin",
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    const back = encodeURIComponent(window.location.pathname);
    window.location.href = `/login?retorno=${back}`;
    throw new Error("UNAUTHENTICATED");
  }
  // CSRF_INVALID (doc 03 §2): recupera a sessão UMA vez e repete conscientemente,
  // sem loop — a segunda falha sobe para o caller.
  if (res.status === 403 && !init._csrfRetry) {
    const err = await errorFrom(res);
    if (err.code === "CSRF_INVALID") {
      const refreshed = await ensureSession();
      if (refreshed) {
        return api<T>(path, { ...init, _csrfRetry: true });
      }
    }
    throw err;
  }
  if (!res.ok) throw await errorFrom(res);
  // 204 No Content (logout) não tem corpo — json() lançaria SyntaxError.
  if (res.status === 204) return { data: undefined as T, meta: {} };
  return (await res.json()) as Envelope<T>;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await errorFrom(res);
  const body = (await res.json()) as Envelope<{ user: typeof currentUser; csrf_token: string }>;
  csrfToken = body.data.csrf_token;
  currentUser = body.data.user;
}

export async function logout(): Promise<void> {
  await api("/auth/logout", { method: "POST" });
  csrfToken = null;
  currentUser = null;
}

export async function downloadCsv(datasetId: string, snapshotId: string, filters: string): Promise<void> {
  const res = await fetch(`/api/v1/datasets/${datasetId}/ranking.csv?snapshot_id=${snapshotId}${filters}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ranking-${snapshotId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
