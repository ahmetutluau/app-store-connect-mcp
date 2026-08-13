import { gunzipSync } from "node:zlib";
import { JwtProvider } from "./auth.js";
import { config } from "./config.js";
import {
  type AppleErrorDocument,
  AppStoreConnectApiError,
  type JsonApiListDocument,
} from "./types.js";

type PrimitiveQueryValue = string | number | boolean;
type QueryValue =
  | PrimitiveQueryValue
  | PrimitiveQueryValue[]
  | readonly PrimitiveQueryValue[]
  | undefined
  | null;
type QueryParams = Record<string, QueryValue>;

interface RequestOptions {
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
}

interface DownloadedSegment {
  content: string;
  contentEncoding: string | null;
  contentType: string | null;
  byteLength: number;
}

export interface DownloadedAuthorizedFile {
  content: string;
  contentEncoding: string | null;
  contentType: string | null;
  byteLength: number;
}

function buildUrl(pathOrUrl: string, query?: QueryParams): URL {
  const url = pathOrUrl.startsWith("http")
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl, config.baseUrl);

  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        url.searchParams.set(key, value.map(String).join(","));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

function formatAppleError(status: number, rawBody: string): AppStoreConnectApiError {
  let parsed: AppleErrorDocument | undefined;

  try {
    parsed = JSON.parse(rawBody) as AppleErrorDocument;
  } catch {
    parsed = undefined;
  }

  const parts =
    parsed?.errors?.map((error) =>
      [
        error.status,
        error.code,
        error.title,
        error.detail,
        error.source?.parameter ? `parameter=${error.source.parameter}` : undefined,
        error.source?.pointer ? `pointer=${error.source.pointer}` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
    ) ?? [];

  return new AppStoreConnectApiError({
    status,
    message:
      parts.length > 0
        ? `App Store Connect API error (${status}): ${parts.join("\n")}`
        : `App Store Connect API error (${status})`,
    errors: parsed?.errors,
    rawBody,
  });
}

export class AppStoreConnectClient {
  readonly #jwtProvider = new JwtProvider();

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, options);
  }

  async post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("POST", path, options);
  }

  async patch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("PATCH", path, options);
  }

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, options);
  }

  async listAll<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
    const firstPage = await this.get<JsonApiListDocument<T>>(path, options);
    const items = [...firstPage.data];
    let nextUrl = firstPage.links?.next;

    while (nextUrl) {
      const nextPage = await this.get<JsonApiListDocument<T>>(nextUrl);
      items.push(...nextPage.data);
      nextUrl = nextPage.links?.next;
    }

    return items;
  }

  async downloadSegment(url: string): Promise<DownloadedSegment> {
    const response = await fetch(url, {
      headers: {
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Analytics segment download failed (${response.status}): ${body}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentEncoding = response.headers.get("content-encoding");
    const contentType = response.headers.get("content-type");
    const isCompressed =
      contentEncoding?.toLowerCase().includes("gzip") || url.toLowerCase().endsWith(".gz");

    const content = isCompressed ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");

    return {
      content,
      contentEncoding,
      contentType,
      byteLength: buffer.byteLength,
    };
  }

  async downloadAuthorizedFile(
    path: string,
    options: RequestOptions = {},
  ): Promise<DownloadedAuthorizedFile> {
    const token = await this.#jwtProvider.getToken();
    const url = buildUrl(path, options.query);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "*/*",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw formatAppleError(response.status, body);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentEncoding = response.headers.get("content-encoding");
    const contentType = response.headers.get("content-type");
    const isCompressed =
      contentEncoding?.toLowerCase().includes("gzip") ||
      contentType?.toLowerCase().includes("gzip") ||
      url.pathname.toLowerCase().endsWith(".gz");

    const content = isCompressed ? gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");

    return {
      content,
      contentEncoding,
      contentType,
      byteLength: buffer.byteLength,
    };
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options: RequestOptions,
  ): Promise<T> {
    const token = await this.#jwtProvider.getToken();
    const url = buildUrl(path, options.query);
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw formatAppleError(response.status, responseText);
    }

    if (!responseText) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }
}
