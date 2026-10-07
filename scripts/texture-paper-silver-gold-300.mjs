#!/usr/bin/env node
/**
 * กระดาษ Texture Paper — กระดาษสีเงิน/สีทอง (ผิวเงา/ผิวด้าน) 250 แกรม → 300 แกรม (เจ้าของร้านสั่ง 7 ต.ค. 69)
 *
 *   node scripts/texture-paper-silver-gold-300.mjs          # ดูก่อน
 *   node scripts/texture-paper-silver-gold-300.mjs --write
 *
 * ชื่อตัวเลือกเป็นคีย์ตารางราคา (data.pricing + priceRates[].pricing) / showWhen / rules ด้วย
 * → แทนที่ทุกจุดใน data พร้อมกัน · "250 แกรม" ในสินค้านี้มีแต่สีเงิน/สีทอง (สคริปต์เช็คก่อน)
 * stockLinks ผูกด้วย stockItemId ไม่กระทบ · รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "texture-paper";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (m) => { console.error("⛔ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);
const src = JSON.stringify(row.data);

// ทุกบรรทัดที่มี 250 แกรม ต้องเป็นของสีเงิน/สีทอง
const hits = src.match(/[^"]{0,40}250 แกรม/g) || [];
const bad = hits.filter((h) => !/สีเงิน|สีทอง/.test(h));
if (bad.length) die("เจอ 250 แกรม ที่ไม่ใช่สีเงิน/สีทอง: " + bad.join(" | "));
console.log(`แทนที่ ${hits.length} จุด`);
if (!hits.length) { console.log("✓ ทำไปแล้ว"); process.exit(0); }

const d = JSON.parse(src.replaceAll("250 แกรม", "300 แกรม"));
const paper = d.options.find((o) => o.label === "ชนิดกระดาษ");
console.log(paper.choices.map((c) => c.name).filter((n) => /สีเงิน|สีทอง/.test(n)));
if (!WRITE) process.exit(0);

d.savedAt = new Date().toISOString();
const { data: out, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (out?.length !== 1) die("อัปเดต 0 แถว");
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = JSON.stringify(back.data);
if (b.includes("250 แกรม") || back.data.savedAt !== d.savedAt) die("อ่านกลับไม่ตรง");
const names = back.data.options.find((o) => o.label === "ชนิดกระดาษ").choices.map((c) => c.name);
for (const n of ["กระดาษสีเงิน ผิวเงา (300 แกรม)", "กระดาษสีเงิน ผิวด้าน (300 แกรม)", "กระดาษสีทอง ผิวเงา (300 แกรม)", "กระดาษสีทอง ผิวด้าน (300 แกรม)"])
  if (!names.includes(n)) die("ไม่เจอ " + n);
const k = "กระดาษสีทอง ผิวเงา (300 แกรม)│ตัดตามขนาด";
if (!back.data.pricing?.cells?.[k] || !back.data.priceRates?.[0]?.pricing?.cells?.[k]) die("คีย์ราคาไม่ลง");
console.log("✓ เขียนแล้ว อ่านกลับตรง");
