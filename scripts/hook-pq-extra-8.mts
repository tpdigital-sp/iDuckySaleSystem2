/**
 * 🪝 ตะขอ P ตะขอปีก / Q ตะขอ + ห่วงกลม (สีเงิน) ต้อง +฿8/ชิ้น — พนักงานแจ้ง 22 ต.ค. 69
 *   "พวงกุญแจอะคริลิค เรทราคาส่ง ตะขอ P Q ราคามันไม่บวกเพิ่มค่ะ ต้องบวก 8 บาทค่ะ" (ชาร์ตร้านเขียน + 8 บาท ทั้ง 2 ตัว)
 *
 *   npx tsx scripts/hook-pq-extra-8.mts            # ดูผล + เทียบราคาก่อน/หลัง (ไม่เขียน)
 *   npx tsx scripts/hook-pq-extra-8.mts --write    # บันทึกจริง + ล้างแคชหน้าสินค้าบนเว็บจริง
 *
 * เหตุ: ครอบครัวพวงกุญแจเก็บราคาตะขอไว้ที่กลุ่ม "สีตะขอ X" (extraFromQty 11 · ช่วงปลีก ≤10 ใช้ค่าเหมา smallQtyFee ฿10 แทน)
 *   ตะขอที่ไม่มีกลุ่มสี (สีเดียว/เงิน-ทอง) ตั้งราคาที่ตัวตะขอเอง: D +8 · E +10 · X +10 · BB/BC +15
 *   แต่ P และ Q (สีเงินอย่างเดียว ไม่มีกลุ่มสี) ในคลังกลาง preset-3 **ไม่มี extra เลย** → ตั้งแต่ 11 ชิ้นขึ้นไปไม่บวกอะไร
 *   สินค้าที่เก็บรายการตะขอเอง (สแตนดี้พวงกุญแจ · จุกใส · กล่องดนตรี) ตั้ง P/Q = 8 ไว้ถูกแล้ว
 * แก้: ใส่ extra 8 ให้ P/Q ใน
 *   - คลัง __preset_preset-3 (ตะขอ) — สินค้าที่ลิงก์คลังอ่านราคาจากตรงนี้ (resolveOptions)
 *   - snapshot ในสินค้าที่ลิงก์ preset-3 (พวงกุญแจอะคริลิค · หลายชิ้น · เขย่า · ดุ๊กดิ๊ก · ประกบ) ให้ตรงคลัง
 *   ไม่แตะสินค้าที่เก็บรายการเอง (3D Acrylic · อะคริลิคคิท · อะคริลิคกระจก ก็ยังไม่มี P/Q +8 — รอเจ้าของร้านตัดสิน)
 * ช่วงปลีก ≤10 ชิ้น (3mm) ค่าเหมา ฿10 คิด "แทน" ราคาตะขอ (groupAddOf) → P/Q ปลีกยัง ฿10 เท่าเดิม เหมือน D
 * รันซ้ำได้ · สำรองไว้ backups/ · เขียนแล้วอ่านกลับเทียบ
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { resolveOptions } from "../src/lib/option-presets.ts";
import { resolveSelections, unitPriceParts, RATE_LABEL, type Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const HOOK_PRESET = "__preset_preset-3";
const EXTRA = 8;
const TARGETS = ["P ตะขอปีก (สีเงิน)", "Q ตะขอ + ห่วงกลม (สีเงิน)"];
const REF = { free: "Z1 ห่วงกลม (สีเงิน)", paid: "D (เงิน/ทอง)" }; // ตัวเทียบ: ฟรี / +8 ที่ตัวตะขอเหมือน P/Q

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m: string): never => { console.error(`❌ ${m}`); process.exit(1); };

type Row = { id: string; name?: string; price?: number; category?: string; data: any };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("products").select("id,name,price,category,data").range(from, from + 999);
  if (error) die(`อ่านสินค้าไม่ได้ — ${error.message}`);
  rows.push(...(data as Row[]));
  if (data.length < 1000) break;
}
const presetRows = rows.filter((r) => r.category === "__presets__");
const presets = presetRows.map((r) => r.data);
const hookPreset = rows.find((r) => r.id === HOOK_PRESET) ?? die(`ไม่เจอ ${HOOK_PRESET}`);

/** สินค้าที่กลุ่มตะขอลิงก์คลัง preset-3 (ไม่รวมฉบับร่าง = รวมด้วย ให้ตรงคลัง) */
const linked = rows.filter((r) => r.category !== "__presets__" && Array.isArray(r.data?.options)
  && r.data.options.some((o: any) => o.presetId === "preset-3"));

// ---------- ราคาก่อนแก้ ----------
const toP = (r: Row, data = r.data): Product =>
  ({ id: r.id, name: r.name, price: r.price, category: r.category, ...data, options: resolveOptions(data.options, presets) }) as Product;

/** ค่าเริ่มต้นทุกกลุ่ม + เปิดชุดตะขอ แล้วเลือกตะขอที่ต้องการ (ราคาตามเรทที่หน้าสินค้าเลือกให้ตามจำนวน) */
function priceOf(p: Product, hook: string, qty: number): { total: number; hook: number } {
  const hookGroup = p.options.find((o) => (o.choices ?? []).some((c) => c.name === hook));
  if (!hookGroup) return { total: NaN, hook: NaN };
  const base: Record<string, string> = {};
  for (const o of p.options) if (o.choices?.length) base[o.label] = o.choices[0].name;
  Object.assign(base, { เจาะรู: "เจาะรู", รับตะขอไหม: "รับตะขอ", [hookGroup.label]: hook });
  if (p.options.some((o) => o.label === "ความหนาอะคริลิค")) base["ความหนาอะคริลิค"] = "3mm";
  const sel = resolveSelections(p, base);
  const rates = (p.priceRates ?? []).filter((r: any) => !r.dealerOnly);
  const rate = rates.find((r: any) => (r.minQty ?? 0) <= qty && qty >= 50) ?? rates[0]; // ≥50 ใช้เรท 2 ถ้ามี
  if (rate) sel[RATE_LABEL] = rate.label;
  const parts = unitPriceParts(p, sel, qty);
  const hookAdd = parts.addOns.filter((a) => a.label === hookGroup.label || /^สีตะขอ/.test(a.label)).reduce((s, a) => s + a.amount, 0);
  return { total: parts.total, hook: hookAdd };
}

const QTYS = [5, 20, 60];
const fmt = (p: Product) => [REF.free, REF.paid, ...TARGETS].map((h) =>
  `${h.slice(0, 2).trim()}: ${QTYS.map((q) => { const r = priceOf(p, h, q); return `${q}ชิ้น ฿${r.total}(+${r.hook})`; }).join(" · ")}`);

console.log(`📦 สินค้าที่ลิงก์ preset-3: ${linked.map((r) => r.id).join(", ")}`);
const before = new Map(linked.map((r) => [r.id, fmt(toP(r))]));

// ---------- แก้ (ในหน่วยความจำ) ----------
const changes: { row: Row; notes: string[] }[] = [];
function patch(list: any[], where: string): string[] {
  const notes: string[] = [];
  for (const c of list ?? []) {
    if (!TARGETS.includes(c.name)) continue;
    if (c.extra === EXTRA) { notes.push(`${c.name} +${EXTRA} อยู่แล้ว`); continue; }
    if ((c.extra ?? 0) > 0) die(`${where}: ${c.name} มี extra ${c.extra} อยู่แล้ว (ไม่ใช่ 0/ว่าง) — ตรวจมือก่อน`);
    notes.push(`${c.name}: ว่าง → +${EXTRA}`);
    c.extra = EXTRA;
  }
  return notes;
}
{
  const notes = patch(hookPreset.data.choices, HOOK_PRESET);
  if (notes.some((n) => n.includes("→"))) changes.push({ row: hookPreset, notes });
  else console.log(`· ${HOOK_PRESET}: ${notes.join(" · ")}`);
}
for (const r of linked) {
  const notes: string[] = [];
  for (const o of r.data.options) if (o.presetId === "preset-3") notes.push(...patch(o.choices, `${r.id} ${o.label}`).map((n) => `${o.label} (snapshot): ${n}`));
  if (notes.some((n) => n.includes("→"))) changes.push({ row: r, notes });
  else if (notes.length) console.log(`· ${r.id}: ${notes.join(" · ")}`);
}
// สินค้าที่เก็บรายการเองแต่ P/Q ยังว่าง — รายงานเฉย ๆ
for (const r of rows) {
  if (r.category === "__presets__" || !Array.isArray(r.data?.options) || linked.includes(r)) continue;
  for (const o of r.data.options) {
    const miss = (o.choices ?? []).filter((c: any) => TARGETS.includes(c.name) && !(c.extra > 0)).map((c: any) => c.name.slice(0, 2).trim());
    if (miss.length) console.log(`ℹ️ ${r.id} (${r.name}) กลุ่ม "${o.label}" เก็บรายการเอง ${miss.join("/")} ยังไม่มี +฿ — ไม่แตะ`);
  }
}

// ---------- ราคาหลังแก้ (คลังใหม่ในหน่วยความจำ) ----------
const presetsAfter = presetRows.map((r) => r.data);
const toPAfter = (r: Row): Product =>
  ({ id: r.id, name: r.name, price: r.price, category: r.category, ...r.data, options: resolveOptions(r.data.options, presetsAfter) }) as Product;
let badPrice = 0;
for (const r of linked) {
  console.log(`\n${r.id} ${r.name}${r.data.hidden ? " [ร่าง]" : ""}`);
  const after = fmt(toPAfter(r));
  console.log("  ก่อน: " + before.get(r.id)!.join(" | "));
  console.log("  หลัง: " + after.join(" | "));
  // ด่าน: หลังแก้ P และ Q ต้องราคาเท่า D ทุกจำนวน (D = +8 ที่ตัวตะขอ ไม่มีกลุ่มสีคิดเงิน)
  const p = toPAfter(r);
  for (const q of QTYS) for (const h of TARGETS) {
    const a = priceOf(p, h, q), d = priceOf(p, REF.paid, q);
    if (a.total !== d.total) { badPrice++; console.log(`  ❌ ${q} ชิ้น ${h} ฿${a.total} ≠ D ฿${d.total}`); }
  }
}
console.log(badPrice ? `\n❌ ราคาหลังแก้ไม่ตรง D ${badPrice} จุด — หยุด` : "\n✅ หลังแก้ P/Q ราคาเท่า D ทุกจำนวนทุกสินค้า");
if (badPrice) process.exit(1);

for (const { row, notes } of changes) { console.log(`\n${row.id} ${row.name ?? row.data.label ?? ""}`); for (const n of notes) console.log(`  - ${n}`); }
console.log(`\nรวม ${changes.length} แถว`);
if (!changes.length) process.exit(0);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

// ---------- เขียน ----------
mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
const ids = changes.map((c) => c.row.id);
const { data: orig } = await sb.from("products").select("id,data").in("id", ids);
const bak = new URL(`../backups/hook-pq-extra-8-${Date.now()}.json`, import.meta.url);
writeFileSync(bak, JSON.stringify(orig, null, 2));
console.log(`💾 สำรอง ${bak.pathname}`);
for (const { row } of changes) {
  const { error: e } = await sb.from("products").update({ data: row.data }).eq("id", row.id);
  if (e) die(`${row.id}: ${e.message}`);
}
const { data: back } = await sb.from("products").select("id,data").in("id", ids);
let bad = 0;
for (const r of back ?? []) {
  const list = r.data.options ? r.data.options.filter((o: any) => o.presetId === "preset-3").flatMap((o: any) => o.choices ?? []) : r.data.choices;
  for (const c of list) if (TARGETS.includes(c.name) && c.extra !== EXTRA) { bad++; console.log(`❌ ${r.id} ${c.name} extra=${c.extra}`); }
}
console.log(bad ? `❌ ไม่ผ่าน ${bad}` : `✅ บันทึกแล้ว อ่านกลับตรง ${back?.length} แถว`);
await revalidateLive(env, { productIds: linked.map((r) => r.id) });
