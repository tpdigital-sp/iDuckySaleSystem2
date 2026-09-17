/**
 * 📋 ไล่หาใบที่ "แอดมินสั่งแบ่งส่งไว้ แต่ใบถูกปิดทั้งใบก่อนส่งรอบตามแผน" → รอบที่เหลือหลุดจากคิวปริ้น
 *
 *   npx tsx --tsconfig tsconfig.json scripts/ship-plan-closed-scan.mts                        (ดูเฉย ๆ ทุกใบ)
 *   npx tsx --tsconfig tsconfig.json scripts/ship-plan-closed-scan.mts OD-260911-5435 --apply (ซ่อมใบที่ระบุ)
 *
 * ทำไม (OD-260911-5435 · 17 ก.ย. 69): ใบ "มารับเอง" มีแผนแบ่งส่งรอบที่ 1 (5 จาก 50 ชิ้น) แต่ปุ่มส่งบางส่วนบังคับเลขพัสดุ
 * ทางเดียวที่ฝ่ายแพ็คกดได้คือ "แพ็คเสร็จ — รอลูกค้ามารับ" ซึ่งปิดทั้งใบเป็นจัดส่งแล้ว (packGate ไม่เคยดูแผนแบ่งส่ง)
 * → ไม่มี shipments[] · สถานะพ้น "กำลังผลิต" → คิวปริ้นไม่เห็นใบนี้อีก พนักงานแจ้ง "รอบที่ 2 ไม่มารอที่หน้ารอปริ้น"
 * ตั้งแต่ 17 ก.ย. 69 ด่าน packGate.planPending กันไว้แล้ว (ทั้งหน้าจอและ API) ตัวนี้ไว้เก็บใบเก่า
 *
 * --apply ซ่อมเฉพาะเคสที่ชัดเจน: ใบมารับเอง · กดแพ็คเสร็จแล้ว · ยังไม่มี shipments · ลูกค้ายังไม่ได้รับของรอบสุดท้าย (ไม่ใช่เสร็จสิ้น)
 *   → แปลง "แพ็คเสร็จ" ครั้งนั้นเป็นรอบแบ่งส่งที่ 1 ตามแผน (pickup) · ถอด packedAt · สถานะกลับเป็นกำลังผลิต
 * ⚠️ ไม่ส่งไลน์ ไม่แตะยอดเงิน · เคสอื่น (ใบส่งพัสดุที่ยิงเลขปิดใบไปแล้ว) แค่รายงาน ให้แอดมินดูเองว่าของออกไปครบหรือยัง
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { nextPlannedRound, pickupRoundRef, proofShipStates, shipmentQty, withLog, type Order, type Shipment } from "../src/lib/admin-data";
import { isPickupOrder } from "../src/lib/ship-label";

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
const BY = "ซ่อมใบแบ่งส่งที่ถูกปิดทั้งใบ (สคริปต์)";

const { data, error } = await sb.from("orders").select("id,data").not("data->shipPlan", "is", null);
if (error) {
  console.error(error.message);
  process.exit(1);
}
const rows = ((data ?? []) as { id: string; data: Order }[])
  .filter((r) => (only.size ? only.has(r.id) : true))
  .filter((r) => (r.data?.shipPlan?.length ?? 0) > 0)
  .sort((a, b) => (a.id < b.id ? 1 : -1));

let bad = 0;
let fixed = 0;
for (const r of rows) {
  const o = r.data;
  const closed = !!(o.tracking ?? "").trim() || !!o.packedAt || o.status === "จัดส่งแล้ว" || o.status === "เสร็จสิ้น";
  if (!closed) continue;
  // มองใบเหมือนยังไม่ปิด → แผนรอบไหนยังไม่มีรอบส่งจริงรองรับ
  const open: Order = { ...o, tracking: "", packedAt: undefined };
  const next = nextPlannedRound(open);
  if (!next) continue;
  let qty = 0;
  next.qty.forEach((q) => (qty += q));
  let remaining = 0;
  proofShipStates(open).forEach((st) => (remaining += st.remaining));
  if (qty >= remaining) continue; // แผนรอบนั้นคือของทั้งหมดที่เหลือ = ปิดใบถูกแล้ว
  bad++;
  const pickup = isPickupOrder(o);
  console.log(
    `${r.id} · ${o.status} · ${pickup ? "มารับเอง" : `ส่งพัสดุ ${o.tracking ?? "-"}`} · แผนรอบที่ ${next.index + 1} (${qty} ชิ้น) ยังไม่มีรอบส่งจริง · ของทั้งใบที่ยังไม่ออกตามระบบ ${remaining} ชิ้น · ส่งแล้ว ${(o.shipments ?? []).length} รอบ`
  );
  if (!apply || !only.has(r.id)) continue;
  if (!pickup || !o.packedAt || (o.shipments?.length ?? 0) > 0 || o.status === "เสร็จสิ้น" || next.index !== 0) {
    console.log("   ⏭ ไม่ใช่เคสที่ซ่อมอัตโนมัติได้ (ต้องเป็นใบมารับเองที่กดแพ็คเสร็จ ยังไม่มีรอบส่ง และยังไม่เสร็จสิ้น) — ให้แอดมินดูเอง");
    continue;
  }
  const plan = o.shipPlan![0];
  const sh: Shipment = {
    tracking: pickupRoundRef(1),
    at: o.packedAt.at,
    by: o.packedAt.by,
    proofs: plan.proofs,
    ...(plan.note ? { note: plan.note } : {}),
    pickup: true,
  };
  const { packedAt: _drop, ...rest } = o;
  void _drop;
  const fixedOrder = withLog(
    { ...rest, shipments: [sh], status: "กำลังผลิต", savedAt: new Date().toISOString() } as Order,
    BY,
    "🏪 แก้เป็นแพ็คเสร็จบางส่วน รอบที่ 1 — ใบยังไม่ปิด",
    `เดิมกด “แพ็คเสร็จ — รอลูกค้ามารับ” (${o.packedAt.by}) ปิดทั้งใบ ทั้งที่แผนแบ่งส่งรอบที่ 1 มีแค่ ${shipmentQty(sh)} ชิ้น · เหลือ ${remaining - shipmentQty(sh)} ชิ้นยังไม่ได้ส่ง → สถานะกลับเป็นกำลังผลิต ใบกลับเข้าคิวปริ้น “ใบปะหน้ารอบถัดไป”`
  );
  const { error: e } = await sb.from("orders").update({ data: fixedOrder }).eq("id", r.id);
  if (e) console.log(`   ❌ บันทึกไม่สำเร็จ: ${e.message}`);
  else {
    fixed++;
    console.log("   ✅ ซ่อมแล้ว — รอบที่ 1 = แพ็คเสร็จบางส่วน (มารับเอง) · สถานะ กำลังผลิต");
  }
}

console.log(`\nใบที่มีแผนแบ่งส่ง ${rows.length} ใบ · ถูกปิดทั้งใบก่อนส่งตามแผน ${bad} ใบ${apply ? ` · ซ่อมแล้ว ${fixed} ใบ` : bad ? " (ระบุเลข OD + --apply เพื่อซ่อม)" : ""}`);
