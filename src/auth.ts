import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import { config } from "./config.js";

const TEN_MINUTES_IN_SECONDS = 10 * 60;
type ImportedPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;

export class JwtProvider {
  #privateKey?: ImportedPrivateKey;
  #cachedToken?: {
    token: string;
    expiresAt: number;
  };

  async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (this.#cachedToken && this.#cachedToken.expiresAt - now > 30) {
      return this.#cachedToken.token;
    }

    if (!this.#privateKey) {
      const privateKeyContent = await readFile(config.privateKeyPath, "utf8");
      this.#privateKey = await importPKCS8(privateKeyContent, "ES256");
    }

    const expiresAt = now + TEN_MINUTES_IN_SECONDS;

    const token = await new SignJWT({})
      .setProtectedHeader({
        alg: "ES256",
        kid: config.keyId,
        typ: "JWT",
      })
      .setIssuer(config.issuerId)
      .setAudience("appstoreconnect-v1")
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(this.#privateKey);

    this.#cachedToken = { token, expiresAt };

    return token;
  }
}
