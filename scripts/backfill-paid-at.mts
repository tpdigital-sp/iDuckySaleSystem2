/**
 * 💰 เติม Order.paidAt (เวลาที่ใบเข้าขั้น "ชำระแล้ว" ครั้งแรก) ให้ใบเก่าที่เกิดก่อนประตู order-write จะประทับให้เอง (7 ต.ค. 69)
 *
 * ทำไม: รายงานยอดขาย (/admin/reports) นับใบชำระแล้วตาม "วันเงินเข้า" ไม่ใช่วันที่บนใบ (เจ้าของร้านกำหนด)
 *       ใบที่ไม่มี paidAt จะถอยไปใช้วันที่บนใบ → ใบ ก.ย. ที่โอน ต.ค. ไปโผล่เดือน ก.ย. ผิดเดือน
 *
 * แหล่งเวลา (เรียงตามความน่าเชื่อ):
 *   1. log "เปลี่ยนสถานะ … → <สถานะ ≥ ชำระแล้ว>" รายการแรก · หรือ "ยืนยันการชำระเงิน" / "นับว่าชำระครบ…" รายการแรก
 *   2. deposit.firstPaidAt (ใบมัดจำ)
 *   3. paidReportedAt (ลูกค้ากดแจ้งโอน — ใกล้เคียงวันเงินเข้า)
 *   4. วันที่บนใบ (ใบที่ไม่มีประวัติเลย เช่นนำเข้าจาก FlowAccount แบบชำระแล้ว)
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-paid-at.mts            # dry-run
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-paid-at.mts --apply    # เขียนจริง (เฉพาะใบที่ยังไม่มี paidAt)
 *
 * เขียนตรงที่ตาราง orders ตั้งใจ (สคริปต์ซ่อมข้อมูล ด่าน check-order-writes ดูแค่ src/) · เติมฟิลด์เดียว ไม่แตะอย่างอื่น · รันซ้ำได้
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { isPaidStatus, type Order } from "../src/lib/admin-data";
import { parseThaiDate } from "../src/lib/admin-dash";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] as [string, string];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");

const orders: Order[] = [];
for (let p = 0; p < 40; p++) {
  const { data, error } = await sb.from("orders").select("data").order("created_at", { ascending: true }).range(p * 1000, p * 1000 + 999);
  if (error) throw new Error(error.message);
  const chunk = (data ?? []).map((r) => r.data as Order).filter(Boolean);
  orders.push(...chunk);
  if (chunk.length < 1000) break;
}

/** หาเวลาที่ใบเข้าขั้นชำระแล้วจากประวัติ — คืน [ISO, แหล่ง] */
function derivePaidAt(o: Order): [string, string] | null {
  for (const l of o.log ?? []) {
    if (!l.at) continue;
    if (l.action === "เปลี่ยนสถานะ") {
      const to = (l.detail ?? "").split("→").pop()?.trim() ?? "";
      if (isPaidStatus(to.split(/\s/)[0])) return [l.at, "log:เปลี่ยนสถานะ"];
    } else if (l.action.includes("ยืนยันการชำระเงิน") || l.action.startsWith("นับว่าชำระครบ")) return [l.at, `log:${l.action.slice(0, 20)}`];
  }
  if (o.deposit?.firstPaidAt) return [o.deposit.firstPaidAt, "deposit.firstPaidAt"];
  if (o.paidReportedAt) return [o.paidReportedAt, "paidReportedAt"];
  const d = parseThaiDate(o.date);
  if (d) return [new Date(d.getTime() - 7 * 3600_000).toISOString(), "วันที่บนใบ"];
  return null;
}

const bySource: Record<string, number> = {};
const todo: { o: Order; at: string; src: string }[] = [];
let havePaidAt = 0, notPaid = 0, noSource = 0;
for (const o of orders) {
  if (!isPaidStatus(o.status)) { notPaid++; continue; }
  if (o.paidAt) { havePaidAt++; continue; }
  const r = derivePaidAt(o);
  if (!r) { noSource++; console.log("  ⚠️ หาเวลาไม่ได้:", o.id, o.status, o.date); continue; }
  bySource[r[1]] = (bySource[r[1]] ?? 0) + 1;
  todo.push({ o, at: r[0], src: r[1] });
}
console.log(`ทั้งหมด ${orders.length} ใบ · ยังไม่ชำระ/ยกเลิก ${notPaid} · มี paidAt แล้ว ${havePaidAt} · ต้องเติม ${todo.length} · หาไม่ได้ ${noSource}`);
console.log("แหล่งเวลา:", bySource);
// ตัวอย่างใบที่วันเงินเข้าต่างเดือนกับวันที่บนใบ
const diffMonth = todo.filter(({ o, at }) => { const d = parseThaiDate(o.date); return d && d.toISOString().slice(0, 7) !== new Date(at).toISOString().slice(0, 7); });
console.log(`ใบที่เดือนเงินเข้าต่างจากเดือนบนใบ: ${diffMonth.length} ใบ`, diffMonth.slice(0, 5).map(({ o, at, src }) => `${o.id} ${o.date} → ${at.slice(0, 10)} (${src})`));

if (!apply) { console.log("\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }
let ok = 0, fail = 0;
for (const { o, at } of todo) {
  // อ่านก้อนล่าสุดก่อนเขียน กันทับการแก้ที่เพิ่งเกิดระหว่างรันสคริปต์
  const { data } = await sb.from("orders").select("data").eq("id", o.id).maybeSingle();
  const cur = (data?.data as Order | undefined);
  if (!cur || cur.paidAt) continue;
  const { error } = await sb.from("orders").update({ data: { ...cur, paidAt: at } }).eq("id", o.id);
  if (error) { fail++; console.log("  ✗", o.id, error.message); } else ok++;
}
console.log(`\n✅ เขียนแล้ว ${ok} ใบ · ผิดพลาด ${fail}`);
