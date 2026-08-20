#!/usr/bin/env node
/**
 * ติดป้าย "แบบยอดนิยม" (ดอกจันแดง) ให้ตัวเลือกงานสกรีนที่ลูกค้าสั่งบ่อยที่สุด
 *   สกรีน 1 ด้าน (ใต้)  ·  สกรีน 2 ด้าน (ใต้-บน)
 *
 *   node scripts/mark-popular-screen.mjs           # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/mark-popular-screen.mjs --write   # บันทึกจริง
 *
 * ป้ายนี้เก็บที่ choice.popular — เป็นป้ายบอกทางเฉย ๆ ไม่มีผลกับราคา ตารางราคา หรือการคิดเงิน
 * หน้าสินค้าโชว์เป็นดอกจันแดงท้ายชื่อ + บรรทัดอธิบายใต้กลุ่ม ("* แบบที่ลูกค้านิยมสั่ง")
 * ทีมงานกดเปิด/ปิดเองได้ที่หน้าแก้ไขสินค้า (ปุ่ม "* ยอดนิยม" ข้างปุ่ม 💬 ตีราคา)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const CLEAR = process.argv.includes("--clear"); // ถอดป้ายออกทั้งหมด (เผื่ออยากเริ่มใหม่)

const CATEGORIES = ["acrylic", "standee"];
const EXTRA_IDS = ["1-3", "1-4", "photoframe-4"];
const GROUP_RE = /^(งานสกรีน|สกรีน|การสกรีน)$/;

/** ชื่อตัวเลือกที่ถือว่าเป็นแบบยอดนิยม — เทียบกับชื่อที่แยกไว้แล้วในทุกสินค้า */
const POPULAR = [
  /1\s*ด้าน\s*\(ใต้\)/, // สกรีนใต้อะคริลิค — ลายอยู่หลังเนื้อใส เงาสวย
  /2\s*ด้าน\s*\(ใต้\s*-\s*บน\)/, // สกรีนใต้ด้านหนึ่ง + บนอีกด้าน
  /^ด้านใต้อะคริลิค$/, // "สแตนดี้ฐานไฟ" เขียนชื่อแบบนี้ (แยกใต้/บน มาแต่แรก)
];

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

const a = await sb.from("products").select("id,data").in("category", CATEGORIES);
const b = await sb.from("products").select("id,data").in("id", EXTRA_IDS);
if (a.error || b.error) throw new Error((a.error || b.error).message);
const rows = [...a.data, ...b.data]
  .filter((r, i, x) => x.findIndex((y) => y.id === r.id) === i)
  .sort((x, y) => x.id.localeCompare(y.id));

let touched = 0;
let marks = 0;
for (const row of rows) {
  const d = structuredClone(row.data);
  const opt = (d.options ?? []).find((o) => GROUP_RE.test(o.label));
  if (!opt) continue;

  const changed = [];
  for (const c of opt.choices) {
    const want = !CLEAR && POPULAR.some((re) => re.test(c.name));
    if (want === !!c.popular) continue;
    if (want) c.popular = true;
    else delete c.popular;
    changed.push(`${want ? "+" : "−"} ${c.name}`);
    if (want) marks++;
  }
  if (!changed.length) continue;

  console.log(`📦 ${row.id.padEnd(24)} "${d.name}"`);
  changed.forEach((c) => console.log(`      ${c}`));
  touched++;
  if (!WRITE) continue;
  const { error } = await sb.from("products").update({ data: d }).eq("id", row.id);
  if (error) throw new Error(`${row.id}: บันทึกไม่สำเร็จ — ${error.message}`);
}
console.log(
  WRITE
    ? `\n✅ แก้ไป ${touched} สินค้า · ติดป้ายรวม ${marks} ตัวเลือก`
    : `\n(ยังไม่บันทึก — ใส่ --write · จะแก้ ${touched} สินค้า · ติดป้ายรวม ${marks} ตัวเลือก)`
);
