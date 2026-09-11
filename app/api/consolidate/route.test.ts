import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "@/lib/engine/store";
import type { MemoryRecord } from "@/lib/engine/types";
import { POST } from "./route";

const qwen = vi.hoisted(() => ({ embed: vi.fn(), chat: vi.fn() }));
vi.mock("@/lib/qwen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/qwen")>()),
  embed: qwen.embed,
  chat: qwen.chat,
}));
vi.mock("@/lib/ratelimit", () => ({ checkRateLimit: async () => true }));

const VISITOR_A = "a".repeat(32);
const VISITOR_B = "b".repeat(32);

const globalForStore = globalThis as unknown as { __engramStore?: MemoryStore };
type Msg = { role: string; content: string };

function aMemory(): MemoryRecord {
  const now = Date.now();
  return {
    id: "a-denver",
    type: "fact",
    content: "I live in Denver",
    embedding: [1, 0, 0],
    importance: 0.9,
    createdAt: now - 1000,
    lastAccessedAt: now - 1000,
    accessCount: 0,
    sessionId: VISITOR_A,
    status: "active",
    supersededBy: null,
  };
}

function consolidateAs(sessionId: string) {
  return POST(
    new NextRequest("http://localhost/api/consolidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, turns: [{ role: "user", content: "I moved to Austin" }] }),
    }),
  );
}

beforeEach(() => {
  globalForStore.__engramStore = new MemoryStore(":memory:");
  qwen.embed.mockReset();
  qwen.chat.mockReset();
  qwen.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
  qwen.chat.mockImplementation(async (messages: Msg[]) => {
    const last = messages[messages.length - 1].content;
    if (last.startsWith("You are a memory consolidator")) {
      return '[{"type":"fact","content":"User lives in Austin","importance":0.9}]';
    }
    if (last.startsWith("Two statements about the same user")) return '{"conflict": true}';
    return "ok";
  });
});

describe("POST /api/consolidate", () => {
  it("rejects the legacy shared tab label so stale clients cannot share one scope", async () => {
    const res = await consolidateAs("session-a");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "sessionId is required." });
    expect(qwen.chat).not.toHaveBeenCalled();
  });

  it("never supersedes (or reveals) another visitor's memory when consolidating", async () => {
    const store = globalForStore.__engramStore!;
    store.insert(aMemory());

    const res = await consolidateAs(VISITOR_B);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain("User lives in Austin");
    expect(text).not.toContain("Denver");
    expect(JSON.stringify(qwen.chat.mock.calls)).not.toContain("Denver");
    expect(store.get("a-denver")?.status).toBe("active");
  });
});
