import { randomUUID } from "crypto";
import { findSuperseded } from "./engine/contradiction";
import { buildDistillPrompt, parseDistillation } from "./engine/consolidate";
import { FORGET_FLOOR, recall, retention } from "./engine/retrieval";
import type { MemoryStore } from "./engine/store";
import type { MemoryRecord, MemoryType } from "./engine/types";
import {
  buildAdjudicationPrompt,
  buildAgentSystemPrompt,
  buildImportancePrompt,
  chat,
  embed,
  parseAdjudication,
  parseImportance,
} from "./qwen";

export interface MemoryEvent {
  kind: "recalled" | "stored" | "superseded" | "decayed" | "skipped";
  memoryId: string;
  content: string;
  type?: string;
  score?: number;
  detail?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TurnResult {
  reply: string;
  events: MemoryEvent[];
}

/** Hard token budget for memories injected into a turn's context. */
export const RECALL_BUDGET = Number(process.env.ENGRAM_RECALL_BUDGET || 800);

/** Below this LLM-scored importance, a user statement is observed but not stored. */
export const STORE_THRESHOLD = 0.3;

// Adjudicator receives (newContent, oldContent); the prompt takes (old, new).
const adjudicator = async (newContent: string, oldContent: string) => {
  const raw = await chat([
    { role: "user", content: buildAdjudicationPrompt(oldContent, newContent) },
  ]);
  return parseAdjudication(raw);
};

/**
 * Persist forgetting: any active memory whose retention has fallen below the
 * floor is marked decayed (recoverable in the store, invisible to recall).
 */
export function sweepDecay(store: MemoryStore, now: number): MemoryEvent[] {
  const events: MemoryEvent[] = [];
  for (const m of store.allActive()) {
    if (retention(m, now) < FORGET_FLOOR) {
      store.markDecayed(m.id);
      events.push({ kind: "decayed", memoryId: m.id, content: m.content, type: m.type });
    }
  }
  return events;
}

async function writeMemory(
  store: MemoryStore,
  content: string,
  type: MemoryType,
  importance: number,
  sessionId: string,
  now: number,
): Promise<MemoryEvent[]> {
  const events: MemoryEvent[] = [];
  const [embedding] = await embed([content]);
  const { supersededIds } = await findSuperseded(content, embedding, store.allActive(), adjudicator);
  const record: MemoryRecord = {
    id: randomUUID(),
    type,
    content,
    embedding,
    importance,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    sessionId,
    status: "active",
    supersededBy: null,
  };
  store.insert(record);
  for (const oldId of supersededIds) {
    const old = store.get(oldId);
    store.markSuperseded(oldId, record.id);
    events.push({
      kind: "superseded",
      memoryId: oldId,
      content: old?.content ?? "",
      type: old?.type,
      detail: `replaced by ${record.id.slice(0, 8)}`,
    });
  }
  events.push({
    kind: "stored",
    memoryId: record.id,
    content,
    type,
    score: importance,
  });
  return events;
}

/**
 * One agent turn: decay sweep -> budget-bounded recall -> Qwen reply ->
 * importance-gated memory write with contradiction adjudication.
 */
export async function runTurn(
  store: MemoryStore,
  sessionId: string,
  userMessage: string,
  history: ChatTurn[],
  now: number = Date.now(),
): Promise<TurnResult> {
  const events: MemoryEvent[] = [];
  events.push(...sweepDecay(store, now));

  const [queryEmbedding] = await embed([userMessage]);
  const recalled = recall(store.allActive(), queryEmbedding, { budget: RECALL_BUDGET, now });
  store.refreshAccess(recalled.selected.map((s) => s.record.id), now);
  for (const s of recalled.selected) {
    events.push({
      kind: "recalled",
      memoryId: s.record.id,
      content: s.record.content,
      type: s.record.type,
      score: s.score,
    });
  }

  const system = buildAgentSystemPrompt(
    recalled.selected.map((s) => ({ type: s.record.type, content: s.record.content })),
  );
  const reply = await chat([
    { role: "system", content: system },
    ...history.slice(-8),
    { role: "user", content: userMessage },
  ]);

  const importanceRaw = await chat([
    { role: "user", content: buildImportancePrompt(userMessage) },
  ]);
  const importance = parseImportance(importanceRaw);
  if (importance >= STORE_THRESHOLD) {
    events.push(...(await writeMemory(store, userMessage, "fact", importance, sessionId, now)));
  } else {
    events.push({
      kind: "skipped",
      memoryId: "",
      content: userMessage,
      score: importance,
      detail: `importance ${importance.toFixed(2)} below ${STORE_THRESHOLD}`,
    });
  }

  return { reply, events };
}

/**
 * Session-end consolidation: distill the transcript into typed durable
 * memories (preferences, facts, skills), each written through the same
 * contradiction-adjudicated path as live writes.
 */
export async function consolidateSession(
  store: MemoryStore,
  sessionId: string,
  turns: ChatTurn[],
  now: number = Date.now(),
): Promise<MemoryEvent[]> {
  if (turns.length === 0) return [];
  const raw = await chat([{ role: "user", content: buildDistillPrompt(turns) }]);
  const drafts = parseDistillation(raw);
  const events: MemoryEvent[] = [];
  for (const draft of drafts) {
    if (draft.importance < STORE_THRESHOLD) {
      events.push({
        kind: "skipped",
        memoryId: "",
        content: draft.content,
        type: draft.type,
        score: draft.importance,
        detail: `importance ${draft.importance.toFixed(2)} below ${STORE_THRESHOLD}`,
      });
      continue;
    }
    events.push(
      ...(await writeMemory(store, draft.content, draft.type, draft.importance, sessionId, now)),
    );
  }
  return events;
}
