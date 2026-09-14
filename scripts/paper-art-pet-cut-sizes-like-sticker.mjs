#!/usr/bin/env node
/**
 * "กระดาษอาร์ตมัน | PET" (paper-art-pet) — เมนู "ขนาดตัด" ให้เหมือนสินค้าสติ๊กเกอร์ Gold/Silver/RoseGold
 * [เจ้าของร้านสั่ง 14 ก.ย. 69]
 *
 *   node scripts/paper-art-pet-cut-sizes-like-sticker.mjs            # ดูอย่างเดียว
 *   node scripts/paper-art-pet-cut-sizes-like-sticker.mjs --write    # บันทึกจริง
 *
 * เติม 4 ขนาดที่ขาด (ตามชาร์ต "ขนาด+จำนวนที่ได้ใน 1 A3" ของร้านเอง — products/paper-art-pet/a3-chart.jpg)
 *   A3 = 1 · ครึ่ง A4 แนวตั้ง = 4 · ครึ่ง A5 แนวตั้ง = 8 · ครึ่ง A6 แนวตั้ง = 16
 * แล้วเรียงลำดับเหมือนสติ๊กเกอร์: ใหญ่ → เล็ก · ขนาดครึ่งต่อท้ายขนาดแม่ · 4 × 6 นิ้ว · กำหนดเอง · ตามไฟล์
 *
 * ⚠️ ไม่ก๊อป badge ของสติ๊กเกอร์มาทั้งดุ้น — ท่อน "ไดคัทฟรี N จุด" เป็นเรื่องของสติ๊กเกอร์ไดคัท 50%
 *    งานกระดาษไม่มีจุดไดคัท จึงเขียนแค่ "ได้ N ชิ้น / แผ่น A3" ตามรูปแบบเดิมของสินค้าตัวนี้
 * ⚠️ ตัวแรกของเมนู = ค่าเริ่มต้นของหน้า → เปลี่ยนจาก A4 เป็น A3 (เต็มแผ่น ไม่ตัด) เหมือนสติ๊กเกอร์
 * ราคาคิดต่อ "แผ่น A3" ทุกขนาดเท่ากัน — เพิ่มขนาดไม่กระทบตารางราคา
 * รันซ้ำได้ (มีอยู่แล้วข้าม)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const EXPECT_NAME = /กระดาษอาร์ตมัน/;
const GROUP = "ขนาดตัด";
const GREEN = "#15803d"; // ขนาดครึ่ง — สีเดียวกับสติ๊กเกอร์ จะได้เห็นตั้งแต่ยังไม่กางเมนู

/** ขนาดที่ต้องมี (จำนวนชิ้น/แผ่น A3 ตามชาร์ตร้าน) — ใส่เฉพาะตัวที่ยังไม่มี */
const ADD = [
  { name: "A3", piecesPerUnit: 1 },
  { name: "ครึ่ง A4 แนวตั้ง", piecesPerUnit: 4, color: GREEN },
  { name: "ครึ่ง A5 แนวตั้ง", piecesPerUnit: 8, color: GREEN },
  { name: "ครึ่ง A6 แนวตั้ง", piecesPerUnit: 16, color: GREEN },
];
const badgeOf = (n) => `ได้ ${n.toLocaleString("th-TH")} ชิ้น / แผ่น A3`;

/** ลำดับเดียวกับ scripts/sticker-cut-size-order.mjs */
const ORDER = ["A3", "A4", "ครึ่ง A4 แนวตั้ง", "A5", "ครึ่ง A5 แนวตั้ง", "A6", "ครึ่ง A6 แนวตั้ง", "A7",
  "4 × 6 นิ้ว", "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)", "📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)"];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
if (!EXPECT_NAME.test(row.name)) { console.error(`id ${ID} เป็นสินค้าอื่น: "${row.name}" — หยุดไว้ก่อน`); process.exit(1); }

const d = row.data;
const g = (d.options ?? []).find((o) => o.label === GROUP);
if (!g) { console.error(`ไม่เจอกลุ่ม "${GROUP}"`); process.exit(1); }

const added = [];
for (const a of ADD) {
  if (g.choices.some((c) => c.name === a.name)) { console.log(`   (มี ${a.name} อยู่แล้ว)`); continue; }
  g.choices.push({ name: a.name, badge: badgeOf(a.piecesPerUnit), piecesPerUnit: a.piecesPerUnit, ...(a.color ? { color: a.color } : {}) });
  added.push(a.name);
}

const rank = (c) => { const i = ORDER.indexOf(c.name); return i < 0 ? ORDER.length : i; };
g.choices = g.choices.map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);

console.log(`\n=== ${ID} — ${row.name}`);
console.log(`เพิ่ม ${added.length} ขนาด: ${added.join(" · ") || "(ไม่มี)"}`);
for (const c of g.choices) console.log(`  • ${c.name}${c.badge ? `  — ${c.badge}` : ""}`);
console.log(`ค่าเริ่มต้นของหน้า (ตัวแรก) = ${g.choices[0].name}`);

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)"); process.exit(0); }

d.savedAt = new Date().toISOString();
const { data: upd, error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (upErr || !upd?.length) { console.error("update พัง/0 แถว", upErr); process.exit(1); }

// อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bg = back.data.options.find((o) => o.label === GROUP);
const got = bg.choices.map((c) => c.name).join(" · ");
const want = g.choices.map((c) => c.name).join(" · ");
if (got !== want) { console.error("❌ อ่านกลับไม่ตรง:\n  ได้:  " + got + "\n  ควร: " + want); process.exit(1); }
console.log("\n✅ บันทึกแล้ว — " + got);
