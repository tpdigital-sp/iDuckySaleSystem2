/**
 * ⏱️ ล้างแคชหน้าสินค้าบนเว็บจริงตามรหัสสินค้า — ใช้หลังสคริปต์เขียน DB ตรง (หน้า /products/[id] แคช 1 ชม.)
 *   npx tsx scripts/revalidate-live-products.mts sticker-uv [id2 ...]
 * เซ็นคำขอด้วย SUPABASE_SERVICE_ROLE_KEY จาก .env.local (ดู scripts/lib/revalidate-live.mts)
 */
import { readFileSync } from "node:fs";
import { revalidateLive } from "./lib/revalidate-live.mts";

const ids = process.argv.slice(2).filter(Boolean);
if (!ids.length) { console.error("ใช้: npx tsx scripts/revalidate-live-products.mts <productId> [...]"); process.exit(1); }
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
) as Record<string, string>;
await revalidateLive(env, { productIds: ids });
