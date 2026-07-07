# Blog post draft (Blog Post Award entry)

Publish target: danmercede.online signal or dev.to (operator decision), link pasted
into the Devpost submission's blog field. No publication without operator approval.

---

## Building Engram in 48 hours: what a memory engine taught me about forgetting

I entered the Qwen Cloud Global AI Hackathon's MemoryAgent track with a bias: I have
spent months maintaining a typed memory system for my own AI agents (memory files
with decay, an index under a hard size budget, contradiction notes). The track brief
read like a checklist of the things that system taught me the hard way: efficient
retrieval, timely forgetting, recall within limited context windows. So I productized
the doctrine into an engine: Engram.

Three things earned their keep.

**1. The budget is the feature.** Most memory demos retrieve top-k and pray it fits.
Engram scores every active memory (embedding similarity from text-embedding-v4,
blended with retention, importance, and access frequency) and greedy-packs under a
hard token budget, with backfill so a huge top memory does not starve the context.
The packer has a property test over randomized pools: the selected set never exceeds
the budget. Writing that test first changed the design; the naive version failed it.

**2. Forgetting needs a mechanism, not a cron job.** Retention decays exponentially
from last access with type-specific half-lives (episodes die in weeks, skills live
for months), scaled by importance. Recall refreshes retention, so what gets used
stays alive. Below the floor, a memory is marked decayed but never deleted; the
audit trail is the product too.

**3. Contradictions are the hard 20 percent.** New facts are checked against nearest
neighbors and adjudicated by qwen3.7-plus at temperature 0 with strict JSON and a
fail-safe parser (a parse failure can never supersede anything). The subtle bug an
adversarial review caught: my similarity gate was tuned too high, so "I moved to
Denver" never even reached the adjudicator against "I live in San Diego" (they only
cosine at about 0.49 in 256 dims). Live probes, not intuition, set the threshold.

The meta-lesson: I ran an adversarial review pass that tried to refute 75 discrete
claims in my own README and submission against the code and live probes. It found a
swapped argument pair feeding the adjudication prompt, the mistuned gate above, and
half a dozen places where my wording was stronger than my evidence. An hour of being
refuted is worth more than a day of polishing.

Engram is MIT-licensed, ships an MCP server so any agent can adopt it as a memory
backend, and runs on Alibaba Cloud with Qwen Cloud models end to end.

Code: https://github.com/OrionArchitekton/engram
Live: https://engram.orionbot.online
