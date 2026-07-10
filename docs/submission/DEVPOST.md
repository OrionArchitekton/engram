# Devpost submission: engram

**Track: 1 (MemoryAgent)**

## Project name

engram

## Tagline (elevator pitch)

A memory engine for AI agents: typed memories, budget-bounded recall, timely
forgetting, and contradiction adjudication. Built on Qwen Cloud.

## Inspiration

Every agent demo has the same embarrassing moment: you open a new session and it has
no idea who you are. The common fixes are worse than the disease. Stuffing the full
chat history into context grows cost without bound; naive RAG over transcripts recalls
stale and contradictory facts with equal confidence. The MemoryAgent track brief names
the three hard parts directly: efficient storage and retrieval, timely forgetting, and
recall within limited context windows. I have spent months building exactly this
discipline into my own agent tooling (typed memory files, decay, contradiction
registers), so I productized that operational doctrine into an engine.

## What it does

Engram is a memory engine, not a chat log. For every turn:

- It scores all active memories against the query (embedding similarity via
  text-embedding-v4 at 256 dims, blended with retention, importance, and access
  frequency) and packs the best set under a HARD token budget: the packer is
  property-tested to never exceed it. Small relevant memories backfill when a large
  one does not fit.
- It forgets on schedule. Retention decays exponentially from last access
  (Ebbinghaus-style), scaled by type-specific half-lives and importance. Below the
  floor, a memory is marked decayed: out of recall, never deleted, fully auditable.
  Every recall refreshes retention, so what you use stays alive.
- It maintains truth. Each write is checked against the nearest active memories; a
  qwen3.7-plus adjudicator (temperature 0, strict JSON, fail-safe parsing) decides
  conflict vs compatible. Conflicting old memories are superseded with a pointer to
  their replacement: "I moved to Denver" retires "lives in San Diego" instead of
  coexisting with it.
- It decides what deserves storing at all: an LLM importance score gates writes, and
  the UI shows the skip decisions too.
- A live memory board makes every engine decision observable: recalled, stored, not
  stored, superseded, decayed, with scores.
- The same engine is exposed as an MCP server (engram_remember / engram_recall /
  engram_list), so any MCP-capable agent can adopt Engram as a memory backend.

## How we built it

TypeScript end to end. The engine core (scoring, budget packer, decay, contradiction,
consolidation parsing) is pure and dependency-injected: 67 unit tests run in
milliseconds with zero network. Qwen Cloud powers everything model-side through the
OpenAI-compatible endpoint: qwen3.7-plus for replies, importance scoring,
contradiction adjudication, and session distillation; text-embedding-v4 for
embeddings. Persistence is SQLite; the app is Next.js 15; deployment is a Docker
container on Alibaba Cloud Function Compute 3.0 (Singapore). All model calls run at
temperature 0, and every LLM output that feeds an engine decision passes a defensive
parser that degrades safely (a parse failure can never supersede a memory).

## Challenges we ran into

- Contradiction detection that does not over-fire: similar-but-compatible memories
  ("prefers TypeScript" vs "prefers pnpm") must NOT supersede each other. The fix was
  a two-stage design: a similarity threshold gate keeps unrelated memories away from
  the adjudicator entirely, and the adjudicator prompt distinguishes conflict from
  overlap. Both paths are pinned by tests.
- Budget packing is a knapsack in disguise: a pure greedy-by-score packer wastes
  budget when the top memory is huge. Greedy-with-backfill keeps the guarantee
  (never over budget) while filling remaining room with smaller relevant memories.
- Fail-safe LLM plumbing: model outputs feed state-changing decisions, so every
  parser defaults to the harmless action on garbage (importance 0.5, no conflict,
  no drafts).

## Accomplishments we're proud of

- Forgetting and truth maintenance actually implemented and observable, not roadmap
  slideware: you can watch a memory decay and watch a contradiction retire an old
  fact in the UI, live.
- A hard recall budget with a property test over randomized memory pools.
- The engine proven live end to end: cross-session recall and a contradiction
  supersede both demonstrated against real Qwen Cloud calls through the DEPLOYED
  public route on Alibaba Cloud Function Compute, with x-fc-request-id bindings
  (docs/submission/alibaba-deploy-proof.md).

## What we learned

Memory quality is a selection problem before it is a storage problem. The interesting
engineering is in what NOT to recall (budget), what NOT to keep (decay), and what NOT
to believe anymore (adjudication). Qwen's OpenAI-compatible surface made the model
layer almost frictionless; the discipline lives in the engine around it.

## What's next for engram

Semantic memory clustering (merge near-duplicates at consolidation time), per-user
namespaces, a retrieval-quality benchmark harness (recall@budget vs full-history
baseline), and packaging the MCP server for one-line install.

## Built with

typescript, next.js, react, qwen3.7-plus, text-embedding-v4, qwen-cloud, dashscope,
sqlite, better-sqlite3, model-context-protocol, docker, alibaba-cloud-function-compute,
tailwindcss, vitest

## Links

- Live demo: https://engram.orionbot.online
- Code repository: https://github.com/OrionArchitekton/engram
- Alibaba Cloud proof: https://github.com/OrionArchitekton/engram/blob/main/docs/submission/alibaba-deploy-proof.md (code file: lib/qwen.ts targets dashscope-intl.aliyuncs.com)
- Demo video: https://youtu.be/MWBz4cQEByc

## Screenshots

See docs/screenshots/ + docs/submission/SCREENSHOT_CAPTIONS.md (upload order).
