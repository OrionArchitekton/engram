import { describe, expect, it } from "vitest";
import type { Adjudicator } from "./contradiction";
import { CONFLICT_SIMILARITY_THRESHOLD, findSuperseded } from "./contradiction";
import type { MemoryRecord } from "./types";

const NOW = Date.parse("2026-07-06T12:00:00Z");

let seq = 0;
function mem(overrides: Partial<MemoryRecord>): MemoryRecord {
  seq += 1;
  return {
    id: `m${seq}`,
    type: "fact",
    content: "user lives in San Diego",
    embedding: [1, 0, 0],
    importance: 0.5,
    createdAt: NOW,
    lastAccessedAt: NOW,
    accessCount: 0,
    sessionId: "s1",
    status: "active",
    supersededBy: null,
    ...overrides,
  };
}

/** Adjudicator fake that records every call and answers from a fixed verdict. */
function fakeAdjudicator(conflict: boolean) {
  const calls: Array<{ newContent: string; oldContent: string }> = [];
  const adjudicate: Adjudicator = async (newContent, oldContent) => {
    calls.push({ newContent, oldContent });
    return { conflict };
  };
  return { adjudicate, calls };
}

describe("CONFLICT_SIMILARITY_THRESHOLD", () => {
  it("is 0.55", () => {
    expect(CONFLICT_SIMILARITY_THRESHOLD).toBe(0.55);
  });
});

describe("findSuperseded (contradiction adjudication)", () => {
  it("supersedes a conflicting near-duplicate", async () => {
    const old = mem({ content: "user lives in San Diego", embedding: [1, 0, 0] });
    const { adjudicate, calls } = fakeAdjudicator(true);
    const result = await findSuperseded(
      "user just moved to Denver",
      [1, 0, 0],
      [old],
      adjudicate,
    );
    expect(result.supersededIds).toEqual([old.id]);
    expect(result.adjudicated).toBe(1);
    expect(calls).toEqual([
      { newContent: "user just moved to Denver", oldContent: "user lives in San Diego" },
    ]);
  });

  it("does NOT supersede a similar but compatible memory", async () => {
    const old = mem({ content: "user prefers TypeScript", embedding: [1, 0, 0] });
    const { adjudicate } = fakeAdjudicator(false);
    const result = await findSuperseded(
      "user also enjoys Rust",
      [0.9, 0.1, 0],
      [old],
      adjudicate,
    );
    expect(result.supersededIds).toEqual([]);
    expect(result.adjudicated).toBe(1);
  });

  it("never sends a below-threshold memory to the adjudicator", async () => {
    // cosine([1,0,0], [1,2,0]) ~= 0.447 < 0.55
    const unrelated = mem({ content: "user owns a cat", embedding: [1, 2, 0] });
    const near = mem({ content: "user lives in San Diego", embedding: [1, 0, 0] });
    const { adjudicate, calls } = fakeAdjudicator(true);
    const result = await findSuperseded(
      "user moved to Denver",
      [1, 0, 0],
      [unrelated, near],
      adjudicate,
    );
    expect(result.adjudicated).toBe(1);
    expect(calls.map((c) => c.oldContent)).toEqual(["user lives in San Diego"]);
    expect(result.supersededIds).toEqual([near.id]);
  });

  it("respects the maxCandidates cap, keeping the most similar candidates", async () => {
    // Similarities against [1,0,0], descending: 1.0, ~0.995, ~0.981, ~0.958, ~0.928
    const pool = [
      mem({ content: "sim4", embedding: [1, 0.4, 0] }),
      mem({ content: "sim1", embedding: [1, 0.1, 0] }),
      mem({ content: "sim0", embedding: [1, 0, 0] }),
      mem({ content: "sim3", embedding: [1, 0.3, 0] }),
      mem({ content: "sim2", embedding: [1, 0.2, 0] }),
    ];
    const { adjudicate, calls } = fakeAdjudicator(true);
    const result = await findSuperseded("new fact", [1, 0, 0], pool, adjudicate, {
      maxCandidates: 3,
    });
    expect(result.adjudicated).toBe(3);
    expect(calls.map((c) => c.oldContent)).toEqual(["sim0", "sim1", "sim2"]);
    expect(result.supersededIds.length).toBe(3);
  });

  it("honors a custom threshold", async () => {
    const far = mem({ content: "loosely related", embedding: [1, 2, 0] }); // ~0.447
    const { adjudicate } = fakeAdjudicator(false);
    const result = await findSuperseded("new fact", [1, 0, 0], [far], adjudicate, {
      threshold: 0.4,
    });
    expect(result.adjudicated).toBe(1);
  });
});
