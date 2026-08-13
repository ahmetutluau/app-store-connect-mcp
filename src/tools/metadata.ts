import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppStoreConnectClient } from "../client.js";
import type {
  AppInfoLocalizationAttributes,
  AppStoreVersionLocalizationAttributes,
  JsonApiDocument,
  JsonApiResource,
} from "../types.js";
import { asToolError, jsonContent, pickDefinedEntries } from "./shared.js";

const MAX_APP_NAME_LENGTH = 30;
const MAX_SUBTITLE_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_KEYWORDS_LENGTH = 100;
const MAX_PROMOTIONAL_TEXT_LENGTH = 170;
const MAX_URL_LENGTH = 255;
const MAX_WHATS_NEW_LENGTH = 4000;

const updateValueSchema = z
  .string()
  .trim()
  .min(1, "Empty strings are not allowed because they could clear existing metadata.")
  .optional();

const updateInputSchema = {
  appStoreVersionLocalizationId: z.string().min(1),
  dryRun: z.boolean().optional().default(true),
  confirm: z.boolean().optional(),
  description: updateValueSchema.refine(
    (value) => value === undefined || value.length <= MAX_DESCRIPTION_LENGTH,
    `description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
  ),
  keywords: updateValueSchema.refine(
    (value) => value === undefined || value.length <= MAX_KEYWORDS_LENGTH,
    `keywords must be at most ${MAX_KEYWORDS_LENGTH} characters.`,
  ),
  promotionalText: updateValueSchema.refine(
    (value) => value === undefined || value.length <= MAX_PROMOTIONAL_TEXT_LENGTH,
    `promotionalText must be at most ${MAX_PROMOTIONAL_TEXT_LENGTH} characters.`,
  ),
  marketingUrl: z
    .string()
    .trim()
    .url()
    .max(MAX_URL_LENGTH, `marketingUrl must be at most ${MAX_URL_LENGTH} characters.`)
    .optional(),
  supportUrl: z
    .string()
    .trim()
    .url()
    .max(MAX_URL_LENGTH, `supportUrl must be at most ${MAX_URL_LENGTH} characters.`)
    .optional(),
  whatsNew: updateValueSchema.refine(
    (value) => value === undefined || value.length <= MAX_WHATS_NEW_LENGTH,
    `whatsNew must be at most ${MAX_WHATS_NEW_LENGTH} characters.`,
  ),
};

function buildPatchAttributes(
  input: Partial<AppStoreVersionLocalizationAttributes>,
): Partial<AppStoreVersionLocalizationAttributes> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function buildAppInfoPatchAttributes(
  input: Partial<AppInfoLocalizationAttributes>,
): Partial<AppInfoLocalizationAttributes> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  );
}

export function registerMetadataTools(server: McpServer, client: AppStoreConnectClient) {
  server.registerTool(
    "update_app_info_localization",
    {
      title: "Update App Info Localization",
      description:
        "Prepares or applies a safe PATCH update for app-level title, subtitle, and privacy policy metadata. dryRun defaults to true.",
      inputSchema: {
        appInfoLocalizationId: z.string().min(1),
        dryRun: z.boolean().optional().default(true),
        confirm: z.boolean().optional(),
        name: updateValueSchema.refine(
          (value) => value === undefined || value.length <= MAX_APP_NAME_LENGTH,
          `name must be at most ${MAX_APP_NAME_LENGTH} characters.`,
        ),
        subtitle: updateValueSchema.refine(
          (value) => value === undefined || value.length <= MAX_SUBTITLE_LENGTH,
          `subtitle must be at most ${MAX_SUBTITLE_LENGTH} characters.`,
        ),
        privacyPolicyUrl: z
          .string()
          .trim()
          .url()
          .max(MAX_URL_LENGTH, `privacyPolicyUrl must be at most ${MAX_URL_LENGTH} characters.`)
          .optional(),
      },
    },
    async ({
      appInfoLocalizationId,
      dryRun = true,
      confirm = false,
      name,
      subtitle,
      privacyPolicyUrl,
    }) => {
      try {
        const updates = buildAppInfoPatchAttributes({
          name,
          subtitle,
          privacyPolicyUrl,
        });

        if (Object.keys(updates).length === 0) {
          return jsonContent({
            updated: false,
            dryRun,
            reason: "No non-empty fields were provided to update.",
          });
        }

        const current = await client.get<
          JsonApiDocument<JsonApiResource<AppInfoLocalizationAttributes>>
        >(`/v1/appInfoLocalizations/${encodeURIComponent(appInfoLocalizationId)}`, {
          query: {
            "fields[appInfoLocalizations]": [
              "locale",
              "name",
              "subtitle",
              "privacyPolicyUrl",
              "privacyChoicesUrl",
              "privacyPolicyText",
            ],
          },
        });

        const currentAttributes = current.data.attributes ?? {};
        const comparison = Object.fromEntries(
          Object.entries(updates).map(([key, nextValue]) => [
            key,
            {
              current: currentAttributes[key as keyof AppInfoLocalizationAttributes] ?? null,
              proposed: nextValue,
              changed:
                currentAttributes[key as keyof AppInfoLocalizationAttributes] !== nextValue,
            },
          ]),
        );

        if (dryRun) {
          return jsonContent({
            updated: false,
            dryRun: true,
            localizationId: current.data.id,
            locale: currentAttributes.locale ?? null,
            comparison,
          });
        }

        if (!confirm) {
          return jsonContent({
            updated: false,
            dryRun: false,
            reason: "confirm=true is required when dryRun=false.",
            comparison,
          });
        }

        const patched = await client.patch<
          JsonApiDocument<JsonApiResource<AppInfoLocalizationAttributes>>
        >(`/v1/appInfoLocalizations/${encodeURIComponent(appInfoLocalizationId)}`, {
          body: {
            data: {
              id: appInfoLocalizationId,
              type: "appInfoLocalizations",
              attributes: updates,
            },
          },
        });

        return jsonContent({
          updated: true,
          dryRun: false,
          localization: {
            id: patched.data.id,
            type: patched.data.type,
            ...pickDefinedEntries(patched.data.attributes ?? {}),
          },
          comparison,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "update_app_store_version_localization",
    {
      title: "Update App Store Version Localization",
      description:
        "Prepares or applies a safe PATCH update for version-localized App Store metadata. dryRun defaults to true.",
      inputSchema: updateInputSchema,
    },
    async ({
      appStoreVersionLocalizationId,
      dryRun = true,
      confirm = false,
      description,
      keywords,
      promotionalText,
      marketingUrl,
      supportUrl,
      whatsNew,
    }) => {
      try {
        const updates = buildPatchAttributes({
          description,
          keywords,
          promotionalText,
          marketingUrl,
          supportUrl,
          whatsNew,
        });

        if (Object.keys(updates).length === 0) {
          return jsonContent({
            updated: false,
            dryRun,
            reason: "No non-empty fields were provided to update.",
          });
        }

        const current = await client.get<
          JsonApiDocument<JsonApiResource<AppStoreVersionLocalizationAttributes>>
        >(`/v1/appStoreVersionLocalizations/${encodeURIComponent(appStoreVersionLocalizationId)}`, {
          query: {
            "fields[appStoreVersionLocalizations]": [
              "locale",
              "description",
              "keywords",
              "promotionalText",
              "marketingUrl",
              "supportUrl",
              "whatsNew",
            ],
          },
        });

        const currentAttributes = current.data.attributes ?? {};
        const comparison = Object.fromEntries(
          Object.entries(updates).map(([key, nextValue]) => [
            key,
            {
              current: currentAttributes[key as keyof AppStoreVersionLocalizationAttributes] ?? null,
              proposed: nextValue,
              changed:
                currentAttributes[key as keyof AppStoreVersionLocalizationAttributes] !== nextValue,
            },
          ]),
        );

        if (dryRun) {
          return jsonContent({
            updated: false,
            dryRun: true,
            localizationId: current.data.id,
            locale: currentAttributes.locale ?? null,
            comparison,
          });
        }

        if (!confirm) {
          return jsonContent({
            updated: false,
            dryRun: false,
            reason: "confirm=true is required when dryRun=false.",
            comparison,
          });
        }

        const patched = await client.patch<
          JsonApiDocument<JsonApiResource<AppStoreVersionLocalizationAttributes>>
        >(`/v1/appStoreVersionLocalizations/${encodeURIComponent(appStoreVersionLocalizationId)}`, {
          body: {
            data: {
              id: appStoreVersionLocalizationId,
              type: "appStoreVersionLocalizations",
              attributes: updates,
            },
          },
        });

        return jsonContent({
          updated: true,
          dryRun: false,
          localization: {
            id: patched.data.id,
            type: patched.data.type,
            ...pickDefinedEntries(patched.data.attributes ?? {}),
          },
          comparison,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}
