#!/usr/bin/env node
/**
 * "HAND FAN พัดพลาสติกใส ทรงกลม (UV)" (hand-fan-uv) — รวม "ตำแหน่งสกรีน" เข้ากลุ่มการสกรีนเป็นชุดเดียว
 *
 *   node scripts/hand-fan-uv-screen-merge.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/hand-fan-uv-screen-merge.mjs --write    # บันทึกจริง แล้วอ่านกลับมาเทียบ
 *
 * เจ้าของร้านสั่ง 18 ก.ย. 69 (รอบ 2): "ตัวเลือกให้รวมเป็นอันเดียวกัน" — รอบแรก (hand-fan-uv-screen-position.mjs)
 * ทำเป็นกลุ่มแยก "ตำแหน่งสกรีน" + กฎล็อก ลูกค้าต้องกด 2 ที่ · รอบนี้ยุบเป็นการ์ด 3 ใบในกลุ่มการสกรีนของแต่ละขนาด:
 *   สกรีน 1 ด้าน (ด้านใต้พัด) · สกรีน 1 ด้าน (ด้านบนพัด) · สกรีน 2 ด้าน (ด้านบนพัดทั้ง 2 ด้าน) +10/+15
 * แล้วถอดกลุ่ม "ตำแหน่งสกรีน" กับกฎที่จำกัดกลุ่มนั้นทิ้ง
 *
 * ปลอดภัยเพราะแกนตารางราคาคือ "ขนาด" อย่างเดียว (pricing/priceRates.driverLabels) ชื่อตัวเลือกสกรีนไม่อยู่ในตาราง
 * ชื่อใหม่ยังขึ้นต้นด้วย "สกรีน 1 ด้าน"/"สกรีน 2 ด้าน" เหมือนเดิม — ข้อความ/ตัวจับคำในโค้ดที่ดูคำนี้ยังเจอ
 * ตะกร้าเก่าที่ค้างชื่อ "สกรีน 1 ด้าน" เฉย ๆ → resolveSelections เด้งไปตัวแรก (ใต้พัด) เอง
 * รันซ้ำได้ · ภาพประจำตัวเลือก (side-1/side-2) ใช้ของเดิม · เซ็ต savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "hand-fan-uv";
const EXPECT_NAME = "พัดพลาสติกใส";
const POS = "ตำแหน่งสกรีน";
const SIDE_1 = "สกรีน 1 ด้าน";
const SIDE_2 = "สกรีน 2 ด้าน";
/** กลุ่มการสกรีนแยกตามขนาด + ค่าสกรีน 2 ด้านของขนาดนั้น (จาก hand-fan-uv-apply.mjs) */
const SIDE_GROUPS = [
  { label: "การสกรีน (พัดอันเล็ก)", size: "พัดอันเล็ก", extra: 10 },
  { label: "การสกรีน (พัดอันใหญ่)", size: "พัดอันใหญ่", extra: 15 },
];

const UNDER = `${SIDE_1} (ด้านใต้พัด)`;
const TOP = `${SIDE_1} (ด้านบนพัด)`;
const TOP_BOTH = `${SIDE_2} (ด้านบนพัดทั้ง 2 ด้าน)`;

/** การ์ด 3 ใบ — รูปยืมจากตัวเลือกเดิม (1 ด้าน → side-1 · 2 ด้าน → side-2) */
const choicesFor = (grp, img1, img2, extra) => [
  { name: UNDER, desc: "พิมพ์ลายด้านเดียว ติดด้านใต้พัด มองผ่านเนื้อพลาสติกใส งานออกมาเงา ลายไม่โดนถลอก", imageSrc: img1 },
  { name: TOP, desc: "พิมพ์ลายด้านเดียว ติดด้านบนพัด งานออกมากึ่งด้าน สัมผัสเนื้อลายได้", imageSrc: img1 },
  {
    name: TOP_BOTH,
    desc: "พิมพ์ลายทั้งสองด้าน หน้า-หลังคนละลายได้ ติดด้านบนพัดทั้ง 2 ด้าน งานออกมากึ่งด้าน (ติดใต้พัดไม่ได้)",
    extra,
    imageSrc: img2,
  },
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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(`อ่าน ${ID} ไม่สำเร็จ — ${error.message}`);
const d = structuredClone(row.data);
if (d.name !== EXPECT_NAME) die(`ชื่อสินค้าไม่ตรงที่คาด: "${d.name}" — หยุด`);
for (const m of [d.pricing, ...(d.priceRates ?? []).map((r) => r.pricing)]) {
  if (m?.driverLabels?.some((l) => SIDE_GROUPS.some((g) => g.label === l))) die("กลุ่มการสกรีนเป็นแกนตารางราคา — เปลี่ยนชื่อไม่ได้ตรง ๆ");
}

for (const g of SIDE_GROUPS) {
  const grp = (d.options ?? []).find((o) => o.label === g.label);
  if (!grp) die(`ไม่พบกลุ่ม "${g.label}"`);
  // รันซ้ำ: การ์ดที่รวมแล้วขึ้นต้นด้วยชื่อเดิม จึงหา imageSrc ด้วย startsWith
  const img1 = grp.choices.find((c) => c.name.startsWith(SIDE_1))?.imageSrc;
  const img2 = grp.choices.find((c) => c.name.startsWith(SIDE_2))?.imageSrc;
  if (!img1 || !img2) die(`กลุ่ม "${g.label}" หา imageSrc ของ ${SIDE_1}/${SIDE_2} ไม่เจอ`);
  grp.choices = choicesFor(g, img1, img2, g.extra);
  grp.note = `${g.size} ${SIDE_2} บวกเพิ่มอันละ ${g.extra} บาท · ${SIDE_1} เลือกติดด้านใต้พัด (งานเงา) หรือด้านบนพัด (กึ่งด้าน) · ${SIDE_2} ติดด้านบนพัดทั้ง 2 ด้านเท่านั้น`;
}
d.options = d.options.filter((o) => o.label !== POS);
d.rules = (d.rules ?? []).filter((r) => r.limit?.label !== POS && r.when?.label !== POS);
d.savedAt = new Date().toISOString();

console.log("ลำดับกลุ่ม:", d.options.map((o) => o.label).join(" → "));
for (const g of SIDE_GROUPS) {
  const grp = d.options.find((o) => o.label === g.label);
  console.log(`[${g.label}]`);
  for (const c of grp.choices) console.log(`   - ${c.name}${c.extra ? ` +${c.extra}` : ""} · ${c.desc} · ${c.imageSrc.split("/").pop()}`);
}
console.log("กฎที่เหลือ:", d.rules.length);

if (!WRITE) {
  console.log("\n(ดูก่อน — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ — ${e2.message}`);
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

// อ่านกลับมาเทียบ (jsonb เรียงคีย์ใหม่ — เทียบเป็นค่า ไม่ใช่ JSON ทั้งก้อน)
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bd = back?.data ?? {};
if ((bd.options ?? []).some((o) => o.label === POS)) die(`อ่านกลับแล้วยังมีกลุ่ม "${POS}"`);
for (const g of SIDE_GROUPS) {
  const names = (bd.options ?? []).find((o) => o.label === g.label)?.choices.map((c) => [c.name, c.extra ?? 0]) ?? [];
  const want = [[UNDER, 0], [TOP, 0], [TOP_BOTH, g.extra]];
  if (JSON.stringify(names) !== JSON.stringify(want)) die(`อ่านกลับแล้วกลุ่ม "${g.label}" ไม่ตรง: ${JSON.stringify(names)}`);
}
if ((bd.rules ?? []).some((r) => r.limit?.label === POS)) die("อ่านกลับแล้วยังมีกฎของกลุ่มตำแหน่ง");
if (bd.savedAt !== d.savedAt) die(`savedAt ไม่ลง (${bd.savedAt})`);
console.log(`\n✓ เขียนแล้ว อ่านกลับตรง — 2 กลุ่มสกรีน × 3 การ์ด · ถอด "${POS}" + กฎแล้ว · savedAt ${bd.savedAt}`);
