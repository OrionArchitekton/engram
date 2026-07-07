import { describe, expect, it } from "vitest";
import { buildDistillPrompt, parseDistillation } from "./consolidate";
import type { MemoryDraft } from "./consolidate";

const TURNS = [
  { role: "user", content: "I prefer TypeScript with strict mode on." },
  { role: "assistant", content: "Noted. I will use strict TypeScript." },
  { role: "user", content: "Also, I live in San Diego." },
];

describe("buildDistillPrompt", () => {
  it("includes every turn's role and content", () => {
    const prompt = buildDistillPrompt(TURNS);
    for (const t of TURNS) {
      expect(prompt).toContain(t.role);
      expect(prompt).toContain(t.content);
    }
  });

  it("pins the output contract: JSON array, allowed types, importance range, cap", () => {
    const prompt = buildDistillPrompt(TURNS);
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("preference");
    expect(prompt).toContain("fact");
    expect(prompt).toContain("skill");
    expect(prompt).toContain("10");
    expect(prompt).toContain("importance");
  });

  it("forbids the episode type (episodes are stored verbatim elsewhere)", () => {
    const prompt = buildDistillPrompt(TURNS);
    expect(prompt.toLowerCase()).toContain("episode");
  });
});

describe("parseDistillation", () => {
  const draft = (over: Partial<MemoryDraft> = {}): MemoryDraft => ({
    type: "fact",
    content: "user lives in San Diego",
    importance: 0.8,
    ...over,
  });

  it("parses a clean JSON array", () => {
    const raw = JSON.stringify([draft(), draft({ type: "preference", content: "strict mode" })]);
    const out = parseDistillation(raw);
    expect(out).toEqual([
      { type: "fact", content: "user lives in San Diego", importance: 0.8 },
      { type: "preference", content: "strict mode", importance: 0.8 },
    ]);
  });

  it("strips a fenced json block", () => {
    const raw = "```json\n" + JSON.stringify([draft()]) + "\n```";
    expect(parseDistillation(raw)).toEqual([draft()]);
  });

  it("finds the array embedded in leading/trailing prose", () => {
    const raw =
      "Here are the extracted memories:\n" +
      JSON.stringify([draft()]) +
      "\nLet me know if you need anything else!";
    expect(parseDistillation(raw)).toEqual([draft()]);
  });

  it("drops items with an invalid or disallowed type", () => {
    const raw = JSON.stringify([
      draft(),
      { type: "episode", content: "we chatted", importance: 0.5 },
      { type: "opinion", content: "nope", importance: 0.5 },
      { content: "typeless", importance: 0.5 },
    ]);
    expect(parseDistillation(raw)).toEqual([draft()]);
  });

  it("drops items whose content is missing, empty, or not a string", () => {
    const raw = JSON.stringify([
      { type: "fact", content: "", importance: 0.5 },
      { type: "fact", content: 42, importance: 0.5 },
      { type: "fact", importance: 0.5 },
      draft(),
    ]);
    expect(parseDistillation(raw)).toEqual([draft()]);
  });

  it("clamps importance to [0, 1] and defaults non-numeric importance out", () => {
    const raw = JSON.stringify([
      draft({ importance: 5 }),
      draft({ content: "b", importance: -3 }),
    ]);
    const out = parseDistillation(raw);
    expect(out[0].importance).toBe(1);
    expect(out[1].importance).toBe(0);
  });

  it("drops items with a non-numeric importance", () => {
    const raw = JSON.stringify([
      { type: "fact", content: "no score", importance: "high" },
      { type: "fact", content: "nan score", importance: NaN },
      draft(),
    ]);
    expect(parseDistillation(raw)).toEqual([draft()]);
  });

  it("truncates content to 500 chars", () => {
    const raw = JSON.stringify([draft({ content: "x".repeat(900) })]);
    const out = parseDistillation(raw);
    expect(out[0].content.length).toBe(500);
  });

  it("caps output at 10 drafts", () => {
    const items = Array.from({ length: 15 }, (_, i) => draft({ content: `fact ${i}` }));
    const out = parseDistillation(JSON.stringify(items));
    expect(out.length).toBe(10);
    expect(out[0].content).toBe("fact 0");
  });

  it("returns [] on garbage input, never throws", () => {
    expect(parseDistillation("")).toEqual([]);
    expect(parseDistillation("no json here at all")).toEqual([]);
    expect(parseDistillation("[1, 2, {broken")).toEqual([]);
    expect(parseDistillation('{"type":"fact"}')).toEqual([]);
    expect(parseDistillation("[]")).toEqual([]);
    expect(parseDistillation('["strings", "only"]')).toEqual([]);
    expect(parseDistillation("null")).toEqual([]);
  });
});
