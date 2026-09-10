// เติมชื่อวิธีส่งจริง (shippingLabel) ให้ออเดอร์ที่ป้ายว่าง/เป็นคำกลาง ๆ ("ค่าส่ง") โดยจับคู่ค่าส่งในใบกับวิธีส่งที่ร้านตั้ง
//   node scripts/backfill-ship-label.mjs            → dry-run โชว์ว่าจะแก้ใบไหนเป็นอะไร
//   node scripts/backfill-ship-label.mjs --apply    → เขียนจริง (สำรองแถวเดิมลง backups/ ก่อน · รันซ้ำได้)
// ที่มา (10 ก.ย. 69): ใบจากลิงก์ FlowAccount ได้ป้าย "ค่าส่ง" (ชื่อบรรทัดในเอกสาร) · ใบจากใบเสนอราคาที่กรอกตัวเลขเองไม่มีป้ายเลย
// → ใบปะหน้าขึ้น "ค่าส่ง"/"ส่งธรรมดา" ตัวใหญ่แทน EMS (50) · กติกาเดียวกับ src/lib/ship-label.ts (0 บาทไม่จับคู่ · ไม่นับ "มารับเอง")
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");

const GENERIC_RE = /^(?:ค่า(?:จัด|ขน)?ส่ง(?:สินค้า|ของ)?|shipping(?:\s*(?:fee|cost))?|delivery(?:\s*(?:fee|cost))?)\s*[:\-–—]?\s*(?:[(\[]?\s*(?:฿|บาท)?\s*[\d,.]*\s*(?:฿|บาท|\.-)?\s*[)\]]?)?$/iu;
const PICKUP_RE = /รับเอง|มารับ|pick\s*-?up/i;
const isGeneric = (s) => !(s ?? "").trim() || GENERIC_RE.test((s ?? "").trim());

const { data: sett } = await sb.from("products").select("data").eq("id", "__shop_payment__").maybeSingle();
const methods = (sett?.data?.shipping ?? []).filter((m) => m?.name?.trim());
if (!methods.length) { console.error("ร้านยังไม่ตั้งวิธีส่ง (__shop_payment__.shipping ว่าง)"); process.exit(1); }
console.log("วิธีส่งของร้าน:", methods.map((m) => `${m.name}=฿${m.price}`).join(" · "));
const byPrice = (cost) => cost > 0 ? methods.find((m) => Number(m.price) === cost && !PICKUP_RE.test(m.name)) : undefined;

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;
const plan = [];
const noMatch = [];
for (const r of rows) {
  const d = r.data ?? {};
  if (!isGeneric(d.shippingLabel)) continue; // ป้ายบอกวิธีส่งอยู่แล้ว
  const cost = Number(d.shippingCost) || 0;
  const m = byPrice(cost);
  if (!m) { if (cost > 0) noMatch.push(`${r.id} ฿${cost} "${d.shippingLabel ?? ""}"`); continue; }
  if (d.shippingLabel === m.name) continue;
  plan.push({ id: r.id, row: r, from: d.shippingLabel ?? "(ว่าง)", to: m.name, cost, fa: !!d.flowAccount, quote: d.quoteOf ?? "" });
}
plan.sort((a, b) => a.id.localeCompare(b.id));
console.log(`\nทั้งหมด ${rows.length} ใบ · จะแก้ ${plan.length} ใบ`);
for (const p of plan) console.log(` ${p.id}  "${p.from}" → "${p.to}"  ฿${p.cost}  ${p.fa ? "FlowAccount" : p.quote ? `ใบเสนอราคา ${p.quote}` : ""}`);
if (noMatch.length) console.log(`\nค่าส่งไม่ตรงวิธีส่งไหน (ไม่แตะ) ${noMatch.length} ใบ:\n ` + noMatch.join("\n "));
if (!APPLY || !plan.length) { console.log(APPLY ? "\nไม่มีอะไรต้องแก้" : "\n(dry-run — ใส่ --apply เพื่อเขียนจริง)"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const f = `backups/orders-before-ship-label-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
writeFileSync(f, JSON.stringify(plan.map((p) => p.row), null, 1));
console.log("\nสำรอง ->", f);
let done = 0;
for (const p of plan) {
  // อ่านสดก่อนเขียน กันทับงานที่หน้าจอเพิ่งเซฟระหว่างสคริปต์รัน
  const { data: fresh } = await sb.from("orders").select("data").eq("id", p.id).maybeSingle();
  const d = fresh?.data; if (!d || !isGeneric(d.shippingLabel)) { console.log(" ข้าม", p.id, "(ป้ายเปลี่ยนไปแล้ว)"); continue; }
  const next = { ...d, shippingLabel: p.to, savedAt: new Date().toISOString() };
  const { error: e } = await sb.from("orders").update({ data: next }).eq("id", p.id);
  if (e) { console.error(" ❌", p.id, e.message); continue; }
  done++;
}
console.log(`เขียนแล้ว ${done}/${plan.length} ใบ`);
