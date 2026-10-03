import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import type { Session, User } from "@prisma/client";
import { prisma } from "../db/prisma";
import { tooMany, unauthenticated } from "../http/errors";

const SESSION_HOURS = 8;
const FAIL_WINDOW_MIN = 15;
const FAIL_MAX_PER_EMAIL_IP = 5;
const FAIL_MAX_PER_IP = 20;
// Hash plausível para equalizar tempo de resposta quando o usuário não existe.
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$ZGV2ZWxmaXhlZHNhbHRkZXZlbGZpeA$RdescH4iW0dJcMxLE2YV1JDZ0oDNC5DGb1qON1THmRE";

export const sha256Hex = (v: string) => createHash("sha256").update(v).digest("hex");

/** CSRF derivável por sessão: token = HMAC(SECRET, session_id) — recuperável em
 * /auth/session sem armazenar o valor em claro; csrf_hash guarda sha256(token)
 * para comparação em tempo constante na mutação. */
export function csrfTokenFor(sessionId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET ausente — configure o ambiente.");
  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export interface RateVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function rateLimitVerdict(emailNorm: string, ip: string): Promise<RateVerdict> {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000);
  const [byEmailIp, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email_norm: emailNorm, ip, occurred_at: { gt: since } } }),
    prisma.loginAttempt.count({ where: { ip, occurred_at: { gt: since } } }),
  ]);
  if (byEmailIp < FAIL_MAX_PER_EMAIL_IP && byIp < FAIL_MAX_PER_IP) return { allowed: true, retryAfterSeconds: 0 };
  const oldest = await prisma.loginAttempt.findFirst({
    where: { occurred_at: { gt: since } },
    orderBy: { occurred_at: "asc" },
    select: { occurred_at: true },
  });
  const retryAfter = oldest
    ? Math.max(1, Math.ceil((oldest.occurred_at.getTime() + FAIL_WINDOW_MIN * 60_000 - Date.now()) / 1000))
    : FAIL_WINDOW_MIN * 60;
  return { allowed: false, retryAfterSeconds: Math.min(retryAfter, FAIL_WINDOW_MIN * 60) };
}

export async function recordFailedAttempt(emailNorm: string, ip: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { email_norm: emailNorm, ip } });
}

export const SESSION_COOKIE = "allya_session";

export interface LoginResult {
  user: Pick<User, "id" | "name" | "email">;
  sessionId: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function loginWithPassword(email: string, password: string, ip: string): Promise<LoginResult> {
  const emailNorm = email.trim().toLowerCase();
  const verdict = await rateLimitVerdict(emailNorm, ip);
  if (!verdict.allowed) throw tooMany(verdict.retryAfterSeconds);

  const user = await prisma.user.findUnique({ where: { email: emailNorm } });
  const hash = user?.password_hash ?? DUMMY_HASH;
  const valid = await argonVerify(hash, password).catch(() => false);
  if (!user || !user.active || !valid) {
    await recordFailedAttempt(emailNorm, ip);
    throw unauthenticated("INVALID_CREDENTIALS", "Credenciais inválidas.");
  }

  const token = newOpaqueToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await prisma.session.create({
    data: {
      id: sessionId,
      user_id: user.id,
      token_hash: sha256Hex(token),
      csrf_hash: sha256Hex(csrfTokenFor(sessionId)),
      expires_at: expiresAt,
    },
  });
  return { user: { id: user.id, name: user.name, email: user.email }, sessionId, token, csrfToken: csrfTokenFor(sessionId), expiresAt };
}

export interface AuthenticatedSession {
  session: Session;
  user: User;
}

export async function sessionFromCookie(req: Request): Promise<AuthenticatedSession | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)allya_session=([^;]+)/);
  if (!match) return null;
  const row = await prisma.session.findUnique({
    where: { token_hash: sha256Hex(match[1]!) },
    include: { user: true },
  });
  if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now() || !row.user.active) return null;
  return { session: row, user: row.user };
}

export function csrfMatches(session: Session, headerToken: string | null): boolean {
  if (!headerToken) return false;
  const a = Buffer.from(session.csrf_hash);
  const b = Buffer.from(sha256Hex(headerToken));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { revoked_at: new Date() } });
}

/** Hash de senha para seed (Argon2id — doc 07 §7). */
export const hashPassword = argonHash;

export function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = (process.env.APP_ORIGIN ?? "").startsWith("https://") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=${maxAgeSeconds}${secure}`;
}
