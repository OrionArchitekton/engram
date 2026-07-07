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

const T0 = Date.parse("2026-07-06T18:00:00Z");

/**
 * Scene states for the demo video: each is a REAL captured state (see file
 * header). "decay" comes from scripts/capture-decay.ts, where the aged seed
 * memory is backdated so the real decay mechanism fires in demo time
 * (disclosed in the README).
 */
export const DEMO_SCENES: Record<string, DemoFixture> = {
  fresh: {
    activeSession: "session-a",
    input: "I prefer TypeScript with strict mode for all new services.",
    sessions: { "session-a": [] },
    events: [],
    board: { counts: { active: 0, decayed: 0, superseded: 0 }, memories: [] },
  },
  stored: {
    activeSession: "session-a",
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
    },
    events: [
      {
        kind: "stored",
        memoryId: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
        content: "I prefer TypeScript with strict mode for all new services.",
        type: "fact",
        score: 1,
      },
    ],
    board: {
      counts: { active: 1, decayed: 0, superseded: 0 },
      memories: [
        {
          id: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
          type: "fact",
          content: "I prefer TypeScript with strict mode for all new services.",
          importance: 1,
          status: "active",
          supersededBy: null,
          createdAt: T0,
          lastAccessedAt: T0,
          accessCount: 0,
          sessionId: "session-a",
          retention: 1,
        },
      ],
    },
  },
  recall: {
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
      ],
    },
    events: [
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
    ],
    board: {
      counts: { active: 1, decayed: 0, superseded: 0 },
      memories: [
        {
          id: "f82f38be-b638-4a47-a5a6-0fcb8eb5a716",
          type: "fact",
          content: "I prefer TypeScript with strict mode for all new services.",
          importance: 1,
          status: "active",
          supersededBy: null,
          createdAt: T0,
          lastAccessedAt: T0 + 120_000,
          accessCount: 1,
          sessionId: "session-a",
          retention: 1,
        },
      ],
    },
  },
  decay: {
    activeSession: "session-c",
    input: "",
    sessions: {
      "session-c": [
        { role: "user", content: "What did I say about code style?" },
        {
          role: "assistant",
          content: "You prefer TypeScript with strict mode for all new services.",
        },
      ],
    },
    events: [
      {
        kind: "decayed",
        memoryId: "0f99ae15-decay-capture",
        content: "User was debugging a flaky staging cron job in March.",
        type: "episode",
      },
      {
        kind: "recalled",
        memoryId: "bb743f36-decay-capture",
        content: "I prefer TypeScript with strict mode for all new services.",
        type: "fact",
        score: 0.646,
      },
      {
        kind: "skipped",
        memoryId: "",
        content: "What did I say about code style?",
        score: 0,
        detail: "importance 0.00 below 0.3",
      },
    ],
    board: {
      counts: { active: 1, decayed: 1, superseded: 0 },
      memories: [
        {
          id: "bb743f36-decay-capture",
          type: "fact",
          content: "I prefer TypeScript with strict mode for all new services.",
          importance: 1,
          status: "active",
          supersededBy: null,
          createdAt: T0 - 2 * 60 * 60 * 1000,
          lastAccessedAt: T0,
          accessCount: 3,
          sessionId: "session-a",
          retention: 1,
        },
        {
          id: "0f99ae15-decay-capture",
          type: "episode",
          content: "User was debugging a flaky staging cron job in March.",
          importance: 0.2,
          status: "decayed",
          supersededBy: null,
          createdAt: T0 - 120 * 24 * 60 * 60 * 1000,
          lastAccessedAt: T0 - 120 * 24 * 60 * 60 * 1000,
          accessCount: 0,
          sessionId: "session-a",
          retention: 0,
        },
      ],
    },
  },
};

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
