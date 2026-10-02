/**
 * ✂️ PILLOW KEYCHAIN (pillow-keychain) — แยกตัวเลือกรูปทรง "ไดคัทตามทรง / วงกลม" (+฿15) เป็น 2 ตัวเลือก
 * เจ้าของร้านสั่ง 2 ต.ค. 69 (ภาพวงกลมแดงบนหน้าสินค้า): "ไดคัทตามทรง +15" และ "วงกลม +15" แยกกัน
 * ตารางราคาแกนเดียว (ไม่มี driverLabels/rules/preset) → เปลี่ยน choices ตรง ๆ ได้ แบบเดียวกับ pillow-keychain-screen-fabric-art.mjs
 * รันซ้ำได้ · --dry = แค่โชว์ไม่เขียน
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "pillow-keychain";
const GROUP = "รูปทรง";
const OLD = "ไดคัทตามทรง / วงกลม";
const NEW_A = "ไดคัทตามทรง";
const NEW_B = "วงกลม";
const DRY = process.argv.includes("--dry");

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
if (p.driverLabels?.length || p.rules?.length) die("สินค้ามี driverLabels/rules แล้ว — โครงเปลี่ยน ตรวจก่อน");
const g = (p.options || []).find((o) => (o.label || "").trim() === GROUP);
if (!g) die(`ไม่พบกลุ่ม "${GROUP}"`);
const names = g.choices.map((c) => c.name);
console.log(`ก่อน: ${GROUP} [${names.join(" | ")}]`);

if (names.includes(NEW_A) && names.includes(NEW_B) && !names.includes(OLD)) {
  console.log("ทำไปแล้ว → ข้าม");
  process.exit(0);
}
const idx = g.choices.findIndex((c) => c.name === OLD);
if (idx < 0) die(`ไม่พบตัวเลือก "${OLD}" (ชื่อถูกแก้จากหน้าแก้ไขแล้ว?)`);
const old = g.choices[idx];
if (old.extra !== 15) die(`extra ของ "${OLD}" = ${old.extra} ไม่ใช่ 15 — ตรวจก่อน`);
const a = { ...old, name: NEW_A };
const b = { ...old, name: NEW_B };
g.choices.splice(idx, 1, a, b);
p.savedAt = new Date().toISOString();
console.log(`หลัง: ${GROUP} [${g.choices.map((c) => c.name + (c.extra ? ` +${c.extra}` : "")).join(" | ")}]`);
if (DRY) { console.log("(dry-run ไม่เขียน)"); process.exit(0); }

const { data: upd, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("id");
if (e2 || !upd?.length) die("เขียนสินค้าไม่ลง: " + (e2?.message || "0 แถว"));
const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const bg = (back?.data?.options || []).find((o) => o.label === GROUP);
const bn = bg?.choices?.map((c) => c.name) || [];
const okA = bg?.choices?.find((c) => c.name === NEW_A), okB = bg?.choices?.find((c) => c.name === NEW_B);
if (!okA || !okB || bn.includes(OLD) || okA.extra !== 15 || okB.extra !== 15 ||
    typeof okA.imageSrc !== "string" || !okA.imageSrc.startsWith("https://") || okB.imageSrc !== okA.imageSrc ||
    back.data.savedAt !== p.savedAt) die("อ่านกลับไม่ตรง — รันซ้ำอีกรอบ: " + JSON.stringify(bn));
console.log("✓ อ่านกลับตรง savedAt=" + back.data.savedAt);
