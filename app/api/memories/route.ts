import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { retention } from "@/lib/engine/retrieval";

export const runtime = "nodejs";

/** Board snapshot: counts plus recent memories across all statuses, embeddings stripped. */
export async function GET() {
  const store = getStore();
  const now = Date.now();
  const memories = store
    .all()
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
  return NextResponse.json({ counts: store.counts(), memories });
}
