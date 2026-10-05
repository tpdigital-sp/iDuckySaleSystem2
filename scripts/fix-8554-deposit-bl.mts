/**
 * 🩹 OD-261002-8554 (5 ต.ค. 69) — ลูกค้าเปลี่ยนเป็นบิลมัดจำ · วาง BL002106 (ใบยอดคงเหลือ หักมัดจำ BL002105) ในกล่องใบกำกับภาษี
 * กล่องเดิมเอา VAT ของงวดเดียว (934.50) ไปตั้งทั้งใบงาน → ยอดเต็ม 27,634.50 (ที่ถูก 28,569) และไม่เปิดโหมดมัดจำ
 * ซ่อม: VAT เต็ม 1,869 (26,700 × 7%) + deposit 14,284.50 (= 13,350 + VAT 934.50 ตาม BL002105) · สถานะรอชำระเงินคงเดิม ไม่ส่งไลน์
 *
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-8554-deposit-bl.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, orderBalance, amountDueNow, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-261002-8554";
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
console.log(`ก่อนแก้: ${o.status} · ยอด ${orderTotal(o)} · VAT ${o.vat?.amount} · deposit ${JSON.stringify(o.deposit)} · paid ${o.paidTotal ?? 0}`);
if (o.status !== "รอชำระเงิน" || o.paidTotal || o.deposit?.firstPaidAt || o.taxInvoice?.docNo !== "BL002106") throw new Error("สภาพใบไม่ใช่แบบที่คาดไว้ — หยุด");

const fixedVat = { rate: 7, amount: 1869 };
const depAmt = 14284.5;
let next: Order = { ...o, vat: fixedVat, deposit: { amount: depAmt } };
if (Math.abs(orderTotal(next) - 28569) >= 0.01) throw new Error(`ยอดหลังแก้ ${orderTotal(next)} ไม่เท่า 28,569 — หยุด`);
next = withLog(next, BY, "ภาษีตามเอกสาร FlowAccount", `VAT ฿934.50 → ฿1,869 (VAT 934.50 เป็นของงวดคงเหลือใน BL002106 ไม่ใช่ทั้งงาน) → ยอดรวม ฿28,569`);
next = withLog(next, BY, "เปิดโหมดมัดจำตามเอกสาร FlowAccount", `งวดแรก ฿14,284.50 (ใบแจ้งหนี้มัดจำ BL002105 = 13,350 + VAT 934.50) · งวดหลัง ฿14,284.50 ตาม BL002106 จากยอดเต็ม ฿28,569`);
console.log(`หลังแก้: ยอด ${orderTotal(next)} · ค้าง ${orderBalance(next)} · ต้องโอนตอนนี้ ${amountDueNow(next)}`);
if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-deposit-bl.json`, JSON.stringify(o, null, 1));
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");
