import type { MemoryRecord, MemoryType, RecallResult, ScoredMemory } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Base half-life per memory type, in days. Effective half-life scales with importance. */
const HALF_LIFE_DAYS: Record<MemoryType, number> = {
  preference: 90,
  fact: 60,
  skill: 120,
  episode: 14,
};

/** Retention below this floor means the memory is functionally forgotten. */
export const FORGET_FLOOR = 0.05;

/** Blend weights for the ranking score. Sum to 1. */
export const WEIGHTS = {
  similarity: 0.5,
  retention: 0.2,
  importance: 0.2,
  frequency: 0.1,
};

/** ~4 chars per token; deliberately conservative and model-agnostic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Ebbinghaus-style exponential retention over time since last access.
 * Important memories decay slower: effective half-life = base * (0.5 + importance),
 * so importance 1.0 gives 1.5x the base half-life, importance 0 gives 0.5x.
 */
export function retention(record: MemoryRecord, now: number): number {
  const ageDays = Math.max(0, now - record.lastAccessedAt) / DAY_MS;
  const halfLife = HALF_LIFE_DAYS[record.type] * (0.5 + record.importance);
  return Math.pow(0.5, ageDays / halfLife);
}

export function scoreMemory(
  record: MemoryRecord,
  queryEmbedding: number[],
  now: number,
): ScoredMemory {
  const similarity = Math.max(0, cosine(queryEmbedding, record.embedding));
  const ret = retention(record, now);
  // log-scaled access frequency, saturating around 50 accesses
  const frequency = Math.min(1, Math.log1p(record.accessCount) / Math.log1p(50));
  const score =
    WEIGHTS.similarity * similarity +
    WEIGHTS.retention * ret +
    WEIGHTS.importance * record.importance +
    WEIGHTS.frequency * frequency;
  return {
    record,
    score,
    similarity,
    retention: ret,
    tokens: estimateTokens(record.content),
  };
}

export interface RecallOptions {
  /** hard token budget for the selected set */
  budget: number;
  /** injected clock (epoch ms) */
  now: number;
  /** retention floor below which memories are treated as forgotten */
  floor?: number;
}

/**
 * Budget-bounded recall: score all active memories, drop the forgotten, then
 * greedily pack by score. A memory that does not fit is passed over and the
 * packer keeps going, so smaller lower-ranked memories can backfill remaining
 * budget. The selected set never exceeds the budget.
 */
export function recall(
  pool: MemoryRecord[],
  queryEmbedding: number[],
  opts: RecallOptions,
): RecallResult {
  const floor = opts.floor ?? FORGET_FLOOR;
  const scored = pool
    .filter((m) => m.status === "active")
    .map((m) => scoreMemory(m, queryEmbedding, opts.now));

  const alive = scored.filter((s) => s.retention >= floor);
  const forgotten = scored.filter((s) => s.retention < floor);

  alive.sort(
    (a, b) => b.score - a.score || a.tokens - b.tokens || a.record.id.localeCompare(b.record.id),
  );

  const selected: ScoredMemory[] = [];
  const passedOver: ScoredMemory[] = [...forgotten];
  let totalTokens = 0;
  for (const s of alive) {
    if (totalTokens + s.tokens <= opts.budget) {
      selected.push(s);
      totalTokens += s.tokens;
    } else {
      passedOver.push(s);
    }
  }
  return { selected, totalTokens, passedOver };
}
