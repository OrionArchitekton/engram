// One-off capture: seed a backdated low-importance memory, run one live turn,
// and print the decay event + board state. Output is frozen into the demo
// fixture's "decay" scene (disclosed in README: the seed memory is backdated
// to demonstrate the real decay mechanism in demo time).
import { randomUUID } from "crypto";
import { runTurn } from "../lib/agent";
import { MemoryStore } from "../lib/engine/store";
import { embed } from "../lib/qwen";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const dbPath = process.env.ENGRAM_DB || "./decay-capture.db";
  const store = new MemoryStore(dbPath);
  const now = Date.now();

  const content = "User was debugging a flaky staging cron job in March.";
  const [embedding] = await embed([content]);
  store.insert({
    id: randomUUID(),
    type: "episode",
    content,
    embedding,
    importance: 0.2,
    createdAt: now - 120 * DAY,
    lastAccessedAt: now - 120 * DAY,
    accessCount: 0,
    sessionId: "session-a",
    status: "active",
    supersededBy: null,
  });

  const preference = "I prefer TypeScript with strict mode for all new services.";
  const [prefEmbedding] = await embed([preference]);
  store.insert({
    id: randomUUID(),
    type: "fact",
    content: preference,
    embedding: prefEmbedding,
    importance: 1,
    createdAt: now - 2 * 60 * 60 * 1000,
    lastAccessedAt: now - 2 * 60 * 60 * 1000,
    accessCount: 2,
    sessionId: "session-a",
    status: "active",
    supersededBy: null,
  });

  const result = await runTurn(store, "session-c", "What did I say about code style?", []);
  console.log(JSON.stringify({ result, all: store.all() }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
