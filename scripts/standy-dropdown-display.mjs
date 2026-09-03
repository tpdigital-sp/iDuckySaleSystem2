// สแตนดี้อะคริลิค (standy): กลุ่มตัวเลือกแบบ cards → dropdown
// ยกเว้นกลุ่ม multi/input (เปลี่ยนแล้วเสียฟังก์ชันติ๊กหลายอย่าง/ช่องกรอก)
// รัน: node scripts/standy-dropdown-display.mjs           (dry-run)
//      node scripts/standy-dropdown-display.mjs --write
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "standy";
const WRITE = process.argv.includes("--write");
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;

const KEEP = new Set(["multi", "input"]);
let changed = 0;
for (const g of row.data.options ?? []) {
  const cur = g.display ?? "pills";
  if (KEEP.has(cur) || cur === "dropdown") continue;
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
  const bad = (back.data.options ?? []).filter(g => !KEEP.has(g.display ?? "pills") && (g.display ?? "pills") !== "dropdown");
  if (bad.length) die("อ่านกลับ ยังไม่เป็น dropdown: " + bad.map(g => g.label).join(", "));
  console.log("บันทึกแล้ว + อ่านกลับตรวจครบ ✅");
}
