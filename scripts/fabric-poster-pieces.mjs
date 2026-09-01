/**
 * ผ้าแขวนผนัง (fabric-poster) — ให้ลูกค้าระบุ "จำนวนชิ้นที่ต้องการต่อ 1 หลา" (1 ก.ย. 69)
 * เดิม: ตัดแบ่งตามขนาด = คิดค่าตัด/เย็บขอบเต็มจำนวนชิ้นที่ตัดได้ต่อหลา (45×45 → 6 ชิ้น)
 * ใหม่: กรอก 2 = คิดค่าตัด/เย็บขอบแค่ 2 ชิ้น (ไม่กรอก = เต็มเหมือนเดิม · เกินเพดานตัดลงมาที่เพดาน)
 * กลไกอยู่ที่ SizeFee.piecesLabel ใน src/lib/products.ts
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-pieces.mjs
 * เขียนจริง: node scripts/fabric-poster-pieces.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";
const G_CUT = "การตัด";
const G_H = "ขนาดชิ้นงาน (ยาว)";
const G_PIECES = "จำนวนชิ้นที่ต้องการ (ต่อ 1 หลา)";
const C_SPLIT = "ตัดแบ่งตามขนาด";

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

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = data.data;
let changed = 0;

/* 1. กลุ่มช่องกรอกใหม่ — วางต่อจาก "ขนาดชิ้นงาน (ยาว)" · โผล่เฉพาะตอนตัดแบ่งตามขนาด */
const OPT = {
  label: G_PIECES,
  display: "input",
  standardInput: true,
  showWhen: { label: G_CUT, choices: [C_SPLIT] },
  input: {
    kind: "number",
    unit: "ชิ้น",
    min: 1,
    integer: true,
    required: false,
    placeholder: "เช่น 2",
    hint: "สั่งตัดน้อยกว่าที่ตัดได้ก็ได้ — ค่าตัด/เย็บขอบคิดตามจำนวนนี้ · ไม่กรอก = ตัดเต็มหลา",
  },
  choices: [],
};
const idx = (d.options ?? []).findIndex((o) => o.label === G_PIECES);
if (idx < 0) {
  const at = d.options.findIndex((o) => o.label === G_H);
  d.options.splice(at < 0 ? d.options.length : at + 1, 0, OPT);
  console.log(`+ เพิ่มกลุ่ม “${G_PIECES}”`);
  changed++;
} else if (JSON.stringify(d.options[idx]) !== JSON.stringify(OPT)) {
  d.options[idx] = OPT;
  console.log(`~ อัปเดตกลุ่ม “${G_PIECES}”`);
  changed++;
}

/* 2. ผูกกับทุกค่าบริการที่คูณจำนวนชิ้น (ค่าตัดแบ่ง · เย็บขอบ · โพ้งขอบ) */
for (const o of d.options ?? []) {
  for (const c of o.choices ?? []) {
    if (!c.sizeFee?.perPiece || c.sizeFee.piecesLabel === G_PIECES) continue;
    c.sizeFee.piecesLabel = G_PIECES;
    console.log(`  ↳ ผูก piecesLabel: ${o.label} › ${c.name}`);
    changed++;
  }
}

if (!changed) {
  console.log("ไม่มีอะไรต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(ดูเฉย ๆ) แก้ ${changed} จุด — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log(`✅ เขียนแล้ว (${changed} จุด)`);
