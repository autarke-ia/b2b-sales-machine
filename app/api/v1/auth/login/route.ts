import { NextResponse } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { assertOrigin } from "@/server/http/guard";
import { validation } from "@/server/http/errors";
import { clientIp, loginWithPassword, sessionCookieHeader } from "@/server/auth/session";

export async function POST(req: Request): Promise<NextResponse> {
  const rid = crypto.randomUUID();
  try {
    assertOrigin(req);
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      throw validation("Envie JSON.", [{ field: "content-type", message: "use application/json" }]);
    }
    const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    if (!body || typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
      throw validation("E-mail e senha são obrigatórios.", [
        { field: "email", message: "obrigatório" },
        { field: "password", message: "obrigatório" },
      ]);
    }
    const result = await loginWithPassword(body.email, body.password, clientIp(req));
    return okJson(
      { user: result.user, csrf_token: result.csrfToken, expires_at: result.expiresAt.toISOString() },
      {},
      rid,
      200,
      { "Set-Cookie": sessionCookieHeader(result.token, 8 * 3600) },
    );
  } catch (e) {
    return errorJson(e, rid);
  }
}
