import dotenv from "dotenv";
import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(moduleDir, "..");
const envPath = resolve(projectRoot, ".env");

dotenv.config({ path: envPath, quiet: true });

const envSchema = z.object({
  APP_STORE_CONNECT_ISSUER_ID: z.string().min(1),
  APP_STORE_CONNECT_KEY_ID: z.string().min(1),
  APP_STORE_CONNECT_PRIVATE_KEY_PATH: z.string().min(1),
  APP_STORE_CONNECT_VENDOR_NUMBER: z.string().min(1).optional(),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HTTP_HOST: z.string().min(1).default("127.0.0.1"),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(8000),
  MCP_HTTP_PATH: z.string().startsWith("/").default("/mcp"),
  MCP_HTTP_SECRET: z.string().min(16).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join("."));
  throw new Error(
    `Missing or invalid environment variables: ${missing.join(", ")}`,
  );
}

const privateKeyPath = resolve(parsedEnv.data.APP_STORE_CONNECT_PRIVATE_KEY_PATH);

accessSync(privateKeyPath, constants.R_OK);

export const config = {
  appName: "app-store-connect",
  appVersion: "1.0.0",
  baseUrl: "https://api.appstoreconnect.apple.com",
  issuerId: parsedEnv.data.APP_STORE_CONNECT_ISSUER_ID,
  keyId: parsedEnv.data.APP_STORE_CONNECT_KEY_ID,
  privateKeyPath,
  vendorNumber: parsedEnv.data.APP_STORE_CONNECT_VENDOR_NUMBER,
  projectRoot,
  envPath,
  http: {
    enabled: parsedEnv.data.MCP_TRANSPORT === "http",
    host: parsedEnv.data.MCP_HTTP_HOST,
    port: parsedEnv.data.MCP_HTTP_PORT,
    path: parsedEnv.data.MCP_HTTP_PATH,
    secret: parsedEnv.data.MCP_HTTP_SECRET,
    secretHeader: "x-upstream-secret",
  },
} as const;
