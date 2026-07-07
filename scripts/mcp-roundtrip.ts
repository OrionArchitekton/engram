// Real MCP round-trip proof: spawns the actual stdio server (mcp/server.ts),
// calls engram_remember then engram_recall then engram_list through the MCP
// protocol, and prints the transcript. Output is saved under docs/submission/.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp/server.ts"],
    cwd: process.cwd(),
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: "engram-roundtrip-proof", version: "0.1.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((t) => t.name).join(", "));

  const remembered = await client.callTool({
    name: "engram_remember",
    arguments: {
      content: "The operator prefers pnpm over npm for all JavaScript projects.",
      type: "preference",
      importance: 0.8,
    },
  });
  console.log("engram_remember ->", JSON.stringify(remembered.content));

  const recalled = await client.callTool({
    name: "engram_recall",
    arguments: { query: "Which package manager should I use?" },
  });
  console.log("engram_recall ->", JSON.stringify(recalled.content));

  const listed = await client.callTool({ name: "engram_list", arguments: {} });
  console.log("engram_list ->", JSON.stringify(listed.content));

  await client.close();
}

main().catch((err) => {
  console.error("ROUNDTRIP FAILED:", err);
  process.exit(1);
});
