#!/usr/bin/env node
/**
 * ชิงช้าสวรรค์อะคริลิค (acrylic-ferris-wheel) — เปลี่ยนหัวชุดตัวเลือก "3. ตะขอ" เป็น "3. ตัวห้อย"
 *   [ร้านทัก 4 ก.ย. 69: "ภาพที่ 2 คือ ตัวห้อย ไม่ใช่ตะขอ"]
 *
 *   node scripts/ferris-wheel-hanger-section.mjs           (ดูก่อน ไม่เขียน)
 *   node scripts/ferris-wheel-hanger-section.mjs --write   (เขียน + อ่านกลับเทียบ)
 *
 * ต้นเหตุ: auto-option-sections.mjs จัดหมวดจากชื่อกลุ่ม — "ตัวห้อย /​ จำนวนไม่เกิน 6 ชิ้น …"
 * ไปเข้ากฎตะขอเพราะมีคำว่า "ห้อย" (คนละความหมาย: ที่นี่คือ *ชิ้นงานที่ห้อยอยู่* ไม่ใช่ตะขอ)
 * แก้ที่ต้นทางแล้วด้วย: เพิ่มกฎ `/^ตัวห้อย/` ไว้ก่อนกฎตะขอ ใน scripts/auto-option-sections.mjs
 * สคริปต์นี้แค่ตามไปแก้ค่าที่เขียนลง DB ไปแล้ว (ทั้งร้านมีกลุ่มแบบนี้ตัวเดียว)
 *
 * รันซ้ำได้ — เจอ "ตัวห้อย" อยู่แล้วก็ออกเฉย ๆ ไม่เขียนซ้ำ
 */
import { readFileSync } from "node:fs";

const PRODUCT_ID = "acrylic-ferris-wheel";
const GROUP_RE = /^ตัวห้อย/;
const FROM = "ตะขอ";
const TO = "ตัวห้อย";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (...m) => { console.error("✗", ...m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
if (error) die(error);
const data = row.data;
const options = data.options ?? [];

const at = options.findIndex((o) => GROUP_RE.test(o.label));
if (at < 0) die(`ไม่เจอกลุ่มที่ขึ้นต้นด้วย "ตัวห้อย" — มีแต่:`, options.map((o) => o.label));

const cur = options[at].section ?? "";
console.log(`กลุ่ม: ${options[at].label}`);
console.log(`section เดิม: "${cur}"`);

if (cur.includes(TO)) { console.log(`✓ เป็น "${TO}" อยู่แล้ว ไม่ต้องแก้`); process.exit(0); }
if (!cur.includes(FROM)) die(`section ไม่มีคำว่า "${FROM}" — เปลี่ยนไปแล้วหรือชื่อชุดเพี้ยน หยุดไว้ก่อน`);

// ชุดนี้มีกลุ่มเดียว (จำนวนกลุ่มที่ section เดียวกัน = 1) จึงเปลี่ยนหัวชุดได้โดยไม่กระทบกลุ่มอื่น
const same = options.filter((o) => o.section === cur);
if (same.length !== 1) die(`ชุด "${cur}" มี ${same.length} กลุ่ม — ต้องเปลี่ยนพร้อมกันทุกกลุ่ม แก้สคริปต์ก่อน`);

const next = cur.replace(FROM, TO);
console.log(`section ใหม่: "${next}"`);
if (!process.argv.includes("--write")) { console.log("\n(ยังไม่เขียน — รันด้วย --write)"); process.exit(0); }

options[at] = { ...options[at], section: next };
data.options = options;
data.savedAt = new Date().toISOString();   // ต้องเป็น ISO string เท่านั้น ไม่งั้นหน้าแก้ไขบันทึกไม่ได้ (409)

const { data: upd, error: updErr } = await sb.from("products").update({ data }).eq("id", PRODUCT_ID).select("data");
if (updErr || !upd?.length) die("update พัง/0 แถว", updErr);

// อ่านกลับมาเทียบ "รูปร่างของค่าจริง" — อย่าเชื่อว่าไม่ error = สำเร็จ
const { data: back } = await sb.from("products").select("data").eq("id", PRODUCT_ID).single();
const got = (back.data.options ?? []).find((o) => GROUP_RE.test(o.label));
if (typeof got?.section !== "string" || got.section !== next) die("อ่านกลับ section ไม่ตรง!", JSON.stringify(got?.section));
if (back.data.options.length !== options.length) die("อ่านกลับแล้วกลุ่มหาย!", back.data.options.map((o) => o.label));
console.log(`✓ อ่านกลับตรง · ${back.data.options.length} กลุ่ม · ชุดทั้งหมด:`, [...new Set(back.data.options.map((o) => o.section))].join(" | "));
console.log("savedAt =", back.data.savedAt);
