import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export const CHAT_MODEL = process.env.ENGRAM_CHAT_MODEL || "qwen3.7-plus";
export const EMBED_MODEL = "text-embedding-v4";
export const EMBED_DIMS = 256;

/** DashScope caps embedding batch size; keep chunks safely under it. */
const EMBED_BATCH_SIZE = 10;

let client: OpenAI | null = null;

/**
 * Lazy singleton so importing this module never requires the key;
 * only the first real API use does.
 */
export function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.QWEN_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "QWEN_CLOUD_API_KEY is not set. Export it (or run under doppler) before calling Qwen Cloud.",
    );
  }
  client = new OpenAI({ apiKey, baseURL: BASE_URL });
  return client;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const api = getClient();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const chunk = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await api.embeddings.create({
      model: EMBED_MODEL,
      input: chunk,
      dimensions: EMBED_DIMS,
      encoding_format: "float",
    });
    // The API documents order-preserving output; sort by index defensively.
    const rows = [...res.data].sort((a, b) => a.index - b.index);
    for (const row of rows) out.push(row.embedding);
  }
  return out;
}

export interface ChatOptions {
  temperature?: number;
  model?: string;
  maxTokens?: number;
}

export async function chat(
  messages: ChatCompletionMessageParam[],
  opts: ChatOptions = {},
): Promise<string> {
  const api = getClient();
  const res = await api.chat.completions.create({
    model: opts.model ?? CHAT_MODEL,
    messages,
    temperature: opts.temperature ?? 0,
    ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

export function buildAgentSystemPrompt(
  memories: { type: string; content: string }[],
): string {
  const base =
    "You are a helpful personal assistant. Answer directly and concisely, " +
    "in plain language.";
  if (memories.length === 0) {
    return (
      base +
      " You have no stored memories about this user yet. Do not claim to " +
      "remember anything about them."
    );
  }
  const lines = memories.map((m) => `- [${m.type}] ${m.content}`).join("\n");
  return (
    base +
    "\n\nMEMORIES\n" +
    "The following memories were recalled from previous sessions with this user:\n" +
    lines +
    "\n\nUse these memories naturally when they are relevant, as if you simply " +
    "know the user. Do not claim to remember anything that is not listed above, " +
    "and do not recite this list back unless asked."
  );
}

export function buildImportancePrompt(content: string): string {
  return (
    "Rate the long-term importance of remembering the following statement " +
    "about a user, on a scale from 0 to 1. 0 means trivial chit-chat not worth " +
    "remembering; 1 means a durable fact, preference, or commitment that should " +
    "shape future conversations.\n\n" +
    `Statement: ${content}\n\n` +
    "Respond with a bare number between 0 and 1 and nothing else."
  );
}

/**
 * Defensive: models wrap numbers in fences or prose. Take the first float,
 * clamp to [0, 1], and fall back to a neutral 0.5 when no number is found.
 */
export function parseImportance(raw: string): number {
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0.5;
  const value = Number.parseFloat(match[0]);
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function buildAdjudicationPrompt(a: string, b: string): string {
  return (
    "Two statements about the same user are shown below. Decide whether the " +
    "NEW statement contradicts the OLD one, such that the old statement should " +
    "no longer be treated as true. Statements that merely add detail or cover " +
    "different topics do NOT conflict.\n\n" +
    `OLD: ${a}\n` +
    `NEW: ${b}\n\n` +
    'Respond with strict JSON, exactly {"conflict": true} or {"conflict": false}, ' +
    "and nothing else."
  );
}

/**
 * Fail-safe: on any parse failure or non-boolean value, report no conflict so
 * a flaky model reply can never supersede a stored memory.
 */
export function parseAdjudication(raw: string): { conflict: boolean } {
  const match = raw.match(/\{[^{}]*\}/);
  if (!match) return { conflict: false };
  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { conflict?: unknown }).conflict === "boolean"
    ) {
      return { conflict: (parsed as { conflict: boolean }).conflict };
    }
  } catch {
    // fall through to the safe default
  }
  return { conflict: false };
}
