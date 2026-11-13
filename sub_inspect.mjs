import { api } from "./asc_lib.mjs";
const apps = await api("/v1/apps?limit=50");
const app = apps.data.find(a => /musicAI/i.test(a.attributes.bundleId) || /sone/i.test(a.attributes.name));
for (const a of apps.data) console.log(a.id, a.attributes.name, a.attributes.bundleId);
console.log("\nUSING", app.id, app.attributes.name);
const groups = await api(`/v1/apps/${app.id}/subscriptionGroups?limit=50`);
for (const g of groups.data) {
  console.log("\nGROUP", g.id, g.attributes.referenceName);
  const gl = await api(`/v1/subscriptionGroups/${g.id}/subscriptionGroupLocalizations?limit=200`);
  console.log("  group locs:", gl.data.map(l => `${l.attributes.locale}:${l.attributes.name}`).join(" | "));
  const subs = await api(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
  for (const s of subs.data) {
    console.log("  SUB", s.id, s.attributes.productId, s.attributes.state);
    const sl = await api(`/v1/subscriptions/${s.id}/subscriptionLocalizations?limit=200`);
    for (const l of sl.data) console.log("     ", l.attributes.locale, JSON.stringify(l.attributes.name), JSON.stringify(l.attributes.description), l.attributes.state);
  }
}
const infos = await api(`/v1/apps/${app.id}/appInfos`);
const il = await api(`/v1/appInfos/${infos.data[0].id}/appInfoLocalizations?limit=200`);
console.log("\nAPP LOCALES:", il.data.map(l => l.attributes.locale).join(", "));
