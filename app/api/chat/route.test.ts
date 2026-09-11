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
const A_SECRET = "My project codename is BLUEFIN";

const globalForStore = globalThis as unknown as { __engramStore?: MemoryStore };
type Msg = { role: string; content: string };

let importanceReply = "0.1";

let seq = 0;
function mem(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  seq += 1;
  const now = Date.now();
  return {
    id: `m${seq}`,
    type: "fact",
    content: A_SECRET,
    // Every embedding (and every query, via the embed mock) is the same vector, so
    // an unscoped pool would always surface the other visitor's memory.
    embedding: [1, 0, 0],
    importance: 0.9,
    createdAt: now - 1000,
    lastAccessedAt: now - 1000,
    accessCount: 0,
    sessionId: VISITOR_A,
    status: "active",
    supersededBy: null,
    ...overrides,
  };
}

function chatAs(sessionId: string, message: string) {
  return POST(
    new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, message, history: [] }),
    }),
  );
}

/** Everything any model call was shown during the request. */
function modelInputs(): string {
  return JSON.stringify(qwen.chat.mock.calls.map(([messages]) => messages as Msg[]));
}

beforeEach(() => {
  globalForStore.__engramStore = new MemoryStore(":memory:");
  importanceReply = "0.1";
  qwen.embed.mockReset();
  qwen.chat.mockReset();
  qwen.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
  qwen.chat.mockImplementation(async (messages: Msg[]) => {
    const last = messages[messages.length - 1].content;
    if (last.startsWith("Rate the long-term importance")) return importanceReply;
    if (last.startsWith("Two statements about the same user")) return '{"conflict": true}';
    return "ok";
  });
});

describe("POST /api/chat", () => {
  it("rejects the legacy shared tab label so stale clients cannot share one scope", async () => {
    globalForStore.__engramStore!.insert(mem({ sessionId: "session-a" }));

    const res = await chatAs("session-a", "What is my project codename?");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "sessionId and message are required." });
    expect(qwen.chat).not.toHaveBeenCalled();
  });

  it("never recalls another visitor's memory into events or the model prompt", async () => {
    globalForStore.__engramStore!.insert(mem());

    const res = await chatAs(VISITOR_B, "What is my project codename?");
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain("BLUEFIN");
    expect(modelInputs()).not.toContain("BLUEFIN");
  });

  it("never supersedes (or reveals) another visitor's memory on a contradicting write", async () => {
    const store = globalForStore.__engramStore!;
    const aMemory = mem({ content: "I live in Denver" });
    store.insert(aMemory);
    importanceReply = "0.9";

    const res = await chatAs(VISITOR_B, "I live in Austin");
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('"kind":"stored"');
    expect(text).not.toContain("Denver");
    expect(modelInputs()).not.toContain("Denver");
    expect(store.get(aMemory.id)?.status).toBe("active");
  });

  it("never sweeps (or reports) another visitor's decayed memory", async () => {
    const store = globalForStore.__engramStore!;
    const longAgo = Date.now() - 3650 * 24 * 60 * 60 * 1000;
    const aStale = mem({ importance: 0.1, createdAt: longAgo, lastAccessedAt: longAgo });
    store.insert(aStale);

    const res = await chatAs(VISITOR_B, "hello there");
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain("BLUEFIN");
    expect(store.get(aStale.id)?.status).toBe("active");
  });

  it("still supersedes the visitor's own contradicted memory (positive control)", async () => {
    const store = globalForStore.__engramStore!;
    const aMemory = mem({ content: "I live in Denver" });
    store.insert(aMemory);
    importanceReply = "0.9";

    const body = await (await chatAs(VISITOR_A, "I live in Austin")).json();

    expect(body.events).toContainEqual(
      expect.objectContaining({ kind: "superseded", content: "I live in Denver" }),
    );
    expect(store.get(aMemory.id)?.status).toBe("superseded");
  });

  it("still sweeps the visitor's own decayed memory (positive control)", async () => {
    const store = globalForStore.__engramStore!;
    const longAgo = Date.now() - 3650 * 24 * 60 * 60 * 1000;
    const aStale = mem({ importance: 0.1, createdAt: longAgo, lastAccessedAt: longAgo });
    store.insert(aStale);

    const body = await (await chatAs(VISITOR_A, "hello there")).json();

    expect(body.events).toContainEqual(
      expect.objectContaining({ kind: "decayed", content: A_SECRET }),
    );
    expect(store.get(aStale.id)?.status).toBe("decayed");
  });

  it("recalls the visitor's own memory across chat tabs (positive control)", async () => {
    globalForStore.__engramStore!.insert(mem());

    const res = await chatAs(VISITOR_A, "What is my project codename?");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.events).toContainEqual(
      expect.objectContaining({ kind: "recalled", content: A_SECRET }),
    );
  });
});
