import { NextRequest, NextResponse } from "next/server";
import { consolidateSession, type ChatTurn } from "@/lib/agent";
import { getStore } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: { sessionId?: unknown; turns?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const turns = Array.isArray(body.turns)
    ? (body.turns as ChatTurn[])
        .filter(
          (t) =>
            !!t &&
            (t.role === "user" || t.role === "assistant") &&
            typeof t.content === "string",
        )
        .slice(-40)
    : [];
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }

  try {
    const events = await consolidateSession(getStore(), sessionId, turns);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("consolidation failed:", err);
    return NextResponse.json({ error: "Consolidation failed. Please try again." }, { status: 502 });
  }
}
