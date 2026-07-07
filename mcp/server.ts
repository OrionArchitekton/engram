import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getStore } from "../lib/db";
import { embed } from "../lib/qwen";
import {
  engramList,
  engramRecall,
  engramRemember,
  type RecallInput,
  type RememberInput,
  type ToolDeps,
} from "./tools";

/**
 * zod is the MCP SDK's dependency, not ours, and package.json must not grow
 * beyond the SDK itself. A bare "zod" import would be a phantom dependency
 * under pnpm's isolated node_modules, so resolve it from the SDK's context.
 */
const sdkRequire = createRequire(
  createRequire(import.meta.url).resolve("@modelcontextprotocol/sdk/server/mcp.js"),
);
const { z } = sdkRequire("zod");

// getStore() opens SQLite at ENGRAM_DB || ./engram.db, the same store the web agent uses.
const deps: ToolDeps = {
  store: getStore(),
  embedder: embed,
  now: () => Date.now(),
};

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: "engram", version: "0.1.0" });

server.registerTool(
  "engram_remember",
  {
    description:
      "Store one memory in the engram store. Returns the id of the new memory record.",
    inputSchema: {
      content: z.string().min(1).describe("The memory content to store"),
      type: z
        .enum(["preference", "fact", "episode", "skill"])
        .optional()
        .describe("Memory type; defaults to fact"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Write-time importance in 0..1; defaults to 0.5"),
      sessionId: z.string().optional().describe("Originating session id; defaults to mcp"),
    },
  },
  async (args: RememberInput) => asText(await engramRemember(deps, args)),
);

server.registerTool(
  "engram_recall",
  {
    description:
      "Budget-bounded semantic recall over active memories. Selected memories get " +
      "their access refreshed, which counters decay.",
    inputSchema: {
      query: z.string().min(1).describe("What to recall"),
      budget: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard token budget for the selected set; defaults to 800"),
    },
  },
  async (args: RecallInput) => asText(await engramRecall(deps, args)),
);

server.registerTool(
  "engram_list",
  {
    description: "Memory counts by status plus the 20 most recent active memories.",
    inputSchema: {},
  },
  async () => asText(await engramList(deps)),
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol; operational logs go to stderr
  console.error("engram mcp server ready on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
