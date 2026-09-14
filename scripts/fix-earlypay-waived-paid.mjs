// ซ่อมใบที่ติ๊ก "ลูกค้าไม่รับส่วนลดโอนไว" ไว้ก่อนมีตัวนับเงินโอนเกิน → ยอดค้างผี ฿5/฿10 ทั้งที่ลูกค้าโอนครบ
//   node scripts/fix-earlypay-waived-paid.mjs           → ดูอย่างเดียว
//   node scripts/fix-earlypay-waived-paid.mjs --apply   → เขียนจริง
// ทำไม (OD-260908-3989 · 14 ก.ย. 69): สลิปผ่านตอนยอดยังลด ระบบนับเข้า paidTotal แค่ "ยอดค้างตอนนั้น" (3,740)
//   ส่วนที่ลูกค้าโอนเกิน (฿10) ค้างนอกบัญชี พอติ๊กไม่รับส่วนลด ยอดรวมกลับเป็น 3,750 → โชว์ค้าง ฿10
//   ตอนนี้ PATCH /api/admin/orders เติมให้ตอนติ๊กแล้ว (earlyPay.waiveCredit) — ใบที่ติ๊กไปก่อนหน้าซ่อมด้วยสคริปต์นี้
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");
const r2 = (n) => Math.round(n * 100) / 100;

/** เงินที่สลิปยืนยันแล้วแต่ยังไม่ถูกนับเข้า paidTotal — กติกาเดียวกับ uncreditedReceived ใน src/lib/admin-data.ts */
function uncreditedReceived(o) {
  let slips = 0;
  const add = (v, counted) => { if (counted && Number(v?.amount) > 0) slips += Number(v.amount); };
  add(o.slipVerify, o.slipVerify?.status === "pass" || Number(o.slipVerify?.credited) > 0);
  const b = o.deposit?.balanceVerify;
  add(b, b?.status === "pass" || Number(b?.credited) > 0);
  for (const p of o.payments ?? []) add(p.verify, Number(p.credited) > 0);
  return Math.max(0, r2(slips - Math.max(0, Number(o.paidTotal) || 0)));
}

const { data, error } = await sb.from("orders").select("id,data");
if (error) throw error;
let fixed = 0;
for (const row of data ?? []) {
  const o = row.data ?? {};
  const e = o.earlyPay;
  if (!e?.waivedAt || !(e.amount > 0) || o.paidTotal == null) continue;
  if (e.waiveCredit != null) continue; // เติมไปแล้ว
  const credit = Math.min(Math.max(0, e.amount), uncreditedReceived(o));
  if (!(credit > 0)) { console.log(`— ${row.id} ไม่มีเงินโอนเกิน (ค้างจริง)`); continue; }
  const next = {
    ...o,
    paidTotal: r2((Number(o.paidTotal) || 0) + credit),
    earlyPay: { ...e, waiveCredit: credit },
    log: [...(o.log ?? []), { at: new Date().toISOString(), by: "ระบบ", action: "นับเงินที่โอนเกินเข้ายอดชำระ (ไม่รับส่วนลดโอนไว)", detail: `ซ่อมย้อนหลัง — ลูกค้าโอนเกินยอดที่เรียกเก็บตอนนั้น ${credit.toLocaleString("th-TH")} บาท` }],
  };
  console.log(`✔ ${row.id} รับแล้ว ${o.paidTotal} → ${next.paidTotal} (+${credit})`);
  fixed++;
  if (APPLY) {
    const { error: e2 } = await sb.from("orders").update({ data: next }).eq("id", row.id);
    if (e2) throw e2;
  }
}
console.log(APPLY ? `เขียนแล้ว ${fixed} ใบ` : `พบ ${fixed} ใบที่ต้องซ่อม (ใส่ --apply เพื่อเขียนจริง)`);
