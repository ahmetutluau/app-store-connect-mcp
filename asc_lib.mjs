import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({ path: fileURLToPath(new URL("./.env", import.meta.url)), quiet: true });
let token;
async function getToken() {
  if (token) return token;
  const pk = await importPKCS8(await readFile(process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH, "utf8"), "ES256");
  const now = Math.floor(Date.now() / 1000);
  token = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: process.env.APP_STORE_CONNECT_KEY_ID, typ: "JWT" })
    .setIssuer(process.env.APP_STORE_CONNECT_ISSUER_ID).setAudience("appstoreconnect-v1").setIssuedAt(now).setExpirationTime(now + 19 * 60).sign(pk);
  return token;
}
export async function api(path, method = "GET", body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${method} ${path}\n${text}`);
  return text ? JSON.parse(text) : null;
}
