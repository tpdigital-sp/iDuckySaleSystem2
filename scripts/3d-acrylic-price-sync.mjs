#!/usr/bin/env node
/**
 * 3D Acrylic — ดึงราคาสดจากเว็บตารางราคา แล้วประกอบตารางราคาในระบบใหม่ทั้งใบ
 *
 *   node scripts/3d-acrylic-price-sync.mjs           # เทียบให้ดูว่าต่างจากในระบบตรงไหน (ไม่เขียน)
 *   node scripts/3d-acrylic-price-sync.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ที่มา: https://www.iduckyofficial-pricelists.com/otheracrylicproducts  บล็อก "3D Acrylic"
 *   "อะคริลิค จำนวน 2 ชิ้น (เลือกขนาดได้) | สกรีน 1 ด้าน / ชิ้น"
 *
 * สูตรประกอบราคา 1 ชุด (= อะคริลิค 2 ชิ้น) — ADD ON บนเว็บเป็นราคา "ต่อชิ้น" จึงคูณ 2:
 *   ราคาชุด = ฐาน[ขนาดชิ้นที่ 1][ช่วงจำนวน]
 *           + ค่าสกรีนเพิ่ม[ขนาด] × 2        (สกรีน 1 ด้าน = 0 · 2 ด้าน / 3 / 4 เลเยอร์ ตามตาราง ADD ON)
 *           + ค่าอะคริลิคพิเศษ[ขนาด] × 2     (ยึดตามโปสเตอร์ +5/+8/+10 ทุกช่วงจำนวน — ดู SPECIAL_RATE_ROW)
 *   อะคริลิคใส / ขาวขุ่น C-02 = ไม่บวกเพิ่ม (ราคาตามตารางฐาน)
 *
 * ขนาดชิ้นที่ 2 ไม่มีผลกับราคา — ราคาคิดจากชิ้นที่ใหญ่ที่สุด (= ชิ้นที่ 1) ตามที่เว็บกำกับไว้
 * เขียนทั้ง p.pricing และ p.priceRates[*].pricing ที่ใช้ตารางชุดเดียวกัน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetch3dAcrylicPrices } from "./3d-acrylic-prices.mjs";

const WRITE = process.argv.includes("--write");
const ID = "3d-acrylic";
const SIZE_LABEL = "ขนาดชิ้นที่ 1";
const SCREEN_LABEL = "งานสกรีน";
const ACRYLIC_LABEL = "ชนิดอะคริลิค";

/** ตัวเลือกงานสกรีนในระบบ → แถว ADD ON บนเว็บ (null = ไม่บวกเพิ่ม คือราคาฐาน "สกรีน 1 ด้าน/ชิ้น") */
const SCREEN_ADDON = {
  "สกรีน 1 ด้าน (ใต้)": null,
  "สกรีน 1 ด้าน (บน)": null,
  "สกรีน 2 ด้าน (ใต้-บน)": "สกรีน 2 ด้าน",
  "สกรีน 2 ด้าน (บน-บน)": "สกรีน 2 ด้าน",
  "สกรีน 3 เลเยอร์": "สกรีน 3 เลเยอร์",
  "สกรีน 4 เลเยอร์": "สกรีน 4 เลเยอร์",
};
/** ชนิดอะคริลิคในระบบ → บวกเพิ่มไหม */
const ACRYLIC_SPECIAL = {
  อะคริลิคใส: false,
  "อะคริลิคขาวขุ่น C-02": false,
  "อะคริลิคพิเศษ (สี / โฮโลแกรม / กลิตเตอร์)": true,
};

const PIECES_PER_SET = 2;

/**
 * 🏷 ค่าอะคริลิคพิเศษ (กลิตเตอร์ / สีพิเศษ / โฮโลแกรม) — ต่อชิ้น ทุกช่วงจำนวน
 *
 * บนเว็บมี 2 แถวให้เลือก: "(เรทราคาปลีก) อคล.พิเศษ" = +10 เท่ากันหมด 2-10cm
 * กับ "(เรทราคาส่ง) อคล.พิเศษ" = 2-5cm +5 · 6-8cm +8 · 9-10cm +10
 * ส่วนโปสเตอร์ 3D Acrylic เขียนกล่อง "กลิตเตอร์/สีพิเศษ/โฮโลแกรม" ไว้ชุดเดียว = +5 / +8 / +10
 *
 * ทางร้านยืนยัน (23 ส.ค. 69) ให้ยึด "ตามโปสเตอร์" ทุกช่วงจำนวน ไม่แยกปลีก/ส่ง
 * ตัวเลขชุดนั้นตรงกับแถวเรทส่งบนเว็บพอดี จึงอ่านสดจากแถวนั้นได้เลย ไม่ต้องพิมพ์ตัวเลขทับในโค้ด
 */
const SPECIAL_RATE_ROW = "wholesale";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const web = await fetch3dAcrylicPrices();
const SPECIAL_RATE = web.special[SPECIAL_RATE_ROW];
console.log(`📥 ดึงจากเว็บ: ขนาด ${web.sizes.join(" / ")} · ช่วงจำนวน ${web.tiers.join(" / ")}`);
console.log(`   ค่าอะคริลิคพิเศษ (ต่อชิ้น ทุกช่วงจำนวน): ${web.sizes.map((s) => `${s} +${SPECIAL_RATE[s]}`).join(" · ")}`);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;

// ── ตรวจว่าตัวเลือกในระบบยังตรงกับที่สคริปต์รู้จัก (ข้อมูลเปลี่ยนไปแล้วต้องหยุด ไม่เดา) ──
const optOf = (label) => {
  const o = (p.options ?? []).find((x) => x.label === label);
  if (!o) throw new Error(`ไม่พบกลุ่มตัวเลือก "${label}" — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์`);
  return o.choices.map((c) => c.name);
};
const sizes = optOf(SIZE_LABEL);
const screens = optOf(SCREEN_LABEL);
const acrylics = optOf(ACRYLIC_LABEL);

const missing = [
  ...sizes.filter((s) => !web.base[s]).map((s) => `ขนาด "${s}" ไม่มีในตารางบนเว็บ`),
  ...screens.filter((s) => !(s in SCREEN_ADDON)).map((s) => `งานสกรีน "${s}" ยังไม่รู้ว่าใช้ ADD ON แถวไหน`),
  ...acrylics.filter((a) => !(a in ACRYLIC_SPECIAL)).map((a) => `ชนิดอะคริลิค "${a}" ยังไม่รู้ว่าบวกเพิ่มไหม`),
];
if (missing.length) throw new Error(`หยุดก่อน:\n  • ${missing.join("\n  • ")}`);

// ── ประกอบตารางราคาใหม่จากตัวเลขบนเว็บ ──
const cells = {};
for (const size of sizes) {
  for (const screen of screens) {
    const addonRow = SCREEN_ADDON[screen];
    const screenFee = addonRow ? (web.screen[addonRow][size] ?? 0) * PIECES_PER_SET : 0;
    for (const acrylic of acrylics) {
      const special = ACRYLIC_SPECIAL[acrylic];
      cells[`${size}│${screen}│${acrylic}`] = web.base[size].map((baseAt) => {
        const acrylicFee = special ? (SPECIAL_RATE[size] ?? 0) * PIECES_PER_SET : 0;
        return baseAt + screenFee + acrylicFee;
      });
    }
  }
}

// ── เทียบกับของเดิม ──
const before = p.pricing?.cells ?? {};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changed = Object.keys(cells).filter((k) => !same(before[k], cells[k]));
const removed = Object.keys(before).filter((k) => !(k in cells));

console.log(`\n🧮 ประกอบได้ ${Object.keys(cells).length} ช่อง (ของเดิมในระบบ ${Object.keys(before).length} ช่อง)`);
for (const k of changed.slice(0, 40)) console.log(`  ~ ${k}\n      เดิม ${JSON.stringify(before[k] ?? null)} → ใหม่ ${JSON.stringify(cells[k])}`);
if (changed.length > 40) console.log(`  … อีก ${changed.length - 40} ช่อง`);
for (const k of removed) console.log(`  - ${k} (ไม่มีในตารางที่ประกอบใหม่)`);

const tierLabels = (p.pricing?.tiers ?? []).map((t) => t.label);
if (!same(tierLabels, web.tiers)) console.log(`\n⚠️ ป้ายช่วงจำนวนต่างกัน — ในระบบ ${tierLabels.join(" / ")} · บนเว็บ ${web.tiers.join(" / ")}`);

const prices = Object.values(cells).flat();
const priceMin = Math.min(...prices);
const priceMax = Math.max(...prices);
const price = cells[`${sizes[0]}│${screens[0]}│${acrylics[0]}`][0];
console.log(
  `\n💰 ราคาเริ่มต้น ${price} · ต่ำสุด ${priceMin} · สูงสุด ${priceMax}` +
    `   (ในระบบตอนนี้ ${p.price} / ${p.priceMin} / ${p.priceMax})`
);

if (!changed.length && !removed.length && p.price === price && p.priceMin === priceMin && p.priceMax === priceMax) {
  console.log("\n✅ ราคาในระบบตรงกับเว็บตารางราคาอยู่แล้ว — ไม่ต้องแก้อะไร");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}

p.pricing = { ...p.pricing, cells };
for (const r of p.priceRates ?? []) if (r.pricing) r.pricing = { ...r.pricing, cells };
p.price = price;
p.priceMin = priceMin;
p.priceMax = priceMax;
p.savedAt = new Date().toISOString();

const { error: upErr } = await sb
  .from("products")
  .update({ data: p, price })
  .eq("id", ID);
if (upErr) throw upErr;
console.log("\nบันทึกแล้ว ✓");
