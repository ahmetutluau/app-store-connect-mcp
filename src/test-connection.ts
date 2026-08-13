import { AppStoreConnectClient } from "./client.js";
import type { AppAttributes, JsonApiListDocument, JsonApiResource } from "./types.js";

async function main(): Promise<void> {
  const client = new AppStoreConnectClient();
  const response = await client.get<JsonApiListDocument<JsonApiResource<AppAttributes>>>(
    "/v1/apps",
    {
      query: {
        limit: 20,
        "fields[apps]": ["name", "bundleId", "sku", "primaryLocale"],
      },
    },
  );

  console.log(
    JSON.stringify(
      response.data.map((app) => ({
        id: app.id,
        name: app.attributes?.name ?? null,
        bundleId: app.attributes?.bundleId ?? null,
        sku: app.attributes?.sku ?? null,
        primaryLocale: app.attributes?.primaryLocale ?? null,
      })),
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
