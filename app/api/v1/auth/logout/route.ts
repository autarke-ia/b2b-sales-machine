import { NextResponse } from "next/server";
import { errorJson, noContent } from "@/server/http/envelope";
import { requireMutationContext } from "@/server/http/guard";
import { revokeSession, SESSION_COOKIE } from "@/server/auth/session";

export async function POST(req: Request): Promise<NextResponse> {
  const rid = crypto.randomUUID();
  try {
    const { session } = await requireMutationContext(req);
    await revokeSession(session.id);
    return noContent(rid, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0` });
  } catch (e) {
    return errorJson(e, rid);
  }
}
