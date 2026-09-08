// ซีดระดับสมาชิกใหม่ตามตารางระดับปัจจุบัน (/admin/settings) ให้ผู้ติดต่อที่ "ยกยอดมาจากระบบเดิม" และยังไม่ได้สะสมยอดใหม่ในรอบนี้
//   node scripts/reseed-tier-levels.mjs            → ดูอย่างเดียว
//   node scripts/reseed-tier-levels.mjs --apply    → เขียนจริง (สำรองแถวที่แก้ลง backups/ ก่อน)
// ทำไม: cron ซีดระดับไว้ 7 ก.ย. 69 ด้วยตารางเก่า พอเจ้าของร้านแก้ยอดขั้นต่ำในหน้าตั้งค่า ระดับที่ล็อกไว้ไม่ตามมา
//        (ยอดสะสม 655,980 ยังโชว์ Diamond ทั้งที่ตารางใหม่ต้อง 900,000) — แตะเฉพาะคนที่ cycleSpend = 0 และ anchor = วันนำเข้า
//        คือคนที่ยังไม่มีออเดอร์จ่ายจริงในระบบนี้ ระดับที่ได้จากการซื้อจริงไม่ถูกแตะ
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");

const { data: sett } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
const tiers = [...(sett?.data?.tiers ?? [])].filter((t) => t.name?.trim()).sort((a, b) => a.minSpend - b.minSpend);
if (!tiers.length) { console.error("ยังไม่ได้ตั้งตารางระดับใน __shop_payment__"); process.exit(1); }
console.log("ตารางปัจจุบัน:", tiers.map((t) => `${t.id} ≥${t.minSpend} ${t.discountPct}%`).join(" · "));
// ยอดไม่ถึงระดับแรกในตาราง = ระดับเริ่มต้น "member" (0%) — ห้ามตกไป tiers[0] (เคยทำให้ยอด ฿0 ได้ Bronze 3%)
const levelFor = (p) => { let c = null; for (const t of tiers) if (p >= t.minSpend) c = t; return c ? c.id : "member"; };

const changes = [], skippedEarned = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("contacts").select("id,data").not("data->>tierLevel", "is", null).range(from, from + 999);
  if (error) throw error;
  for (const r of data ?? []) {
    const d = r.data;
    const exp = levelFor(Number(d.point) || 0);
    if (d.tierLevel === exp) continue;
    const pureSeed = (Number(d.tierCycleSpend) || 0) === 0 && d.tierAnchor && d.tierAnchor === d.importedAt;
    if (!pureSeed) { skippedEarned.push({ id: r.id, point: d.point, tierLevel: d.tierLevel, exp, cycleSpend: d.tierCycleSpend }); continue; }
    changes.push({ id: r.id, name: d.name, point: d.point, from: d.tierLevel, to: exp, row: r });
  }
  if (!data || data.length < 1000) break;
}
const pairs = {}; for (const c of changes) pairs[`${c.from}→${c.to}`] = (pairs[`${c.from}→${c.to}`] || 0) + 1;
console.log("จะแก้:", changes.length, pairs);
console.log("ข้าม (มียอดสะสมรอบนี้แล้ว/ไม่ใช่ซีดล้วน):", skippedEarned.length, skippedEarned.slice(0, 5));
console.log("ตัวอย่าง:", changes.slice(0, 5).map((c) => `${c.id} ${c.name} ${c.point} ${c.from}→${c.to}`));
if (!APPLY || !changes.length) process.exit(0);

mkdirSync("backups", { recursive: true });
const f = `backups/contacts-tier-before-reseed-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(f, JSON.stringify(changes.map((c) => c.row), null, 1)); console.log("backup ->", f);
let n = 0;
for (const c of changes) {
  const { error } = await sb.from("contacts").update({ data: { ...c.row.data, tierLevel: c.to } }).eq("id", c.id);
  if (error) { console.error(c.id, error.message); continue; }
  n++;
}
console.log("แก้แล้ว", n, "ราย");
