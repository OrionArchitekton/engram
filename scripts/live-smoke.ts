/**
 * Live smoke test against Qwen Cloud. NOT part of the vitest suite.
 * Run: doppler run --project qwen_hackathon --config prd -- npx tsx scripts/live-smoke.ts
 * Prints PASS/FAIL lines only; never prints the API key.
 */
import { cosine } from "../lib/engine/retrieval";
import { EMBED_DIMS, chat, embed } from "../lib/qwen";

let failed = false;

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    console.log(`PASS ${name} (${detail})`);
  } else {
    failed = true;
    console.log(`FAIL ${name} (${detail})`);
  }
}

async function main(): Promise<void> {
  const [tsPref, tsStrict, pelican] = await embed([
    "I prefer writing TypeScript with strict mode enabled",
    "TypeScript strict compiler settings are my favorite way to code",
    "The pelican ate a sandwich on the beach at sunset",
  ]);

  check(
    "embed dims",
    tsPref.length === EMBED_DIMS &&
      tsStrict.length === EMBED_DIMS &&
      pelican.length === EMBED_DIMS,
    `got ${tsPref.length}/${tsStrict.length}/${pelican.length}, want ${EMBED_DIMS}`,
  );

  const related = cosine(tsPref, tsStrict);
  const unrelated = cosine(tsPref, pelican);
  check(
    "embedding similarity ordering",
    related > unrelated,
    `related=${related.toFixed(4)} unrelated=${unrelated.toFixed(4)}`,
  );

  const reply = await chat([
    { role: "user", content: "Reply with the single word: pong" },
  ]);
  check("chat reply non-empty", reply.trim().length > 0, `len=${reply.trim().length}`);
}

main()
  .then(() => {
    process.exit(failed ? 1 : 0);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL live smoke threw (${msg.slice(0, 200)})`);
    process.exit(1);
  });
