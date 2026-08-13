import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AppStoreConnectClient } from "./client.js";
import { config } from "./config.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAppTools } from "./tools/apps.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerSalesTools } from "./tools/sales.js";

const server = new McpServer({
  name: config.appName,
  version: config.appVersion,
});

const client = new AppStoreConnectClient();

registerAppTools(server, client);
registerAnalyticsTools(server, client);
registerMetadataTools(server, client);
registerSalesTools(server, client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${config.appName} MCP server started.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
