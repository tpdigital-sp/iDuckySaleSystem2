#!/usr/bin/env node
/**
 * Mini Calendar (mini-calendar) — เพิ่มกลุ่มตัวเลือก "จำนวนแผ่น" (พนักงานขอ 18 ก.ย. 69)
 *
 *   node scripts/mini-calendar-pages-option.mjs            (dry-run ดูผลก่อน)
 *   node scripts/mini-calendar-pages-option.mjs --write    (เขียน options + อ่านกลับเทียบ)
 *
 * ใบสเปคร้าน (ปฏิทินมินิ): 8 แผ่น = 1 A3 (16 หน้า) · 14 แผ่น = 1 A3 (28 หน้า) → ราคาเท่ากัน
 *   → กลุ่มนี้ไม่บวกราคา ไม่เป็นแกนตารางราคา (pricing.driverLabels ว่างเหมือนเดิม)
 *   → ค่าเคลือบคิดต่อแผ่น A3 (perSheet 1) ใช้ A3 1 แผ่นทั้งสองแบบ ไม่ต้องแตะ
 * ชื่อตัวเลือก/โน้ตชุดเดียวกับปฏิทินไดคัทตามทรง (new-mt2s9i0u-5323) ให้ใบงานอ่านเหมือนกัน
 *
 * รันซ้ำได้: มีกลุ่มอยู่แล้ว = เขียนทับที่เดิม · กลุ่มอื่นไม่แตะ (เช็คหลังเขียนว่าไม่หาย)
 * ⚠️ mini-calendar-build.mts เขียน d.options ทับทั้งก้อน — ใส่ PAGES_OPTION ไว้ที่นั่นด้วยแล้ว
 */
import { readFileSync } from "node:fs";

const PRODUCT_ID = "mini-calendar";
const SIZE_GROUP = "ขนาด";
const GROUP = "จำนวนแผ่น";
const CHOICES = ["8 แผ่น (16หน้า)", "14 แผ่น (28หน้า)"];
const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗", m); process.exit(1); };

const { data: row, error: readErr } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
if (readErr) die(JSON.stringify(readErr));
const data = row.data;
if ((data.pricing?.driverLabels ?? []).length) die("ตารางราคามีแกนแล้ว — โครงสินค้าเปลี่ยน หยุดไว้ก่อน");
const options = data.options ?? [];
const before = options.map((o) => o.label);
const sizeAt = options.findIndex((o) => o.label === SIZE_GROUP);
if (sizeAt < 0) die(`ไม่เจอกลุ่ม "${SIZE_GROUP}" — โครงสินค้าเปลี่ยน`);

const group = {
  label: GROUP,
  note: "8 แผ่น = 16 หน้า (ปกหน้า + 12 เดือน) · 14 แผ่น = 28 หน้า (แยกเดือนละแผ่น) — ราคาเท่ากัน",
  choices: CHOICES.map((name) => ({ name })),
  ...(options[sizeAt].section ? { section: options[sizeAt].section } : {}),
};

const at = options.findIndex((o) => o.label === GROUP);
if (at >= 0) options[at] = group;
else options.splice(sizeAt + 1, 0, group);

console.log(`${row.name} — กลุ่มหลังแก้:`);
for (const o of options) console.log(`  · ${o.label}${o.section ? `  [${o.section}]` : ""}${o.label === GROUP ? "  ← " + CHOICES.join(" / ") : ""}`);
if (!WRITE) { console.log("\n(dry-run — รันด้วย --write เพื่อเขียนจริง)"); process.exit(0); }

data.options = options;
data.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || upd?.length !== 1) die("update พัง/ไม่ได้ 1 แถว " + JSON.stringify(updErr));

const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
const g = got.find((o) => o.label === GROUP);
const lost = before.filter((l) => !got.some((o) => o.label === l));
const fails = [
  [back.data.savedAt === data.savedAt, "savedAt ไม่ตรง — ค่าไม่ลงจริง"],
  [got.filter((o) => o.label === GROUP).length === 1, "กลุ่มจำนวนแผ่นซ้ำ/หาย"],
  [Array.isArray(g?.choices) && g.choices.length === 2 && g.choices.every((c, i) => c.name === CHOICES[i] && !c.price), "ตัวเลือกไม่ตรง/มีราคาบวก"],
  [got[got.findIndex((o) => o.label === SIZE_GROUP) + 1]?.label === GROUP, "ไม่ได้อยู่ถัดจากกลุ่มขนาด"],
  [lost.length === 0, `กลุ่มเดิมหาย: ${lost.join(", ")}`],
].filter(([ok]) => !ok);
if (fails.length) die("อ่านกลับไม่ตรง: " + fails.map((f) => f[1]).join(" · "));
console.log(`✓ เพิ่มกลุ่ม "${GROUP}" แล้ว · ทั้งหมด ${got.length} กลุ่ม · savedAt = ${back.data.savedAt}`);
