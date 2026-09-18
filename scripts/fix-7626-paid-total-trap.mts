/**
 * 🩹 ซ่อม OD-260914-7626 (QT010635) — paidTotal โดนเขียนทับเป็น 50 (18 ก.ย. 69)
 *
 * เรื่องเดิม: 18 ก.ย. 09:53 Pang เก็บเพิ่มค่าส่ง ฿50 (ยอดบิล 11,877 → 11,927 ค้าง 50 ถูกแล้ว) → แนบสลิป ฿50 ตรวจตก (ไฟล์ซ้ำใบ OD-260917-2152)
 * → 09:54 เปลี่ยนสถานะเอง รอชำระเงิน → รอตรวจสอบ → ใบเข้ากับดัก paidTotalIsReportedOnly (สลิปช่องหลัก K BIZ ไม่มี QR ไม่เคย pass)
 * → 10:12 champ กด 💰 รับยอด ฿50 เอง → paidSoFar = 0 → paidTotal = 50 → ค้าง 11,877 (เงิน 11,877 ที่ champ ยืนยันไว้ 16 ก.ย. หายจากบัญชี)
 * ซ่อม: paidTotal 50 → ยอดบิลเต็ม 11,927 · สถานะ รอตรวจสอบ → อนุมัติแบบ (ส่งผลิตแล้ว 17 ก.ย.) · ไม่ยิงไลน์ · โค้ดอุดกับดักแล้ว (paidTotalEverConfirmed)
 *
 * รัน: npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/fix-7626-paid-total-trap.mts [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { orderTotal, orderBalance, paidSoFar, paidTotalIsReportedOnly, withLog, type Order } from "../src/lib/admin-data";
import { updateOrder } from "../src/lib/server/order-write";

const ID = "OD-260914-7626";
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
mkdirSync("backups", { recursive: true });
writeFileSync(`backups/${ID}-before-paid-total-trap-fix.json`, JSON.stringify(o, null, 1));

const bill = orderTotal(o);
console.log(`${ID} ก่อนแก้ : ${o.status} · ยอดบิล ${bill} · paidTotal ${o.paidTotal} · paidSoFar ${paidSoFar(o)} · reportedOnly ${paidTotalIsReportedOnly(o)} · ค้าง ${orderBalance(o)}`);
if (o.status !== "รอตรวจสอบ" || o.paidTotal !== 50) throw new Error("สภาพใบไม่ใช่แบบที่คาดไว้ (อาจมีคนซ่อมไปแล้ว) — หยุด");
if (bill !== 11927) throw new Error(`ยอดบิล ${bill} ไม่ใช่ 11,927 — หยุด`);

let next: Order = { ...o, status: "อนุมัติแบบ", reopenedFrom: undefined, paidTotal: bill };
next = withLog(next, BY, "🩹 ซ่อมยอดชำระที่ถูกเขียนทับ", `ยอดชำระ 50 → ${bill.toLocaleString("th-TH")} (11,877 ที่ยืนยันไว้ 16 ก.ย. + ค่าส่งเพิ่ม 50 ที่ champ รับยอด 18 ก.ย.) · สถานะ รอตรวจสอบ → อนุมัติแบบ (ส่งผลิตแล้ว 17 ก.ย.) · ต้นเหตุ: เปลี่ยนสถานะกลับรอตรวจสอบด้วยมือแล้วระบบมองยอดเดิมเป็นแค่ยอดแจ้งโอน — อุดโค้ดแล้ว ไม่แจ้งไลน์`);
console.log(`${ID} หลังแก้ : ${next.status} · paidTotal ${next.paidTotal} · ค้าง ${orderBalance(next)}`);

if (!APPLY) { console.log("\n(ลองดูเฉย ๆ — ใส่ --apply เพื่อบันทึกจริง)"); process.exit(0); }
const r = await updateOrder(sb, next, { prev: o, by: BY });
if (r.error) throw new Error(r.error.message);
console.log("✅ บันทึกแล้ว");
