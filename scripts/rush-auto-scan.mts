/**
 * 🔥 ไล่ดูว่าใบไหน "ควรเป็นงานเร่ง" ตามกติกาวันใช้งานกระชั้น (lib/rush-auto.ts)
 *
 *   npm run scan:rush           ดูเฉย ๆ (ไม่แตะฐาน)
 *
 * ตั้งแต่ 21 ก.ย. 69 ระบบติ๊กธงนี้ให้เองที่ประตูเขียนออเดอร์ + กวาดซ้ำทุกเช้า (api/cron/rush-sweep)
 * ตัวนี้ไว้ส่องด้วยตาว่ากติกาให้ผลตรงกับที่ทีมคิดไหม ก่อน/หลังปล่อยขึ้นเว็บจริง
 *
 * ⚠️ อ่านอย่างเดียว — ไม่เขียนฐาน ไม่แจ้งไลน์ (จะติ๊กจริงให้ใบเก่า ปล่อยให้ cron ทำตอนเช้า)
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Order } from "../src/lib/admin-data";
import { applyAutoRush, autoRushReason, workingDaysUntil } from "../src/lib/rush-auto";
import { shortThaiDay, todayBkkYmd } from "../src/lib/ship-date";

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

const { data, error } = await sb.from("orders").select("id,data").not("data->>useByDate", "is", null);
if (error) {
  console.error(error.message);
  process.exit(1);
}
const today = todayBkkYmd();
const orders = (data ?? []).map((r) => r.data as Order);
const on: string[] = [];
const off: string[] = [];
const already: string[] = [];
for (const o of orders) {
  const r = applyAutoRush(o, today);
  const line = `${o.id}  ${(o.customer || "-").slice(0, 18).padEnd(18)} ${o.status.padEnd(12)} ใช้งาน ${shortThaiDay(o.useByDate!)} (เหลือ ${workingDaysUntil(o.useByDate!, today)} วันทำการ)${o.placedBy ? ` · พนักงาน ${o.placedBy} สั่งแทน` : " · ลูกค้าสั่งเอง"}`;
  if (r.turned === "on") on.push(line);
  else if (r.turned === "off") off.push(line);
  else if (o.rush) already.push(`${line}${o.rushManual ? ` · ${o.rushManual.on ? "คนติ๊กเอง" : "คนยกเลิกเอง"} (${o.rushManual.by})` : o.rushAuto ? " · ระบบติ๊กให้" : " · ติ๊กไว้แต่เดิม"}`);
}
console.log(`📅 วันนี้ ${shortThaiDay(today)} · ใบที่มีวันใช้งานทั้งหมด ${orders.length} ใบ\n`);
console.log(`🔥 จะถูกติ๊กเป็นงานเร่ง ${on.length} ใบ\n${on.join("\n") || "  (ไม่มี)"}\n`);
console.log(`⬇️  จะถูกปลดธง (วันใช้งานถูกเลื่อนออกไปแล้ว) ${off.length} ใบ\n${off.join("\n") || "  (ไม่มี)"}\n`);
console.log(`✅ ติ๊กงานเร่งอยู่แล้ว ${already.length} ใบ\n${already.join("\n") || "  (ไม่มี)"}`);
const openWithout = orders.filter((o) => !o.rush && !autoRushReason(o, today) && o.status !== "ยกเลิก" && o.status !== "เสร็จสิ้น" && o.status !== "จัดส่งแล้ว");
console.log(`\nℹ️ ใบเปิดอยู่ที่ยังไม่เข้าเกณฑ์เร่ง ${openWithout.length} ใบ`);
