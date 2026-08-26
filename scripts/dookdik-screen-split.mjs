#!/usr/bin/env node
/**
 * "อะคริลิคดุ๊กดิ๊ก" — แยกกลุ่มงานสกรีนตามแบบ ให้ตรงเงื่อนไขสินค้า
 * "สกรีน 2 ด้าน (แผ่นหน้าและแผ่นหลัง) — เฉพาะแบบพวงกุญแจ"
 * (Griptok/แม่เหล็ก ด้านหลังติดอุปกรณ์ สกรีนได้ด้านเดียว)
 *
 * ต่อจาก dookdik-hooks-screen.mjs ที่ใส่กลุ่ม "งานสกรีน" 4 ตัวเลือกให้ทุกแบบ:
 *   • "งานสกรีน" (4 ตัวเลือก รวม 2 ด้าน) → โชว์เฉพาะ แบบ=พวงกุญแจ
 *   • เพิ่ม "งานสกรีน (Griptok / แม่เหล็ก)" → 1 ด้าน ใต้/บน เท่านั้น โชว์เฉพาะสองแบบนั้น
 * ทุกตัวเลือก 0฿ เหมือนเดิม (ราคารวมค่าสกรีนแล้ว)
 *
 *   node scripts/dookdik-screen-split.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/dookdik-screen-split.mjs --write   # บันทึกจริง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-dookdik";
const KEYRING_NOTE =
  "**ราคารวมค่าสกรีน 2 ด้านแล้ว** — เลือกสกรีน 2 ด้าน (แผ่นหน้าและแผ่นหลัง) ได้โดยไม่บวกเพิ่ม · เฉพาะแบบพวงกุญแจ";
const OTHER_LABEL = "งานสกรีน (Griptok / แม่เหล็ก)";
const OTHER_NOTE =
  "แบบ Griptok / แม่เหล็ก ด้านหลังติดอุปกรณ์ สกรีนได้ด้านเดียว — สกรีน 2 ด้านมีเฉพาะแบบพวงกุญแจ";

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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const screen = (d.options ?? []).find((o) => o.label === "งานสกรีน");
if (!screen) throw new Error('ไม่พบกลุ่ม "งานสกรีน" — รัน scripts/dookdik-hooks-screen.mjs ก่อน');
if ((d.options ?? []).some((o) => o.label === OTHER_LABEL))
  throw new Error(`มีกลุ่ม "${OTHER_LABEL}" อยู่แล้ว — แยกไปแล้ว ไม่ต้องรันซ้ำ`);

screen.showWhen = { label: "แบบ", choices: ["พวงกุญแจ"] };
screen.note = KEYRING_NOTE;

const oneSide = structuredClone(screen);
oneSide.label = OTHER_LABEL;
oneSide.note = OTHER_NOTE;
oneSide.showWhen = { label: "แบบ", choices: ["Griptok", "แม่เหล็ก"] };
oneSide.choices = oneSide.choices.filter((c) => c.name.startsWith("สกรีน 1 ด้าน"));
if (oneSide.choices.length !== 2)
  throw new Error(`คัดตัวเลือก 1 ด้านได้ ${oneSide.choices.length} ตัว (ต้องได้ 2) — ตรวจชื่อตัวเลือกก่อน`);

const idx = d.options.findIndex((o) => o.label === "งานสกรีน");
d.options.splice(idx + 1, 0, oneSide);
d.savedAt = new Date().toISOString();

console.log(`📦 ${d.name} (${ID})`);
console.log(`   "งานสกรีน" → โชว์เมื่อ แบบ=พวงกุญแจ (${screen.choices.length} ตัวเลือก · แก้ note)`);
console.log(`   + "${OTHER_LABEL}" → โชว์เมื่อ แบบ=Griptok/แม่เหล็ก (${oneSide.choices.map((c) => c.name).join(" · ")})`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
