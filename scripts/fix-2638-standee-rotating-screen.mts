/**
 * 🩹 เติมบรรทัด "สกรีนกี่ด้าน: สกรีน 2 ด้าน" ให้รายการสแตนดี้หมุนได้ในออเดอร์ที่สั่งก่อนมีกลุ่มนี้
 * (พนักงานแจ้ง 25 ก.ย. 69 · OD-260923-2638 รายการที่ 3 — หน้าออเดอร์/ใบงานไม่บอกว่าสกรีนกี่ด้าน)
 *
 * ต้นตอ: สินค้า standee-rotating ไม่เคยมีกลุ่มตัวเลือกสกรีน (แก้แล้วด้วย standee-rotating-screen-sides-group.mts)
 * ใบที่สั่งไปก่อนจึงไม่มีบรรทัดนี้ — สินค้าระบุสเปค "ตัวสแตนดี้สกรีน 2 ด้าน" ในเรทที่ลูกค้าเลือก จึงเติมเป็น 2 ด้าน
 * เขียนผ่านประตู updateOrder (ไม่แตะจำนวน/ราคา → ไม่กระทบส่วนลด/การ์ด WIP) + ลงประวัติ
 *
 * รัน: node --conditions=react-server --import tsx scripts/fix-2638-standee-rotating-screen.mts [OD-…] [--apply]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order, type OrderItem } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = process.argv.find((a) => a.startsWith("OD-")) ?? "OD-260923-2638";
const APPLY = process.argv.includes("--apply");
const BY = "ระบบ (แก้ย้อนหลัง)";
const PRODUCT = "standee-rotating";
const G_SIZE = "ขนาดตัวสแตนดี้";
const G_SIDES = "สกรีนกี่ด้าน";
const VALUE = "สกรีน 2 ด้าน";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data, error } = await sb.from("orders").select("data").eq("id", ID).maybeSingle();
if (error || !data) throw new Error(`อ่าน ${ID} ไม่ได้: ${error?.message ?? "ไม่พบ"}`);
const existing = data.data as Order;

/** แทรกคีย์ใหม่ถัดจากขนาดตัว (ลำดับใน sel ไม่มีผลกับจอ — tidySpec เรียงเอง — แต่ให้อ่านง่ายตอน dump) */
function patchItem(it: OrderItem): OrderItem | null {
  if (it.productId !== PRODUCT) return null;
  const sel = it.sel ?? {};
  if (sel[G_SIDES]) return null;
  const nextSel: Record<string, string> = {};
  for (const [k, v] of Object.entries(sel)) {
    nextSel[k] = v;
    if (k === G_SIZE) nextSel[G_SIDES] = VALUE;
  }
  if (!nextSel[G_SIDES]) nextSel[G_SIDES] = VALUE;
  const line = `${G_SIDES}: ${VALUE}`;
  // ข้อความ selections คั่นด้วย " · " — แทรกบรรทัดใหม่ถัดจากท่อนขนาดตัว (ไม่มี = ขึ้นหน้าสุด)
  const parts = (it.selections ?? "").split(" · ").filter(Boolean);
  const at = parts.findIndex((s) => s.startsWith(`${G_SIZE}: `));
  parts.splice(at < 0 ? 0 : at + 1, 0, line);
  const selections = parts.join(" · ");
  return { ...it, sel: nextSel, selections };
}

let touched = 0;
const items = existing.items.map((it, i) => {
  const p = patchItem(it);
  if (!p) return it;
  touched++;
  console.log(`${APPLY ? "✏️" : "•"} รายการ #${i + 1} ${it.name} (qty ${it.qty})\n   sel += ${G_SIDES}: ${VALUE}\n   selections → ${p.selections}`);
  return p;
});
if (!touched) {
  console.log(`• ${ID} ไม่มีรายการ ${PRODUCT} ที่ขาดบรรทัด "${G_SIDES}" — ไม่ต้องแก้`);
  process.exit(0);
}
if (!APPLY) {
  console.log("\n(ดูอย่างเดียว — ใส่ --apply เพื่อบันทึก)");
  process.exit(0);
}

const toSave = withLog(
  { ...existing, items },
  BY,
  "เติมรายละเอียดรายการ",
  `${G_SIDES}: ${VALUE} — สแตนดี้หมุนได้ ${touched} รายการ (สินค้าเพิ่งมีกลุ่มนี้ 25 ก.ย. 69 · สเปคสินค้า = สกรีน 2 ด้าน ราคาไม่เปลี่ยน)`
);
const res = await updateOrder(sb as never, toSave, { prev: existing, by: BY });
if (res.error) throw new Error(`บันทึกไม่สำเร็จ: ${res.error.message}`);

// อ่านกลับเทียบ
const { data: back } = await sb.from("orders").select("data").eq("id", ID).single();
const b = back!.data as Order;
for (const it of b.items.filter((i) => i.productId === PRODUCT)) {
  if (it.sel?.[G_SIDES] !== VALUE) throw new Error(`อ่านกลับ: ${it.name} ไม่มี ${G_SIDES}`);
  if (!(it.selections ?? "").includes(`${G_SIDES}: ${VALUE}`)) throw new Error(`อ่านกลับ: selections ของ ${it.name} ไม่มีบรรทัดใหม่`);
}
console.log(`\n✓ ${ID} บันทึกแล้ว + อ่านกลับตรง (${touched} รายการ)`);
