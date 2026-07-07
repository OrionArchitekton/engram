# YouTube metadata for the demo video

## Title (<= 100 chars)

Engram: a memory engine for AI agents on Qwen Cloud (Global AI Hackathon, Track 1 MemoryAgent)

## Description

Engram gives AI agents memory that behaves like memory should: it decides what to
remember, what to recall, what to forget, and what to stop believing.

Built for the Qwen Cloud Global AI Hackathon (Track 1: MemoryAgent) with qwen3.7-plus
and text-embedding-v4 on Qwen Cloud, running on Alibaba Cloud.

How it works:
- Typed memories (preference, fact, skill, episode) with LLM-scored importance at
  write time.
- Budget-bounded recall: memories are ranked by similarity, retention, importance,
  and access frequency, then packed under a hard token budget (property-tested to
  never exceed it).
- Timely forgetting: Ebbinghaus-style retention decay with type-specific half-lives;
  decayed memories leave recall but stay auditable.
- Contradiction adjudication: new facts are checked against nearest neighbors;
  qwen3.7-plus decides conflict vs compatible, and old facts are superseded with an
  audit trail.
- MCP server: any MCP-capable agent can use Engram as its memory backend.

Live demo: https://engram.orionbot.online
Code (MIT): https://github.com/OrionArchitekton/engram

Chapters:
0:00 What Engram is
0:10 Storing a typed memory
0:20 Cross-session recall under a token budget
0:28 What the engine declines to store
0:37 Contradiction adjudication
0:48 Timely forgetting (decay)
0:58 Tests, MCP server, Alibaba Cloud

## Tags (comma-separated)

qwen, qwen cloud, alibaba cloud, ai agents, agent memory, memory engine, llm, rag,
mcp, model context protocol, hackathon, devpost, nextjs, typescript, text embeddings
