#!/usr/bin/env npx tsx
/**
 * เปลี่ยนชื่อตัวเลือก (choice) ทุกสินค้าในฐานข้อมูล
 *
 *   npx tsx scripts/rename-choice.mts --old "ชื่อเดิม" --new "ชื่อใหม่"           # ดูผลก่อน (ไม่เขียน)
 *   npx tsx scripts/rename-choice.mts --old "ชื่อเดิม" --new "ชื่อใหม่" --write   # เขียนทุกแถวที่เจอ
 *
 * ที่ใช้ไปแล้ว (2 ก.ย. 69):
 *   "100 Pound Paper 300 แกรม"   → "100 Pound Paper (หนา 300gsm)"   (3 สินค้า)
 *   "กระดาษอาร์ตเกาหลี 300 แกรม" → "กระดาษอาร์ตมัน 300 แกรม"        (โฟโต้บูธกระดาษ)
 *
 * ชื่อตัวเลือกโผล่หลายที่ในก้อน data — แทนที่ทั้งก้อนจาก JSON string ทีเดียว
 * เพื่อให้ทุกจุดขยับพร้อมกัน (ไม่งั้นราคาหล่นไป product.price / กฎเพี้ยน):
 *   ตัวเลือกในกลุ่ม · คีย์ช่องราคา "ตัวเลือก│ตัวเลือก" ทุกเรท · rules (when.choices / limit.allow)
 *   · showWhen ที่อ้างชื่อ · ข้อความ description / highlights / tabs / terms / seo
 *
 * ⛔ หยุดให้เองถ้าสินค้าไหนมีทั้งชื่อเดิมและชื่อใหม่อยู่พร้อมกัน — เปลี่ยนแล้วจะกลายเป็นตัวเลือกซ้ำ
 *    และคีย์ช่องราคาจะทับกัน (ต้องมาตัดสินใจเองว่ายุบยังไง)
 * ⛔ ไม่แตะตาราง orders — ออเดอร์เก่าต้องคงชื่อที่ลูกค้าสั่งไว้ตามเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`ต้องใส่ ${flag} "ชื่อ"`);
  return process.argv[i + 1];
};
const OLD = argOf("--old");
const NEW = argOf("--new");
if (OLD === NEW) throw new Error("ชื่อเดิมกับชื่อใหม่เหมือนกัน");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: rows, error } = await sb.from("products").select("id,name,price,data");
if (error) throw error;

const hits = rows!.filter((r) => JSON.stringify(r.data).includes(OLD));
console.log(`สแกน ${rows!.length} แถว · เจอชื่อเดิม ${hits.length} แถว\n`);

const clash = hits.filter((r) => JSON.stringify(r.data).includes(NEW));
if (clash.length)
  throw new Error(
    `มีทั้งชื่อเดิมและชื่อใหม่อยู่ในสินค้าเดียวกัน ${clash.length} แถว (${clash
      .map((r) => r.id)
      .join(", ")}) — เปลี่ยนแล้วตัวเลือกจะซ้ำ/ช่องราคาทับกัน มาดูเองก่อน`
  );

for (const r of hits) {
  const raw = JSON.stringify(r.data);
  const count = raw.split(OLD).length - 1;
  const next = JSON.parse(raw.split(OLD).join(NEW));
  const where: string[] = [];
  const g = (next.options ?? []).find((o: any) => o.choices?.some((c: any) => c.name === NEW));
  if (g) where.push(`ตัวเลือกในกลุ่ม "${g.label}"`);
  const cells = Object.keys(next.pricing?.cells ?? {}).filter((k) => k.includes(NEW)).length;
  if (cells) where.push(`ช่องราคา ${cells} ช่อง`);
  const rateCells = (next.priceRates ?? []).reduce(
    (n: number, rate: any) => n + Object.keys(rate.pricing?.cells ?? {}).filter((k) => k.includes(NEW)).length,
    0
  );
  if (rateCells) where.push(`ช่องราคาในเรท ${rateCells} ช่อง`);
  const ruleHits = (next.rules ?? []).filter((x: any) =>
    JSON.stringify(x).includes(NEW)
  ).length;
  if (ruleHits) where.push(`กฎ ${ruleHits} ข้อ`);
  const textHits = count - (g ? 1 : 0) - cells - rateCells - ruleHits;
  if (textHits > 0) where.push(`ข้อความ ${textHits} จุด`);

  console.log(`${r.id.padEnd(22)} ${r.name}`);
  console.log(`   ${count} จุด: ${where.join(" · ")}`);

  if (!WRITE) continue;
  const { error: saveErr } = await sb.from("products").update({ data: next }).eq("id", r.id);
  if (saveErr) throw saveErr;
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const { data: back, error: backErr } = await sb.from("products").select("id,name,data");
if (backErr) throw backErr;
const left = back!.filter((r) => JSON.stringify(r.data).includes(OLD));
if (left.length) throw new Error(`ยังเหลือชื่อเดิมอีก ${left.length} แถว: ${left.map((r) => r.id).join(", ")}`);
// เช็คเฉพาะแถวที่แก้ — ชื่อใหม่อาจมีอยู่ในสินค้าอื่นตั้งแต่แรก (เปลี่ยนไปใช้ชื่อที่ร้านใช้อยู่แล้ว)
const got = back!.filter((r) => hits.some((h) => h.id === r.id) && JSON.stringify(r.data).includes(NEW));
if (got.length !== hits.length) throw new Error(`อ่านกลับได้ ${got.length} แถว คาด ${hits.length}`);
for (const r of got) {
  const d: any = r.data;
  const inGroup = (d.options ?? []).some((o: any) => o.choices?.some((c: any) => c.name === NEW));
  const inCells =
    Object.keys(d.pricing?.cells ?? {}).some((k) => k.includes(NEW)) ||
    (d.priceRates ?? []).some((rate: any) => Object.keys(rate.pricing?.cells ?? {}).some((k) => k.includes(NEW)));
  if (inGroup && !inCells) throw new Error(`${r.id}: มีตัวเลือกแต่ไม่มีช่องราคา — ราคาจะหล่น มาดูเองก่อน`);
}
console.log(`\n✅ เปลี่ยนชื่อแล้ว ${got.length} แถว — "${OLD}" → "${NEW}"`);
