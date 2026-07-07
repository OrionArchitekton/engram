import type { MemoryType } from "./types";

/** Types a distillation may produce. Episodes are stored verbatim elsewhere. */
const DRAFT_TYPES: readonly MemoryType[] = ["preference", "fact", "skill"];

const MAX_DRAFTS = 10;
const MAX_CONTENT_CHARS = 500;

export interface MemoryDraft {
  type: MemoryType;
  content: string;
  importance: number;
}

/**
 * Prompt asking the model to distill a session transcript into durable
 * memories as a strict JSON array. Kept in lockstep with parseDistillation:
 * same type whitelist, importance range, and item cap.
 */
export function buildDistillPrompt(turns: { role: string; content: string }[]): string {
  const transcript = turns.map((t) => `${t.role}: ${t.content}`).join("\n");
  return [
    "You are a memory consolidator for an AI agent.",
    "Extract the durable facts, preferences, and skills from the session",
    "transcript below. Ignore small talk and one-off details.",
    "",
    "Output rules:",
    '- Respond with ONLY a strict JSON array, no prose, no markdown fences.',
    '- Each item: {"type": string, "content": string, "importance": number}.',
    '- "type" must be one of: "preference", "fact", "skill".',
    '- Never use the "episode" type; raw episodes are stored verbatim elsewhere.',
    '- "content" is one self-contained sentence, at most 500 characters.',
    '- "importance" is a number from 0 to 1 (1 = essential to remember).',
    "- At most 10 items. Return [] if nothing durable was said.",
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

/**
 * Defensive parser for model output: strips fences and surrounding prose by
 * locating the first parseable JSON array, validates each item (invalid ones
 * are dropped, not fatal), clamps importance to [0, 1], truncates content to
 * 500 chars, and caps the result at 10 drafts. Never throws; returns [] when
 * nothing usable is found.
 */
export function parseDistillation(raw: string): MemoryDraft[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const parsed = extractFirstJsonArray(raw);
  if (!Array.isArray(parsed)) return [];
  const drafts: MemoryDraft[] = [];
  for (const item of parsed) {
    const draft = toDraft(item);
    if (draft) drafts.push(draft);
    if (drafts.length >= MAX_DRAFTS) break;
  }
  return drafts;
}

function toDraft(item: unknown): MemoryDraft | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const { type, content, importance } = item as Record<string, unknown>;
  if (typeof type !== "string" || !DRAFT_TYPES.includes(type as MemoryType)) return null;
  if (typeof content !== "string") return null;
  const text = content.trim().slice(0, MAX_CONTENT_CHARS);
  if (text.length === 0) return null;
  if (typeof importance !== "number" || !Number.isFinite(importance)) return null;
  return {
    type: type as MemoryType,
    content: text,
    importance: Math.min(1, Math.max(0, importance)),
  };
}

/**
 * Finds the first substring that parses as a JSON array. Scans candidate "["
 * openers left to right; for each, bracket-matches (string-aware) to the
 * closing "]" and attempts JSON.parse, so a stray "[" in prose before the
 * real array does not defeat extraction.
 */
function extractFirstJsonArray(raw: string): unknown {
  let from = 0;
  for (;;) {
    const start = raw.indexOf("[", from);
    if (start === -1) return null;
    const end = matchArrayEnd(raw, start);
    if (end !== -1) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        // malformed candidate; keep scanning past this opener
      }
    }
    from = start + 1;
  }
}

/** Index of the "]" closing the array opened at start, or -1 if unbalanced. */
function matchArrayEnd(raw: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return ch === "]" ? i : -1;
      if (depth < 0) return -1;
    }
  }
  return -1;
}
