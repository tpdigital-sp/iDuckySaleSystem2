/**
 * 🏅 เติม "ส่วนลดระดับสมาชิก" ย้อนหลังให้ออเดอร์ที่ผูกผู้ติดต่อไว้แล้วแต่ยังไม่ได้ลด
 * (ใบที่พนักงานเปิดให้ทางไลน์ — customerId ว่าง ระบบเลยไม่เคยคิด % ของระดับให้ · พนักงานแจ้ง 14 ก.ย. 69 OD-260914-1542)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/order-member-tier-backfill.mts                 (ดูรายการ ไม่เขียน)
 *   npx tsx --tsconfig tsconfig.json scripts/order-member-tier-backfill.mts --apply         (เขียนจริง ทุกใบที่เข้าเกณฑ์)
 *   npx tsx --tsconfig tsconfig.json scripts/order-member-tier-backfill.mts OD-260914-1542 --apply
 *
 * กติกาเดียวกับที่เซิร์ฟเวอร์คิดตอนบันทึก (src/lib/server/order-member-tier.ts) — รันซ้ำได้ ใบที่ถูกแล้วไม่แตะ
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, withLog, type Order } from "../src/lib/admin-data";
import { mayAutoMemberTier, syncOrderMemberTier } from "../src/lib/server/order-member-tier";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = new Set(args.filter((a) => a.startsWith("OD-")));

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;

let changed = 0;
for (const r of rows ?? []) {
  const o = r.data as Order;
  if (only.size && !only.has(o.id)) continue;
  if (!o.contactId || !mayAutoMemberTier(o)) continue;
  const before = orderTotal(o);
  const next = await syncOrderMemberTier(sb as never, o);
  if (next === o) continue;
  changed++;
  const d = next.discount;
  console.log(
    `${apply ? "✏️" : "•"} ${o.id} · ${o.customer} (#${o.contactId}) · ${d ? `${d.label} −฿${d.amount}` : "เอาส่วนลดออก"}` +
      ` · ยอด ฿${before.toLocaleString()} → ฿${orderTotal(next).toLocaleString()}`
  );
  if (!apply) continue;
  const logged = withLog(
    next,
    "ระบบ",
    d ? "คิดส่วนลดระดับสมาชิก" : "เอาส่วนลดระดับสมาชิกออก",
    d ? `${d.label} −${d.amount.toLocaleString("th-TH")} บาท (เติมย้อนหลังให้ใบที่ผูกผู้ติดต่อไว้)` : "ผู้ติดต่อไม่มีระดับส่วนลดแล้ว"
  );
  const { error: upErr } = await sb.from("orders").update({ data: logged }).eq("id", o.id);
  if (upErr) console.log(`  ✗ เขียนไม่สำเร็จ: ${upErr.message}`);
}

console.log(`\n${changed === 0 ? "ไม่มีใบไหนต้องแก้" : `${changed} ใบ`}${apply || changed === 0 ? "" : " — ใส่ --apply เพื่อเขียนจริง"}`);
