#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — แยกกลุ่มตัวเลือกให้ชัดเจนตามที่ร้านสั่ง (24 ส.ค. 69 รอบ 2)
 *
 *   node scripts/keyring-stopper-top-screen-side.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/keyring-stopper-top-screen-side.mjs --write   # บันทึกจริง
 *
 * โครงที่ร้านต้องการให้เห็นเป็น "แผ่นล่าง" กับ "แผ่นบน" คู่กันชัด ๆ:
 *   • ขนาดแผ่นล่าง
 *       └ งานสกรีน (แผ่นล่าง)      — 1 ด้าน (ใต้/บน) · 2 ด้าน (ใต้-บน/บน-บน)  ← เป็นแกนตารางราคา
 *   • ขนาดแผ่นบน (อะคริลิคใส)
 *       └ งานสกรีน (แผ่นบน)        — สกรีนได้แค่ 1 ด้าน เลือกว่าจะ "ใต้" หรือ "บน"  ← ใหม่
 *
 * แผ่นบนสกรีน 1 ด้านเสมอ (ไม่มีค่าสกรีนเพิ่ม) → กลุ่มใหม่นี้ "ไม่ใช่แกนตารางราคา"
 * เป็นแค่ตัวเลือกที่ติดไปกับออเดอร์ว่าจะให้สกรีนผิวไหนของแผ่นบน (เหมือนกลุ่มตะขอ/สี)
 *
 * ⚠️ รันซ้ำได้ (กันด้วยการเช็คว่ามีกลุ่ม "งานสกรีน (แผ่นบน)" แล้วหรือยัง)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";

const BOTTOM_SIZE = "ขนาดแผ่นล่าง";
const BOTTOM_SCREEN = "งานสกรีน (แผ่นล่าง)";
const TOP_SIZE = "ขนาดแผ่นบน (อะคริลิคใส)";
const TOP_SCREEN = "งานสกรีน (แผ่นบน)";
const S1U = "สกรีน 1 ด้าน (ใต้)";
const S1T = "สกรีน 1 ด้าน (บน)";

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

const opts = d.options ?? [];
const byLabel = (l) => opts.find((o) => o.label === l);

if (byLabel(TOP_SCREEN)) {
  console.log(`มีกลุ่ม "${TOP_SCREEN}" อยู่แล้ว — ไม่ต้องรันซ้ำ`);
  process.exit(0);
}
for (const need of [BOTTOM_SIZE, BOTTOM_SCREEN, TOP_SIZE]) {
  if (!byLabel(need)) throw new Error(`ไม่เจอกลุ่ม "${need}" — โครงเปลี่ยนไป ตรวจก่อน`);
}

/* ── 1. สร้างกลุ่ม "งานสกรีน (แผ่นบน)" — สกรีน 1 ด้าน เลือก ใต้/บน (ไม่คิดเงินเพิ่ม) ── */
const bs = byLabel(BOTTOM_SCREEN);
const imgUnder = bs.choices.find((c) => c.name === S1U)?.imageSrc;
const imgTop = bs.choices.find((c) => c.name === S1T)?.imageSrc;
const topScreen = {
  label: TOP_SCREEN,
  note: "แผ่นบนสกรีนได้ 1 ด้าน — เลือกสกรีนผิวใต้หรือผิวบน (อะคริลิคใส · ไม่มีค่าสกรีนเพิ่ม)",
  choices: [
    { name: S1U, popular: true, ...(imgUnder ? { imageSrc: imgUnder } : {}) },
    { name: S1T, ...(imgTop ? { imageSrc: imgTop } : {}) },
  ],
};

/* ── 2. เรียงลำดับกลุ่มใหม่ให้ ขนาด+สกรีน ของแต่ละแผ่นอยู่ติดกัน ───────────── */
const head = [BOTTOM_SIZE, BOTTOM_SCREEN, TOP_SIZE];
const rest = opts.filter((o) => !head.includes(o.label)); // ตะขอ · สี · สีพิเศษ×9 (คงลำดับเดิม)
d.options = [byLabel(BOTTOM_SIZE), byLabel(BOTTOM_SCREEN), byLabel(TOP_SIZE), topScreen, ...rest];

/* ── 3. อัปเดตข้อความแท็บให้ตรง (แผ่นบนเลือกผิวสกรีนได้) ───────────────── */
const tab = (t) => (d.tabs ?? []).find((x) => x.title === t);
{
  const t = tab("แผ่นบน (ชิ้นที่ 2)");
  if (t)
    t.text = t.text.replace(
      /• แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้าน[^\n]*/,
      "• แผ่นบนเป็นอะคริลิคใส สกรีนได้ 1 ด้าน — เลือกสกรีนผิวใต้หรือผิวบนได้ (ไม่มีค่าสกรีนเพิ่ม · งานสกรีน 2 ด้านคิดเฉพาะแผ่นล่าง)"
    );
}
{
  const t = tab("ขนาดและงานสกรีน");
  if (t)
    t.text = t.text.replace(
      /• แผ่นบนเป็นอะคริลิคใส สกรีน 1 ด้านเสมอ[^\n]*/,
      "• แผ่นบนเป็นอะคริลิคใส สกรีนได้ 1 ด้าน (เลือกผิวใต้/ผิวบน) — งานสกรีน 2 ด้านมีเฉพาะแผ่นล่าง (ชิ้นหลัก)"
    );
}

/* ── สรุป ──────────────────────────────────────────────────────── */
console.log(`📦 ${d.name} (${ID})`);
console.log(`   • เพิ่มกลุ่ม "${TOP_SCREEN}" (2 ตัวเลือก: ใต้ / บน · ไม่คิดเงินเพิ่ม · ไม่เป็นแกนราคา)`);
console.log(`   • เรียงกลุ่มใหม่:`);
d.options.forEach((o, i) => console.log(`       [${i}] ${o.label}${o.label.startsWith("เลือกสีพิเศษ") ? " (…)" : ""}`));
console.log(`   • ตารางราคา/แกน driverLabels ไม่เปลี่ยน (${JSON.stringify(d.pricing.driverLabels)})`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
