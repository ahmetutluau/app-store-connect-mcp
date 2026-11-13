import { readFile } from "node:fs/promises";
import { importPKCS8, SignJWT } from "jose";
import dotenv from "dotenv";

dotenv.config();

const ISSUER_ID = process.env.APP_STORE_CONNECT_ISSUER_ID;
const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID;
const PRIVATE_KEY_PATH = process.env.APP_STORE_CONNECT_PRIVATE_KEY_PATH;

async function getToken() {
  const privateKeyContent = await readFile(PRIVATE_KEY_PATH, "utf8");
  const privateKey = await importPKCS8(privateKeyContent, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 19 * 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: KEY_ID, typ: "JWT" })
    .setIssuer(ISSUER_ID)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(privateKey);
}

async function api(token, path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText} for ${path}\n${body}`);
  }
  return res.json();
}

const token = await getToken();

// 1. Find the app
const appsResp = await api(token, "/v1/apps?limit=50");
console.log("Apps found:");
for (const a of appsResp.data) {
  console.log(" -", a.id, a.attributes.name, a.attributes.bundleId);
}

const app = appsResp.data.find((a) =>
  /sone/i.test(a.attributes.name) || /musicgenerator/i.test(a.attributes.bundleId)
) || appsResp.data[0];

if (!app) {
  console.error("No app found.");
  process.exit(1);
}
console.log(`\nUsing app: ${app.attributes.name} (${app.id})\n`);

// 2. Fetch all customer reviews (paginated)
let url = `/v1/apps/${app.id}/customerReviews?limit=200&sort=-createdDate&include=response`;
const reviews = [];
let pageCount = 0;
while (url) {
  const resp = await api(token, url);
  reviews.push(...resp.data);
  pageCount++;
  const next = resp.links && resp.links.next;
  url = next ? next.replace("https://api.appstoreconnect.apple.com", "") : null;
  if (pageCount > 100) break; // safety
}

console.log(`Total reviews fetched: ${reviews.length} (pages: ${pageCount})\n`);

// 3. Bucket by date relative to 2026-08-05
const cutoff = new Date("2026-08-05T00:00:00Z");
let pre = [];
let post = [];
for (const r of reviews) {
  const d = new Date(r.attributes.createdDate);
  const rating = r.attributes.rating;
  if (d < cutoff) pre.push(rating);
  else post.push(rating);
}

function summarize(arr, label) {
  const n = arr.length;
  const avg = n ? (arr.reduce((a, b) => a + b, 0) / n).toFixed(2) : "N/A";
  const dist = [1, 2, 3, 4, 5].map((s) => arr.filter((x) => x === s).length);
  console.log(`${label}: count=${n}, avg=${avg}, dist(1-5)=${dist}`);
}

summarize(pre, "5 Agustos ONCESI (tum gecmis - 4 Agustos)");
summarize(post, "5 Agustos SONRASI (5 Agustos - bugun)");

// 4. Also print oldest/newest review dates to know full coverage window
if (reviews.length) {
  const dates = reviews.map((r) => r.attributes.createdDate).sort();
  console.log(`\nEn eski review: ${dates[0]}`);
  console.log(`En yeni review: ${dates[dates.length - 1]}`);
}

// 5. Monthly breakdown for a clearer trend
const byMonth = {};
for (const r of reviews) {
  const d = new Date(r.attributes.createdDate);
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  byMonth[key] = byMonth[key] || { count: 0, sum: 0 };
  byMonth[key].count++;
  byMonth[key].sum += r.attributes.rating;
}
console.log("\nAylik kirilim:");
for (const [k, v] of Object.entries(byMonth).sort()) {
  console.log(`  ${k}: count=${v.count}, avg=${(v.sum / v.count).toFixed(2)}`);
}
