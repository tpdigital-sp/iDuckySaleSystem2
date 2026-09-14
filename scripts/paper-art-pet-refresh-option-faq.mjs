#!/usr/bin/env node
/**
 * รีเฟรชคำตอบ FAQ ข้อ "มีตัวเลือกอะไรบ้าง" ของ paper-art-pet ให้ตรงเมนูปัจจุบัน
 * (คำตอบถูกเซฟแช่ไว้ตั้งแต่ตอนสร้าง SEO — พอเพิ่มขนาดตัดใหม่ก็ยังบอกรายการเก่า)
 *
 *   node scripts/paper-art-pet-refresh-option-faq.mjs [--write]
 *
 * ใช้สูตรเดียวกับ src/lib/auto-seo.ts (กลุ่มที่มีตัวเลือก · เอา 6 ชื่อแรกต่อกลุ่ม · คั่นด้วย " · ")
 * แตะเฉพาะ seo.faqs ข้อที่ขึ้นต้นด้วย "<กลุ่มแรก>:" — ข้อความอื่นไม่ยุ่ง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "paper-art-pet";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("name,data").eq("id", ID).single();
if (error) throw error;
const d = row.data;

const opts = (d.options ?? [])
  .map((o) => ({ label: o.label.trim(), names: (o.choices ?? []).map((c) => c.name.trim()).filter(Boolean) }))
  .filter((o) => o.label && o.names.length > 0);
const answer = opts.map((o) => `${o.label}: ${o.names.slice(0, 6).join(", ")}`).join(" · ");

const faqs = d.seo?.faqs ?? [];
// คำตอบเก่าอาจขึ้นต้นด้วยกลุ่มไหนก็ได้ (ลำดับกลุ่มเคยสลับ) — จับจากรูปแบบ "<ชื่อกลุ่ม>: ก, ข · <ชื่อกลุ่ม>: ..."
const labels = new Set(opts.map((o) => o.label));
const at = faqs.findIndex((f) => typeof f.a === "string" && labels.has(f.a.split(":")[0]) && f.a.includes(" · "));
if (at < 0) { console.log("ไม่เจอ FAQ ข้อรายการตัวเลือก — ไม่ต้องแก้"); process.exit(0); }
// คำถามอ้างชื่อกลุ่มแรก ("...มีขนาดตัดอะไรให้เลือกบ้าง?") — กลุ่มแรกเปลี่ยนแล้วต้องเปลี่ยนตาม
const oldQ = faqs[at].q ?? "";
const m = oldQ.match(/^(.*)มี(.+?)อะไรให้เลือกบ้าง\?$/);
const question = m && labels.has(m[2]) && m[2] !== opts[0].label ? `${m[1]}มี${opts[0].label}อะไรให้เลือกบ้าง?` : oldQ;
if (faqs[at].a === answer && question === oldQ) { console.log("ตรงอยู่แล้ว"); process.exit(0); }

console.log(`Q เดิม: ${oldQ}`);
console.log(`Q ใหม่: ${question}\n`);
console.log(`A เดิม: ${faqs[at].a}\n`);
console.log(`A ใหม่: ${answer}`);
if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write)"); process.exit(0); }

faqs[at].a = answer;
faqs[at].q = question;
d.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: d }).eq("id", ID);
if (upErr) throw upErr;
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bf = back.data.seo.faqs[at];
console.log(bf.a === answer && bf.q === question ? "\n✅ บันทึกแล้ว" : "\n❌ อ่านกลับไม่ตรง");
