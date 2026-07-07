import { describe, expect, it } from "vitest";
import {
  engramList,
  engramRecall,
  engramRemember,
  type ToolDeps,
  type ToolStore,
} from "../../mcp/tools";
import type { MemoryRecord } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00Z");

class FakeStore implements ToolStore {
  records: MemoryRecord[] = [];
  refreshCalls: string[][] = [];

  insert(record: MemoryRecord): void {
    this.records.push(record);
  }

  allActive(): MemoryRecord[] {
    return this.records.filter((r) => r.status === "active");
  }

  refreshAccess(ids: string[], now: number): void {
    this.refreshCalls.push([...ids]);
    for (const r of this.records) {
      if (ids.includes(r.id)) {
        r.accessCount += 1;
        r.lastAccessedAt = now;
      }
    }
  }

  counts(): Record<string, number> {
    const counts: Record<string, number> = { active: 0, decayed: 0, superseded: 0 };
    for (const r of this.records) counts[r.status] += 1;
    return counts;
  }
}

/** Deterministic keyword -> unit vector embedder; unit tests never touch the network. */
async function fakeEmbedder(texts: string[]): Promise<number[][]> {
  return texts.map((t) => {
    const lower = t.toLowerCase();
    if (lower.includes("typescript")) return [1, 0, 0];
    if (lower.includes("coffee")) return [0, 1, 0];
    return [0, 0, 1];
  });
}

function makeDeps(now: () => number = () => NOW): { deps: ToolDeps; store: FakeStore } {
  const store = new FakeStore();
  return { deps: { store, embedder: fakeEmbedder, now }, store };
}

describe("engram_remember", () => {
  it("inserts a record with defaults and returns its id", async () => {
    const { deps, store } = makeDeps();
    const { id } = await engramRemember(deps, {
      content: "user prefers typescript strict mode",
    });
    expect(id).toBeTruthy();
    expect(store.records).toHaveLength(1);
    const rec = store.records[0];
    expect(rec.id).toBe(id);
    expect(rec.type).toBe("fact");
    expect(rec.importance).toBe(0.5);
    expect(rec.sessionId).toBe("mcp");
    expect(rec.status).toBe("active");
    expect(rec.accessCount).toBe(0);
    expect(rec.createdAt).toBe(NOW);
    expect(rec.lastAccessedAt).toBe(NOW);
    expect(rec.embedding).toEqual([1, 0, 0]);
    expect(rec.supersededBy).toBeNull();
  });

  it("honors explicit type, importance, and sessionId", async () => {
    const { deps, store } = makeDeps();
    await engramRemember(deps, {
      content: "always drinks coffee before standup",
      type: "preference",
      importance: 0.9,
      sessionId: "cli-7",
    });
    const rec = store.records[0];
    expect(rec.type).toBe("preference");
    expect(rec.importance).toBe(0.9);
    expect(rec.sessionId).toBe("cli-7");
  });

  it("assigns distinct ids to distinct memories", async () => {
    const { deps } = makeDeps();
    const a = await engramRemember(deps, { content: "typescript" });
    const b = await engramRemember(deps, { content: "coffee" });
    expect(a.id).not.toBe(b.id);
  });
});

describe("engram_recall", () => {
  it("round-trips a remembered record with the blended score", async () => {
    const { deps } = makeDeps();
    const { id } = await engramRemember(deps, {
      content: "user prefers typescript strict mode",
    });
    const items = await engramRecall(deps, { query: "which language: typescript?" });
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(id);
    expect(items[0].type).toBe("fact");
    expect(items[0].content).toBe("user prefers typescript strict mode");
    // similarity 1, retention 1, importance 0.5, frequency 0 under WEIGHTS
    expect(items[0].score).toBeCloseTo(0.8, 5);
    expect(Object.keys(items[0]).sort()).toEqual(["content", "id", "score", "type"]);
  });

  it("refreshes access on selected ids only", async () => {
    const { deps, store } = makeDeps();
    const a = await engramRemember(deps, { content: "typescript strict" });
    const b = await engramRemember(deps, { content: "coffee " + "x".repeat(400) });
    const items = await engramRecall(deps, { query: "typescript", budget: 50 });
    expect(items.map((i) => i.id)).toEqual([a.id]);
    const recA = store.records.find((r) => r.id === a.id)!;
    const recB = store.records.find((r) => r.id === b.id)!;
    expect(recA.accessCount).toBe(1);
    expect(recA.lastAccessedAt).toBe(NOW);
    expect(recB.accessCount).toBe(0);
  });

  it("defaults to an 800 token budget", async () => {
    const { deps } = makeDeps();
    const small = await engramRemember(deps, { content: "typescript strict" });
    // 3600 chars -> 900 estimated tokens: over the 800 default on its own
    await engramRemember(deps, { content: "typescript " + "y".repeat(3589) });
    const items = await engramRecall(deps, { query: "typescript" });
    expect(items.map((i) => i.id)).toEqual([small.id]);
  });

  it("returns empty and skips the access refresh when nothing matches", async () => {
    const { deps, store } = makeDeps();
    const items = await engramRecall(deps, { query: "anything at all" });
    expect(items).toEqual([]);
    expect(store.refreshCalls).toEqual([]);
  });
});

describe("engram_list", () => {
  it("returns store counts plus the 20 most recent active memories", async () => {
    let t = NOW;
    const { deps, store } = makeDeps(() => t);
    for (let i = 0; i < 25; i++) {
      t = NOW + i * 1000;
      await engramRemember(deps, { content: `note ${i}` });
    }
    // newest record of all, but decayed: must be excluded by status, not age
    store.records.push({
      id: "decayed-1",
      type: "fact",
      content: "stale note",
      embedding: [0, 0, 1],
      importance: 0.1,
      createdAt: NOW + 10_000_000,
      lastAccessedAt: NOW,
      accessCount: 0,
      sessionId: "mcp",
      status: "decayed",
      supersededBy: null,
    });
    const result = await engramList(deps);
    expect(result.counts).toEqual({ active: 25, decayed: 1, superseded: 0 });
    expect(result.recent).toHaveLength(20);
    expect(result.recent[0].content).toBe("note 24");
    expect(result.recent[19].content).toBe("note 5");
    expect(result.recent.some((m) => m.id === "decayed-1")).toBe(false);
  });
});
