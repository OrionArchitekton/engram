import { NextRequest, NextResponse } from "next/server";
import { runTurn, type ChatTurn } from "@/lib/agent";
import { getStore } from "@/lib/db";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 20;

function cleanHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ChatTurn =>
        !!t &&
        typeof t === "object" &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.content === "string",
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE_CHARS) }));
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: { sessionId?: unknown; message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!sessionId || !message) {
    return NextResponse.json({ error: "sessionId and message are required." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_MESSAGE_CHARS} chars).` },
      { status: 400 },
    );
  }

  try {
    const result = await runTurn(getStore(), sessionId, message, cleanHistory(body.history));
    return NextResponse.json(result);
  } catch (err) {
    console.error("chat turn failed:", err);
    return NextResponse.json(
      { error: "The model call failed. Please try again." },
      { status: 502 },
    );
  }
}
