// ซ่อมผู้ติดต่อที่ถูกล็อกเป็น Bronze ทั้งที่ยอดยังไม่ถึง ฿50,000 → ระดับเริ่มต้น "member" (0%)
//   node scripts/fix-base-tier-contacts.mjs            → ดูอย่างเดียว
//   node scripts/fix-base-tier-contacts.mjs --apply    → เขียนจริง (สำรองแถวที่แก้ลง backups/ ก่อน)
// ทำไม: ตารางระดับร้านเริ่มที่ Bronze ≥ ฿50,000 ไม่มีระดับ ฿0 แต่ tierForSpend/lockedTier เคยตกไป tiers[0]
//        → cron/reseed ซีดลูกค้ายอด ฿0 เป็น Bronze แล้วใบเสนอราคา+สั่งเองได้ลด 3% (QT-260908-3316, 8 ก.ย. 69)
//        แก้โค้ดให้มีระดับเริ่มต้นแล้ว (src/lib/tiers.ts BASE_TIER) แต่ระดับที่ "ล็อก" ไว้ในผู้ติดต่อต้องซ่อมข้อมูลด้วย
//        เก็บ anchor/cycleSpend เดิมไว้ — ยอดที่ซื้อในรอบนี้ยังนับต่อ ถึง ฿50,000 เมื่อไหร่ก็ขึ้น Bronze เอง
//        ใบเสนอราคาที่ยังไม่เป็นออเดอร์และแช่ Bronze ของคนกลุ่มนี้ไว้ → ล้าง memberTier ให้ด้วย (เซิร์ฟเวอร์ sync ซ้ำตอนเปิดอยู่แล้ว)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");
const BASE = "member";

const { data: sett } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
const tiers = [...(sett?.data?.tiers ?? [])].filter((t) => t.name?.trim()).sort((a, b) => a.minSpend - b.minSpend);
if (!tiers.length) { console.error("ยังไม่ได้ตั้งตารางระดับใน __shop_payment__"); process.exit(1); }
const lowest = tiers[0];
console.log("ตารางปัจจุบัน:", tiers.map((t) => `${t.id} ≥${t.minSpend} ${t.discountPct}%`).join(" · "));
if (!(lowest.minSpend > 0)) { console.log("ระดับแรกเริ่มที่ ฿0 อยู่แล้ว ไม่มีอะไรต้องซ่อม"); process.exit(0); }

// ผู้ติดต่อที่ล็อกระดับแรกไว้ แต่ทั้งแต้มสะสมเดิมและยอดในรอบนี้ยังไม่ถึงเกณฑ์ระดับแรก
const changes = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("contacts").select("id,data").eq("data->>tierLevel", lowest.id).range(from, from + 999);
  if (error) throw error;
  for (const r of data ?? []) {
    const d = r.data;
    const point = Number(d.point) || 0, cyc = Number(d.tierCycleSpend) || 0;
    if (point >= lowest.minSpend || cyc >= lowest.minSpend) continue;
    changes.push({ id: r.id, name: d.name, point, cyc, row: r });
  }
  if (!data || data.length < 1000) break;
}
console.log(`ผู้ติดต่อล็อก ${lowest.id} ทั้งที่ยอด < ${lowest.minSpend}: ${changes.length} ราย`, changes.slice(0, 5).map((c) => `${c.id} ${c.name} point=${c.point} cycle=${c.cyc}`));

// ใบเสนอราคาที่ยังไม่เป็นออเดอร์ และแช่ระดับแรกของคนกลุ่มนี้ไว้
const fixIds = new Set(changes.map((c) => String(c.id)));
const { data: qs, error: qe } = await sb.from("quotes").select("id,data").not("data->memberTier", "is", null);
if (qe) throw qe;
// รวมใบของผู้ติดต่อที่ "ยังไม่เคยซีดระดับ" (tierLevel ว่าง) แต่ยอดไม่ถึงเกณฑ์ด้วย — โค้ดเก่าประเมินสดแล้วตกไป Bronze เหมือนกัน
const cand = (qs ?? []).filter((q) => !q.data.orderId && q.data.memberTier?.id === lowest.id && q.data.contactId);
const needIds = [...new Set(cand.map((q) => String(q.data.contactId)).filter((id) => !fixIds.has(id)))];
const unseeded = new Set();
if (needIds.length) {
  const { data: cs } = await sb.from("contacts").select("id,data").in("id", needIds);
  for (const c of cs ?? []) {
    const d = c.data;
    if (!d.tierLevel && (Number(d.point) || 0) < lowest.minSpend && d.customerType !== "dealer") unseeded.add(String(c.id));
  }
}
const quoteFixes = cand.filter((q) => fixIds.has(String(q.data.contactId)) || unseeded.has(String(q.data.contactId)));
console.log("ใบเสนอราคาที่ต้องล้างส่วนลดสมาชิก:", quoteFixes.map((q) => `${q.id} (${q.data.status})`));
if (!APPLY || (!changes.length && !quoteFixes.length)) process.exit(0);

mkdirSync("backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
writeFileSync(`backups/contacts-before-base-tier-${stamp}.json`, JSON.stringify(changes.map((c) => c.row), null, 1));
writeFileSync(`backups/quotes-before-base-tier-${stamp}.json`, JSON.stringify(quoteFixes, null, 1));
let done = 0;
for (const c of changes) {
  const { error } = await sb.from("contacts").update({ data: { ...c.row.data, tierLevel: BASE } }).eq("id", c.id);
  if (error) { console.error("contact", c.id, error.message); continue; }
  done++;
}
let qdone = 0;
for (const q of quoteFixes) {
  const { memberTier: _drop, ...rest } = q.data;
  const { error } = await sb.from("quotes").update({ data: rest }).eq("id", q.id);
  if (error) { console.error("quote", q.id, error.message); continue; }
  qdone++;
}
console.log(`แก้ผู้ติดต่อ ${done}/${changes.length} · ล้างส่วนลดในใบเสนอราคา ${qdone}/${quoteFixes.length} · สำรองไว้ backups/*-base-tier-${stamp}.json`);
