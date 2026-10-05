/**
 * 🩹 OD-261005-7691 (5 ต.ค. 69) — ใบเสนอราคา 2 ใบ (QT010827 หลัก · QT010828 สติ๊กเกอร์สะท้อนแสงสั่งเพิ่ม 2 แผ่น)
 * แนบ QT010828 เป็น "บิลเพิ่ม" ตอนนั้นมีแต่แบบเก็บเงิน → เข้าเป็น charges ฿299.60 รายการไม่เข้าใบงาน
 * ซ่อม: แปลง charge → รายการสินค้า (extraDoc) ราคาตามใบ + VAT ตามใบเข้ายอดออเดอร์ · ยอดรวมต้องเท่าเดิม 898.80 · ไม่ส่งไลน์ (แจ้งไปแล้ว)
 *
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-7691-extra-items.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, flowAccountGap, withLog, type Order, type OrderItem } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";
import { fetchFlowAccountDoc } from "../src/lib/server/flowaccount";

const ID = "OD-261005-7691";
const DOC = "QT010828";
const CHARGE = "cmuv2y1rn36ju";
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
const ex = (o.flowAccountExtras ?? []).find((x) => x.docNo === DOC);
const ch = (o.charges ?? []).find((c) => c.id === CHARGE);
console.log(`ก่อนแก้: ${o.status} · ยอด ${orderTotal(o)} · VAT ${JSON.stringify(o.vat)} · gap ${flowAccountGap(o)} · items ${o.items.length} · charge ${ch?.amount}`);
if (!ex || !ch || ex.chargeId !== CHARGE || ex.items || o.paidTotal || o.items.some((it) => it.extraDoc)) throw new Error("สภาพใบไม่ใช่แบบที่คาดไว้ — หยุด");
if (!o.vat?.rate) throw new Error("ใบหลักไม่มี VAT — หยุด");

const doc = await fetchFlowAccountDoc(ex.url);
const work = doc.items.filter((it) => it.name.trim() && it.qty > 0);
console.log("รายการในเอกสาร:", work);
const items: OrderItem[] = work.map((it) => ({
  productId: "special-item",
  name: it.name.trim(),
  selections: (it.detail ?? "").trim(),
  qty: Math.round(it.qty),
  unitPrice: it.unitPrice,
  extraDoc: DOC,
}));
const r2 = (n: number) => Math.round(n * 100) / 100;
let next: Order = {
  ...o,
  items: [...o.items, ...items],
  vat: { ...o.vat, amount: r2(o.vat.amount + (ex.vat ?? 0)) },
  charges: (o.charges ?? []).filter((c) => c.id !== CHARGE),
  flowAccountExtras: (o.flowAccountExtras ?? []).map((x) => (x.docNo === DOC ? { ...x, chargeId: undefined, items: items.length } : x)),
};
if (!next.charges?.length) delete next.charges;
if (Math.abs(orderTotal(next) - orderTotal(o)) >= 0.01) throw new Error(`ยอดหลังแก้ ${orderTotal(next)} ≠ ${orderTotal(o)} — หยุด`);
if (flowAccountGap(next) !== 0) throw new Error(`ยอดไม่ตรงบิล (gap ${flowAccountGap(next)}) — หยุด`);
next = withLog(
  next,
  BY,
  `บิลเพิ่ม ${DOC} — เพิ่ม ${items.length} รายการเข้าใบงาน`,
  `${items.map((it) => `${it.name} ×${it.qty} @${it.unitPrice}`).join(" · ")} · เดิมแนบเป็นค่าบริการเพิ่ม ฿${ch.amount} (รายการไม่เข้าใบงาน) → แปลงเป็นรายการ + VAT ${o.vat.amount} → ${next.vat!.amount} · ยอดรวมเท่าเดิม ${orderTotal(next)} บาท`
);
console.log(`หลังแก้: ยอด ${orderTotal(next)} · VAT ${next.vat!.amount} · gap ${flowAccountGap(next)} · items ${next.items.length}`);
if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-extra-items.json`, JSON.stringify(o, null, 1));
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✓ บันทึกแล้ว");
