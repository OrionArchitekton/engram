# Engram — Spec

A memory engine for AI agents. An agent using Engram accumulates experience across
sessions, recalls what matters within a hard token budget, forgets what has gone stale,
and adjudicates contradictions instead of hoarding conflicting facts.

Track: Qwen Cloud Global AI Hackathon, Track 1 (MemoryAgent).

## Problem

Agents forget everything between sessions, or "solve" it by stuffing full chat history
into context: cost grows unboundedly, stale facts linger, and contradictory facts
coexist silently. The three unsolved parts are selection (what to recall under a budget),
forgetting (what to stop recalling), and truth maintenance (what to do when new
information conflicts with old).

## Scenarios (each a demoable vertical slice)

### S1. Cross-session recall
- Given a user tells the agent a preference in session A ("I prefer TypeScript, strict mode"),
- When the user opens a fresh session B and asks a related question,
- Then the agent's answer reflects the stored preference without the user restating it,
  and the recall event is visible on the memory board.

### S2. Budget-bounded recall
- Given more stored memories than fit in the recall budget,
- When the agent assembles context for a turn,
- Then it selects the highest-value subset whose combined token estimate is <= the hard
  budget (never over), value = blend of semantic similarity, recency, importance, and
  access frequency.

### S3. Timely forgetting
- Given a memory that is old, low-importance, and unaccessed,
- When its retention score falls below the floor,
- Then it stops being recalled (status: decayed, excluded from retrieval) but is never
  hard-deleted (auditable), and recalling a memory refreshes its retention.

### S4. Contradiction adjudication
- Given a stored fact ("user lives in San Diego") and a new statement ("I just moved to
  Denver"),
- When the new memory is written,
- Then the engine detects the conflict (similarity search + LLM adjudication), marks the
  old memory superseded with a pointer to its replacement, and subsequent recall returns
  only the current fact. Non-conflicting similar memories are NOT superseded.

### S5. Session consolidation
- Given a completed session of raw conversational turns,
- When consolidation runs,
- Then durable facts/preferences are distilled into typed memories (episodic turns ->
  semantic/preference records) so future recall is cheaper than replaying transcript.

### S6. Live memory board
- Given any chat turn,
- When the engine stores, recalls, decays, or supersedes memories,
- Then the UI shows each event with the memory content, type, and score — the engine's
  reasoning is observable, not a black box.

### S7. MCP surface
- Given an external MCP client,
- When it calls the engram tools (remember / recall / list),
- Then it operates on the same store as the web agent, making Engram an embeddable
  memory backend, not just a demo app.

## Constraints
- Qwen models on Qwen Cloud only (chat: qwen3.7-plus tier; embeddings: text-embedding-v4),
  OpenAI-compatible endpoint. temperature 0 for demo-stable output.
- API key server-side only. Public endpoint rate-limited.
- Backend deployed on Alibaba Cloud (hackathon requirement) with proof artifacts.
- Memories persist in SQLite; embeddings stored alongside content.
- All engine logic pure and unit-testable with injected clock, embedder, and adjudicator.

## Test seams (decided up front)
1. **Engine module boundary** (primary): pure functions over injected `now`, embedder,
   and adjudicator fakes — retrieval scoring, budget packing, decay, supersede graph.
2. **HTTP chat route** (integration): one live end-to-end proof against Qwen Cloud.
No other seams; UI is exercised by the demo capture.

## Acceptance criteria
- [ ] S1-S4 each covered by unit tests at seam 1 (deterministic, no network).
- [ ] S2: packer provably never exceeds budget (property-style test over random sets).
- [ ] S4: adjudicator fake proves both supersede and no-supersede paths.
- [ ] Live e2e proof: real Qwen call through the deployed chat route.
- [ ] Memory board shows stored/recalled/decayed/superseded events live.
- [ ] MCP server round-trip: remember then recall returns the same record.
