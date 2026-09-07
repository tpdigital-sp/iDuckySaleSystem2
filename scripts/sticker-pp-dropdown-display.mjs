// สติ๊กเกอร์ดิจิตอล (sticker-pp): กลุ่มตัวเลือกที่เหลือ → dropdown ทั้งหมด
// ("ชนิดสติ๊กเกอร์" display cards + "เคลือบ" pills — กลุ่มอื่นเป็น dropdown/input อยู่แล้ว)
// ข้ามกลุ่ม multi/input (เปลี่ยนแล้วเสียฟังก์ชันติ๊กหลายอย่าง/ช่องกรอก)
// วนทุกกลุ่ม ห้าม find(label) — กันเคสชื่อกลุ่มซ้ำ
// รัน: node scripts/sticker-pp-dropdown-display.mjs           (dry-run)
//      node scripts/sticker-pp-dropdown-display.mjs --write
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "sticker-pp";
const KEEP = new Set(["multi", "input"]);
const WRITE = process.argv.includes("--write");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };
const target = (g) => !KEEP.has(g.display ?? "pills");

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;

let changed = 0;
for (const g of row.data.options ?? []) {
  const cur = g.display ?? "pills";
  if (!target(g)) { console.log(`${cur.padEnd(8)}    คงเดิม   ${g.label}`); continue; }
  if (cur === "dropdown") { console.log(`${cur.padEnd(8)}    เป็นอยู่แล้ว ${g.label}`); continue; }
  console.log(`${cur.padEnd(8)} → dropdown  ${g.label}`);
  g.display = "dropdown";
  changed++;
}
console.log(`\n${changed} กลุ่มจะถูกเปลี่ยน${WRITE ? "" : " (dry-run — เติม --write เพื่อบันทึกจริง)"}`);

if (WRITE && changed) {
  row.data.savedAt = new Date().toISOString();
  const up = await sb.from("products").update({ data: row.data }).eq("id", ID).select("data");
  if (up.error) throw up.error;
  if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");
  // อ่านกลับมาเทียบ — อย่าเชื่อว่าไม่มี error = สำเร็จ
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  if (back?.data?.savedAt !== row.data.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
  const bad = (back.data.options ?? []).filter(g => target(g) && g.display !== "dropdown");
  if (bad.length) die("อ่านกลับ ยังไม่เป็น dropdown: " + bad.map(g => g.label).join(", "));
  console.log("บันทึกแล้ว + อ่านกลับตรวจครบ ✅");
}
