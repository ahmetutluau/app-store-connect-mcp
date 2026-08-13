import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppStoreConnectClient } from "../client.js";
import type {
  AnalyticsReportAttributes,
  AnalyticsReportInstanceAttributes,
  AnalyticsReportRequestRelationships,
  AnalyticsReportRequestAttributes,
  AnalyticsReportSegmentAttributes,
  JsonApiDocument,
  JsonApiListDocument,
  JsonApiResource,
} from "../types.js";
import { appIdSchema, asToolError, jsonContent, pickDefinedEntries } from "./shared.js";

const analyticsAccessTypeSchema = z.enum(["ONGOING", "ONE_TIME_SNAPSHOT"]);

const requestFields = ["accessType", "stoppedDueToInactivity"] as const;
const reportFields = ["name", "category"] as const;
const instanceFields = ["granularity", "processingDate"] as const;
const segmentFields = ["checksum", "sizeInBytes", "url"] as const;

function toRequestSummary(
  request: JsonApiResource<AnalyticsReportRequestAttributes & { relationships?: AnalyticsReportRequestRelationships }>,
) {
  return {
    id: request.id,
    type: request.type,
    ...pickDefinedEntries(request.attributes ?? {}),
  };
}

export function registerAnalyticsTools(server: McpServer, client: AppStoreConnectClient) {
  server.registerTool(
    "list_analytics_report_requests",
    {
      title: "List Analytics Report Requests",
      description: "Lists analytics report requests for an app.",
      inputSchema: {
        appId: appIdSchema,
      },
    },
    async ({ appId }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >(`/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests`, {
          query: {
            limit: 200,
            "fields[analyticsReportRequests]": requestFields,
          },
        });

        return jsonContent(response.data.map((request) => toRequestSummary(request)));
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "create_analytics_report_request",
    {
      title: "Create Analytics Report Request",
      description:
        "Creates an analytics report request for an app when one of the same access type does not already exist.",
      inputSchema: {
        appId: appIdSchema,
        accessType: analyticsAccessTypeSchema,
      },
    },
    async ({ appId, accessType }) => {
      try {
        const existing = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >(`/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests`, {
          query: {
            limit: 200,
            "fields[analyticsReportRequests]": requestFields,
          },
        });

        const duplicate = existing.data.find(
          (item) => item.attributes?.accessType === accessType,
        );

        if (duplicate) {
          return jsonContent({
            created: false,
            reason:
              "A report request with the same access type already exists, so no duplicate was created.",
            existingRequest: {
              id: duplicate.id,
              type: duplicate.type,
              ...pickDefinedEntries(duplicate.attributes ?? {}),
            },
          });
        }

        const created = await client.post<
          JsonApiDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >("/v1/analyticsReportRequests", {
          body: {
            data: {
              type: "analyticsReportRequests",
              attributes: {
                accessType,
              },
              relationships: {
                app: {
                  data: {
                    type: "apps",
                    id: appId,
                  },
                },
              },
            },
          },
        });

        return jsonContent({
          created: true,
          request: {
            id: created.data.id,
            type: created.data.type,
            ...pickDefinedEntries(created.data.attributes ?? {}),
          },
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_analytics_report_request_status",
    {
      title: "Get Analytics Report Request Status",
      description:
        "Gets the status of one analytics report request and includes its related report definitions.",
      inputSchema: {
        analyticsReportRequestId: z.string().min(1),
      },
    },
    async ({ analyticsReportRequestId }) => {
      try {
        const response = await client.get<
          JsonApiDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >(`/v1/analyticsReportRequests/${encodeURIComponent(analyticsReportRequestId)}`, {
          query: {
            include: ["reports"],
            "fields[analyticsReportRequests]": [...requestFields, "reports"],
            "fields[analyticsReports]": reportFields,
            "limit[reports]": 50,
          },
        });

        const reports =
          response.included
            ?.filter((resource) => resource.type === "analyticsReports")
            .map((report) => ({
              id: report.id,
              type: report.type,
              ...pickDefinedEntries((report.attributes ?? {}) as AnalyticsReportAttributes),
            })) ?? [];

        return jsonContent({
          request: toRequestSummary(response.data),
          reportCount: reports.length,
          reports,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_analytics_reports",
    {
      title: "List Analytics Reports",
      description: "Lists generated reports for an analytics report request.",
      inputSchema: {
        analyticsReportRequestId: z.string().min(1),
      },
    },
    async ({ analyticsReportRequestId }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportAttributes>>
        >(`/v1/analyticsReportRequests/${encodeURIComponent(analyticsReportRequestId)}/reports`, {
          query: {
            limit: 200,
            "fields[analyticsReports]": reportFields,
          },
        });

        return jsonContent(
          response.data.map((report) => ({
            id: report.id,
            type: report.type,
            ...pickDefinedEntries(report.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "diagnose_analytics_pipeline",
    {
      title: "Diagnose Analytics Pipeline",
      description:
        "Diagnoses where the Analytics Reports API pipeline is blocked for an app, from request creation through report instances and downloadable segments.",
      inputSchema: {
        appId: appIdSchema,
        accessType: analyticsAccessTypeSchema.optional(),
        maxReportsToInspect: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ appId, accessType, maxReportsToInspect = 10 }) => {
      try {
        const requestResponse = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >(`/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests`, {
          query: {
            limit: 200,
            "fields[analyticsReportRequests]": requestFields,
            ...(accessType ? { "filter[accessType]": accessType } : {}),
          },
        });

        const requests = requestResponse.data;

        if (requests.length === 0) {
          return jsonContent({
            appId,
            accessType: accessType ?? null,
            stage: "NO_REQUEST",
            summary:
              "No analytics report request exists for this app and access type. Create one first, then wait for Apple to generate report instances.",
            nextSteps: [
              "Create an ONGOING request for recurring daily/weekly/monthly reports.",
              "Optionally create a ONE_TIME_SNAPSHOT request for historical backfill.",
              "Apple documents that the first report request can take 1–2 days before instances appear.",
            ],
            requests: [],
          });
        }

        const inspectedRequests = [];
        let totalReports = 0;
        let totalInstances = 0;
        let totalSegments = 0;

        for (const request of requests) {
          const reportResponse = await client.get<
            JsonApiListDocument<JsonApiResource<AnalyticsReportAttributes>>
          >(`/v1/analyticsReportRequests/${encodeURIComponent(request.id)}/reports`, {
            query: {
              limit: Math.min(maxReportsToInspect, 200),
              "fields[analyticsReports]": reportFields,
            },
          });

          const reports = [];

          for (const report of reportResponse.data.slice(0, maxReportsToInspect)) {
            const instanceResponse = await client.get<
              JsonApiListDocument<JsonApiResource<AnalyticsReportInstanceAttributes>>
            >(`/v1/analyticsReports/${encodeURIComponent(report.id)}/instances`, {
              query: {
                limit: 200,
                "fields[analyticsReportInstances]": instanceFields,
              },
            });

            totalInstances += instanceResponse.data.length;

            const instances = [];
            for (const instance of instanceResponse.data) {
              const segmentResponse = await client.get<
                JsonApiListDocument<JsonApiResource<AnalyticsReportSegmentAttributes>>
              >(`/v1/analyticsReportInstances/${encodeURIComponent(instance.id)}/segments`, {
                query: {
                  limit: 200,
                  "fields[analyticsReportSegments]": segmentFields,
                },
              });

              totalSegments += segmentResponse.data.length;
              instances.push({
                id: instance.id,
                type: instance.type,
                ...pickDefinedEntries(instance.attributes ?? {}),
                segmentCount: segmentResponse.data.length,
              });
            }

            totalReports += 1;
            reports.push({
              id: report.id,
              type: report.type,
              ...pickDefinedEntries(report.attributes ?? {}),
              instanceCount: instanceResponse.data.length,
              latestInstances: instances.slice(0, 5),
            });
          }

          inspectedRequests.push({
            request: toRequestSummary(request),
            reportCount: reportResponse.data.length,
            inspectedReportCount: reports.length,
            reports,
          });
        }

        const hasStoppedRequest = requests.some(
          (request) => request.attributes?.stoppedDueToInactivity === true,
        );
        const hasInstances = totalInstances > 0;
        const hasSegments = totalSegments > 0;

        let stage = "READY";
        let summary =
          "At least one analytics report instance and segment exists, so the Analytics Reports API should be downloadable through MCP.";
        let nextSteps: string[] = [
          "Call list_analytics_report_segments for the target instance.",
          "Then call download_analytics_report_segment for the returned segment ID.",
        ];

        if (hasStoppedRequest) {
          stage = "STOPPED_DUE_TO_INACTIVITY";
          summary =
            "At least one report request is marked stoppedDueToInactivity. Apple requires creating a new request to resume report generation.";
          nextSteps = [
            "Create a fresh request of the same access type after removing the inactive one.",
            "Wait 1–2 days for Apple to generate the first instances.",
          ];
        } else if (totalReports === 0) {
          stage = "NO_REPORT_DEFINITIONS";
          summary =
            "A request exists, but Apple has not exposed any report definitions for it yet.";
          nextSteps = [
            "Wait for Apple to finish provisioning the request.",
            "If this remains empty after 48 hours, recreate the request and retry.",
          ];
        } else if (!hasInstances) {
          stage = "NO_INSTANCES";
          summary =
            "Report definitions exist, but Apple has not generated any report instances yet. This is the most common reason MCP cannot download analytics data.";
          nextSteps = [
            "If the request was created recently, wait 1–2 days before checking again.",
            "Create a ONE_TIME_SNAPSHOT request if you need historical backfill.",
            "If the request is old and still empty, recreate it and monitor again.",
          ];
        } else if (!hasSegments) {
          stage = "NO_SEGMENTS";
          summary =
            "Instances exist, but Apple has not exposed downloadable segments for them yet.";
          nextSteps = [
            "Retry later; segment availability can lag behind instance creation.",
            "Inspect the specific instance again to see when segments appear.",
          ];
        }

        return jsonContent({
          appId,
          accessType: accessType ?? null,
          stage,
          summary,
          totals: {
            requestCount: requests.length,
            reportCount: totalReports,
            instanceCount: totalInstances,
            segmentCount: totalSegments,
          },
          nextSteps,
          requests: inspectedRequests,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "reset_analytics_report_request",
    {
      title: "Reset Analytics Report Request",
      description:
        "Deletes an existing analytics report request and creates a new one of the same access type. Use this when Apple marks a request stoppedDueToInactivity or a long-lived request never generates instances.",
      inputSchema: {
        appId: appIdSchema,
        analyticsReportRequestId: z.string().min(1),
        accessType: analyticsAccessTypeSchema,
        confirm: z.boolean().default(false),
      },
    },
    async ({ appId, analyticsReportRequestId, accessType, confirm = false }) => {
      try {
        if (!confirm) {
          return jsonContent({
            reset: false,
            reason:
              "This operation deletes the existing analytics report request before creating a new one. Re-run with confirm=true to proceed.",
          });
        }

        await client.delete<void>(
          `/v1/analyticsReportRequests/${encodeURIComponent(analyticsReportRequestId)}`,
        );

        const created = await client.post<
          JsonApiDocument<JsonApiResource<AnalyticsReportRequestAttributes>>
        >("/v1/analyticsReportRequests", {
          body: {
            data: {
              type: "analyticsReportRequests",
              attributes: {
                accessType,
              },
              relationships: {
                app: {
                  data: {
                    type: "apps",
                    id: appId,
                  },
                },
              },
            },
          },
        });

        return jsonContent({
          reset: true,
          deletedRequestId: analyticsReportRequestId,
          newRequest: {
            id: created.data.id,
            type: created.data.type,
            ...pickDefinedEntries(created.data.attributes ?? {}),
          },
          note: "Apple documents that the first generated instances for a new request can take 1–2 days to appear.",
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_analytics_report_instances",
    {
      title: "List Analytics Report Instances",
      description: "Lists instances for a specific analytics report.",
      inputSchema: {
        analyticsReportId: z.string().min(1),
      },
    },
    async ({ analyticsReportId }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportInstanceAttributes>>
        >(`/v1/analyticsReports/${encodeURIComponent(analyticsReportId)}/instances`, {
          query: {
            limit: 200,
            "fields[analyticsReportInstances]": instanceFields,
          },
        });

        return jsonContent(
          response.data.map((instance) => ({
            id: instance.id,
            type: instance.type,
            ...pickDefinedEntries(instance.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_analytics_report_segments",
    {
      title: "List Analytics Report Segments",
      description: "Lists downloadable segments for an analytics report instance.",
      inputSchema: {
        analyticsReportInstanceId: z.string().min(1),
      },
    },
    async ({ analyticsReportInstanceId }) => {
      try {
        const response = await client.get<
          JsonApiListDocument<JsonApiResource<AnalyticsReportSegmentAttributes>>
        >(`/v1/analyticsReportInstances/${encodeURIComponent(analyticsReportInstanceId)}/segments`, {
          query: {
            limit: 200,
            "fields[analyticsReportSegments]": segmentFields,
          },
        });

        return jsonContent(
          response.data.map((segment) => ({
            id: segment.id,
            type: segment.type,
            ...pickDefinedEntries(segment.attributes ?? {}),
          })),
        );
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "download_analytics_report_segment",
    {
      title: "Download Analytics Report Segment",
      description:
        "Downloads an analytics report segment by segment ID and returns a text preview of the decompressed report.",
      inputSchema: {
        analyticsReportSegmentId: z.string().min(1),
        previewLines: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ analyticsReportSegmentId, previewLines = 20 }) => {
      try {
        const segmentDetails = await client.get<
          JsonApiDocument<JsonApiResource<AnalyticsReportSegmentAttributes>>
        >(`/v1/analyticsReportSegments/${encodeURIComponent(analyticsReportSegmentId)}`, {
          query: {
            "fields[analyticsReportSegments]": segmentFields,
          },
        });

        const downloadUrl = segmentDetails.data.attributes?.url;

        if (!downloadUrl) {
          throw new Error("The analytics report segment does not currently expose a download URL.");
        }

        const downloaded = await client.downloadSegment(downloadUrl);
        const lines = downloaded.content.split(/\r?\n/);

        return jsonContent({
          segment: {
            id: segmentDetails.data.id,
            type: segmentDetails.data.type,
            ...pickDefinedEntries(segmentDetails.data.attributes ?? {}),
          },
          download: {
            compressedByteLength: downloaded.byteLength,
            contentType: downloaded.contentType,
            contentEncoding: downloaded.contentEncoding,
            lineCount: lines.filter((line) => line.length > 0).length,
          },
          preview: lines.slice(0, previewLines).join("\n"),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}
