// Sticker Gold | Silver | RoseGold (sticker-gold-silver-rosegold): เรียงลำดับกลุ่มตัวเลือกใหม่
//   สีเนื้อสติ๊กเกอร์ → ผิว → ขายแบบ → แบบไดคัท → ขอบไดคัท → ขนาดตัด → จำนวนจุดไดคัท
// (ย้ายแค่ "ขอบไดคัท" ขึ้นมาก่อน "ขนาดตัด" · กลุ่มช่องกรอกเกาะไปกับกลุ่มแม่ของมัน)
// รัน: node scripts/sticker-gold-group-order.mjs           (dry-run)
//      node scripts/sticker-gold-group-order.mjs --write
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "sticker-gold-silver-rosegold";
const WRITE = process.argv.includes("--write");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const ORDER = [
  "สีเนื้อสติ๊กเกอร์",
  "ผิว",
  "ขายแบบ",
  "แบบไดคัท",
  "ขอบไดคัท",
  "ขนาดตัด",
  "ขนาดตัด (กว้าง)",
  "ขนาดตัด (สูง)",
  "จำนวนจุดไดคัท",
  "ขนาดไดคัท (กว้าง)",
  "ขนาดไดคัท (สูง)",
];

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;

const groups = row.data.options ?? [];
const before = groups.map(g => (g.label ?? "").trim());

// กันกลุ่มหาย: รายชื่อต้องตรงกันทุกตัว (ทั้งจำนวนและชื่อ) ก่อนเรียงใหม่
const missing = ORDER.filter(l => !before.includes(l));
const extra = before.filter(l => !ORDER.includes(l));
if (missing.length) die("ORDER มีชื่อที่ไม่มีใน DB: " + missing.join(", "));
if (extra.length) die("DB มีกลุ่มที่ไม่อยู่ใน ORDER: " + extra.join(", ") + " (เติมใน ORDER ก่อน ไม่งั้นกลุ่มหาย)");
if (before.length !== ORDER.length) die(`จำนวนกลุ่มไม่ตรง: DB ${before.length} vs ORDER ${ORDER.length}`);

const sorted = ORDER.map(l => groups.find(g => (g.label ?? "").trim() === l));
row.data.options = sorted;

console.log("ก่อน → หลัง");
for (let i = 0; i < ORDER.length; i++) {
  const a = before[i], b = ORDER[i];
  console.log(`${String(i + 1).padStart(2)}. ${a.padEnd(20)} ${a === b ? "=" : "→"} ${b}`);
}
const changed = before.some((l, i) => l !== ORDER[i]);
console.log(`\n${changed ? "ลำดับเปลี่ยน" : "ลำดับเดิมอยู่แล้ว"}${WRITE ? "" : " (dry-run — เติม --write เพื่อบันทึกจริง)"}`);

if (WRITE && changed) {
  row.data.savedAt = new Date().toISOString();
  const up = await sb.from("products").update({ data: row.data }).eq("id", ID).select("data");
  if (up.error) throw up.error;
  if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");
  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back?.data?.savedAt !== row.data.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
  const got = (back.data.options ?? []).map(g => (g.label ?? "").trim());
  if (got.join("|") !== ORDER.join("|")) die("อ่านกลับลำดับไม่ตรง:\n  " + got.join(" · "));
  console.log("บันทึกแล้ว + อ่านกลับตรวจครบ ✅");
}
