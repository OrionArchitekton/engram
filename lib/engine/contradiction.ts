import { cosine } from "./retrieval";
import type { MemoryRecord } from "./types";

/**
 * Decides whether a new statement contradicts an old one. Injected so the
 * engine stays pure; production wires this to an LLM call, tests use fakes.
 */
export type Adjudicator = (
  newContent: string,
  oldContent: string,
) => Promise<{ conflict: boolean }>;

/**
 * Only candidates at/above this cosine similarity are adjudicated; anything
 * less similar cannot be a contradiction worth an LLM call.
 */
export const CONFLICT_SIMILARITY_THRESHOLD = 0.55;

export interface FindSupersededOptions {
  /** similarity cutoff for adjudication; defaults to CONFLICT_SIMILARITY_THRESHOLD */
  threshold?: number;
  /** cap on adjudicator calls per new memory; defaults to 5 */
  maxCandidates?: number;
}

export interface FindSupersededResult {
  /** ids of pool memories the adjudicator judged in conflict with the new content */
  supersededIds: string[];
  /** number of adjudicator calls actually made */
  adjudicated: number;
}

/**
 * Truth maintenance for a new memory write: rank the active pool by cosine
 * similarity to the new embedding, adjudicate the top candidates at/above the
 * threshold (sequentially, capped at maxCandidates), and return the ids of
 * memories the adjudicator judged superseded by the new content.
 */
export async function findSuperseded(
  newContent: string,
  newEmbedding: number[],
  activePool: MemoryRecord[],
  adjudicate: Adjudicator,
  opts?: FindSupersededOptions,
): Promise<FindSupersededResult> {
  const threshold = opts?.threshold ?? CONFLICT_SIMILARITY_THRESHOLD;
  const maxCandidates = opts?.maxCandidates ?? 5;

  const candidates = activePool
    .map((m) => ({ record: m, similarity: cosine(newEmbedding, m.embedding) }))
    .filter((c) => c.similarity >= threshold)
    .sort(
      (a, b) =>
        b.similarity - a.similarity || a.record.id.localeCompare(b.record.id),
    )
    .slice(0, maxCandidates);

  const supersededIds: string[] = [];
  let adjudicated = 0;
  for (const c of candidates) {
    const verdict = await adjudicate(newContent, c.record.content);
    adjudicated += 1;
    if (verdict.conflict) supersededIds.push(c.record.id);
  }
  return { supersededIds, adjudicated };
}
