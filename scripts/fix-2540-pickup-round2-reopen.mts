/**
 * 🏪↩ OD-261007-2540 (20 ต.ค. 69) — ใบมารับเองแบ่งส่ง ถูกปิดทั้งใบหลังบันทึกรอบที่ 1 เพียง 2 นาที
 *
 * 06:56 บันทึก "แพ็คเสร็จบางส่วน — รอลูกค้ามารับ" รอบที่ 1 (300/505 ชิ้น) ย้อนหลัง (ลูกค้ารับรอบ 1 ไปก่อนแล้ว)
 * 06:58 กด "📦 แพ็คเสร็จ — รอลูกค้ามารับ" + 07:02 "ลูกค้ามารับของแล้ว — ปิดงาน" ตั้งใจปิดงานรอบ 1
 *   แต่ปุ่มนี้คือ "รอบสุดท้าย" = ปิดทั้งใบ (ของที่เหลือ 205 ชิ้นยังไม่ได้ไป) → ใบเป็นเสร็จสิ้น · หลุดคิวปริ้น "ใบปะหน้ารอบถัดไป"
 *   ปริ้นซ้ำ 11:38 ได้แต่ใบปะหน้าแบบใบปิดแล้ว (ไม่มีตรา "กล่องรอบที่ 2 (รอบสุดท้าย)")
 *
 * แก้: ถอด packedAt + pickedUp · สถานะ เสร็จสิ้น → กำลังผลิต (ขั้นก่อนกดปิด) · รอบที่ 1 + ภาพ/ตรวจนับคงเดิม · ไม่ส่งไลน์ · ไม่แตะยอดเงิน
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-2540-pickup-round2-reopen.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { isPartiallyShipped, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-261007-2540";
const BY = "ระบบ (แก้ย้อนหลัง)";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const o = data.data as Order;
if ((o.shipments?.length ?? 0) !== 1 || !o.packedAt || o.status !== "เสร็จสิ้น") {
  console.log("ใบไม่ใช่สภาพที่คาดไว้แล้ว (แก้ไปแล้ว/มีคนแตะต่อ) — ไม่ทำอะไร", { status: o.status, packedAt: o.packedAt, rounds: o.shipments?.length });
  process.exit(0);
}
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-pickup-round2-reopen.json`, JSON.stringify(o, null, 1));

const { packedAt, pickedUp, ...rest } = o;
const next = withLog(
  { ...rest, status: "กำลังผลิต" } as Order,
  BY,
  "🏪↩ เปิดใบกลับ — รอบที่ 2 (รอบสุดท้าย) ยังไม่ได้แพ็ค",
  `กด “แพ็คเสร็จ — รอลูกค้ามารับ” (${packedAt!.by} ${packedAt!.at}) + “ลูกค้ามารับของแล้ว” (${pickedUp?.by ?? "-"}) ตั้งใจปิดรอบที่ 1 แต่ปุ่มนี้ปิดทั้งใบ · ของที่เหลือ 205 ชิ้นยังไม่ได้ไป → ถอดแพ็คเสร็จ/รับของแล้ว · เสร็จสิ้น → กำลังผลิต · รอบที่ 1 (300 ชิ้น) คงเดิม · ใบกลับเข้าคิวปริ้น “ใบปะหน้ารอบถัดไป”`
);
console.log(`สถานะ ${o.status} → ${next.status} · isPartiallyShipped ${isPartiallyShipped(o)} → ${isPartiallyShipped(next)}`);
if (!APPLY) {
  console.log("(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");
