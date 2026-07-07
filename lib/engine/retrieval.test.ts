import { describe, expect, it } from "vitest";
import { cosine, estimateTokens, recall, retention, scoreMemory } from "./retrieval";
import type { MemoryRecord } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-06T12:00:00Z");

let seq = 0;
function mem(overrides: Partial<MemoryRecord>): MemoryRecord {
  seq += 1;
  return {
    id: `m${seq}`,
    type: "fact",
    content: "user prefers TypeScript strict mode",
    embedding: [1, 0, 0],
    importance: 0.5,
    createdAt: NOW - 1 * DAY,
    lastAccessedAt: NOW - 1 * DAY,
    accessCount: 0,
    sessionId: "s1",
    status: "active",
    supersededBy: null,
    ...overrides,
  };
}

describe("cosine", () => {
  it("is 1 for identical vectors, 0 for orthogonal", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 for a zero vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("retention (timely forgetting)", () => {
  it("decays with time since last access", () => {
    const fresh = mem({ lastAccessedAt: NOW });
    const stale = mem({ lastAccessedAt: NOW - 60 * DAY });
    expect(retention(fresh, NOW)).toBeGreaterThan(retention(stale, NOW));
  });
  it("high-importance memories outlive low-importance ones", () => {
    const vital = mem({ importance: 1, lastAccessedAt: NOW - 30 * DAY });
    const trivia = mem({ importance: 0.1, lastAccessedAt: NOW - 30 * DAY });
    expect(retention(vital, NOW)).toBeGreaterThan(retention(trivia, NOW));
  });
  it("is in (0, 1]", () => {
    expect(retention(mem({ lastAccessedAt: NOW }), NOW)).toBeLessThanOrEqual(1);
    expect(retention(mem({ lastAccessedAt: NOW - 365 * DAY }), NOW)).toBeGreaterThan(0);
  });
});

describe("scoreMemory", () => {
  it("ranks a similar memory above a dissimilar one, all else equal", () => {
    const query = [1, 0, 0];
    const near = scoreMemory(mem({ embedding: [1, 0, 0] }), query, NOW);
    const far = scoreMemory(mem({ embedding: [0, 1, 0] }), query, NOW);
    expect(near.score).toBeGreaterThan(far.score);
  });
  it("ranks a frequently accessed memory above an untouched twin", () => {
    const query = [1, 0, 0];
    const hot = scoreMemory(mem({ accessCount: 20 }), query, NOW);
    const cold = scoreMemory(mem({ accessCount: 0 }), query, NOW);
    expect(hot.score).toBeGreaterThan(cold.score);
  });
});

describe("recall (budget-bounded)", () => {
  it("excludes non-active memories", () => {
    const pool = [
      mem({ status: "superseded" }),
      mem({ status: "decayed" }),
      mem({ status: "active", content: "the only live memory" }),
    ];
    const r = recall(pool, [1, 0, 0], { budget: 1000, now: NOW });
    expect(r.selected.map((s) => s.record.content)).toEqual(["the only live memory"]);
  });

  it("never exceeds the token budget (property over random pools)", () => {
    let rng = 42;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) % 2 ** 31;
      return rng / 2 ** 31;
    };
    for (let trial = 0; trial < 50; trial++) {
      const pool = Array.from({ length: 40 }, () =>
        mem({
          content: "x".repeat(Math.floor(rand() * 400) + 10),
          embedding: [rand(), rand(), rand()],
          importance: rand(),
          lastAccessedAt: NOW - Math.floor(rand() * 90) * DAY,
        }),
      );
      const budget = Math.floor(rand() * 300) + 20;
      const r = recall(pool, [1, 0.5, 0.25], { budget, now: NOW });
      expect(r.totalTokens).toBeLessThanOrEqual(budget);
      const sum = r.selected.reduce((t, s) => t + s.tokens, 0);
      expect(sum).toBe(r.totalTokens);
    }
  });

  it("prefers higher-scoring memories when budget forces a choice", () => {
    const query = [1, 0, 0];
    const strong = mem({ embedding: [1, 0, 0], content: "a".repeat(400) });
    const weak = mem({ embedding: [0.1, 1, 0], content: "b".repeat(400) });
    const budget = estimateTokens(strong.content) + 5; // room for exactly one
    const r = recall([weak, strong], query, { budget, now: NOW });
    expect(r.selected.length).toBe(1);
    expect(r.selected[0].record.id).toBe(strong.id);
  });

  it("backfills a smaller memory when the top one does not fit", () => {
    const query = [1, 0, 0];
    const big = mem({ embedding: [1, 0, 0], content: "a".repeat(2000) });
    const small = mem({ embedding: [0.9, 0.1, 0], content: "tiny but relevant" });
    const r = recall([big, small], query, { budget: 50, now: NOW });
    expect(r.selected.map((s) => s.record.id)).toEqual([small.id]);
  });

  it("recalls memories regardless of which session wrote them (cross-session)", () => {
    const fromA = mem({ sessionId: "session-a", content: "preference from session a" });
    const fromB = mem({ sessionId: "session-b", content: "fact from session b" });
    const r = recall([fromA, fromB], [1, 0, 0], { budget: 1000, now: NOW });
    expect(r.selected.map((s) => s.record.sessionId).sort()).toEqual(["session-a", "session-b"]);
  });

  it("drops memories whose retention is below the forgetting floor", () => {
    const ancient = mem({
      importance: 0.05,
      lastAccessedAt: NOW - 400 * DAY,
      createdAt: NOW - 400 * DAY,
      content: "long-forgotten trivia",
    });
    const r = recall([ancient], [1, 0, 0], { budget: 1000, now: NOW });
    expect(r.selected).toEqual([]);
    expect(r.passedOver.length).toBe(1);
  });
});
