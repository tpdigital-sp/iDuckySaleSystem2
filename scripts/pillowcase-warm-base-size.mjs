/**
 * หมอนอุ่นมือ (pillowcases-1) — เขียนขนาดฐาน "13×13 นิ้ว" ลงในชื่อกลุ่ม "เพิ่มขนาด"
 *
 * ทำไม: เดิมขนาดฐานอยู่แค่ในคำอธิบายสินค้า ระบบจึงบวก "เพิ่มนิ้วละ ×2" ให้ไม่ได้
 * พอชื่อกลุ่มมีฐาน foldSizeExtra() (SpecLines.tsx) จะโชว์ให้เองว่า "→ รวม 15×15 นิ้ว"
 * โตทั้งสองด้าน — เจ้าของร้านยืนยัน 4 ก.ย. 69
 *
 * ปลอดภัย: กลุ่มนี้ไม่ใช่แกนตารางราคา (pricing.driverLabels ว่าง) · ไม่มี rules/showWhen อ้างถึง
 * รันซ้ำได้ (เขียนแล้วข้าม) · อ่านกลับมาเทียบก่อนประกาศสำเร็จ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✖", m); process.exit(1); };

const ID = "pillowcases-1";
const OLD = "เพิ่มขนาด";
const NEW = "เพิ่มขนาด (จาก 13×13 นิ้ว)";

const { data: p, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const data = p.data;

// ด่านกันเขียนผิดตัว — กลุ่มนี้ต้องไม่ใช่แกนราคา และต้องไม่มีใครอ้างชื่อกลุ่มเดิม
if ((data.pricing?.driverLabels ?? []).includes(OLD)) die("กลุ่มนี้เป็นแกนตารางราคา ห้ามเปลี่ยนชื่อ");
if (JSON.stringify(data.rules ?? []).includes(OLD)) die("มี rules อ้างชื่อกลุ่มเดิม ต้องแก้ rules ด้วย");
if ((data.options ?? []).some((g) => g.showWhen && JSON.stringify(g.showWhen).includes(OLD))) die("มี showWhen อ้างชื่อกลุ่มเดิม");

const g = (data.options ?? []).find((x) => x.label === NEW || x.label === OLD);
if (!g) die("ไม่เจอกลุ่มเพิ่มขนาด");
if (g.label === NEW) { console.log("✓ เขียนไว้แล้ว ไม่ต้องทำซ้ำ"); process.exit(0); }
g.label = NEW;
data.savedAt = new Date().toISOString(); // ⚠️ ต้องเป็น ISO string เสมอ (ด่าน 409 ของหน้าแก้ไข)

const { data: rows, error: upErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (upErr) die(upErr.message);
if (rows?.length !== 1) die(`อัปเดตโดน ${rows?.length ?? 0} แถว`);

// อ่านกลับมาเทียบของจริง ไม่เชื่อว่า "ไม่ error = สำเร็จ"
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const gb = (back.data.options ?? []).find((x) => x.label === NEW);
if (!gb || typeof back.data.savedAt !== "string") die("อ่านกลับแล้วไม่ตรง");
if (!(gb.choices ?? []).some((c) => c.qty && c.name === "เพิ่มนิ้วละ")) die("ตัวเลือกในกลุ่มหายไป");
console.log("✓ เขียนแล้ว:", gb.label, "·", JSON.stringify(gb.choices));
