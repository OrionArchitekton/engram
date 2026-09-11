import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { retention } from "@/lib/engine/retrieval";
import { parseSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Board snapshot for ONE session: its counts plus its recent memories across all
 * statuses, embeddings stripped. No valid sessionId means no memory content.
 */
export async function GET(req: NextRequest) {
  const sessionId = parseSessionId(req.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  const store = getStore();
  const now = Date.now();
  const memories = store
    .allInSession(sessionId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      importance: m.importance,
      status: m.status,
      supersededBy: m.supersededBy,
      createdAt: m.createdAt,
      lastAccessedAt: m.lastAccessedAt,
      accessCount: m.accessCount,
      sessionId: m.sessionId,
      retention: Number(retention(m, now).toFixed(3)),
    }));
  return NextResponse.json(
    { counts: store.countsInSession(sessionId), memories },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
