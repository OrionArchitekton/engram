export type MemoryType = "preference" | "fact" | "episode" | "skill";

export type MemoryStatus = "active" | "decayed" | "superseded";

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  embedding: number[];
  /** 0..1, assigned at write time by the writer (LLM-scored or caller-set). */
  importance: number;
  /** epoch ms */
  createdAt: number;
  /** epoch ms; refreshed on every recall that includes this memory. */
  lastAccessedAt: number;
  accessCount: number;
  sessionId: string;
  status: MemoryStatus;
  /** id of the memory that replaced this one, when status === "superseded". */
  supersededBy: string | null;
}

export interface ScoredMemory {
  record: MemoryRecord;
  /** blended ranking score, 0..1 */
  score: number;
  similarity: number;
  retention: number;
  /** estimated token cost of including this memory in context */
  tokens: number;
}

export interface RecallResult {
  selected: ScoredMemory[];
  /** total estimated tokens of the selected set, always <= budget */
  totalTokens: number;
  /** scored but not selected (over budget or below floor) */
  passedOver: ScoredMemory[];
}
