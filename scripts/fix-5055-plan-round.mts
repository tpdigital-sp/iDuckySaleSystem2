/**
 * 🚚 ซ่อม OD-260915-5055 — แผนแบ่งส่งรอบที่ 1 แต่ใบถูกปิดทั้งใบ (พนักงานแจ้ง 5 ต.ค. 69 "ยังต้องส่งอีกรอบ 25A3")
 *
 * ต้นเรื่อง: สั่ง 50 แผ่น A3 (2 ลาย ลายละ 25 A3 · 1 แผ่น = 2 ชิ้น = 100 ชิ้น) · 18 ก.ย. ToEy ตั้งแผนรอบ 1 = 50/100 ชิ้น
 * แล้วกราฟฟิกเปลี่ยนรูปเป็นไฟล์ "25A3" (50 ชิ้น · ลายที่ 2 ยังไม่อัป) → ระบบนับของทั้งใบจากรูป = 50 = รอบ 1 คือรอบสุดท้าย
 * → ด่านแผน (packGate.planPending) ไม่ล็อก · 22 ก.ย. ยิง EQ226638325TH ช่องเลขพัสดุปกติ → ปิดทั้งใบ → 25 ก.ย. ปิดงานอัตโนมัติ
 * (ด่านแก้แล้ว: unproofedQty ใน admin-data.ts)
 *
 * ทำอะไร: ย้าย EQ226638325TH เป็นรอบแบ่งส่งที่ 1 ตามแผน · ถอดเลขพัสดุของใบ · สถานะกลับ "กำลังผลิต" (รอบหลังรอลายที่ 2)
 * เงียบ ๆ ไม่ยิงไลน์ · ไม่แตะยอดเงิน (ค่าส่งเพิ่ม 50 บาทของรอบ 2 เก็บไปแล้ว)
 *
 *   node --conditions=react-server --import tsx scripts/fix-5055-plan-round.mts            (ดูเฉย ๆ)
 *   node --conditions=react-server --import tsx scripts/fix-5055-plan-round.mts --apply    (บันทึกจริง)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { pendingPlanRound, isPartiallyShipped, shipmentQty, withLog, type Order, type Shipment } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260915-5055";
const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error) throw error;
const o = data!.data as Order;
const tracking = (o.tracking ?? "").trim();
const plan = o.shipPlan?.[0];
if (!tracking || (o.shipments?.length ?? 0) > 0 || !plan) {
  console.log("สภาพใบไม่ตรงเคส (ไม่มีเลขพัสดุ/มีรอบแบ่งส่งแล้ว/ไม่มีแผน) — อาจซ่อมไปแล้ว");
  process.exit(0);
}
const shotAt = [...(o.log ?? [])].reverse().find((l) => l.action === "บันทึกเลขพัสดุ" && (l.detail ?? "").includes(tracking));
console.log("ก่อนแก้ :", o.status, "| เลขพัสดุใบ:", tracking, "| แผน:", plan.proofs.map((p) => `${p.qty}/${p.ofQty}`).join(", "));

mkdirSync("backups", { recursive: true });
const bak = `backups/${ID}-before-plan-round-fix.json`;
writeFileSync(bak, JSON.stringify(o, null, 1));
console.log("สำรองไว้ที่", bak);

const round: Shipment = {
  tracking,
  at: shotAt?.at ?? new Date().toISOString(),
  by: shotAt?.by ?? "แอดมิน",
  proofs: plan.proofs.map((p) => ({ ...p })),
  ...(plan.note ? { note: plan.note } : {}),
};
const BY = "ระบบ (แก้ย้อนหลัง)";
let next: Order = { ...o, shipments: [round], tracking: undefined, status: "กำลังผลิต" };
next = withLog(
  next,
  BY,
  "🚚 เลขพัสดุที่ยิงไปคือรอบแบ่งส่งที่ 1 — เปิดใบกลับ",
  `${tracking} (${shipmentQty(round)} ชิ้น ตามแผนรอบที่ 1) · ลูกค้าสั่ง 50 แผ่น A3 = 100 ชิ้น ยังค้างลายที่ 2 (25 A3) · ใบถูกปิดทั้งใบเพราะรูปแบบงานมีแค่ลายแรก ระบบเลยนับรอบ 1 เป็นรอบสุดท้าย · ไม่แจ้งไลน์`
);
next = withLog(next, BY, "กำลังผลิต", "เสร็จสิ้น → กำลังผลิต · รอกราฟฟิกอัปแบบลายที่ 2 แล้วส่งรอบสุดท้าย");
console.log("หลังแก้ :", next.status, "| เลขพัสดุใบ:", next.tracking ?? "—", "| รอบแบ่งส่ง:", next.shipments!.length, "| ส่งบางส่วน:", isPartiallyShipped(next), "| แผนค้าง:", pendingPlanRound(next));

if (!APPLY) {
  console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)");
  process.exit(0);
}
const res = await updateOrder(sb, next, { prev: o, by: BY });
if (res.error) throw new Error(res.error.message);
console.log("✅ บันทึกแล้ว");
