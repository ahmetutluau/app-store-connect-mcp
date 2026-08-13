import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppStoreConnectClient } from "../client.js";
import { config } from "../config.js";
import { asToolError, jsonContent } from "./shared.js";

type SalesRow = Record<string, string>;

const salesReportTypeSchema = z.enum([
  "SALES",
  "SUBSCRIPTION",
  "SUBSCRIPTION_EVENT",
  "SUBSCRIBER",
  "PRE_ORDER",
  "INSTALLS",
]);

const salesReportSubTypeSchema = z.enum([
  "SUMMARY",
  "DETAILED",
  "SUMMARY_INSTALL_TYPE",
  "SUMMARY_TERRITORY",
  "SUMMARY_CHANNEL",
]);

const frequencySchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

const financeReportTypeSchema = z.enum(["FINANCIAL", "FINANCE_DETAIL"]);

function parseTabularReport(content: string): SalesRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split("\t");

  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getConfiguredVendorNumber(inputVendorNumber?: string): string {
  const vendorNumber = inputVendorNumber ?? config.vendorNumber;
  if (!vendorNumber) {
    throw new Error(
      "Missing vendor number. Provide vendorNumber in the tool input or set APP_STORE_CONNECT_VENDOR_NUMBER in .env.",
    );
  }
  return vendorNumber;
}

function filterRowsForApp(rows: SalesRow[], appId: string): SalesRow[] {
  return rows.filter((row) => {
    const appleIdentifier = normalize(
      row["Apple Identifier"] ??
        row["AppleIdentifier"] ??
        row["appleIdentifier"] ??
        row["App Apple Identifier"],
    );
    return appleIdentifier === normalize(appId);
  });
}

function sumNumericColumns(rows: SalesRow[], candidateColumns: string[]) {
  let total = 0;

  for (const row of rows) {
    for (const column of candidateColumns) {
      const rawValue = row[column];
      if (!rawValue) {
        continue;
      }

      const parsed = Number(rawValue.replaceAll(",", ""));
      if (!Number.isNaN(parsed)) {
        total += parsed;
        break;
      }
    }
  }

  return total;
}

function uniqueValues(rows: SalesRow[], candidateColumns: string[]) {
  const values = new Set<string>();

  for (const row of rows) {
    for (const column of candidateColumns) {
      const rawValue = row[column]?.trim();
      if (rawValue) {
        values.add(rawValue);
        break;
      }
    }
  }

  return [...values];
}

function buildSalesSummary(rows: SalesRow[]) {
  return {
    rowCount: rows.length,
    units: sumNumericColumns(rows, ["Units", "Quantity", "quantity"]),
    proceedsUsdEstimate: sumNumericColumns(rows, [
      "Customer Price",
      "Developer Proceeds",
      "proceeds",
      "Proceeds",
    ]),
    territories: uniqueValues(rows, ["Country Code", "Country", "Region"]),
    products: uniqueValues(rows, ["Title", "SKU", "Product Type Identifier"]),
  };
}

export function registerSalesTools(server: McpServer, client: AppStoreConnectClient) {
  server.registerTool(
    "download_sales_report",
    {
      title: "Download Sales and Trends Report",
      description:
        "Downloads a Sales and Trends report and returns a preview plus parsed rows count.",
      inputSchema: {
        vendorNumber: z.string().min(1).optional(),
        reportType: salesReportTypeSchema,
        reportSubType: salesReportSubTypeSchema,
        frequency: frequencySchema,
        version: z.string().min(1),
        reportDate: z.string().min(7).optional(),
        previewRows: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({
      vendorNumber,
      reportType,
      reportSubType,
      frequency,
      version,
      reportDate,
      previewRows = 10,
    }) => {
      try {
        const resolvedVendorNumber = getConfiguredVendorNumber(vendorNumber);
        const downloaded = await client.downloadAuthorizedFile("/v1/salesReports", {
          query: {
            "filter[vendorNumber]": resolvedVendorNumber,
            "filter[reportType]": reportType,
            "filter[reportSubType]": reportSubType,
            "filter[frequency]": frequency,
            "filter[version]": version,
            "filter[reportDate]": reportDate,
          },
        });

        const rows = parseTabularReport(downloaded.content);
        return jsonContent({
          reportType,
          reportSubType,
          frequency,
          version,
          reportDate: reportDate ?? null,
          rowCount: rows.length,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
          preview: rows.slice(0, previewRows),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "summarize_app_sales_report",
    {
      title: "Summarize App Sales Report",
      description:
        "Downloads a Sales and Trends report, filters it by app Apple ID, and returns a compact revenue and units summary.",
      inputSchema: {
        appId: z.string().min(1),
        vendorNumber: z.string().min(1).optional(),
        reportType: salesReportTypeSchema.default("SALES"),
        reportSubType: salesReportSubTypeSchema.default("SUMMARY"),
        frequency: frequencySchema.default("DAILY"),
        version: z.string().min(1).default("1_0"),
        reportDate: z.string().min(7).optional(),
      },
    },
    async ({
      appId,
      vendorNumber,
      reportType = "SALES",
      reportSubType = "SUMMARY",
      frequency = "DAILY",
      version = "1_0",
      reportDate,
    }) => {
      try {
        const resolvedVendorNumber = getConfiguredVendorNumber(vendorNumber);
        const downloaded = await client.downloadAuthorizedFile("/v1/salesReports", {
          query: {
            "filter[vendorNumber]": resolvedVendorNumber,
            "filter[reportType]": reportType,
            "filter[reportSubType]": reportSubType,
            "filter[frequency]": frequency,
            "filter[version]": version,
            "filter[reportDate]": reportDate,
          },
        });

        const rows = parseTabularReport(downloaded.content);
        const appRows = filterRowsForApp(rows, appId);

        return jsonContent({
          appId,
          reportType,
          reportSubType,
          frequency,
          version,
          reportDate: reportDate ?? null,
          matchedRows: appRows.length,
          summary: buildSalesSummary(appRows),
          sample: appRows.slice(0, 10),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "download_finance_report",
    {
      title: "Download Finance Report",
      description: "Downloads a finance report and returns a preview of the parsed rows.",
      inputSchema: {
        vendorNumber: z.string().min(1).optional(),
        regionCode: z.string().min(2),
        reportDate: z.string().regex(/^\d{4}-\d{2}$/),
        reportType: financeReportTypeSchema.default("FINANCIAL"),
        previewRows: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({
      vendorNumber,
      regionCode,
      reportDate,
      reportType = "FINANCIAL",
      previewRows = 10,
    }) => {
      try {
        const resolvedVendorNumber = getConfiguredVendorNumber(vendorNumber);
        const downloaded = await client.downloadAuthorizedFile("/v1/financeReports", {
          query: {
            "filter[vendorNumber]": resolvedVendorNumber,
            "filter[regionCode]": regionCode,
            "filter[reportDate]": reportDate,
            "filter[reportType]": reportType,
          },
        });

        const rows = parseTabularReport(downloaded.content);
        return jsonContent({
          regionCode,
          reportDate,
          reportType,
          rowCount: rows.length,
          headers: rows.length > 0 ? Object.keys(rows[0]) : [],
          preview: rows.slice(0, previewRows),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}
