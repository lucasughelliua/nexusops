import dotenv from "dotenv";

dotenv.config();

const CF_MARKETING_SYNC_URL = process.env.CF_MARKETING_SYNC_URL;
const SYNC_SECRET = process.env.SYNC_SECRET;
const GA4_CSV_URL = process.env.GA4_CSV_URL;

if (!CF_MARKETING_SYNC_URL) {
  throw new Error("Falta CF_MARKETING_SYNC_URL");
}

if (!SYNC_SECRET) {
  throw new Error("Falta SYNC_SECRET");
}

if (!GA4_CSV_URL) {
  throw new Error("Falta GA4_CSV_URL");
}

async function main() {
  console.log("[Marketing] Iniciando sincronización...");

  await syncGA4GoogleAdsOnly();

  console.log("[Marketing] Sync finalizada");
}

async function syncGA4GoogleAdsOnly() {
  console.log("[GA4] Descargando CSV de Google Ads...");

  const res = await fetch(GA4_CSV_URL);

  if (!res.ok) {
    throw new Error(`[GA4] Error descargando CSV: ${res.status}`);
  }

  const csv = await res.text();

  const lines = csv
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    console.log("[GA4] CSV vacío");
    return;
  }

  const headers = parseCSVLine(lines.shift());

  console.log("[GA4] Headers detectados:");
  console.log(headers);

  const rows = [];

  for (const line of lines) {
    const cols = parseCSVLine(line);

    const row = {
      date: cols[0] || "",
      source: cols[1] || "",
      medium: cols[2] || "",
      campaign: cols[3] || "",
      sessions: Number(cols[4] || 0),
      users: Number(cols[5] || 0),
      conversions: Number(cols[6] || 0),
      revenue: Number(cols[7] || 0)
    };

    rows.push(row);
  }

  console.log(`[GA4] ${rows.length} filas encontradas`);

  const payload = {
    source: "ga4_google_ads",
    rows
  };

  console.log("[GA4] Enviando datos al Worker...");

  const syncRes = await fetch(CF_MARKETING_SYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": SYNC_SECRET
    },
    body: JSON.stringify(payload)
  });

  const text = await syncRes.text();

  if (!syncRes.ok) {
    console.error(text);
    throw new Error(`[GA4] Error sync worker: ${syncRes.status}`);
  }

  console.log("[GA4] Sync OK");
  console.log(text);
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());

  return result;
}

main().catch((err) => {
  console.error("[Marketing] ERROR:");
  console.error(err);

  process.exit(1);
});
