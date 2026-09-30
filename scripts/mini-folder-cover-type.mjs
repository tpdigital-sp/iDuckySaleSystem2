/**
 * MiNi FOLDER (mini-folder) — เพิ่มกลุ่มตัวเลือก "แบบปก": แบบใส / แบบกลิสเตอร์
 *
 *   node scripts/mini-folder-cover-type.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/mini-folder-cover-type.mjs --write    # เขียนจริง + อ่านกลับตรวจ
 *
 * เจ้าของร้านสั่ง 30 ก.ย. 69: "จะมีตัวเลือกสินค้าเพิ่ม · แบบใส · แบบกลิสเตอร์"
 *   • highlights ของสินค้าบอกอยู่แล้วว่า "มี 2 แบบ ปกใส และกลิตเตอร์" แต่ยังไม่มีกลุ่มให้ลูกค้าเลือก
 *   • ราคาเท่ากันทั้ง 2 แบบ (ตารางราคาแกน ขนาด×สีตะขอ ไม่แตะ) → กลุ่มปุ่มธรรมดา ไม่มี +฿
 *   • ยังไม่มีรูปแบบกลิสเตอร์ในสตอเรจ → ไม่ใส่ imageSrc (เติมทีหลังจากหน้าแก้ไขได้)
 *   • วางไว้หลัง "ขนาด" เป็นชุด "2. แบบปก" · ชุดตะขอเลื่อนเป็น "3. ตะขอ"
 *
 * รันซ้ำได้: มีกลุ่มแล้ว = แทนที่ตัวเดิม ไม่งอกซ้ำ · savedAt ใหม่เป็น ISO string (กันหน้าแก้ไขที่เปิดค้างบันทึกทับ)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mini-folder";
const GROUP_LABEL = "แบบปก";
const SECTION = "2. แบบปก";
const HOOK_SECTION_OLD = "2. ตะขอ";
const HOOK_SECTION_NEW = "3. ตะขอ";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const COVER_GROUP = {
  label: GROUP_LABEL,
  section: SECTION,
  choices: [
    { name: "แบบใส", desc: "ปกพลาสติกใส เห็นภาพด้านในชัด" },
    { name: "แบบกลิสเตอร์", desc: "ปกใสโรยกลิสเตอร์ วิบวับ ✨" },
  ],
};

function die(msg) {
  console.error("✗", msg);
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).maybeSingle();
if (error || !row) die(`อ่านสินค้าไม่สำเร็จ: ${error?.message ?? "ไม่พบ " + ID}`);
if (!/mini folder|แฟ้มจิ๋ว/i.test(row.name)) die(`id ${ID} เป็นสินค้าอื่น: "${row.name}"`);

const d = structuredClone(row.data);
const options = [...(d.options ?? [])];

// ห้าม options.find(label) เดี่ยว ๆ — เช็คว่าไม่มีชื่อซ้ำก่อน (ดู iducky-duplicate-group-label)
const dupe = options.filter((o) => o.label === GROUP_LABEL);
if (dupe.length > 1) die(`มีกลุ่ม "${GROUP_LABEL}" ซ้ำ ${dupe.length} กลุ่ม — ไปดูในหลังบ้านก่อน`);

const sizeIdx = options.findIndex((o) => o.label === "ขนาด");
if (sizeIdx < 0) die('ไม่พบกลุ่ม "ขนาด" — โครงสินค้าเปลี่ยนไปจากที่สคริปต์รู้จัก');

const at = options.findIndex((o) => o.label === GROUP_LABEL);
if (at >= 0) {
  // รันซ้ำ: คงรูปที่ทีมงานอาจเติมทีหลัง (imageSrc/desc) ไว้ แทนที่เฉพาะโครง
  const keep = options[at];
  options[at] = {
    ...COVER_GROUP,
    choices: COVER_GROUP.choices.map((c) => {
      const old = keep.choices?.find((k) => k.name === c.name);
      return old ? { ...c, ...old, name: c.name } : c;
    }),
  };
} else {
  options.splice(sizeIdx + 1, 0, COVER_GROUP);
}

// ชุดตะขอเลื่อนลำดับ 2 → 3 (ทั้ง 2 กลุ่มที่ใช้ชุดนี้)
for (const o of options) if (o.section === HOOK_SECTION_OLD) o.section = HOOK_SECTION_NEW;

// ยาม: กลุ่มใหม่ต้องไม่หลงเป็นแกนราคาและไม่โดน rules ครอบ
const drivers = new Set([...(d.pricing?.driverLabels ?? []), ...(d.priceRates ?? []).flatMap((r) => r.pricing?.driverLabels ?? [])]);
if (drivers.has(GROUP_LABEL)) die("กลุ่มใหม่ไปโผล่ใน driverLabels — ไม่ควรเกิด");
if ((d.rules ?? []).some((r) => r.limit?.label === GROUP_LABEL || r.when?.label === GROUP_LABEL)) die("มี rules อ้างกลุ่มใหม่อยู่ก่อน — ตรวจก่อน");

d.options = options;
d.savedAt = new Date().toISOString();

console.log(`สินค้า: ${row.name} (${ID})`);
console.log("ลำดับกลุ่มหลังแก้:");
for (const o of options) console.log(`  [${o.section ?? "-"}] ${o.label} → ${o.choices.map((c) => c.name).join(" / ")}${o.display ? ` (${o.display})` : ""}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write เพื่อบันทึกจริง)");
  process.exit(0);
}

const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(`เขียนไม่สำเร็จ: ${e2.message}`);
if (!upd || upd.length !== 1) die(`update โดน ${upd?.length ?? 0} แถว (คาด 1)`);

// อ่านกลับเทียบรูปร่างค่าจริง (ไม่เทียบตัวแปรกับตัวแปร)
const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3 || !back) die(`อ่านกลับไม่สำเร็จ: ${e3?.message}`);
const bd = back.data;
const g = (bd.options ?? []).filter((o) => o.label === GROUP_LABEL);
if (g.length !== 1) die(`อ่านกลับพบกลุ่ม "${GROUP_LABEL}" ${g.length} กลุ่ม (คาด 1)`);
const names = g[0].choices.map((c) => c.name);
if (names.join("|") !== "แบบใส|แบบกลิสเตอร์") die(`ตัวเลือกอ่านกลับไม่ตรง: ${names.join(" / ")}`);
if (g[0].section !== SECTION) die(`section อ่านกลับไม่ตรง: ${g[0].section}`);
if ((bd.options ?? [])[sizeIdx + 1]?.label !== GROUP_LABEL) die("ตำแหน่งกลุ่มไม่ตรง (ควรอยู่ถัดจาก ขนาด)");
if ((bd.options ?? []).some((o) => o.section === HOOK_SECTION_OLD)) die("ยังมีชุดตะขอเลข 2 ค้าง");
if (typeof bd.savedAt !== "string" || bd.savedAt !== d.savedAt) die(`savedAt อ่านกลับไม่ตรง: ${bd.savedAt}`);
if (JSON.stringify(bd.pricing) !== JSON.stringify(row.data.pricing)) die("ตารางราคาเรทแรกเปลี่ยน — ไม่ควรเกิด");
if (JSON.stringify(bd.priceRates) !== JSON.stringify(row.data.priceRates)) die("priceRates เปลี่ยน — ไม่ควรเกิด");
if (JSON.stringify(bd.rules) !== JSON.stringify(row.data.rules)) die("rules เปลี่ยน — ไม่ควรเกิด");

console.log(`\n✓ เขียนแล้วและอ่านกลับตรง · savedAt ${bd.savedAt}`);
