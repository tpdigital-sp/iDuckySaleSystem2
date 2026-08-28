/**
 * กระดาษรองหลัง (package-backing) — 3 เรื่องตามที่ร้านสั่ง 27 ส.ค. 69
 *
 * 1) 1 หน่วย = 1 แผ่น A3  → ใส่ตารางราคาหน่วย "แผ่น A3" (เดิมไม่มี pricing เลย หน้าร้านจึงเรียก "ชิ้น")
 *    แกนตาราง = กลุ่ม "ขนาด" ทุกช่อง 45 บาท (ราคาเท่าเดิมทุกขนาด) — ต้องมีครบทุกตัวเลือก
 *    ไม่งั้นราคาหล่นไป product.price เงียบ ๆ
 * 2) กำหนดขนาดเองได้ + บอกจำนวนใบที่ได้ต่อ 1 แผ่น A3 (แพทเทิร์นเดียวกับ Sticker-PP-Digital):
 *    ตัวเลือก "📐 กำหนดขนาดเอง" + ช่องกรอกกว้าง/สูง (standardInput) + sheetYield บนช่องสูง
 *    สเปคแผ่น 40.5 × 30.4 gap 0.8 ได้จาก grid-search ให้ตรงตารางร้าน (20/12/14/12/6/5/4 ใบ)
 *    — ชุดที่ "ไม่เคยบอกเกินจริง" สักขนาด (ตรงเป๊ะ 5/7 · ต่ำกว่าตาราง 1 ใบที่ 7.5×10 และ 14×20.5)
 *    capDesigns บนช่องสูง = เพดานจำนวนลายของขนาดที่กรอกเอง (เท่าจำนวนใบที่ตัดได้จริง)
 * 3) คละลาย: ขั้นต่ำ 1 ลาย/แผ่น A3 · ลายที่เกินจำนวนแผ่นคิดเพิ่มลายละ 5 บาท
 *    = mixRule { baseFee 0, includedDesigns 1, extraFee 5 } (เดิม 2 ลาย/แผ่น เหมาแผ่นละ 10)
 *
 * read-modify-write บนแถวจริง รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const ID = "package-backing";
const GROUP = "ขนาด";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const W_LABEL = "ขนาด (กว้าง)";
const H_LABEL = "ขนาด (สูง)";
const SHEET = "แผ่น A3";
const PRICE = 45;

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");
/* เทียบค่าแบบไม่สนลำดับคีย์ — ของที่อ่านกลับจาก DB คีย์สลับลำดับ ทำให้ "เปลี่ยน" ทุกครั้งทั้งที่เหมือนเดิม */
const same = (a, b) => stable(a) === stable(b);
const stable = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
      : x
  );

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) {
  console.log("SKIP —", error?.message || "not found");
  process.exit(1);
}
const p = row.data;
const opts = (p.options ??= []);
const size = opts.find((o) => o.label === GROUP);
if (!size) {
  console.log(`SKIP — ไม่พบกลุ่ม "${GROUP}"`);
  process.exit(1);
}
const log = [];

/* ---------- 1) หน่วย = แผ่น A3 (ตารางราคาแกน "ขนาด") ---------- */
if (!size.choices.some((c) => c.name === CUSTOM)) {
  size.choices.push({ name: CUSTOM });
  log.push(`เพิ่มตัวเลือก "${CUSTOM}"`);
}
const cells = {};
for (const c of size.choices) cells[c.name] = [p.pricing?.cells?.[c.name]?.[0] ?? PRICE];
const pricing = {
  unit: SHEET,
  driverLabels: [GROUP],
  tiers: [{ upTo: null, label: "ทุกจำนวน" }],
  cells,
};
if (!same(p.pricing, pricing)) {
  p.pricing = pricing;
  log.push(`ตารางราคา หน่วย "${SHEET}" · ${Object.keys(cells).length} แถว × ฿${PRICE}`);
}

/* ---------- 2) ช่องกรอกขนาดเอง + จำนวนใบต่อแผ่น ---------- */
const showWhen = { label: GROUP, choices: [CUSTOM] };
if (!opts.some((o) => o.label === W_LABEL)) {
  opts.splice(opts.indexOf(size) + 1, 0,
    {
      label: W_LABEL,
      choices: [],
      display: "input",
      standardInput: true,
      showWhen,
      input: {
        kind: "number", unit: "ซม.", min: 3, max: 29, placeholder: "เช่น 8",
        hint: "ขนาดใบสำเร็จหลังไดคัท — ขนาดที่กำหนดเองไม่มีซองให้ (ซองมีเฉพาะขนาดสำเร็จด้านบน)",
      },
    },
    {
      label: H_LABEL,
      choices: [],
      display: "input",
      standardInput: true,
      capDesigns: true,
      showWhen,
      input: { kind: "number", unit: "ซม.", min: 3, max: 40, placeholder: "เช่น 12" },
      sheetYield: { pairLabel: W_LABEL, sheetW: 40.5, sheetH: 30.4, gap: 0.8, sheetName: SHEET },
    }
  );
  log.push(`เพิ่มช่องกรอก "${W_LABEL}" / "${H_LABEL}" (sheetYield 40.5×30.4 gap 0.8)`);
}

/* ตัวเลือกขนาดสำเร็จ — โชว์ "ได้ N ใบ / แผ่น A3" (perUnit เดิมเป็นเพดานลาย ไม่ได้โชว์) */
for (const c of size.choices) {
  if (!c.perUnit) continue;
  if (c.piecesPerUnit !== c.perUnit) {
    c.piecesPerUnit = c.perUnit;
    log.push(`piecesPerUnit ${c.name} = ${c.perUnit}`);
  }
  const badge = `ได้ ${c.perUnit} ใบ / ${SHEET}`;
  if (c.badge !== badge) {
    c.badge = badge;
    log.push(`ป้าย ${c.name} → "${badge}"`);
  }
}

/* ---------- 3) คละลาย 1 ลาย/แผ่น · เกินลายละ 5 ---------- */
const mixRule = { baseFee: 0, includedDesigns: 1, extraFee: 5 };
if (!same(p.mixRule, mixRule)) {
  p.mixRule = mixRule;
  log.push("คละลาย → 1 ลาย/แผ่น A3 · ลายที่เกินลายละ ฿5");
}

/* ---------- ข้อความที่บอกกติกาเก่า ---------- */
const MIX_NEW =
  "1 แผ่น A3 = 1 ลาย (ขั้นต่ำคละลายละ 1 แผ่น A3) — สั่ง 5 แผ่นคละได้ 5 ลายโดยไม่คิดเพิ่ม · อยากได้ลายมากกว่าจำนวนแผ่น (ซอยหลายลายในแผ่นเดียว) คิดเพิ่มลายละ 5 บาท";
const swaps = [
  [/• 1 แผ่น A3 ต่อ 1 ลาย — คละได้ 2 ลายต่อแผ่น โดยหารครึ่งลงตัว \(คละลายบวกแผ่นละ 10 บาท\)/g, `• ${MIX_NEW}`],
  [/1 แผ่น A3 คละได้ 2 ลาย โดยหารครึ่งลงตัว คละลายบวกแผ่นละ 10 บาท/g, MIX_NEW],
  [/• คิดเป็นแผ่น A3 — แผ่นละ 45 บาท ไม่มีขั้นต่ำในการสั่งผลิต/g,
   "• คิดเป็นแผ่น A3 — 1 หน่วยที่สั่ง = 1 แผ่น A3 แผ่นละ 45 บาท ไม่มีขั้นต่ำในการสั่งผลิต"],
];
const CUSTOM_LINE =
  "• 📐 กำหนดขนาดเองได้ — กรอกกว้าง × สูง (ซม.) แล้วระบบคำนวณให้ว่าได้กี่ใบต่อ 1 แผ่น A3 · ขนาดกำหนดเองไม่มีซองให้";
const applySwaps = (s) => (typeof s === "string" ? swaps.reduce((t, [re, to]) => t.replace(re, to), s) : s);

for (const t of p.tabs ?? []) {
  const before = t.text;
  t.text = applySwaps(t.text);
  if (t.title === "รายละเอียดงานพิมพ์" && !t.text.includes("กำหนดขนาดเองได้")) {
    t.text = t.text.replace(/(::ราคาบวกเพิ่ม::)/, `${CUSTOM_LINE}\n$1`);
  }
  if (t.text !== before) log.push(`แก้ข้อความแท็บ "${t.title}"`);
}
for (const f of p.seo?.faqs ?? []) {
  const before = f.a;
  f.a = applySwaps(f.a);
  if (f.q.includes("ราคาเท่าไหร่") && !f.a.includes("กำหนดขนาดเอง")) {
    f.a += " · กำหนดขนาดเองได้ ระบบบอกจำนวนใบที่ได้ต่อ 1 แผ่น A3 ให้";
  }
  if (f.a !== before) log.push(`แก้ FAQ "${f.q}"`);
}
p.terms = applySwaps(p.terms);
const HL = "📐 กำหนดขนาดเองได้ — ระบบคำนวณจำนวนใบต่อ 1 แผ่น A3 ให้";
if (Array.isArray(p.highlights) && !p.highlights.some((h) => h.includes("กำหนดขนาดเอง"))) {
  p.highlights.push(HL);
  log.push("เพิ่ม highlight กำหนดขนาดเอง");
}

/* ---------- สรุป ---------- */
console.log(`${ID} — ${log.length} จุด`);
for (const l of log) console.log("  •", l);
console.log("  pricing:", JSON.stringify(p.pricing).slice(0, 200));
console.log("  mixRule:", JSON.stringify(p.mixRule));
console.log("  ขนาด:", size.choices.map((c) => `${c.name}${c.piecesPerUnit ? ` (${c.piecesPerUnit})` : ""}`).join(" | "));
console.log("  ช่องกรอก:", opts.filter((o) => o.display === "input").map((o) => `${o.label} ${o.input.min}-${o.input.max}${o.input.unit}`).join(" · "));

if (!WRITE) {
  console.log("  (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}
const { error: upErr } = await sb.from("products").update({ data: p, price: p.price }).eq("id", ID);
console.log(upErr ? "  ❌ " + upErr.message : "  ✅ บันทึกแล้ว");
