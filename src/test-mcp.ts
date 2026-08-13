import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from "./config.js";

const testAppId = process.env.TEST_APP_ID ?? "6761691377";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: config.projectRoot,
    stderr: "pipe",
  });

  const stderr = transport.stderr;
  if (stderr) {
    stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client(
    {
      name: "app-store-connect-mcp-tester",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);

  const tools = await client.listTools();
  console.log(
    JSON.stringify(
      {
        toolCount: tools.tools.length,
        toolNames: tools.tools.map((tool) => tool.name),
      },
      null,
      2,
    ),
  );

  const listAppsResult = await client.callTool({
    name: "list_apps",
    arguments: {},
  });
  console.log(JSON.stringify({ listAppsResult }, null, 2));

  const analyticsRequestsResult = await client.callTool({
    name: "list_analytics_report_requests",
    arguments: {
      appId: testAppId,
    },
  });
  console.log(JSON.stringify({ analyticsRequestsResult }, null, 2));

  await transport.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

