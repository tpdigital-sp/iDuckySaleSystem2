#!/usr/bin/env node
/**
 * ชิงช้าสวรรค์อะคริลิค (acrylic-ferris-wheel) — จัดแผงตัวเลือกให้ไม่รก
 *   [ร้านสั่ง 4 ก.ย. 69: "ปรับให้กลุ่มตัวเลือกดูไม่รกให้หน่อย"]
 *
 *   node scripts/ferris-wheel-option-tidy.mjs           (ดูก่อน ไม่เขียน)
 *   node scripts/ferris-wheel-option-tidy.mjs --write   (เขียน + อ่านกลับเทียบ)
 *
 * ของเดิมรก 3 จุด:
 *   1) 4 ชุด (section) ทั้งที่ชุด 3/4 มีกลุ่มเดียว — ชิ้นส่วน 4 กลุ่มกระจายอยู่คนละชุด
 *   2) ทุกกลุ่มชิ้นส่วนกางค้างไว้ = ติ๊ก 8 แถวหน้าตาซ้ำกันเรียงยาว ทั้งที่เป็นของเสริมที่ไม่เลือกก็ได้
 *   3) ชื่อกลุ่ม/ชื่อตัวเลือกยาว ("(ขนาด 14.8 x 9.6 cm)" · "บวกเพิ่มชิ้นละ") ทั้งที่ป้าย +฿ บอกราคาอยู่แล้ว
 *
 * แก้เป็น: 3 ชุด — ขนาด / เนื้อวัสดุ / ตกแต่งเพิ่ม (ชิ้นส่วน 4 กลุ่มอยู่ชุดเดียวกัน เป็นสวิตช์ปิดไว้ก่อน)
 * ราคาไม่แตะเลย (extra/qtyMax/pricing เท่าเดิมทุกตัว) · driverLabels ว่าง + rules อ้างแต่กลุ่มเนื้อวัสดุ
 * จึงเปลี่ยนชื่อกลุ่มชิ้นส่วน/ชื่อตัวเลือกได้ ไม่ชน [[iducky-price-driver-trap]]
 *
 * รันซ้ำได้ — ตรงตามเป้าหมดแล้วก็ออกเฉย ๆ
 */
import { readFileSync } from "node:fs";

const PRODUCT_ID = "acrylic-ferris-wheel";
const SEC_SIZE = "1. ขนาดชุด";
const SEC_MAT = "2. เนื้อวัสดุ";
const SEC_ADD = "3. ตกแต่งเพิ่ม (ไม่บังคับ)";

/** ชื่อตัวเลือกใหม่ — ตัด "บวกเพิ่ม/ชิ้นละ" ทิ้ง (ป้าย +฿ ข้างชื่อบอกราคาอยู่แล้ว
 *  · ตัวที่ระบุจำนวนได้ตั้ง qtyUnit "ชิ้น" ให้แทน จะได้อ่านออกว่า "2 ชิ้น = +฿40") */
const CHOICE_RENAME = {
  "อะคริลิคสีพิเศษ บวกเพิ่ม": "อะคริลิคสีพิเศษ",
  "อะคริลิคสีพิเศษ บวกเพิ่มชิ้นละ": "อะคริลิคสีพิเศษ",
  "สกรีน2ด้าน บวกเพิ่ม": "สกรีน 2 ด้าน",
  "สกรีน2ด้าน บวกเพิ่ม ชิ้นละ": "สกรีน 2 ด้าน",
  "สกรีน2ด้าน บวกเพิ่มชิ้นละ": "สกรีน 2 ด้าน",
};

/** แผนทั้งแผง — เรียงตามลำดับที่จะโชว์ · label = ชื่อกลุ่มปัจจุบันใน DB (ต้องเจอครบทุกตัว) */
const PLAN = [
  { label: "ขนาด", section: SEC_SIZE },
  { label: "ประเภทอะคริลิค", section: SEC_MAT },
  { label: "สีอะคริลิค", section: SEC_MAT },
  {
    label: "แกนกลาง (แผ่นทรงกลม หมุนได้)(ขนาด 13 cm.)",
    to: "แกนกลาง (Ø 13 ซม. หมุนได้)",
    section: SEC_ADD,
    collapsible: true,
  },
  {
    label: "เสาตั้ง /จำนวน 2ชิ้น (ขนาด 14.8 x 9.6 cm)",
    to: "เสาตั้ง (2 ชิ้น · 14.8 × 9.6 ซม.)",
    section: SEC_ADD,
    collapsible: true,
    note: "+฿ ที่แสดงคือราคาต่อชิ้น — เลือกได้สูงสุด 2 ชิ้น",
  },
  {
    label: "ตัวห้อย / จำนวนไม่เกิน 6 ชิ้น (ขนาดไม่เกิน 4.5 cm (รวมรูเจาะ))",
    to: "ตัวห้อย (ไม่เกิน 6 ชิ้น · ชิ้นละไม่เกิน 4.5 ซม.)",
    section: SEC_ADD,
    collapsible: true,
    note: "+฿ ที่แสดงคือราคาต่อชิ้น — เลือกได้สูงสุด 6 ชิ้น",
  },
  { label: "ฐาน (ขนาด 9.5 x 5.5 cm)", to: "ฐาน (9.5 × 5.5 ซม.)", section: SEC_ADD, collapsible: true },
];

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✗", ...m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) die(error);
const data = row.data;
const options = data.options ?? [];

// ── ยาม: ชื่อกลุ่มที่กลุ่มอื่น/กฎอ้างถึง ห้ามเปลี่ยน ─────────────────────────
const RENAMED = new Map(PLAN.filter((p) => p.to).map((p) => [p.label, p.to]));
const referenced = new Set();
for (const o of options) for (const w of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? []), ...(o.showWhenAny ?? [])])
  if (w?.label) referenced.add(w.label);
for (const r of data.rules ?? []) { if (r.when?.label) referenced.add(r.when.label); if (r.limit?.label) referenced.add(r.limit.label); }
for (const p of data.pricing?.driverLabels ?? []) referenced.add(p);
for (const rate of data.priceRates ?? []) for (const p of rate.pricing?.driverLabels ?? []) referenced.add(p);
for (const [from] of RENAMED) if (referenced.has(from)) die(`กลุ่ม "${from}" ถูกอ้างถึง (showWhen/rules/แกนราคา) — เปลี่ยนชื่อไม่ได้`);

// ── ประกอบชุดใหม่ ────────────────────────────────────────────────────────
const seen = new Set();
const next = PLAN.map((p) => {
  const cur = options.find((o) => o.label === p.label || (p.to && o.label === p.to));
  if (!cur) die(`ไม่เจอกลุ่ม "${p.label}" — โครงสินค้าเปลี่ยนไปแล้ว หยุดไว้ก่อน`, options.map((o) => o.label));
  seen.add(cur.label);
  const o = { ...cur, label: p.to ?? p.label, section: p.section };
  if (p.note) o.note = p.note; // ของเดิมไม่มี note ในกลุ่มชิ้นส่วน (เช็คด้านล่าง)
  if (p.collapsible) o.collapsible = true; else delete o.collapsible;
  o.choices = (cur.choices ?? []).map((c) => {
    const name = CHOICE_RENAME[c.name] ?? c.name;
    // ตัวเลือกในกลุ่มชิ้นส่วนต้องเข้าตารางเปลี่ยนชื่อครบ ไม่งั้นแปลว่าโครงเปลี่ยน
    if (p.section === SEC_ADD && name === c.name && / บวกเพิ่ม/.test(c.name)) die(`ชื่อตัวเลือกไม่อยู่ในตาราง: "${c.name}"`);
    return c.qty ? { ...c, name, qtyUnit: c.qtyUnit || "ชิ้น" } : { ...c, name };
  });
  return o;
});
const left = options.filter((o) => !seen.has(o.label));
if (left.length) die("มีกลุ่มที่แผนไม่ครอบคลุม — เติมใน PLAN ก่อน:", left.map((o) => o.label));
if (next.length !== options.length) die("จำนวนกลุ่มไม่เท่าเดิม!", options.length, "→", next.length);

// ราคาต้องไม่ขยับแม้แต่บาทเดียว — เทียบ extra/qtyMax ของทุกตัวเลือก (เทียบด้วยลำดับ ไม่ใช่ชื่อ เพราะชื่อเปลี่ยน)
const feesOf = (list) => list.flatMap((o) => (o.choices ?? []).map((c) => `${c.extra ?? 0}/${c.qtyMax ?? ""}/${c.qty ? 1 : 0}`)).sort();
if (feesOf(options).join("|") !== feesOf(next).join("|")) die("ราคา/จำนวนสูงสุดเปลี่ยน — หยุด");

console.log("ก่อน:");
for (const o of options) console.log(`  [${o.section ?? "-"}] ${o.label}${o.collapsible ? " 🔽" : ""}`, (o.choices ?? []).map((c) => c.name).join(" · ").slice(0, 90));
console.log("\nหลัง:");
for (const o of next) console.log(`  [${o.section ?? "-"}] ${o.label}${o.collapsible ? " 🔽" : ""}`, (o.choices ?? []).map((c) => c.name + (c.qtyUnit ? `(${c.qtyUnit})` : "")).join(" · ").slice(0, 90));

if (JSON.stringify(options) === JSON.stringify(next)) { console.log("\n✓ เป็นแบบใหม่อยู่แล้ว ไม่ต้องเขียน"); process.exit(0); }
if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน — รันด้วย --write)"); process.exit(0); }

data.options = next;
data.savedAt = new Date().toISOString();   // ต้องเป็น ISO string เท่านั้น ไม่งั้นหน้าแก้ไขบันทึกไม่ได้ (409)

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// อ่านกลับมาเทียบ "รูปร่างของค่าจริง" — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = back.data.options ?? [];
if (got.length !== next.length) die("อ่านกลับแล้วจำนวนกลุ่มไม่ตรง!", got.map((o) => o.label));
for (const [i, want] of next.entries()) {
  const g = got[i];
  if (typeof g?.label !== "string" || g.label !== want.label) die(`กลุ่มที่ ${i} ชื่อไม่ตรง:`, g?.label, "≠", want.label);
  if (typeof g.section !== "string" || g.section !== want.section) die(`กลุ่ม "${g.label}" section ไม่ตรง:`, g.section);
  if (!!g.collapsible !== !!want.collapsible) die(`กลุ่ม "${g.label}" collapsible ไม่ตรง:`, g.collapsible);
  for (const [j, wc] of want.choices.entries()) {
    const c = g.choices?.[j];
    if (typeof c?.name !== "string" || c.name !== wc.name) die(`ตัวเลือก ${g.label}[${j}] ไม่ตรง:`, c?.name);
    if ((c.extra ?? 0) !== (wc.extra ?? 0)) die(`ราคาตัวเลือก ${g.label}/${c.name} เพี้ยน:`, c.extra);
    if (wc.qty && c.qtyUnit !== wc.qtyUnit) die(`qtyUnit ${g.label}/${c.name} ไม่ลง:`, c.qtyUnit);
  }
}
console.log(`\n✓ อ่านกลับตรงทุกข้อ · ${got.length} กลุ่ม · ชุด:`, [...new Set(got.map((o) => o.section))].join(" | "));
console.log("savedAt =", back.data.savedAt);
