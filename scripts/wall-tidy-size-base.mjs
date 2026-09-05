/**
 * WALL TIDY (wall-tidy) — เขียนขนาดฐาน "55×33 ซม." ลงชื่อกลุ่มช่องกรอก "เพิ่มขนาด · ด้านยาวสุด"
 *
 * ทำไม: ลูกค้าที่เลือกการ์ด "📐 เพิ่มขนาด (นิ้วละ ฿30)" ในกลุ่ม "ขนาด" จะไม่มีตัวเลขขนาดในตะกร้า/ออเดอร์เลย
 * (ฐาน 55×33 อยู่แค่ในชื่อการ์ดขนาดมาตรฐานที่ไม่ได้เลือก) พอชื่อกลุ่มมีฐาน foldSizeExtra() (SpecLines.tsx)
 * จะเขียนขนาดจริงทับบรรทัด "ขนาด" ให้เอง เช่น "67.7×33 ซม. (ด้านยาวสุดเดิม 55 + เพิ่ม 5 นิ้ว = 12.7 ซม.)"
 * "ด้านยาวสุด" = โตเฉพาะด้านที่ตัวเลขมากกว่า (55) — ด้านกว้าง 33 คงเดิม
 *
 * ปลอดภัย: กลุ่มนี้ไม่ใช่แกนตารางราคา · ไม่มี rules/showWhen อ้างชื่อเดิม (เช็คซ้ำในสคริปต์)
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

const ID = "wall-tidy";
const OLD = "เพิ่มขนาด · ด้านยาวสุด (นิ้ว)";
const NEW = "เพิ่มขนาด · ด้านยาวสุด (นิ้ว · จาก 55×33 ซม.)";

const { data: p, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const data = p.data;

// ด่านกันเขียนผิดตัว — กลุ่มนี้ต้องไม่ใช่แกนราคา และต้องไม่มีใครอ้างชื่อกลุ่มเดิม
if ((data.pricing?.driverLabels ?? []).includes(OLD)) die("กลุ่มนี้เป็นแกนตารางราคา ห้ามเปลี่ยนชื่อ");
if (JSON.stringify(data.rules ?? []).includes(OLD)) die("มี rules อ้างชื่อกลุ่มเดิม ต้องแก้ rules ด้วย");
if ((data.options ?? []).some((g) => g.showWhen && JSON.stringify(g.showWhen).includes(OLD))) die("มี showWhen อ้างชื่อกลุ่มเดิม");

const g = (data.options ?? []).find((x) => x.label === NEW || x.label === OLD);
if (!g) die("ไม่เจอกลุ่มช่องกรอกเพิ่มขนาด");
if (g.label === NEW) { console.log("✓ เขียนไว้แล้ว ไม่ต้องทำซ้ำ"); process.exit(0); }
if (g.display !== "input" || g.input?.kind !== "number") die("กลุ่มที่เจอไม่ใช่ช่องกรอกตัวเลข — โครงเปลี่ยนไปแล้ว เช็คก่อน");
g.label = NEW;
data.savedAt = new Date().toISOString(); // ⚠️ ต้องเป็น ISO string เสมอ (ด่าน 409 ของหน้าแก้ไข)

const { data: rows, error: upErr } = await sb.from("products").update({ data }).eq("id", ID).select("data");
if (upErr) die(upErr.message);
if (rows?.length !== 1) die(`อัปเดตโดน ${rows?.length ?? 0} แถว`);

// อ่านกลับมาเทียบของจริง ไม่เชื่อว่า "ไม่ error = สำเร็จ"
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const gb = (back.data.options ?? []).find((x) => x.label === NEW);
if (!gb || typeof back.data.savedAt !== "string") die("อ่านกลับแล้วไม่ตรง");
if (gb.display !== "input" || gb.input?.kind !== "number" || gb.input?.unit !== "นิ้ว") die("ช่องกรอกในกลุ่มเพี้ยนหลังเขียน");
console.log("✓ เขียนแล้ว:", gb.label);
