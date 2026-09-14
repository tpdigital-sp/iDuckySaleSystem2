#!/usr/bin/env node
/**
 * ✏️ SHIKISHI (ชิกิชิ) เปลี่ยนชื่อชุดตัวเลือก "1. เนื้อวัสดุ + สี" → "1. เนื้อวัสดุ + สีขอบ"
 *   [เจ้าของร้านส่งภาพหน้าสินค้า 14 ก.ย. 69: ชุดนี้มีแค่ กระดาษ + สีขอบ คำว่า "สี" กว้างเกิน]
 *   ใช้ " + " ตามชุดตัวเลือกทั้งเว็บ (72 ชุด · ไม่มีชุดไหนใช้ ·)
 *
 *   node scripts/shikishi-section-rename.mjs           dry-run
 *   node scripts/shikishi-section-rename.mjs --write   เขียนจริง + อ่านกลับเทียบ
 *
 * ⚠️ แตะแค่ ProductOption.section ของสินค้าตัวนี้ — ไม่แตะตัวเลือก/ราคา/showWhen
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ID = "pricelist-shikishi";
const FROM = "1. เนื้อวัสดุ + สี";
const TO = "1. เนื้อวัสดุ + สีขอบ";
const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) throw error;
const opts = row.data.options || [];
const hit = opts.filter((o) => o.section === FROM);
console.log(`${row.id} — ${row.name}`);
console.log(`ชุด "${FROM}" มี ${hit.length} กลุ่ม: ${hit.map((o) => o.label).join(" | ")}`);
if (!hit.length) { console.log("ไม่มีอะไรต้องแก้ (รันซ้ำหรือชื่อเปลี่ยนไปแล้ว)"); process.exit(0); }
console.log(`→ เปลี่ยนเป็น "${TO}"`);
if (!WRITE) { console.log("(dry-run — ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }

const nextOpts = opts.map((o) => (o.section === FROM ? { ...o, section: TO } : o));
const d = { ...row.data, options: nextOpts, savedAt: new Date().toISOString() };
const { error: e1 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e1) throw e1;
const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", ID).single();
if (e2) throw e2;
const left = (back.data.options || []).filter((o) => o.section === FROM).length;
const now = (back.data.options || []).filter((o) => o.section === TO).map((o) => o.label);
if (left || now.length !== hit.length) throw new Error(`อ่านกลับไม่ตรง: เหลือชื่อเก่า ${left} · ชื่อใหม่ ${now.length}`);
console.log(`✓ บันทึก + อ่านกลับตรวจครบ: "${TO}" = ${now.join(" | ")} · savedAt = ${back.data.savedAt}`);
