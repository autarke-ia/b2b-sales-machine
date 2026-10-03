import { NextResponse } from "next/server";
import { errorJson, okJson } from "@/server/http/envelope";
import { requireSession } from "@/server/http/guard";
import { csrfTokenFor } from "@/server/auth/session";

export async function GET(req: Request): Promise<NextResponse> {
  const rid = crypto.randomUUID();
  try {
    const { session, user } = await requireSession(req);
    return okJson(
      {
        user: { id: user.id, name: user.name, email: user.email },
        csrf_token: csrfTokenFor(session.id),
        expires_at: session.expires_at.toISOString(),
      },
      {},
      rid,
    );
  } catch (e) {
    return errorJson(e, rid);
  }
}
