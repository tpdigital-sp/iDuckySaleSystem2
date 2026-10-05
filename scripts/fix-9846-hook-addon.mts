/**
 * 🪝 OD-261005-9846 — บรรทัดค่าตะขอซ้ำ (5 ต.ค. 69)
 * พวงกุญแจอะคริลิค 6cm เรท 2 · ตะขอ AB + สีตะขอ AB6 → เดิมคิด 45+5+5 = 55 · ราคาถูก 45+5 = 50
 * unitPrice ถูกแก้เป็น 50 ไปแล้ว เหลือ addOns ยังมี "ตะขอ +5" ทำให้ตะกร้า/หน้าออเดอร์โชว์ +5 สองรอบ
 * ถอดบรรทัด addOn ของกลุ่ม "ตะขอ" (คงสีตะขอ AB +5) · ไม่แตะยอดเงิน
 * (ต้นเหตุแก้ที่สินค้าด้วย scripts/hook-ab-ac-double-extra.mjs)
 *
 *   node --conditions=react-server --import tsx scripts/fix-9846-hook-addon.mts           (ดูเฉย ๆ)
 *   node --conditions=react-server --import tsx scripts/fix-9846-hook-addon.mts --apply   (บันทึกจริง)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-261005-9846";
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
const idx = o.items.findIndex((it) => it.productId === "keyring-copy-copy" && it.addOns?.some((a) => a.label === "ตะขอ" && a.amount > 0));
if (idx < 0) { console.log("ไม่มีบรรทัดตะขอซ้ำแล้ว — อาจซ่อมไปแล้ว"); process.exit(0); }
const it = o.items[idx];
console.log("ก่อน:", it.unitPrice, JSON.stringify(it.addOns));
if (it.unitPrice !== 50) { console.log("unitPrice ไม่ใช่ 50 — สภาพไม่ตรงเคส หยุด"); process.exit(1); }

mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-hook-addon-fix.json`, JSON.stringify(o, null, 1));

const items = o.items.map((x, i) => (i === idx ? { ...x, addOns: x.addOns!.filter((a) => a.label !== "ตะขอ") } : x));
const BY = "ระบบ (แก้ย้อนหลัง)";
const next = withLog({ ...o, items }, BY, "🪝 ถอดบรรทัดค่าตะขอซ้ำ", "ตะขอ AB คิดเงินที่สีตะขอแล้ว (+฿5) · ราคาต่อชิ้นคงเดิม ฿50 (เรท ฿45 + สีตะขอ AB ฿5) · ยอดไม่เปลี่ยน");
console.log("หลัง:", next.items[idx].unitPrice, JSON.stringify(next.items[idx].addOns));
if (!APPLY) { console.log("\n(ดูเฉย ๆ — ใส่ --apply)"); process.exit(0); }
const res = await updateOrder(sb, next, { prev: o, by: BY });
if (res.error) throw new Error(res.error.message);
console.log("✅ บันทึกแล้ว");
