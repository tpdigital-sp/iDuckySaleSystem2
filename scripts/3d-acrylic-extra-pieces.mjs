#!/usr/bin/env node
/**
 * 3D Acrylic — กลุ่มตัวเลือก "เพิ่มจำนวนชิ้น" (ชิ้นที่ 3 ขึ้นไป)
 *
 *   node scripts/3d-acrylic-extra-pieces.mjs           # ดูก่อนว่าจะเพิ่ม/แก้อะไร (ไม่เขียน)
 *   node scripts/3d-acrylic-extra-pieces.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ที่มา: โปสเตอร์ 3D Acrylic กล่อง "เพิ่มจำนวนชิ้น (ราคาอะคริลิคใส)"
 *     งานสกรีน   เพิ่ม cm ละ 15.-
 *     งานไม่สกรีน เพิ่ม cm ละ 10.-
 *     จำนวน 11 ชิ้นขึ้นไป คิดราคาเรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1)
 *
 * รูปแบบบนหน้าเว็บ (ทางร้านเลือกไว้): ลูกค้า "ติ๊กขนาดชิ้นที่เพิ่ม แล้วระบุจำนวน"
 *   เช่น ติ๊ก "3cm · สกรีน ×2" = เพิ่มอีก 2 ชิ้น ชิ้นละ 3×15 = 45 → +90 ต่อชุด
 *   ระบบคูณให้เอง ลูกค้าไม่ต้องคิดเลข และแอดมินไม่ต้องมาตีราคาทีหลัง
 *
 * ราคาสองช่วง ใช้กลไก extraFromQty / extraBelow ของระบบตัวเลือก:
 *   • 1-10 ชุด        → extraBelow = ขนาด(cm) × 15 (สกรีน) หรือ × 10 (ไม่สกรีน)   ← ราคาปลีกตามโปสเตอร์
 *   • 11 ชุดขึ้นไป    → extra      = ตารางแผ่นอะคริลิคพวงกุญแจ เรทที่ 1 ช่วง "11-29 ชิ้น"
 *                                    (ดึงสดจากหน้า /keyring — ดู fetchKeyringRate1)
 *
 * ⚠️ ข้อจำกัดที่รู้ตัว: ระบบตัวเลือกเก็บราคาช่วงส่งได้ค่าเดียว จึงใช้ขั้น "11-29 ชิ้น" ของเรทที่ 1
 *    สั่ง 31 ชุดขึ้นไปชิ้นที่เพิ่มจะแพงกว่าตารางจริงอยู่ 4-6 บาท/ชิ้น — แอดมินปรับในบิลได้ถ้าเจอเคสนั้น
 *
 * สคริปต์นี้แตะเฉพาะกลุ่ม "เพิ่มจำนวนชิ้น" กลุ่มเดียว — ไม่แตะตารางราคา ไม่แตะกลุ่มอื่น
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetch3dAcrylicPrices, fetchKeyringRate1 } from "./3d-acrylic-prices.mjs";

const WRITE = process.argv.includes("--write");
const ID = "3d-acrylic";
const EXPECT_NAME = "3D Acrylic";
const LABEL = "เพิ่มจำนวนชิ้น";
/** กลุ่มนี้วางต่อจากกลุ่มนี้ (ต่อท้ายรายการถ้าไม่เจอ) */
const AFTER = "ชนิดอะคริลิค";

/** เรทปลีกต่อ 1 ซม. ตามโปสเตอร์ */
const PER_CM = { สกรีน: 15, ไม่สกรีน: 10 };
/** ขั้นราคาส่งของตารางแผ่นอะคริลิค (เรทที่ 1) ที่เอามาใช้ + จำนวนชุดที่เริ่มใช้ */
const WHOLESALE_TIER = "11-29 ชิ้น";
const WHOLESALE_FROM_QTY = 11;

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

const web = await fetch3dAcrylicPrices();
const rate1 = await fetchKeyringRate1();
console.log(`📥 ขนาดที่เปิดขาย: ${web.sizes.join(" / ")}`);
console.log(`   เรทส่ง (เรทที่ 1 · ${WHOLESALE_TIER}): ${web.sizes.map((s) => `${s} ${rate1.cell(s, WHOLESALE_TIER)}`).join(" · ")}\n`);

/** ตัวเลือกทั้งหมดของกลุ่ม — ขนาด × (สกรีน / ไม่สกรีน) */
const choices = [];
for (const [kind, perCm] of Object.entries(PER_CM)) {
  for (const size of web.sizes) {
    const cm = Number(size.replace("cm", ""));
    const retail = cm * perCm; // 1-10 ชุด — ราคาปลีกตามโปสเตอร์
    /**
     * 11 ชุดขึ้นไป — เรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1)
     * ⚠️ ตัวเลขในตารางนั้นเป็นราคา "แผ่นที่สกรีนแล้ว" งานไม่สกรีนจึงไม่ควรแพงกว่าราคาปลีกของตัวเอง
     *    (2cm ไม่สกรีน ปลีก 20 แต่เรทที่ 1 = 29 — สั่งเยอะแล้วแพงขึ้นไม่สมเหตุผล)
     *    โปสเตอร์ไม่ได้ให้เรทส่งของงานไม่สกรีนไว้ จึงกันไว้ด้วย min() — สั่งเยอะไม่มีทางแพงกว่าสั่งน้อย
     */
    const wholesale = Math.min(retail, rate1.cell(size, WHOLESALE_TIER));
    choices.push({ name: `${size} · ${kind}`, qty: true, qtyMax: 10, extraBelow: retail, extra: wholesale });
  }
}

const group = {
  label: LABEL,
  display: "multi",
  extraFromQty: WHOLESALE_FROM_QTY,
  note:
    "1 ชุดได้อะคริลิค 2 ชิ้นอยู่แล้ว — อยากได้มากกว่านั้นติ๊กขนาดของชิ้นที่เพิ่มแล้วใส่จำนวน " +
    "(ราคาคิดแบบอะคริลิคใส · งานสกรีน ซม.ละ 15 บาท · ไม่สกรีน ซม.ละ 10 บาท ต่อ 1 ชิ้น) " +
    "— สั่งตั้งแต่ 11 ชุดขึ้นไป คิดเรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1) ให้อัตโนมัติ",
  choices,
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
if (p.name !== EXPECT_NAME) throw new Error(`สินค้า id "${ID}" ตอนนี้ชื่อ "${p.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);

const at = (p.options ?? []).findIndex((o) => o.label === LABEL);
const before = at >= 0 ? p.options[at] : null;

console.log(`กลุ่ม "${LABEL}" — ${before ? "มีอยู่แล้ว (จะเขียนทับ)" : "ยังไม่มี (จะเพิ่มใหม่)"}`);
for (const c of choices) {
  const old = before?.choices?.find((x) => x.name === c.name);
  const mark = !old ? "＋" : old.extraBelow === c.extraBelow && old.extra === c.extra ? "  " : "~ ";
  console.log(`  ${mark} ${c.name.padEnd(20)} 1-10 ชุด +${String(c.extraBelow).padStart(3)}/ชิ้น · ${WHOLESALE_FROM_QTY}+ ชุด +${c.extra}/ชิ้น`);
}
const dropped = (before?.choices ?? []).filter((o) => !choices.some((c) => c.name === o.name));
for (const d of dropped) console.log(`  −  ${d.name} (ไม่มีในชุดใหม่)`);

// ภาพประจำตัวเลือกผูกด้วย 3d-acrylic-option-art.mjs — ถ้าของเดิมมีอยู่แล้วก็ยกมาให้ ไม่ต้องอัปซ้ำ
for (const c of choices) {
  const old = before?.choices?.find((x) => x.name === c.name);
  if (old?.imageSrc) c.imageSrc = old.imageSrc;
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  console.log("หลังเขียนแล้วให้รัน: node scripts/3d-acrylic-art.mjs && node scripts/3d-acrylic-option-art.mjs --upload --write");
  process.exit(0);
}

p.options = p.options ?? [];
if (at >= 0) p.options[at] = group;
else {
  const i = p.options.findIndex((o) => o.label === AFTER);
  p.options.splice(i >= 0 ? i + 1 : p.options.length, 0, group);
}
p.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw upErr;
console.log(`\nบันทึกแล้ว ✓ (${choices.length} ตัวเลือก)`);
console.log("ต่อไป: node scripts/3d-acrylic-art.mjs && node scripts/3d-acrylic-option-art.mjs --upload --write");
