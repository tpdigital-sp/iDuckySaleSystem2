/**
 * 🩹 ซ่อมใบที่ "สลิปงวดหลัง/ใบเพิ่มตก แต่ใบไม่ได้เข้ารอตรวจสอบ" (กติกาใหม่ parkForSlipReview · 2 ต.ค. 69)
 *   npx tsx --tsconfig tsconfig.json scripts/fix-8026-slip-review.mts            → สแกนทุกใบ (ดูเฉย ๆ)
 *   npx tsx --tsconfig tsconfig.json scripts/fix-8026-slip-review.mts OD-… --apply → พักใบนั้นเข้ารอตรวจสอบ (จำขั้นเดิมไว้)
 * เงื่อนไข: มีสลิปที่ยังรอคนตรวจ (hasPendingSlip) · ยอดยังค้าง · สถานะอยู่ในชุดที่พักได้ (REOPEN_FOR_BALANCE) และยังไม่ใช่รอตรวจสอบ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderBalance, orderTotal, parkForSlipReview, withLog, type Order } from "../src/lib/admin-data";
import { hasPendingSlip, paymentEntries } from "../src/lib/payments";
import { updateOrder } from "../src/lib/server/order-write";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ID = args.find((a) => a.startsWith("OD-"));
const BY = "ระบบ (ซ่อมสลิปรอตรวจ)";

const { data, error } = await sb.from("orders").select("data").neq("data->>status", "ยกเลิก");
if (error) throw error;
const hits = (data ?? [])
  .map((r) => r.data as Order)
  .filter((o) => o.status !== "รอตรวจสอบ" && hasPendingSlip(o) && orderBalance(o) > 0 && parkForSlipReview(o).status === "รอตรวจสอบ");

console.log(`สแกน ${data?.length ?? 0} ใบ · มีสลิปรอคนตรวจแต่ใบไม่อยู่รอตรวจสอบ ${hits.length} ใบ`);
for (const o of hits) {
  const pend = paymentEntries(o).filter((e) => e.state === "fail" || e.state === "pending");
  console.log(` • ${o.id} ${o.status} · ${o.customer} · ค้าง ${orderBalance(o).toLocaleString("th-TH")}/${orderTotal(o).toLocaleString("th-TH")} · สลิปรอตรวจ: ${pend.map((e) => `${e.label} ใบที่ ${e.n} (${e.at?.slice(0, 10) ?? "?"})`).join(", ")}`);
}
if (!ID) { console.log("\n(ระบุเลขใบ + --apply เพื่อพักใบนั้นเข้ารอตรวจสอบ)"); process.exit(0); }

const o = hits.find((x) => x.id === ID);
if (!o) throw new Error(`${ID} ไม่เข้าเงื่อนไข (ไม่มีสลิปรอตรวจ / อยู่รอตรวจสอบแล้ว / ไม่มียอดค้าง)`);
const next = withLog(
  parkForSlipReview(o),
  BY,
  "พักใบไว้รอตรวจสอบ (สลิปตรวจไม่ผ่าน)",
  `สลิปงวดหลัง/ใบเพิ่มที่ SlipOK ตกยังรอคนตรวจ — ใบจาก "${o.status}" ไปรอตรวจสอบ จำขั้นเดิมไว้ ตรวจเงิน/รับยอดเองแล้วกลับไป "${o.status}" เอง · งานยังอยู่คิวเดิม`
);
console.log(`\n${ID}: ${o.status} → ${next.status} (reopenedFrom ${next.reopenedFrom})`);
if (!APPLY) { console.log("(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-slip-review-park.json`, JSON.stringify(o, null, 1));
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");
