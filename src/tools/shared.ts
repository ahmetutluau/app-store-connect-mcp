import { z } from "zod";
import { AppStoreConnectApiError } from "../types.js";

export const appIdSchema = z.string().min(1).describe("App Store Connect app ID.");

export function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function asToolError(error: unknown) {
  const message =
    error instanceof AppStoreConnectApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

export function pickDefinedEntries<T extends object>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
