import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppStoreConnectClient } from "../client.js";
import type {
  AppAttributes,
  AppInfoAttributes,
  AppInfoLocalizationAttributes,
  AppStoreVersionAttributes,
  AppStoreVersionLocalizationAttributes,
  JsonApiDocument,
  JsonApiListDocument,
  JsonApiResource,
} from "../types.js";
import { appIdSchema, asToolError, jsonContent, pickDefinedEntries } from "./shared.js";

const appFields = ["name", "bundleId", "sku", "primaryLocale"] as const;
const appInfoFields = ["appStoreState", "state"] as const;
const appInfoLocalizationFields = [
  "locale",
  "name",
  "subtitle",
  "privacyPolicyUrl",
  "privacyChoicesUrl",
  "privacyPolicyText",
] as const;
const versionFields = [
  "platform",
  "versionString",
  "appStoreState",
  "copyright",
  "createdDate",
  "downloadable",
  "earliestReleaseDate",
  "releaseType",
] as const;
const localizationFields = [
  "locale",
  "description",
  "keywords",
  "promotionalText",
  "marketingUrl",
  "supportUrl",
  "whatsNew",
] as const;

export function registerAppTools(server: McpServer, client: AppStoreConnectClient) {
  server.registerTool(
    "list_apps",
    {
      title: "List Apps",
      description: "Lists apps available in App Store Connect.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ limit = 200 }) => {
      try {
        const response = await client.get<JsonApiListDocument<JsonApiResource<AppAttributes>>>(
          "/v1/apps",
          {
            query: {
              limit,
              "fields[apps]": appFields,
            },
          },
        );

        return jsonContent(
          response.data.map((app) => ({
            id: app.id,
            type: app.type,
            ...pickDefinedEntries(app.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_app",
    {
      title: "Get App",
      description: "Gets a single app by App Store Connect app ID.",
      inputSchema: {
        appId: appIdSchema,
      },
    },
    async ({ appId }) => {
      try {
        const response = await client.get<JsonApiDocument<JsonApiResource<AppAttributes>>>(
          `/v1/apps/${encodeURIComponent(appId)}`,
          {
            query: {
              "fields[apps]": appFields,
            },
          },
        );

        return jsonContent({
          id: response.data.id,
          type: response.data.type,
          ...pickDefinedEntries(response.data.attributes ?? {}),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_app_infos",
    {
      title: "List App Infos",
      description: "Lists app-level info resources for an app, including title/subtitle localizations.",
      inputSchema: {
        appId: appIdSchema,
        includeLocalizations: z.boolean().optional(),
      },
    },
    async ({ appId, includeLocalizations = false }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AppInfoAttributes>>
        >(`/v1/apps/${encodeURIComponent(appId)}/appInfos`, {
          query: {
            limit: 200,
            include: includeLocalizations ? ["appInfoLocalizations"] : undefined,
            "fields[appInfos]": appInfoFields,
            "fields[appInfoLocalizations]": appInfoLocalizationFields,
          },
        });

        return jsonContent({
          data: response.data.map((appInfo) => ({
            id: appInfo.id,
            type: appInfo.type,
            ...pickDefinedEntries(appInfo.attributes ?? {}),
          })),
          included:
            response.included?.map((resource) => ({
              id: resource.id,
              type: resource.type,
              ...pickDefinedEntries(resource.attributes ?? {}),
            })) ?? [],
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_app_info_localizations",
    {
      title: "Get App Info Localizations",
      description: "Lists app-level localizations for title, subtitle, and privacy policy URL.",
      inputSchema: {
        appInfoId: z.string().min(1),
        locale: z.string().min(2).optional(),
      },
    },
    async ({ appInfoId, locale }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AppInfoLocalizationAttributes>>
        >(`/v1/appInfos/${encodeURIComponent(appInfoId)}/appInfoLocalizations`, {
          query: {
            limit: 200,
            "filter[locale]": locale,
            "fields[appInfoLocalizations]": appInfoLocalizationFields,
          },
        });

        return jsonContent(
          response.data.map((localization) => ({
            id: localization.id,
            type: localization.type,
            ...pickDefinedEntries(localization.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_app_store_versions",
    {
      title: "Get App Store Versions",
      description: "Lists App Store versions for an app.",
      inputSchema: {
        appId: appIdSchema,
        includeLocalizations: z.boolean().optional(),
      },
    },
    async ({ appId, includeLocalizations = false }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AppStoreVersionAttributes>>
        >(`/v1/apps/${encodeURIComponent(appId)}/appStoreVersions`, {
          query: {
            limit: 200,
            include: includeLocalizations ? ["appStoreVersionLocalizations"] : undefined,
            "fields[appStoreVersions]": versionFields,
            "fields[appStoreVersionLocalizations]": localizationFields,
          },
        });

        return jsonContent({
          data: response.data.map((version) => ({
            id: version.id,
            type: version.type,
            ...pickDefinedEntries(version.attributes ?? {}),
          })),
          included:
            response.included?.map((resource) => ({
              id: resource.id,
              type: resource.type,
              ...pickDefinedEntries(resource.attributes ?? {}),
            })) ?? [],
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_app_store_version_localizations",
    {
      title: "Get App Store Version Localizations",
      description: "Lists localizations for an App Store version.",
      inputSchema: {
        appStoreVersionId: z.string().min(1),
        locale: z.string().min(2).optional(),
      },
    },
    async ({ appStoreVersionId, locale }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AppStoreVersionLocalizationAttributes>>
        >(
          `/v1/appStoreVersions/${encodeURIComponent(appStoreVersionId)}/appStoreVersionLocalizations`,
          {
            query: {
              limit: 200,
              "filter[locale]": locale,
              "fields[appStoreVersionLocalizations]": localizationFields,
            },
          },
        );

        return jsonContent(
          response.data.map((localization) => ({
            id: localization.id,
            type: localization.type,
            ...pickDefinedEntries(localization.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}
