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
- Then it greedily selects the highest-scoring memories that fit, so the combined
  token estimate is <= the hard budget (never over); score = blend of semantic
  similarity, recency, importance, and access frequency.

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
- Then the UI shows each event with the memory content and kind, plus type and score
  where applicable — the engine's reasoning is observable, not a black box.

### S7. MCP surface
- Given an external MCP client,
- When it calls the engram tools (remember / recall / list),
- Then it operates on the same store as the web agent, making Engram an embeddable
  memory backend, not just a demo app.

### S8. Visitor isolation on the public demo
- Given two visitors using the public demo at the same time,
- When either one reads the memory board, chats, or consolidates a session,
- Then each sees, recalls, decays, and supersedes only memories in their own memory
  scope: the board lists only their memories and counts, recall never surfaces the
  other visitor's memories (in events or in the model prompt), and a contradicting
  statement never supersedes another visitor's memory.
- A memory scope is a random id minted per browser tab and sent as the session id.
  The session a/b/c tabs are chat contexts inside one scope, which is what keeps S1
  cross-session recall working for a single visitor.
- No valid session id means no memory content: a request without one, or with any
  id not shaped like a 128-bit random id (such as the shared "session-a" label every
  visitor used before), is rejected rather than served a global view. The server can
  check the shape, not the randomness; a client choosing a weak id only exposes itself.
- The MCP surface (S7) is a local, single-operator process and is not scoped: MCP
  recall and list read every scope, while MCP writes land in a scope no web visitor can
  claim. Never point MCP at the deployed database.

## Constraints
- Qwen models on Qwen Cloud only (chat: qwen3.7-plus tier; embeddings: text-embedding-v4),
  OpenAI-compatible endpoint. temperature 0 for demo-stable output.
- API key server-side only. Public endpoint rate-limited.
- Backend deployed on Alibaba Cloud (hackathon requirement) with proof artifacts:
  docs/submission/alibaba-deploy-proof.md.
- Memories persist in SQLite; embeddings stored alongside content.
- All engine logic pure and unit-testable with injected clock, embedder, and adjudicator.

## Test seams (decided up front)
1. **Engine module boundary** (primary): pure functions over injected `now`, embedder,
   and adjudicator fakes — retrieval scoring, budget packing, decay, supersede graph.
2. **HTTP chat route** (integration): one live end-to-end proof against Qwen Cloud.
3. **HTTP route handlers** (S8): board, chat, and consolidate handlers driven with an
   in-memory store and a faked model, asserting what one visitor can observe of another.
No other seams; UI is exercised by the demo capture.

## Acceptance criteria
- [x] S1-S4 each covered by unit tests at seam 1 (deterministic, no network).
- [x] S2: packer provably never exceeds budget (property-style test over random sets).
- [x] S4: adjudicator fake proves both supersede and no-supersede paths.
- [x] Live e2e proof: real Qwen call through the deployed chat route
      (docs/submission/alibaba-deployed-e2e.txt, 2026-07-09, x-fc-request-id bound).
      Recorded before S8: its pub-a/pub-b ids are now rejected, and cross-session
      recall now means two chat tabs sharing one scope id.
- [x] Memory board shows stored/recalled/decayed/superseded events live.
- [x] MCP server round-trip: remember then recall returns the same record
      (real stdio protocol run: docs/submission/mcp-roundtrip.txt).
- [ ] S8: a board read without a valid session id is rejected (400) with no memory content.
- [ ] S8: one visitor's board, counts, recall events, model prompt, decay events, and
      supersede decisions never include another visitor's memories (negative control),
      while the visitor's own memories still appear (positive control).
- [ ] S8: the deployed demo rejects an unscoped board read and isolates two live sessions.
