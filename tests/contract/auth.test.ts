/**
 * Fase 1.1 — AUTH01–04 + contrato de sessão (doc 03 §2, doc 07 §7).
 * Executa contra o banco dev real; usuários vêm de SEED_USERS (.env).
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import * as loginRoute from "../../app/api/v1/auth/login/route";
import * as sessionRoute from "../../app/api/v1/auth/session/route";
import * as logoutRoute from "../../app/api/v1/auth/logout/route";
import { call, err, firstSeedUser, login, ok, prisma, sessionCookie, type SessionCtx } from "../helpers/routes";

let ctx: SessionCtx;

beforeAll(async () => {
  // Higiene do contador de rate limit para determinismo entre execuções.
  await prisma.loginAttempt.deleteMany();
  ctx = await login(loginRoute.POST);
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany();
  await prisma.$disconnect();
});

describe("AUTH01 — login individual", () => {
  test("credenciais corretas geram sessão com csrf e cookie HttpOnly", async () => {
    const u = firstSeedUser();
    const res = await call(loginRoute.POST, "/auth/login", { method: "POST", body: u });
    expect(res.status).toBe(200);
    const body = await ok<{ user: { email: string }; csrf_token: string; expires_at: string }>(res);
    expect(body.data.user.email).toBe(u.email.toLowerCase());
    expect(body.data.csrf_token.length).toBeGreaterThanOrEqual(16);
    expect(new Date(body.data.expires_at).getTime()).toBeGreaterThan(Date.now());
    const raw = res.headers.getSetCookie().find((c) => c.startsWith("allya_session="))!;
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    expect(raw).toContain("Path=/api/v1");
  });

  test("senha errada e e-mail inexistente retornam o MESMO código (sem enumerar cadastro)", async () => {
    const u = firstSeedUser();
    const wrong = await err(await call(loginRoute.POST, "/auth/login", { method: "POST", body: { email: u.email, password: "senha-errada" } }));
    const unknown = await err(
      await call(loginRoute.POST, "/auth/login", {
        method: "POST",
        body: { email: `ninguem-${crypto.randomUUID()}@invalid.test`, password: "qualquer" },
      }),
    );
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.code).toBe(unknown.code);
    expect(["INVALID_CREDENTIALS", "UNAUTHENTICATED"]).toContain(wrong.code);
  });
});

describe("AUTH01b — recuperação de sessão", () => {
  test("GET /auth/session com cookie devolve usuário e csrf", async () => {
    const res = await call(sessionRoute.GET, "/auth/session", { session: ctx });
    expect(res.status).toBe(200);
    const body = await ok<{ user: { email: string }; csrf_token: string }>(res);
    expect(body.data.user.email).toBe(firstSeedUser().email.toLowerCase());
    expect(body.data.csrf_token).toBe(ctx.csrf);
  });

  test("sem cookie é 401 UNAUTHENTICATED", async () => {
    const r = await err(await call(sessionRoute.GET, "/auth/session", {}));
    expect(r.status).toBe(401);
    expect(r.code).toBe("UNAUTHENTICATED");
  });
});

describe("AUTH03 — CSRF e Origin", () => {
  test("logout sem X-CSRF-Token é 403 CSRF_INVALID e não revoga", async () => {
    const r = await err(await call(logoutRoute.POST, "/auth/logout", { method: "POST", session: ctx, csrf: null }));
    expect(r.status).toBe(403);
    expect(r.code).toBe("CSRF_INVALID");
    const still = await call(sessionRoute.GET, "/auth/session", { session: ctx });
    expect(still.status).toBe(200);
  });

  test("login com Origin indevido é 403 ORIGIN_NOT_ALLOWED", async () => {
    const u = firstSeedUser();
    const r = await err(
      await call(loginRoute.POST, "/auth/login", {
        method: "POST",
        body: u,
        origin: "https://evil.example",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(r.status).toBe(403);
    expect(r.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("AUTH02 — logout revoga a sessão", () => {
  test("logout 204; sessão seguinte é 401 SESSION_EXPIRED e cookie é limpo", async () => {
    const res = await call(logoutRoute.POST, "/auth/logout", { method: "POST", session: ctx });
    expect(res.status).toBe(204);
    const clearing = res.headers.getSetCookie().find((c) => c.startsWith("allya_session="));
    expect(clearing ?? "").toContain("Max-Age=0");
    const after = await err(await call(sessionRoute.GET, "/auth/session", { session: ctx }));
    expect(after.status).toBe(401);
    expect(["SESSION_EXPIRED", "UNAUTHENTICATED"]).toContain(after.code);
  });
});

describe("AUTH04 — limite de tentativas", () => {
  test("6ª tentativa falha com 429 RATE_LIMITED e Retry-After; conta por (e-mail, IP)", async () => {
    const email = `ratelimit-${crypto.randomUUID()}@invalid.test`;
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await call(loginRoute.POST, "/auth/login", { method: "POST", body: { email, password: "errada" } });
    }
    expect(last!.status).toBe(429);
    const body = await err(last!);
    expect(body.code).toBe("RATE_LIMITED");
    const retryAfter = Number(last!.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
  });

  test("usuário válido não sofre lock permanente por uma falha isolada", async () => {
    const u = firstSeedUser();
    await call(loginRoute.POST, "/auth/login", { method: "POST", body: { email: u.email, password: "errada-única" } });
    const good = await call(loginRoute.POST, "/auth/login", { method: "POST", body: u });
    expect(good.status).toBe(200);
    expect(sessionCookie(good)).toContain("allya_session=");
  });
});
