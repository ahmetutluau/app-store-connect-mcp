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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join("."));
  throw new Error(
    `Missing required App Store Connect environment variables: ${missing.join(", ")}`,
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
} as const;
