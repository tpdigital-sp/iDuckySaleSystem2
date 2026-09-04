// Sticker Gold | Silver | RoseGold (sticker-gold-silver-rosegold): แบ่ง "ชุดตัวเลือก" แบบเดียวกับ POSTER
// (ProductOption.section — กลุ่มที่ชื่อชุดเดียวกันและอยู่ติดกัน = กรอบเดียว มีหัวชุดเลขวงกลม กด หุบ/กาง ได้)
// ผู้ใช้สั่ง 4 ก.ย. 69 — อ้างอิงโครงของ poster-a3 (1. เนื้อกระดาษ / 2. แนววาง + จำนวนด้าน / 3. เคลือบผิว)
//   1. เนื้อ + ผิว        : สีเนื้อสติ๊กเกอร์ · ผิว
//   2. พิมพ์ลาย + ไดคัท   : ขายแบบ · แบบไดคัท · ขอบไดคัท
//   3. ขนาด + จุดไดคัท    : ขนาดตัด (+ช่องกรอก ก./ส.) · จำนวนจุดไดคัท (+ขนาดไดคัท ก./ส.)
// ⚠️ ชุดจะรวมกรอบได้ต่อเมื่อกลุ่ม "อยู่ติดกัน" ใน options — สคริปต์จึงตรวจว่าลำดับยังเรียงตามชุดอยู่
// รัน: node scripts/sticker-gold-option-sections.mjs           (dry-run)
//      node scripts/sticker-gold-option-sections.mjs --write
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "sticker-gold-silver-rosegold";
const WRITE = process.argv.includes("--write");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const SECTION_OF = {
  "สีเนื้อสติ๊กเกอร์": "1. เนื้อ + ผิว",
  "ผิว": "1. เนื้อ + ผิว",
  "ขายแบบ": "2. พิมพ์ลาย + ไดคัท",
  "แบบไดคัท": "2. พิมพ์ลาย + ไดคัท",
  "ขอบไดคัท": "2. พิมพ์ลาย + ไดคัท",
  "ขนาดตัด": "3. ขนาด + จุดไดคัท",
  "ขนาดตัด (กว้าง)": "3. ขนาด + จุดไดคัท",
  "ขนาดตัด (สูง)": "3. ขนาด + จุดไดคัท",
  "จำนวนจุดไดคัท": "3. ขนาด + จุดไดคัท",
  "ขนาดไดคัท (กว้าง)": "3. ขนาด + จุดไดคัท",
  "ขนาดไดคัท (สูง)": "3. ขนาด + จุดไดคัท",
};

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;
const groups = row.data.options ?? [];

const unknown = groups.map(g => (g.label ?? "").trim()).filter(l => !SECTION_OF[l]);
if (unknown.length) die("มีกลุ่มที่ยังไม่ได้กำหนดชุด: " + unknown.join(", ") + " (เติมใน SECTION_OF ก่อน ไม่งั้นกลุ่มนั้นหลุดออกนอกกรอบ)");

let changed = 0;
for (const g of groups) {
  const want = SECTION_OF[(g.label ?? "").trim()];
  if (g.section === want) { console.log(`คงเดิม   ${want}  ←  ${g.label}`); continue; }
  console.log(`ตั้งชุด  ${want}  ←  ${g.label}${g.section ? ` (เดิม ${g.section})` : ""}`);
  g.section = want;
  changed++;
}

// กรอบชุดรวมได้เฉพาะกลุ่มที่ "ติดกัน" — ชุดเดียวกันโผล่ 2 ช่วง = ได้ 2 กรอบชื่อซ้ำ
const runs = [];
for (const g of groups) if (runs[runs.length - 1] !== g.section) runs.push(g.section);
const dup = runs.filter((s, i) => runs.indexOf(s) !== i);
if (dup.length) die("ชุดถูกคั่นกลาง (จะได้กรอบซ้ำ): " + dup.join(", ") + " — เรียงลำดับกลุ่มให้ชุดเดียวกันอยู่ติดกันก่อน");

console.log(`\n${changed} กลุ่มจะถูกตั้งชุด · ${runs.length} กรอบ: ${runs.join(" | ")}${WRITE ? "" : "  (dry-run — เติม --write เพื่อบันทึกจริง)"}`);

if (WRITE && changed) {
  row.data.savedAt = new Date().toISOString();
  const up = await sb.from("products").update({ data: row.data }).eq("id", ID).select("data");
  if (up.error) throw up.error;
  if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");
  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back?.data?.savedAt !== row.data.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
  const bg = back.data.options ?? [];
  if (bg.length !== groups.length) die(`จำนวนกลุ่มเพี้ยน: ${groups.length} → ${bg.length}`);
  const bad = bg.filter(g => g.section !== SECTION_OF[(g.label ?? "").trim()]);
  if (bad.length) die("อ่านกลับ ชุดไม่ตรง: " + bad.map(g => g.label).join(", "));
  console.log("บันทึกแล้ว + อ่านกลับตรวจครบ ✅");
}
