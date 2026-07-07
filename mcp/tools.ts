import { randomUUID } from "node:crypto";
import { recall } from "../lib/engine/retrieval";
import type { MemoryRecord, MemoryType } from "../lib/engine/types";

/**
 * Minimal store surface the MCP tools depend on. The real MemoryStore in
 * lib/store satisfies this structurally; unit tests inject an in-memory fake.
 */
export interface ToolStore {
  insert(record: MemoryRecord): void;
  allActive(): MemoryRecord[];
  /** Bump accessCount and set lastAccessedAt = now for each id. */
  refreshAccess(ids: string[], now: number): void;
  counts(): Record<string, number>;
}

export interface ToolDeps {
  store: ToolStore;
  /** Batch embedder: one vector per input text, same order. */
  embedder: (texts: string[]) => Promise<number[][]>;
  /** Injected clock (epoch ms). */
  now: () => number;
}

const DEFAULT_RECALL_BUDGET = 800;
const RECENT_LIMIT = 20;

export interface RememberInput {
  content: string;
  type?: MemoryType;
  importance?: number;
  sessionId?: string;
}

export async function engramRemember(
  deps: ToolDeps,
  input: RememberInput,
): Promise<{ id: string }> {
  const [embedding] = await deps.embedder([input.content]);
  const now = deps.now();
  const record: MemoryRecord = {
    id: randomUUID(),
    type: input.type ?? "fact",
    content: input.content,
    embedding,
    importance: input.importance ?? 0.5,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    sessionId: input.sessionId ?? "mcp",
    status: "active",
    supersededBy: null,
  };
  deps.store.insert(record);
  return { id: record.id };
}

export interface RecallInput {
  query: string;
  budget?: number;
}

export interface RecallItem {
  id: string;
  type: MemoryType;
  content: string;
  score: number;
}

/**
 * Budget-bounded recall over the active pool. Selection is a read that also
 * writes: selected memories get their access refreshed so recall itself
 * counters decay (spec S3).
 */
export async function engramRecall(deps: ToolDeps, input: RecallInput): Promise<RecallItem[]> {
  const [queryEmbedding] = await deps.embedder([input.query]);
  const now = deps.now();
  const result = recall(deps.store.allActive(), queryEmbedding, {
    budget: input.budget ?? DEFAULT_RECALL_BUDGET,
    now,
  });
  const ids = result.selected.map((s) => s.record.id);
  if (ids.length > 0) deps.store.refreshAccess(ids, now);
  return result.selected.map((s) => ({
    id: s.record.id,
    type: s.record.type,
    content: s.record.content,
    score: s.score,
  }));
}

export interface ListedMemory {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  createdAt: number;
  accessCount: number;
  sessionId: string;
}

export interface ListResult {
  counts: Record<string, number>;
  recent: ListedMemory[];
}

export async function engramList(deps: ToolDeps): Promise<ListResult> {
  const recent = [...deps.store.allActive()]
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .slice(0, RECENT_LIMIT)
    .map((r) => ({
      id: r.id,
      type: r.type,
      content: r.content,
      importance: r.importance,
      createdAt: r.createdAt,
      accessCount: r.accessCount,
      sessionId: r.sessionId,
    }));
  return { counts: deps.store.counts(), recent };
}
