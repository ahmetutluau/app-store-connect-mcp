import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AppStoreConnectClient } from "../client.js";
import type { JsonApiDocument, JsonApiListDocument, JsonApiResource } from "../types.js";
import { appIdSchema, asToolError, jsonContent } from "./shared.js";

interface PricePointAttributes {
  customerPrice?: string;
  proceeds?: string;
  proceedsYear2?: string;
}

interface SubscriptionPriceAttributes {
  startDate?: string | null;
  preserved?: boolean;
}

interface TerritoryAttributes {
  currency?: string;
}

interface PricePointRow {
  pricePointId: string;
  territory: string;
  currency: string | null;
  customerPrice: string | null;
  proceeds: string | null;
}

interface CurrentPriceRow extends PricePointRow {
  subscriptionPriceId: string;
  startDate: string | null;
  preserved: boolean | null;
}

const subscriptionIdSchema = z
  .string()
  .min(1)
  .describe("App Store Connect subscription ID (not the productId). Use list_subscriptions to find it.");

const territorySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase())
  .describe("Three-letter App Store territory code, e.g. USA, TUR, DEU, GBR.");

/** Follows `links.next` and keeps `included` resources from every page. */
async function listAllWithIncluded<T>(
  client: AppStoreConnectClient,
  path: string,
  query: Record<string, string | number | string[]>,
): Promise<{ data: T[]; included: JsonApiResource[] }> {
  const data: T[] = [];
  const included: JsonApiResource[] = [];
  let page = await client.get<JsonApiListDocument<T>>(path, { query });

  for (;;) {
    data.push(...page.data);
    included.push(...(page.included ?? []));
    if (!page.links?.next) break;
    page = await client.get<JsonApiListDocument<T>>(page.links.next);
  }

  return { data, included };
}

function relId(resource: JsonApiResource<unknown>, name: string): string | null {
  const data = resource.relationships?.[name]?.data;
  return data && !Array.isArray(data) ? data.id : null;
}

function indexIncluded(included: JsonApiResource[]) {
  const map = new Map<string, JsonApiResource>();
  for (const item of included) map.set(`${item.type}:${item.id}`, item);
  return map;
}

function toPricePointRows(
  doc: { data: JsonApiResource<PricePointAttributes>[]; included: JsonApiResource[] },
): PricePointRow[] {
  const included = indexIncluded(doc.included);
  return doc.data.map((point) => {
    const territory = relId(point, "territory") ?? "";
    const territoryRes = included.get(`territories:${territory}`) as
      | JsonApiResource<TerritoryAttributes>
      | undefined;
    return {
      pricePointId: point.id,
      territory,
      currency: territoryRes?.attributes?.currency ?? null,
      customerPrice: point.attributes?.customerPrice ?? null,
      proceeds: point.attributes?.proceeds ?? null,
    };
  });
}

async function listPricePoints(
  client: AppStoreConnectClient,
  subscriptionId: string,
  territory: string,
): Promise<PricePointRow[]> {
  const doc = await listAllWithIncluded<JsonApiResource<PricePointAttributes>>(
    client,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/pricePoints`,
    {
      "filter[territory]": territory,
      include: "territory",
      limit: 200,
    },
  );
  return toPricePointRows(doc);
}

async function listEqualizations(
  client: AppStoreConnectClient,
  pricePointId: string,
): Promise<PricePointRow[]> {
  const doc = await listAllWithIncluded<JsonApiResource<PricePointAttributes>>(
    client,
    `/v1/subscriptionPricePoints/${encodeURIComponent(pricePointId)}/equalizations`,
    { include: "territory", limit: 200 },
  );
  return toPricePointRows(doc);
}

/**
 * Returns every scheduled price row (past, current and future) for a subscription.
 * The row whose startDate is the latest one not in the future is the current price.
 */
async function listSubscriptionPrices(
  client: AppStoreConnectClient,
  subscriptionId: string,
  territory?: string,
): Promise<CurrentPriceRow[]> {
  const query: Record<string, string | number | string[]> = {
    include: ["subscriptionPricePoint", "territory"],
    "fields[subscriptionPricePoints]": ["customerPrice", "proceeds", "territory"],
    limit: 200,
  };
  if (territory) query["filter[territory]"] = territory;

  const doc = await listAllWithIncluded<JsonApiResource<SubscriptionPriceAttributes>>(
    client,
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}/prices`,
    query,
  );
  const included = indexIncluded(doc.included);

  return doc.data.map((price) => {
    const pointId = relId(price, "subscriptionPricePoint") ?? "";
    const territoryId = relId(price, "territory") ?? "";
    const point = included.get(`subscriptionPricePoints:${pointId}`) as
      | JsonApiResource<PricePointAttributes>
      | undefined;
    const territoryRes = included.get(`territories:${territoryId}`) as
      | JsonApiResource<TerritoryAttributes>
      | undefined;
    return {
      subscriptionPriceId: price.id,
      pricePointId: pointId,
      territory: territoryId,
      currency: territoryRes?.attributes?.currency ?? null,
      customerPrice: point?.attributes?.customerPrice ?? null,
      proceeds: point?.attributes?.proceeds ?? null,
      startDate: price.attributes?.startDate ?? null,
      preserved: price.attributes?.preserved ?? null,
    };
  });
}

/** Picks the price currently in effect per territory (latest startDate <= today; null = since the beginning). */
function currentPricesByTerritory(rows: CurrentPriceRow[]): Map<string, CurrentPriceRow> {
  const today = new Date().toISOString().slice(0, 10);
  const result = new Map<string, CurrentPriceRow>();
  for (const row of rows) {
    const start = row.startDate ?? "0000-00-00";
    if (start > today) continue;
    const existing = result.get(row.territory);
    if (!existing || start > (existing.startDate ?? "0000-00-00")) result.set(row.territory, row);
  }
  return result;
}

function samePrice(a: string | null, b: string): boolean {
  return a !== null && Number(a) === Number(b);
}

async function createSubscriptionPrice(
  client: AppStoreConnectClient,
  subscriptionId: string,
  pricePointId: string,
  territory: string,
  startDate: string | undefined,
  preserveCurrentPrice: boolean,
) {
  return client.post<JsonApiDocument<JsonApiResource<SubscriptionPriceAttributes>>>(
    "/v1/subscriptionPrices",
    {
      body: {
        data: {
          type: "subscriptionPrices",
          attributes: {
            preserveCurrentPrice,
            ...(startDate ? { startDate } : {}),
          },
          relationships: {
            subscription: { data: { type: "subscriptions", id: subscriptionId } },
            subscriptionPricePoint: {
              data: { type: "subscriptionPricePoints", id: pricePointId },
            },
            territory: { data: { type: "territories", id: territory } },
          },
        },
      },
    },
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export function registerSubscriptionTools(server: McpServer, client: AppStoreConnectClient) {
  server.registerTool(
    "set_subscription_territory_prices",
    {
      title: "Set Subscription Territory Prices",
      description:
        "Sets explicit per-territory prices for a subscription (e.g. from a pricing sheet). Each target price is matched to an Apple price point in that territory (exact or nearest). Territories not listed are left unchanged. dryRun defaults to true; applying requires dryRun=false and confirm=true.",
      inputSchema: {
        subscriptionId: subscriptionIdSchema,
        prices: z
          .array(
            z.object({
              territory: territorySchema,
              customerPrice: z.number().positive(),
              currency: z
                .string()
                .length(3)
                .optional()
                .describe("Expected currency (e.g. EUR). If Apple uses a different currency in that territory, the row is skipped."),
            }),
          )
          .min(1),
        match: z
          .enum(["exact", "nearest"])
          .default("nearest")
          .describe("'exact': skip rows whose price is not an Apple price point. 'nearest': use the closest price point."),
        preserveCurrentPrice: z.boolean().default(true),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dryRun: z.boolean().optional().default(true),
        confirm: z.boolean().optional(),
      },
    },
    async ({
      subscriptionId,
      prices,
      match = "nearest",
      preserveCurrentPrice = true,
      startDate,
      dryRun = true,
      confirm = false,
    }) => {
      try {
        const currentRows = currentPricesByTerritory(
          await listSubscriptionPrices(client, subscriptionId),
        );

        const rows = await mapWithConcurrency(prices, 2, async (input) => {
          const points = await listPricePoints(client, subscriptionId, input.territory);
          const current = currentRows.get(input.territory);
          const base = {
            territory: input.territory,
            requestedPrice: input.customerPrice,
            currentPrice: current?.customerPrice ?? null,
          };
          if (points.length === 0) {
            return { ...base, status: "skipped" as const, reason: "No price points for this territory." };
          }
          const currency = points[0].currency;
          if (input.currency && currency && input.currency.toUpperCase() !== currency) {
            return {
              ...base,
              currency,
              status: "skipped" as const,
              reason: `Apple uses ${currency} here, sheet expects ${input.currency.toUpperCase()}.`,
            };
          }
          const best = [...points].sort(
            (a, b) =>
              Math.abs(Number(a.customerPrice) - input.customerPrice) -
              Math.abs(Number(b.customerPrice) - input.customerPrice),
          )[0];
          const exact = samePrice(best.customerPrice, String(input.customerPrice));
          if (!exact && match === "exact") {
            return {
              ...base,
              currency,
              status: "skipped" as const,
              reason: `Not an exact price point; nearest is ${best.customerPrice}.`,
            };
          }
          const unchanged = current?.pricePointId === best.pricePointId;
          return {
            ...base,
            currency,
            newPrice: best.customerPrice,
            newProceeds: best.proceeds,
            exactMatch: exact,
            pricePointId: best.pricePointId,
            status: unchanged ? ("unchanged" as const) : ("change" as const),
          };
        });

        const changes = rows.flatMap((row) => (row.status === "change" ? [row] : []));
        const summary = {
          subscriptionId,
          preserveCurrentPrice,
          startDate: startDate ?? "as soon as possible",
          requested: rows.length,
          toChange: changes.length,
          unchanged: rows.filter((row) => row.status === "unchanged").length,
          skipped: rows.filter((row) => row.status === "skipped").length,
        };

        if (dryRun || !confirm) {
          return jsonContent({
            updated: false,
            dryRun,
            ...(dryRun ? {} : { reason: "confirm=true is required when dryRun=false." }),
            ...summary,
            rows,
          });
        }

        const results = await mapWithConcurrency(changes, 2, async (row) => {
          try {
            const created = await createSubscriptionPrice(
              client,
              subscriptionId,
              row.pricePointId,
              row.territory,
              startDate,
              preserveCurrentPrice,
            );
            return { territory: row.territory, newPrice: row.newPrice, ok: true, subscriptionPriceId: created.data.id };
          } catch (error) {
            return {
              territory: row.territory,
              newPrice: row.newPrice,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        });

        return jsonContent({
          updated: results.some((r) => r.ok),
          dryRun: false,
          ...summary,
          appliedCount: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok),
          applied: results.filter((r) => r.ok),
          skippedRows: rows.filter((row) => row.status === "skipped"),
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_subscriptions",
    {
      title: "List Subscriptions",
      description:
        "Lists an app's subscription groups and their auto-renewable subscriptions (id, productId, name, period, state).",
      inputSchema: { appId: appIdSchema },
    },
    async ({ appId }) => {
      try {
        const groups = await client.listAll<JsonApiResource<{ referenceName?: string }>>(
          `/v1/apps/${encodeURIComponent(appId)}/subscriptionGroups`,
          { query: { limit: 200 } },
        );

        const result = [];
        for (const group of groups) {
          const subs = await client.listAll<
            JsonApiResource<{
              name?: string;
              productId?: string;
              subscriptionPeriod?: string;
              state?: string;
              groupLevel?: number;
            }>
          >(`/v1/subscriptionGroups/${encodeURIComponent(group.id)}/subscriptions`, {
            query: { limit: 200 },
          });
          result.push({
            groupId: group.id,
            referenceName: group.attributes?.referenceName ?? null,
            subscriptions: subs.map((sub) => ({
              subscriptionId: sub.id,
              name: sub.attributes?.name ?? null,
              productId: sub.attributes?.productId ?? null,
              period: sub.attributes?.subscriptionPeriod ?? null,
              state: sub.attributes?.state ?? null,
              groupLevel: sub.attributes?.groupLevel ?? null,
            })),
          });
        }

        return jsonContent({ appId, groups: result });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "get_subscription_prices",
    {
      title: "Get Subscription Prices",
      description:
        "Returns the price currently in effect per territory for a subscription, plus any scheduled future price changes.",
      inputSchema: {
        subscriptionId: subscriptionIdSchema,
        territory: territorySchema.optional(),
      },
    },
    async ({ subscriptionId, territory }) => {
      try {
        const rows = await listSubscriptionPrices(client, subscriptionId, territory);
        const current = currentPricesByTerritory(rows);
        const today = new Date().toISOString().slice(0, 10);
        const scheduled = rows.filter((row) => row.startDate && row.startDate > today);

        return jsonContent({
          subscriptionId,
          territoryCount: current.size,
          current: [...current.values()].sort((a, b) => a.territory.localeCompare(b.territory)),
          scheduled,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "list_subscription_price_points",
    {
      title: "List Subscription Price Points",
      description:
        "Lists the price points Apple allows for a subscription in one territory. Optionally narrows to the points closest to a target price.",
      inputSchema: {
        subscriptionId: subscriptionIdSchema,
        territory: territorySchema.default("USA"),
        nearPrice: z.number().positive().optional().describe("Return the price points closest to this amount."),
        limit: z.number().int().min(1).max(1000).optional().default(15),
      },
    },
    async ({ subscriptionId, territory = "USA", nearPrice, limit = 15 }) => {
      try {
        let points = await listPricePoints(client, subscriptionId, territory);
        points.sort((a, b) => Number(a.customerPrice) - Number(b.customerPrice));
        if (nearPrice !== undefined) {
          points = [...points]
            .sort(
              (a, b) =>
                Math.abs(Number(a.customerPrice) - nearPrice) -
                Math.abs(Number(b.customerPrice) - nearPrice),
            )
            .slice(0, limit)
            .sort((a, b) => Number(a.customerPrice) - Number(b.customerPrice));
        } else {
          points = points.slice(0, limit);
        }
        return jsonContent({ subscriptionId, territory, pricePoints: points });
      } catch (error) {
        return asToolError(error);
      }
    },
  );

  server.registerTool(
    "update_subscription_price",
    {
      title: "Update Subscription Price",
      description:
        "Schedules a new price for a subscription. Set the price for one base territory (default USA); with otherTerritories='equalize' every other territory that currently has a price gets Apple's equalized equivalent. dryRun defaults to true and shows the full before/after plan; applying requires dryRun=false and confirm=true.",
      inputSchema: {
        subscriptionId: subscriptionIdSchema,
        territory: territorySchema.default("USA"),
        customerPrice: z
          .number()
          .positive()
          .describe("New customer price in the base territory's currency. Must match an Apple price point exactly."),
        otherTerritories: z
          .enum(["equalize", "unchanged"])
          .describe(
            "'equalize': update every other territory that has a price to Apple's equalized equivalent. 'unchanged': only touch the base territory.",
          ),
        preserveCurrentPrice: z
          .boolean()
          .default(true)
          .describe("true: existing subscribers keep their current price; only new subscribers pay the new price."),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("YYYY-MM-DD date the new price takes effect. Omit to apply as soon as possible."),
        dryRun: z.boolean().optional().default(true),
        confirm: z.boolean().optional(),
      },
    },
    async ({
      subscriptionId,
      territory = "USA",
      customerPrice,
      otherTerritories,
      preserveCurrentPrice = true,
      startDate,
      dryRun = true,
      confirm = false,
    }) => {
      try {
        const basePoints = await listPricePoints(client, subscriptionId, territory);
        const basePoint = basePoints.find((point) => samePrice(point.customerPrice, String(customerPrice)));
        if (!basePoint) {
          const nearest = [...basePoints]
            .sort(
              (a, b) =>
                Math.abs(Number(a.customerPrice) - customerPrice) -
                Math.abs(Number(b.customerPrice) - customerPrice),
            )
            .slice(0, 6)
            .map((point) => point.customerPrice);
          return jsonContent({
            updated: false,
            reason: `${customerPrice} is not an Apple price point in ${territory}.`,
            nearestPricePoints: nearest,
          });
        }

        const currentRows = currentPricesByTerritory(
          await listSubscriptionPrices(client, subscriptionId),
        );

        const targets: PricePointRow[] = [basePoint];
        if (otherTerritories === "equalize") {
          const equalized = await listEqualizations(client, basePoint.pricePointId);
          for (const point of equalized) {
            if (point.territory !== territory && currentRows.has(point.territory)) targets.push(point);
          }
        }

        const plan = targets.map((target) => {
          const current = currentRows.get(target.territory);
          return {
            territory: target.territory,
            currency: target.currency ?? current?.currency ?? null,
            currentPrice: current?.customerPrice ?? null,
            newPrice: target.customerPrice,
            newProceeds: target.proceeds,
            pricePointId: target.pricePointId,
            changed: current?.pricePointId !== target.pricePointId,
          };
        });
        const changes = plan.filter((row) => row.changed);

        const summary = {
          subscriptionId,
          baseTerritory: territory,
          otherTerritories,
          preserveCurrentPrice,
          startDate: startDate ?? "as soon as possible",
          territoriesWithPrice: currentRows.size,
          territoriesToChange: changes.length,
          territoriesAlreadyAtTarget: plan.length - changes.length,
        };

        if (dryRun) {
          return jsonContent({ updated: false, dryRun: true, ...summary, plan: changes });
        }
        if (!confirm) {
          return jsonContent({
            updated: false,
            dryRun: false,
            reason: "confirm=true is required when dryRun=false.",
            ...summary,
          });
        }

        const applied: Array<{ territory: string; newPrice: string | null; subscriptionPriceId: string }> = [];
        const failed: Array<{ territory: string; error: string }> = [];
        for (const row of changes) {
          try {
            const created = await createSubscriptionPrice(
              client,
              subscriptionId,
              row.pricePointId,
              row.territory,
              startDate,
              preserveCurrentPrice,
            );
            applied.push({
              territory: row.territory,
              newPrice: row.newPrice,
              subscriptionPriceId: created.data.id,
            });
          } catch (error) {
            failed.push({
              territory: row.territory,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return jsonContent({
          updated: applied.length > 0,
          dryRun: false,
          ...summary,
          appliedCount: applied.length,
          failedCount: failed.length,
          applied,
          failed,
        });
      } catch (error) {
        return asToolError(error);
      }
    },
  );
}
