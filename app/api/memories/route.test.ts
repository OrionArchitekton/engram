import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/engine/store";
import type { MemoryRecord } from "@/lib/engine/types";
import { GET } from "./route";

const VISITOR_A = "a".repeat(32);
const VISITOR_B = "b".repeat(32);
const A_SECRET = "My project codename is BLUEFIN";

const globalForStore = globalThis as unknown as { __engramStore?: MemoryStore };

let seq = 0;
function mem(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  seq += 1;
  const now = Date.now();
  return {
    id: `m${seq}`,
    type: "fact",
    content: "user prefers TypeScript strict mode",
    embedding: [0.25, -0.5, 1],
    importance: 0.5,
    createdAt: now - 1000,
    lastAccessedAt: now - 1000,
    accessCount: 0,
    sessionId: VISITOR_A,
    status: "active",
    supersededBy: null,
    ...overrides,
  };
}

function board(query: string) {
  return GET(new NextRequest(`http://localhost/api/memories${query}`));
}

beforeEach(() => {
  globalForStore.__engramStore = new MemoryStore(":memory:");
});

describe("GET /api/memories", () => {
  it("fails closed with 400 and no memory content when sessionId is absent", async () => {
    globalForStore.__engramStore!.insert(mem({ content: A_SECRET }));

    const res = await board("");
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({ error: "sessionId is required." });
    expect(text).not.toContain("BLUEFIN");
  });

  it.each([
    ["the legacy shared tab label", "session-a"],
    ["a readable label of scope-id length", "session-a-shared-label-000000000"],
    ["an over-long id (rejected, never truncated into a collision)", `${VISITOR_A}${"x".repeat(64)}`],
    ["an id with separator characters", "visitor-aaaa/../aaaaaaaa"],
  ])("fails closed with 400 on %s", async (_label, sessionId) => {
    globalForStore.__engramStore!.insert(mem({ content: A_SECRET, sessionId: "session-a" }));

    const res = await board(`?sessionId=${encodeURIComponent(sessionId)}`);
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(text).not.toContain("BLUEFIN");
  });

  it("never returns another visitor's memory content (cross-session negative control)", async () => {
    globalForStore.__engramStore!.insert(mem({ content: A_SECRET, sessionId: VISITOR_A }));
    globalForStore.__engramStore!.insert(mem({ content: "B likes tea", sessionId: VISITOR_B }));

    const res = await board(`?sessionId=${VISITOR_B}`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain("BLUEFIN");
    expect(text).not.toContain(VISITOR_A);
    expect(JSON.parse(text).memories.map((m: { content: string }) => m.content)).toEqual([
      "B likes tea",
    ]);
  });

  it("counts only the requesting visitor's memories", async () => {
    const store = globalForStore.__engramStore!;
    store.insert(mem({ sessionId: VISITOR_A, status: "active" }));
    store.insert(mem({ sessionId: VISITOR_A, status: "decayed" }));
    store.insert(mem({ sessionId: VISITOR_A, status: "superseded" }));
    store.insert(mem({ sessionId: VISITOR_B, status: "active" }));

    const forB = await (await board(`?sessionId=${VISITOR_B}`)).json();
    const forA = await (await board(`?sessionId=${VISITOR_A}`)).json();

    expect(forB.counts).toEqual({ active: 1, decayed: 0, superseded: 0 });
    expect(forA.counts).toEqual({ active: 1, decayed: 1, superseded: 1 });
  });

  it("returns the requesting visitor's own memories (positive control)", async () => {
    globalForStore.__engramStore!.insert(mem({ content: A_SECRET, sessionId: VISITOR_A }));

    const res = await board(`?sessionId=${VISITOR_A}`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.memories.map((m: { content: string }) => m.content)).toEqual([A_SECRET]);
    // A per-visitor board must never be stored by a shared cache (e.g. a CDN cache rule).
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
