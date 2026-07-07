// Demo-mode state for ?demo=1: server-rendered so capture tooling sees the
// full UI without racing live async calls.
//
// HONESTY DISCLOSURE: every reply, event, score, and board row below is a
// REAL output captured on 2026-07-06 from live qwen3.7-plus +
// text-embedding-v4 calls through this app's /api/chat route (see README
// "Demo mode"). Only the session labels were renamed for display
// (e2e-a -> session-a, e2e-b -> session-b). Nothing is invented.

export interface DemoTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DemoEvent {
  kind: "recalled" | "stored" | "superseded" | "decayed" | "skipped";
  memoryId: string;
  content: string;
  type?: string;
  score?: number;
  detail?: string;
}

export interface DemoBoardMemory {
  id: string;
  type: string;
  content: string;
  importance: number;
  status: string;
  supersededBy: string | null;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sessionId: string;
  retention: number;
}

export interface DemoFixture {
  sessions: Record<string, DemoTurn[]>;
  activeSession: string;
  events: DemoEvent[];
  board: {
    counts: { active: number; decayed: number; superseded: number };
    memories: DemoBoardMemory[];
  };
  input: string;
}

export const DEMO_FIXTURE: DemoFixture = {
  activeSession: "session-b",
  input: "",
  sessions: {
    "session-a": [
      { role: "user", content: "I prefer TypeScript with strict mode for all new services." },
      {
        role: "assistant",
        content:
          "Understood. I will use TypeScript with strict mode for all new services we work on.",
      },
    ],
    "session-b": [
      { role: "user", content: "Which language should I use for my new microservice?" },
      {
        role: "assistant",
        content:
          "You should use TypeScript with strict mode, since you prefer it for all new services.",
      },
      { role: "user", content: "Actually, I now prefer Python for all new services." },
      { role: "assistant", content: "Got it. We'll use Python for your new microservice." },
    ],
  },
  events: [
    {
      kind: "stored",
      memoryId: "22c95c77-8c97-4ac6-b82a-fdfa335c5f3a",
      content: "Actually, I now prefer Python for all new services.",
      type: "fact",
      score: 1,
    },
    {
      kind: "superseded",
      memoryId: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
      content: "I prefer TypeScript with strict mode for all new services.",
      type: "fact",
      detail: "replaced by 22c95c77",
    },
    {
      kind: "recalled",
      memoryId: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
      content: "I prefer TypeScript with strict mode for all new services.",
      type: "fact",
      score: 0.7353925394714651,
    },
    {
      kind: "skipped",
      memoryId: "",
      content: "Which language should I use for my new microservice?",
      score: 0,
      detail: "importance 0.00 below 0.3",
    },
    {
      kind: "recalled",
      memoryId: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
      content: "I prefer TypeScript with strict mode for all new services.",
      type: "fact",
      score: 0.7300122154606412,
    },
    {
      kind: "stored",
      memoryId: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
      content: "I prefer TypeScript with strict mode for all new services.",
      type: "fact",
      score: 1,
    },
  ],
  board: {
    counts: { active: 1, decayed: 0, superseded: 1 },
    memories: [
      {
        id: "22c95c77-8c97-4ac6-b82a-fdfa335c5f3a",
        type: "fact",
        content: "Actually, I now prefer Python for all new services.",
        importance: 1,
        status: "active",
        supersededBy: null,
        createdAt: 1783396383752,
        lastAccessedAt: 1783396383752,
        accessCount: 0,
        sessionId: "session-b",
        retention: 1,
      },
      {
        id: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
        type: "fact",
        content: "I prefer TypeScript with strict mode for all new services.",
        importance: 1,
        status: "superseded",
        supersededBy: "22c95c77-8c97-4ac6-b82a-fdfa335c5f3a",
        createdAt: 1783396241649,
        lastAccessedAt: 1783396383752,
        accessCount: 2,
        sessionId: "session-a",
        retention: 0.999,
      },
    ],
  },
};
