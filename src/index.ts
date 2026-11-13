import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AppStoreConnectClient } from "./client.js";
import { config } from "./config.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAppTools } from "./tools/apps.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerSalesTools } from "./tools/sales.js";
import { registerSubscriptionTools } from "./tools/subscriptions.js";

const client = new AppStoreConnectClient();

function buildServer(): McpServer {
  const server = new McpServer({
    name: config.appName,
    version: config.appVersion,
  });

  registerAppTools(server, client);
  registerAnalyticsTools(server, client);
  registerMetadataTools(server, client);
  registerSalesTools(server, client);
  registerSubscriptionTools(server, client);

  return server;
}

async function startStdio() {
  await buildServer().connect(new StdioServerTransport());
  console.error(`${config.appName} MCP server started (stdio).`);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function hasValidSecret(req: IncomingMessage, secret: Buffer): boolean {
  const provided = req.headers[config.http.secretHeader];
  if (typeof provided !== "string") return false;
  const providedBuffer = Buffer.from(provided);
  return providedBuffer.length === secret.length && timingSafeEqual(providedBuffer, secret);
}

async function startHttp() {
  const { host, port, path, secret } = config.http;
  if (!secret) {
    throw new Error("MCP_HTTP_SECRET is required when MCP_TRANSPORT=http.");
  }
  const secretBuffer = Buffer.from(secret);

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (url.pathname !== path) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    // Only the gateway knows the secret, so requests that bypass it are rejected.
    if (!hasValidSecret(req, secretBuffer)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    // Stateless mode: a fresh server and transport per request.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  httpServer.listen(port, host, () => {
    console.error(`${config.appName} MCP server listening on http://${host}:${port}${path}`);
  });
}

async function main() {
  if (config.http.enabled) {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
