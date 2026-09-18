#!/usr/bin/env node
/**
 * "HAND FAN พัดพลาสติกใส ทรงกลม (UV)" (hand-fan-uv) — เพิ่มกลุ่ม "ตำแหน่งสกรีน" ผูกกับจำนวนด้านที่สกรีน
 *
 *   node scripts/hand-fan-uv-screen-position.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/hand-fan-uv-screen-position.mjs --write    # บันทึกจริง แล้วอ่านกลับมาเทียบ
 *
 * เจ้าของร้านสั่ง 18 ก.ย. 69:
 *   • สกรีน 1 ด้าน (ด้านใต้พัด / ด้านบนพัด) สามารถเลือกได้
 *   • สกรีน 2 ด้าน (ด้านบนพัดทั้ง 2 ด้าน) เท่านั้น
 *
 * คำอธิบายตัวเลือกอิงโน้ตเดิมในหน้าสินค้า: ใต้พัด = งานออกมาเงา · บนพัด = งานออกมากึ่งด้าน
 *
 * วิธีทำ: กลุ่มใหม่ "ตำแหน่งสกรีน" (ด้านใต้พัด / ด้านบนพัด / ด้านบนพัดทั้ง 2 ด้าน) วางต่อจากกลุ่มการสกรีน
 *   + OptionRule 4 ข้อ (กลุ่มการสกรีนแยกตามขนาด 2 กลุ่ม × 1 ด้าน/2 ด้าน)
 *   สกรีน 2 ด้าน → เหลือตัวเดียว หน้าร้านโชว์เป็นป้าย 🔒 กดไม่ได้ (allowedChoices/resolveSelections ใน lib/products.ts)
 *   กลุ่มการสกรีนของขนาดที่ซ่อนอยู่ไม่ถูกนับ (allowedChoices ข้ามกฎที่กลุ่มต้นทางไม่โชว์)
 *
 * รันซ้ำได้: มีกลุ่มชื่อนี้อยู่แล้วก็เขียนทับ · กฎเก่าที่จำกัดกลุ่มนี้ถูกถอดก่อนใส่ชุดใหม่
 * ราคา/แกนตาราง/ภาพ ไม่แตะ · เซ็ต savedAt ให้หน้าร้านรู้ว่าเปลี่ยน (ดู memory iducky-script-write-product)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "hand-fan-uv";
const EXPECT_NAME = "พัดพลาสติกใส";

const POS = "ตำแหน่งสกรีน";
const UNDER = "ด้านใต้พัด";
const TOP = "ด้านบนพัด";
const TOP_BOTH = "ด้านบนพัดทั้ง 2 ด้าน";
const SIDE_1 = "สกรีน 1 ด้าน";
const SIDE_2 = "สกรีน 2 ด้าน";
/** กลุ่มการสกรีนแยกตามขนาด (จาก hand-fan-uv-apply.mjs — ค่าสกรีน 2 ด้านคนละเรท) */
const SIDE_GROUPS = ["การสกรีน (พัดอันเล็ก)", "การสกรีน (พัดอันใหญ่)"];

const GROUP = {
  label: POS,
  section: "2. งานสกรีน",
  display: "cards",
  note: `${SIDE_1} เลือกได้ว่าลายอยู่ด้านใต้พัดหรือด้านบนพัด · ${SIDE_2} ทำได้เฉพาะด้านบนพัดทั้ง 2 ด้าน`,
  choices: [
    { name: UNDER, desc: "ติดลายด้านใต้พัด มองผ่านเนื้อพลาสติกใส งานออกมาเงา ลายไม่โดนถลอก" },
    { name: TOP, desc: "ติดลายด้านบนพัด งานออกมากึ่งด้าน สัมผัสเนื้อลายได้" },
    { name: TOP_BOTH, desc: `${SIDE_2} ติดลายด้านบนพัดทั้งสองด้าน งานออกมากึ่งด้าน (ติดใต้พัดไม่ได้)` },
  ],
};

const rule = (label, choice, allow) => ({ when: { label, choice, choices: [choice] }, limit: { label: POS, allow } });
const RULES = SIDE_GROUPS.flatMap((g) => [rule(g, SIDE_1, [UNDER, TOP]), rule(g, SIDE_2, [TOP_BOTH])]);

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
if (d.name !== EXPECT_NAME) die(`ชื่อสินค้าไม่ตรงที่คาด: "${d.name}" (คาด "${EXPECT_NAME}") — หยุด กันเขียนทับผิดตัว`);

const opts = d.options ?? [];
for (const g of SIDE_GROUPS) {
  const grp = opts.find((o) => o.label === g);
  if (!grp) die(`ไม่พบกลุ่ม "${g}"`);
  for (const n of [SIDE_1, SIDE_2]) if (!grp.choices.some((c) => c.name === n)) die(`กลุ่ม "${g}" ไม่มีตัวเลือก "${n}"`);
}

// วางกลุ่มใหม่ต่อจากกลุ่มการสกรีนกลุ่มสุดท้าย (ก่อน "ตะขอ") · มีอยู่แล้ว = ทับที่เดิม
const next = opts.filter((o) => o.label !== POS);
const lastSide = Math.max(...SIDE_GROUPS.map((g) => next.findIndex((o) => o.label === g)));
next.splice(lastSide + 1, 0, GROUP);
d.options = next;
d.rules = [...(d.rules ?? []).filter((r) => r.limit?.label !== POS), ...RULES];
d.savedAt = new Date().toISOString();

console.log("ลำดับกลุ่ม:", d.options.map((o) => o.label).join(" → "));
console.log("กฎ:");
for (const r of RULES) console.log(`  ${r.when.label} = ${r.when.choice} → ${POS} เหลือ [${r.limit.allow.join(", ")}]`);

if (!WRITE) {
  console.log("\n(ดูก่อน — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ — ${e2.message}`);
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

// อ่านกลับมาเทียบ — update() คืนไม่ error ได้ทั้งที่ค่าไม่ลง (memory iducky-script-write-product ข้อ 4)
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bd = back?.data ?? {};
const gotGroup = (bd.options ?? []).find((o) => o.label === POS);
const gotRules = (bd.rules ?? []).filter((r) => r.limit?.label === POS);
// jsonb เรียงคีย์ใหม่ตอนเก็บ — เทียบด้วยค่าเป็นคู่ ๆ ไม่ใช่ JSON ทั้งก้อน
const same = (a, b) => JSON.stringify(a.map((c) => [c.name, c.desc])) === JSON.stringify(b.map((c) => [c.name, c.desc]));
if (!gotGroup || !same(gotGroup.choices, GROUP.choices)) die("อ่านกลับแล้วกลุ่มไม่ตรง");
if (gotRules.length !== RULES.length) die(`อ่านกลับแล้วกฎได้ ${gotRules.length}/${RULES.length}`);
if (bd.savedAt !== d.savedAt) die(`savedAt ไม่ลง (${bd.savedAt})`);
console.log(`\n✓ เขียนแล้ว อ่านกลับตรง — กลุ่ม "${POS}" ${gotGroup.choices.length} ตัวเลือก · กฎ ${gotRules.length} ข้อ · savedAt ${bd.savedAt}`);
