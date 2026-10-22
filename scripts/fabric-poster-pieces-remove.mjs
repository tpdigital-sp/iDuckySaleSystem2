/**
 * ผ้าแขวนผนัง (fabric-poster) — ถอดช่อง "จำนวนชิ้นที่ต้องการ (ต่อ 1 หลา)" ออก (22 ต.ค. 69)
 *   พนักงานแจ้ง (OD-261019-1820): "ตรงจำนวนที่ต้องการตัดต่อหลาออกไปเลยก็ได้ค่ะ
 *   เพราะตอนนี้สั่งขนาดแบบที่เกิน 1 หลาได้แล้วค่ะ" — ช่องนี้สร้างโดย fabric-poster-pieces.mjs (1 ก.ย. 69)
 *   ตั้งแต่ 19 ต.ค. 69 ช่องยาวรับเกิน 90 ซม. (maxPerQtyCap 360) + longPiece คิดชิ้นยาวครั้งเดียว
 *   ช่องนี้เลยซ้ำซ้อน/ทำให้งง (ใบ 1820 กรอก "1 ชิ้น" ทั้งที่ชิ้น 140×150 ใช้ 2 หลาอยู่แล้ว)
 *
 *   ทำ 2 อย่าง: ลบกลุ่มช่องกรอกออกจาก options + ถอด sizeFee.piecesLabel จากทุกตัวเลือกที่อ้างถึง
 *   ผลต่อราคา: ไม่กรอก = คิดเต็มตามที่ตัดได้ต่อหลาเหมือนก่อน 1 ก.ย. (ของเก่าในตะกร้า/ออเดอร์ไม่เปลี่ยน
 *   เพราะราคาถูกล็อกตอนสั่ง · selections เก่าที่ยังมีคีย์นี้ค้างก็แค่ถูกเมิน)
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-pieces-remove.mjs
 * เขียนจริง: node scripts/fabric-poster-pieces-remove.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const G_PIECES = "จำนวนชิ้นที่ต้องการ (ต่อ 1 หลา)";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = data.data;
let changed = 0;

console.log("กลุ่มตัวเลือกตอนนี้:");
for (const o of d.options ?? []) console.log(`  - [${o.display}] ${o.label}${o.showWhen ? `  (เมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join("/")})` : ""}`);

/* 1. ลบกลุ่มช่องกรอก */
const idx = (d.options ?? []).findIndex((o) => o.label === G_PIECES);
if (idx >= 0) {
  console.log(`\n- ลบกลุ่ม “${G_PIECES}” (ตำแหน่ง ${idx + 1}) · hint เดิม: ${d.options[idx].input?.hint ?? "—"}`);
  d.options.splice(idx, 1);
  changed++;
} else console.log(`\n(ไม่มีกลุ่ม “${G_PIECES}” อยู่แล้ว)`);

/* 2. ถอด piecesLabel ออกจาก sizeFee ทุกตัวที่ชี้มาที่กลุ่มนี้ */
for (const o of d.options ?? []) {
  for (const c of o.choices ?? []) {
    if (c.sizeFee?.piecesLabel !== G_PIECES) continue;
    delete c.sizeFee.piecesLabel;
    console.log(`  ↳ ถอด piecesLabel: ${o.label} › ${c.name}`);
    changed++;
  }
}

/* 3. เช็คว่ามีที่ไหนยังอ้างชื่อกลุ่มนี้ค้าง (showWhen/when/ข้อความ) */
const left = JSON.stringify(d).split(G_PIECES).length - 1;
if (left) console.log(`\n⚠️ ยังมีคำว่า “${G_PIECES}” ค้างอีก ${left} จุด (ดูใน data เอง)`);

if (!changed) {
  console.log("ไม่มีอะไรต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(ดูเฉย ๆ) แก้ ${changed} จุด — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log(`✅ เขียนแล้ว (${changed} จุด)`);
