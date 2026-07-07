# Engram demo script

All scenes are server-rendered frozen replays of REAL captured engine output
(see README "Demo mode" and lib/demo-fixture.ts header).

### SHOT intro
- target: dashboard
- narration: Engram is a memory engine for AI agents, built on Qwen Cloud. It decides what to remember, what to recall, what to forget, and what to stop believing.
- action: goto url="/?demo=1&scene=fresh"
- action: wait ms=900

### SHOT store
- target: dashboard
- narration: Tell the agent something that matters. A Qwen importance score decides whether it becomes a typed memory, and you watch it land on the board.
- action: goto url="/?demo=1&scene=stored"
- action: wait ms=600
- action: highlight selector="[data-kind=stored]"

### SHOT recall
- target: dashboard
- narration: A brand new session starts empty, but Engram recalls that preference under a hard token budget, and the agent answers with it.
- action: goto url="/?demo=1&scene=recall"
- action: wait ms=600
- action: highlight selector="[data-kind=recalled]"

### SHOT skipped
- target: dashboard
- narration: Questions and small talk score low and are deliberately not stored. Every engine decision is visible, including the ones it declines to make.
- action: goto url="/?demo=1&scene=recall"
- action: wait ms=600
- action: highlight selector="[data-kind=skipped]"

### SHOT contradict
- target: dashboard
- narration: Change your mind, and qwen 3.7 plus adjudicates the conflict. The old fact is superseded with a full audit trail, never silently overwritten.
- action: goto url="/?demo=1"
- action: wait ms=600
- action: highlight selector="[data-kind=superseded]"

### SHOT decay
- target: dashboard
- narration: Memories that go unused decay on an Ebbinghaus curve and drop out of recall. Timely forgetting is built in, not bolted on.
- action: goto url="/?demo=1&scene=decay"
- action: wait ms=600
- action: highlight selector="[data-kind=decayed]"

### SHOT outro
- target: dashboard
- narration: Sixty seven unit tests, an MCP server so any agent can plug in, and the backend on Alibaba Cloud. Engram: memory that behaves like memory should.
- action: goto url="/?demo=1"
- action: wait ms=900
