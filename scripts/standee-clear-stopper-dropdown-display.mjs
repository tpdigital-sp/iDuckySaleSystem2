// สแตนดี้อะคริลิค+จุกใส (new-mt1k6h3q-6601): ทุกกลุ่มตัวเลือกเป็น dropdown
// ยกเว้นกลุ่ม multi/input (เปลี่ยนแล้วเสียฟังก์ชันติ๊กหลายอย่าง/ช่องกรอก)
// เรทราคา (priceRates) ไม่เกี่ยวกับ display ของกลุ่ม — คงแบบเดิมอยู่แล้ว
// รัน: node scripts/standee-clear-stopper-dropdown-display.mjs        (dry-run)
//      node scripts/standee-clear-stopper-dropdown-display.mjs --write
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ID = "new-mt1k6h3q-6601";
const WRITE = process.argv.includes("--write");

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
  const { error: e2 } = await sb.from("products").update({ data: row.data }).eq("id", ID);
  if (e2) throw e2;
  console.log("บันทึกแล้ว ✅");
}
