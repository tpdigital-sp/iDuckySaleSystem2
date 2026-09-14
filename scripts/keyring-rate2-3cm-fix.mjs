#!/usr/bin/env node
/**
 * 📐 พวงกุญแจอะคริลิค — เรทที่ 2 (ราคาส่ง) คอลัมน์ "หนา 3mm × ขนาด 3cm" ไม่ตรงใบราคาจริง
 * (เจ้าของร้านทัก 14 ก.ย. 69 — หน้าสินค้าโชว์ ฿25/ชิ้น ตอนสั่ง 60 ชิ้น แต่ใบราคา
 *  iduckyofficial-pricelists.com/keyring ตาราง "(หนา 3mm) อะคริลิคใส | ขาวขุ่น C-02" บอก ฿30)
 *
 * ผิดแค่ 2 ขั้นแรกของคอลัมน์นี้ — ตอนนำเข้าตารางค่าเลื่อนไป 1 ช่อง:
 *   ในระบบ  50-100 = 25 · 101-199 = 20 · 200-4,999 = 20 …
 *   ใบราคา  50-100 = 30 · 101-199 = 25 · 200-4,999 = 20 …
 * ช่องอื่นของเรท 2 ตรงใบราคาครบ 255/270 ช่อง (เช็คด้วยตารางเว็บ + ส่วนบวกงานสกรีน/อคล.พิเศษ)
 * คอลัมน์นี้แตกเป็น 15 ช่อง (งานสกรีน 5 แบบ × ประเภทอะคริลิค 3 แบบ) ซึ่งบวกส่วนเพิ่มจากฐานเดียวกัน
 * → บวก 5 บาทที่ขั้น "50-100" กับ "101-199" ของทุกช่องที่ขึ้นต้น "3mm│3cm│"
 *
 *   node scripts/keyring-rate2-3cm-fix.mjs           # ดูก่อนว่าจะแก้อะไร (dry-run)
 *   node scripts/keyring-rate2-3cm-fix.mjs --write   # เขียนจริง + อ่านกลับมาเทียบ
 *
 * รันซ้ำได้ — ช่องที่ถูกต้องแล้วจะไม่ถูกแตะ (เทียบกับค่าเป้าหมายที่คำนวณจากส่วนต่างเดิม)
 * ⚠️ รันเสร็จต้องตาม 2 อย่าง:
 *   node scripts/dealer-rates-apply.mjs --apply --only=keyring-copy-copy   (ตารางตัวแทนคิดจากราคาปกติ)
 *   node scripts/multi-charm-rate-2.mjs --write                            (พวงกุญแจหลายชิ้นก๊อปเรท 2 จากตัวนี้)
 * ไม่แตะ data.pricing / priceRates[0] (เรทที่ 1 ถูกอยู่แล้ว) และไม่แตะออเดอร์/ใบเสนอราคาที่ออกไปแล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy";
const RATE_ID = "r2";
const PREFIX = "3mm│3cm│";
/** ขั้นที่ต้องบวก (index) → จำนวนบาทที่ขาด */
const BUMP = { 0: 5, 1: 5 };
/** ค่าที่ถูกต้องของช่องฐาน (สกรีน 1 ด้าน · อะคริลิคใส) ตามใบราคา — ไว้เป็นด่านตรวจ */
const BASE_KEY = "3mm│3cm│สกรีน 1 ด้าน (บน)│อะคริลิคใส";
const BASE_WANT = [30, 25, 20, 15, 13, 10, 10];

const die = (m) => { console.error("✖ " + m); process.exit(1); };
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const rate = (p.priceRates ?? []).find((r) => r.id === RATE_ID && !r.dealerOnly);
if (!rate) die(`ไม่เจอเรท ${RATE_ID} (แบบไม่ใช่เรทตัวแทน) ใน ${ID}`);
const cells = rate.pricing?.cells ?? {};
if (!Array.isArray(cells[BASE_KEY])) die(`ไม่เจอช่องฐาน "${BASE_KEY}"`);
const nTiers = rate.pricing.tiers.length;
if (nTiers !== BASE_WANT.length) die(`จำนวนขั้นราคาเปลี่ยนไป (${nTiers} ขั้น) — ตรวจตารางก่อนรันซ้ำ`);

const keys = Object.keys(cells).filter((k) => k.startsWith(PREFIX));
if (keys.length !== 15) die(`คาดว่าคอลัมน์ 3mm × 3cm มี 15 ช่อง แต่เจอ ${keys.length} ช่อง`);

// ค่าเป้าหมาย = ค่าปัจจุบัน + ส่วนที่ขาด · ถ้าช่องไหนตรงค่าที่ควรอยู่แล้ว (รันซ้ำ) ปล่อยไว้
const done = cells[BASE_KEY].every((v, i) => v === BASE_WANT[i]);
const changes = [];
if (!done) {
  for (const k of keys) {
    const arr = cells[k];
    if (!Array.isArray(arr) || arr.length !== nTiers || arr.some((n) => typeof n !== "number" || !(n > 0)))
      die(`ช่อง "${k}" ค่าผิดรูป ${JSON.stringify(arr)}`);
    const next = arr.map((v, i) => v + (BUMP[i] ?? 0));
    changes.push({ k, from: [...arr], to: next });
  }
}

if (!changes.length) { console.log("(ไม่มีอะไรต้องแก้ — คอลัมน์ 3mm × 3cm ตรงใบราคาแล้ว)"); process.exit(0); }
for (const c of changes) console.log(`• ${c.k}\n    ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
const baseNext = changes.find((c) => c.k === BASE_KEY).to;
if (JSON.stringify(baseNext) !== JSON.stringify(BASE_WANT))
  die(`ช่องฐานหลังแก้ ${JSON.stringify(baseNext)} ไม่ตรงใบราคา ${JSON.stringify(BASE_WANT)} — หยุดไว้ก่อน`);

if (!WRITE) { console.log(`\n(dry-run · ${changes.length} ช่อง) ใส่ --write เพื่อเขียนจริง`); process.exit(0); }

for (const c of changes) cells[c.k] = c.to;
// ช่วงราคา (เรท public เท่านั้น เหมือน priceRange)
const pub = p.priceRates.filter((r) => !r.dealerOnly);
const all = pub.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
const min = Math.min(...all), max = Math.max(...all);
if (p.priceMin !== min || p.priceMax !== max) { console.log(`ช่วงราคา ${p.priceMin}/${p.priceMax} → ${min}/${max}`); p.priceMin = min; p.priceMax = max; }
p.savedAt = new Date().toISOString();

const { data: back, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (e2) throw e2;
if (!back?.length) die("update ไม่โดนแถวไหนเลย");
// อ่านกลับจาก DB จริงอีกรอบ (ไม่ใช่ค่าที่ส่งไป)
const { data: chk, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3) throw e3;
const chkCells = chk.data.priceRates.find((r) => r.id === RATE_ID && !r.dealerOnly)?.pricing?.cells ?? {};
for (const c of changes)
  if (JSON.stringify(chkCells[c.k]) !== JSON.stringify(c.to)) die(`อ่านกลับไม่ตรง: ${c.k} = ${JSON.stringify(chkCells[c.k])}`);
if (chk.data.savedAt !== p.savedAt) die(`savedAt อ่านกลับไม่ตรง (${chk.data.savedAt})`);
console.log(`\n✅ เขียนแล้ว ${changes.length} ช่อง · อ่านกลับตรงทุกช่อง`);
console.log("ต่อด้วย: node scripts/dealer-rates-apply.mjs --apply --only=keyring-copy-copy && node scripts/multi-charm-rate-2.mjs --write");
