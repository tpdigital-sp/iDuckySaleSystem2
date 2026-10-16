#!/usr/bin/env node
/**
 * ☕📐 CUP SLEEVE — เปลี่ยนสกินของไฟล์เทมเพลต "Cup 250g (27.7x7.6) +" ให้ขนาดเท่าอาร์ตบอร์ด 300×150 มม.
 *
 * ผู้ใช้แจ้ง 16 ต.ค. 69 "ช่วยปรับขนาดให้หน่อย" — จอวางลายโชว์ปลอกสูงเกินจริง ~70%
 * สาเหตุ: สกิน PNG เดิม (3427×1064 · 3.2:1) ครอปชิดตัวปลอก แต่จอวางลายปูสกินแบบ fill เต็มผืน 300×150 (2:1) → โดนยืด
 * แก้: วางสกินเดิมลงผืนใส 3612×1806 (= 300×150 มม. @12.04 px/มม.) ที่ตำแหน่งจริงของปลอกบนอาร์ตบอร์ดของไฟล์ .ai
 *      (เรนเดอร์ .ai แล้ววัด: ปลอกอยู่ x 7.7–292.2 มม. · y 48.2–132.0 มม. — ด้านบนเป็นข้อความสเปกของร้าน)
 *
 *   node scripts/cup-sleeve-skin-artboard.mjs <skin-artboard.png>          # ดูอย่างเดียว
 *   node scripts/cup-sleeve-skin-artboard.mjs <skin-artboard.png> --write  # อัปไฟล์ + ผูกกับไฟล์เทมเพลต
 *
 * read-modify-write แถว __template_tpl-658smodrd · สกินเดิมไม่ถูกลบ (url เก่าจดไว้ใน log เผื่อย้อน)
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const TPL = "tpl-658smodrd";
const FILE = "f-irajcdvvz";
const BUCKET = "design-templates";
const WRITE = process.argv.includes("--write");
const src = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!src) { console.error("ใส่พาธไฟล์สกินใหม่ (.png)"); process.exit(1); }

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", `__template_${TPL}`).maybeSingle();
if (error || !row) { console.error("ไม่พบเทมเพลต", error?.message); process.exit(1); }
const t = row.data;
const f = (t.files || []).find((x) => x.id === FILE);
if (!f) { console.error("ไม่พบไฟล์", FILE); process.exit(1); }
console.log("เทมเพลต:", t.name, "· ไฟล์:", f.fileName, `· ${f.widthMm}×${f.heightMm} มม.`);
console.log("สกินเดิม:", f.skinUrl);

const bytes = readFileSync(src);
const path = `preview/${randomUUID().slice(0, 8)}-Cup-250g-27.7x7.6-skin-artboard.png`;
console.log(`สกินใหม่: ${src} (${Math.round(bytes.length / 1024)} KB) → ${BUCKET}/${path}`);
if (!WRITE) { console.log("(dry-run · ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }

const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: false });
if (up.error) { console.error("อัปโหลดไม่สำเร็จ:", up.error.message); process.exit(1); }
const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
f.skinUrl = url;
t.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products").upsert(
  { id: `__template_${TPL}`, name: `(เทมเพลต) ${t.name}`.slice(0, 120), category: "__templates__", price: 0, data: t },
  { onConflict: "id" },
);
if (e2) { console.error("บันทึกไม่สำเร็จ:", e2.message); process.exit(1); }
console.log("✓ ผูกสกินใหม่แล้ว:", url);
