# Proof of Alibaba Cloud deployment

Engram's backend runs on Alibaba Cloud Function Compute 3.0 (Singapore,
ap-southeast-1) as a custom-container web function, with all model calls served by
Qwen Cloud (DashScope International), which is itself an Alibaba Cloud API surface.

## The deployment

- Function: `engram` (FC 3.0, custom container, 1 vCPU / 2 GB, port 3000, anonymous
  HTTP trigger), region ap-southeast-1, state Active.
- Image: `crpi-woamps056vghzrls.ap-southeast-1.personal.cr.aliyuncs.com/engram-dm/engram-web:v2`
  (Alibaba Cloud Container Registry, Personal Edition, Singapore),
  digest `sha256:f0fe911525bc04305ab4c21cb838630f84359055fe3f9be5b6c223d77a1fc6f3`,
  built from commit `4bfeca6` of this repository.
- Public URLs:
  - Judge-facing: https://engram.orionbot.online (FC custom domain, Cloudflare DNS)
  - FC system URL: https://engram-mpmnmdmubc.ap-southeast-1.fcapp.run
- Deployed with Serverless Devs (`s deploy`); function + trigger + custom domain
  declared in YAML.

## Code files demonstrating Alibaba Cloud service/API use (rules requirement)

- [lib/qwen.ts](../../lib/qwen.ts): every model call targets
  `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (Alibaba Cloud DashScope
  International) with `qwen3.7-plus` and `text-embedding-v4`.
- [Dockerfile](../../Dockerfile): the exact image the Function Compute deployment runs.

## Request-ID binding (public URL to Alibaba Cloud function)

Every response from the public URL carries an `x-fc-request-id` header issued by
Function Compute; the same IDs appear in the function's request logs in the FC
console. Captured during the deployed-route end-to-end proof
([alibaba-deployed-e2e.txt](alibaba-deployed-e2e.txt), 2026-07-09T17:36Z):

- turn 1 (store):    `1-6a4fdc07-01b90c-29927e7a530a`
- turn 2 (recall):   `1-6a4fdc27-0105a9-c89f6a71a01a`
- turn 3 (supersede): `1-6a4fdc41-0132f2-a2ddbcab8400`

That transcript shows the full memory story running against the DEPLOYED route:
cross-session recall of a stored preference, an importance-gated skip, and a
contradiction supersede with an audit pointer, plus the resulting board state.

## Console evidence

- [alibaba-fc-console.png](alibaba-fc-console.png): the `engram` function in the FC
  console (Singapore), showing the HTTP trigger, the bound custom domain, the
  custom-container runtime, and the account identity.

Note: the function stores memories in SQLite at `/tmp/engram.db` inside the instance;
FC instance recycling resets that store, which is acceptable and disclosed for a demo
deployment.
