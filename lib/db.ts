import { MemoryStore } from "./engine/store";

const globalForStore = globalThis as unknown as { __engramStore?: MemoryStore };

/** Process-wide store singleton (survives Next.js dev hot reloads). */
export function getStore(): MemoryStore {
  if (!globalForStore.__engramStore) {
    globalForStore.__engramStore = new MemoryStore(process.env.ENGRAM_DB || "./engram.db");
  }
  return globalForStore.__engramStore;
}
