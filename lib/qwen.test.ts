import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import {
  CHAT_MODEL,
  EMBED_DIMS,
  EMBED_MODEL,
  buildAdjudicationPrompt,
  buildAgentSystemPrompt,
  buildImportancePrompt,
  getClient,
  parseAdjudication,
  parseImportance,
} from "./qwen";

describe("constants", () => {
  it("pins the embedding model and dimensions", () => {
    expect(EMBED_MODEL).toBe("text-embedding-v4");
    expect(EMBED_DIMS).toBe(256);
  });
  it("has a non-empty chat model", () => {
    expect(typeof CHAT_MODEL).toBe("string");
    expect(CHAT_MODEL.length).toBeGreaterThan(0);
  });
});

describe("getClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Order matters: the missing-key case must run before the singleton is
  // created, because a successful getClient() caches the instance.
  it("throws a clear error naming QWEN_CLOUD_API_KEY when unset", () => {
    vi.stubEnv("QWEN_CLOUD_API_KEY", "");
    expect(() => getClient()).toThrowError(/QWEN_CLOUD_API_KEY/);
  });

  it("returns a lazy singleton once the key is present", () => {
    vi.stubEnv("QWEN_CLOUD_API_KEY", "test-key-not-real");
    const a = getClient();
    const b = getClient();
    expect(a).toBeInstanceOf(OpenAI);
    expect(b).toBe(a);
  });
});

describe("buildAgentSystemPrompt", () => {
  it("weaves memories under a MEMORIES heading with their types", () => {
    const prompt = buildAgentSystemPrompt([
      { type: "preference", content: "prefers TypeScript strict mode" },
      { type: "fact", content: "lives in San Diego" },
    ]);
    expect(prompt).toContain("MEMORIES");
    expect(prompt).toContain("prefers TypeScript strict mode");
    expect(prompt).toContain("lives in San Diego");
    expect(prompt).toContain("preference");
    expect(prompt).toContain("fact");
  });

  it("instructs the model not to claim memories that are not listed", () => {
    const prompt = buildAgentSystemPrompt([{ type: "fact", content: "x" }]);
    expect(prompt.toLowerCase()).toContain("do not claim");
  });

  it("omits the MEMORIES section when there are no memories", () => {
    const prompt = buildAgentSystemPrompt([]);
    expect(prompt).not.toContain("MEMORIES");
    expect(prompt.length).toBeGreaterThan(0);
  });
});

describe("buildImportancePrompt", () => {
  it("contains the content being scored and the 0..1 contract", () => {
    const prompt = buildImportancePrompt("user adopted a cat named Mochi");
    expect(prompt).toContain("user adopted a cat named Mochi");
    expect(prompt).toContain("0");
    expect(prompt).toContain("1");
  });
});

describe("parseImportance", () => {
  it("parses a clean bare number", () => {
    expect(parseImportance("0.7")).toBeCloseTo(0.7);
  });
  it("parses a fenced number", () => {
    expect(parseImportance("```\n0.35\n```")).toBeCloseTo(0.35);
  });
  it("parses a prose-wrapped number", () => {
    expect(parseImportance("I would rate this 0.8 out of 1.")).toBeCloseTo(0.8);
  });
  it("clamps values above 1 and below 0", () => {
    expect(parseImportance("1.5")).toBe(1);
    expect(parseImportance("-0.3")).toBe(0);
  });
  it("defaults to 0.5 on garbage", () => {
    expect(parseImportance("no number here")).toBe(0.5);
    expect(parseImportance("")).toBe(0.5);
  });
});

describe("buildAdjudicationPrompt", () => {
  it("contains both statements and the strict JSON contract", () => {
    const prompt = buildAdjudicationPrompt("lives in San Diego", "moved to Denver");
    expect(prompt).toContain("lives in San Diego");
    expect(prompt).toContain("moved to Denver");
    expect(prompt).toContain('"conflict"');
  });
});

describe("parseAdjudication", () => {
  it("parses clean strict JSON, both ways", () => {
    expect(parseAdjudication('{"conflict": true}')).toEqual({ conflict: true });
    expect(parseAdjudication('{"conflict": false}')).toEqual({ conflict: false });
  });
  it("parses fenced JSON", () => {
    expect(parseAdjudication('```json\n{"conflict": true}\n```')).toEqual({
      conflict: true,
    });
  });
  it("parses prose-wrapped JSON", () => {
    expect(
      parseAdjudication('Sure. The answer is {"conflict": true} based on the move.'),
    ).toEqual({ conflict: true });
  });
  it("fails safe to no-conflict on garbage (never supersede on parser failure)", () => {
    expect(parseAdjudication("I cannot decide")).toEqual({ conflict: false });
    expect(parseAdjudication("")).toEqual({ conflict: false });
    expect(parseAdjudication('{"conflict": "maybe"}')).toEqual({ conflict: false });
    expect(parseAdjudication("{broken json")).toEqual({ conflict: false });
  });
});
