/**
 * กระดาษรองหลัง (package-backing) — ขนาดที่ไม่ใช่ขนาดสำเร็จของร้าน "ไม่มีซองให้" (เจ้าของร้านสั่ง 6 ต.ค. 69)
 * เดิมเขียนไว้แค่ hint ใต้ช่องกว้าง (ตัวเล็ก) — ลูกค้าเลือก "ขนาดตามไฟล์" ไม่เห็นเลย
 * · 📐 กำหนดขนาดเอง / 📄 ขนาดตามไฟล์ → badge "ไม่มีซองให้" (โชว์ในดรอปดาวน์) + selectedNote ⚠️ (กล่องใต้กลุ่มตอนเลือก)
 * · การ์ด "ไม่เจาะรู" ที่บอกว่าใส่ซองที่แถม → ระบุว่าเฉพาะขนาดสำเร็จของร้าน
 * read-modify-write บนแถวจริง รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const ID = "package-backing";
const BADGE = "ไม่มีซองให้";
const WARN = "⚠️ ขนาดนี้ไม่มีซองให้ — ซองมีเฉพาะขนาดสำเร็จของร้าน 7 ขนาดด้านบน";
const TARGETS = ["📐 กำหนดขนาดเอง (ระบุ ก.×ส.)", "📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)"];
const OLD_HOLE = "ใส่ซองที่แถมส่งได้เลย (รวมในราคาแล้ว)";
const NEW_HOLE = "ใส่ซองที่แถมส่งได้เลย (ซองแถมเฉพาะขนาดสำเร็จของร้าน รวมในราคาแล้ว)";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");
const die = (m) => { console.error("✗", m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const d = row.data;
const size = d.options.find((o) => o.label === "ขนาด");
if (!size) die("ไม่พบกลุ่ม ขนาด");
let changed = 0;
for (const name of TARGETS) {
  const c = size.choices.find((x) => x.name === name);
  if (!c) die(`ไม่พบตัวเลือก ${name}`);
  if (c.badge !== BADGE) { c.badge = BADGE; changed++; }
  const note = c.selectedNote ?? "";
  if (!note.startsWith(WARN)) { c.selectedNote = note ? `${WARN}\n${note}` : WARN; changed++; }
}
const hole = d.options.find((o) => o.label === "เจาะรู")?.choices.find((c) => c.name === "ไม่เจาะรู");
if (hole?.desc?.includes(OLD_HOLE)) { hole.desc = hole.desc.replace(OLD_HOLE, NEW_HOLE); changed++; }

console.log(`เปลี่ยน ${changed} จุด`);
if (!changed || !WRITE) process.exit(0);
d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (upd?.length !== 1) die("ไม่โดนแถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bs = back.data.options.find((o) => o.label === "ขนาด");
for (const name of TARGETS) {
  const c = bs.choices.find((x) => x.name === name);
  if (c?.badge !== BADGE || typeof c.selectedNote !== "string" || !c.selectedNote.startsWith(WARN)) die(`อ่านกลับไม่ตรง: ${name}`);
}
console.log("✓ เขียนแล้ว อ่านกลับตรง");
