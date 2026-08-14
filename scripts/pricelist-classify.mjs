#!/usr/bin/env node
/**
 * คัด 656 ค่าที่ดึงมาจากเว็บตารางราคา ออกเป็น 3 กอง ก่อนสร้าง SKU
 *
 *   node scripts/pricelist-classify.mjs              # สรุป 3 กอง
 *   node scripts/pricelist-classify.mjs --list=sku   # ดูรายการกองใดกองหนึ่งเต็ม ๆ (sku|tier|ask)
 *
 * หลักที่ใช้ตัดสิน — ตัวชี้ขาดคือ "สินค้าหน้านั้นทำจากอะไร" ไม่ใช่หน้าตาของค่า
 *   ตัดจากแผ่น (อะคริลิค/กระดาษ/สติกเกอร์) → ขนาดเป็นแค่ขั้นราคา ของที่กินสต๊อกคือ "แผ่น"
 *   ของสำเร็จรูปนับเป็นชิ้น (ผ้าห่ม/ปลอกคอ/เสื้อ)  → ขนาดคือของคนละตัว นับแยกกอง = เป็น SKU
 *
 * ค่าที่เป็น "กระบวนการ" (สกรีน/ไดคัท/เคลือบ/ราคา…) ตัดทิ้งทุกหน้า — ไม่มีอะไรหายจากชั้นวาง
 *
 * สคริปต์นี้อ่านอย่างเดียว — ไม่เขียนคลัง ผลออกเป็นไฟล์ให้คนตรวจก่อน
 */
import { readFileSync, writeFileSync } from "node:fs";

const LIST = (process.argv.find((a) => a.startsWith("--list=")) || "").split("=")[1];
const CACHE = new URL("../.cache/pricelist/", import.meta.url).pathname;
const data = JSON.parse(readFileSync(`${CACHE}variants.json`, "utf8"));

/**
 * หน้าที่สินค้า "ตัดจากแผ่น/ม้วน" — ขนาดบนหน้าพวกนี้คือขั้นราคา ไม่ใช่ SKU
 * (งานอะคริลิคทุกชนิด กระดาษ สติกเกอร์ การ์ด โฟโต้การ์ด)
 */
const CUT_FROM_SHEET = new Set([
  "pricestandy", "อคลประกบ", "อคลกระจก", "blank", "keyring", "standeewobbles", "acrylicseesaw",
  "ราคาstandup", "acrylickitmagnet", "ministandy", "acrylicbending", "acrylicdreamworld",
  "acrylicferriswheel", "acrylicpirateship", "acrylicrotatingstand", "acrylicmagnet",
  "acrylic-kit", "swingervariety", "otheracrylicproducts", "otheracrylicproducts2",
  "otheracrylicproducts3", "otheracrylicproducts4", "otheracrylicproducts5", "coloracrylic",
  "standyphonebase", "stickerprice", "paperprice", "laminate", "cardboard", "shikishi",
  "photocard", "magnetbookmark", "พกจnotprint", "การ์ดสเปรย์แอลกอฮอล์", "pin", "photoframe",
  "partskeychain", "acrylickit", "standylightbase", "fabricposter_size", "package",
]);

/** หน้าที่ไม่ใช่สินค้า */
const NOT_PRODUCT = new Set(["about-4", "team", "conditions", "productionlimitations", "blank"]);

/**
 * ค่าที่เป็นกระบวนการ/ราคา — ไม่ใช่ของ ตัดทิ้งทุกหน้า
 * ⚠️ ต้องเทียบกับค่าที่ "ถอดช่องว่างออกแล้ว" เพราะหน้า Wix มีช่องว่างแทรกกลางคำไทย
 *    ("ขนาดสก  รีน A4", "แ  ม่เหล็ก") ถ้าเทียบตรง ๆ คำพวกนี้จะหลุดเข้ากอง SKU
 */
const PROCESS =
  /ราคา|สกรีน|สรีน|ไดคัท|เคลือบ|ตรม\.|ตร\.ซม|^\+$|พิมพ์|งานซับ|DTF|DFT|UVPrint|ปัก|เพิ่ม|add ?on|ขั้นต่ำ|ไม่เกิน|แรก$|ต่อไป$|^-$/i;
const squish = (s) => String(s).replace(/\s+/g, "");

/** ค่าที่เป็น "ขนาดล้วน" — 3cm / 10x15cm / A4 / 60x80นิ้ว */
const PURE_SIZE = /^(\d+(\.\d+)?\s*[-–]?\s*\d*(\.\d+)?\s*(cm|mm|นิ้ว|inch|")?|[A-Z]\d|\d+\s*[x×*]\s*\d+.*)$/i;

const buckets = { sku: [], tier: [], ask: [] };
for (const p of data) {
  if (!p.variants || NOT_PRODUCT.has(p.slug)) continue;
  const cut = CUT_FROM_SHEET.has(p.slug);
  for (const v of p.variants) {
    const row = { page: p.slug, value: v };
    if (PROCESS.test(squish(v))) {
      buckets.tier.push({ ...row, why: "กระบวนการ ไม่ใช่ของ" });
      continue;
    }
    const isSize = PURE_SIZE.test(v.replace(/\s/g, ""));
    if (cut && isSize) {
      buckets.tier.push({ ...row, why: "ขั้นราคาตามขนาด (ตัดจากแผ่น)" });
    } else if (cut && !isSize) {
      buckets.ask.push({ ...row, why: "หน้าตัดจากแผ่น แต่ค่าไม่ใช่ขนาด — อาจเป็นชนิดวัสดุ" });
    } else if (!cut && isSize) {
      buckets.sku.push({ ...row, why: "ของสำเร็จรูป ขนาดละกอง" });
    } else {
      buckets.sku.push({ ...row, why: "ชนิด/วัสดุ" });
    }
  }
}

if (LIST) {
  const b = buckets[LIST] ?? [];
  console.log(`กอง "${LIST}" — ${b.length} ค่า\n`);
  const byPage = new Map();
  for (const r of b) {
    if (!byPage.has(r.page)) byPage.set(r.page, []);
    byPage.get(r.page).push(r.value);
  }
  for (const [page, vs] of [...byPage].sort((a, b2) => b2[1].length - a[1].length)) {
    console.log(`${page} (${vs.length})`);
    console.log(`   ${vs.join(" · ").slice(0, 400)}`);
  }
  process.exit(0);
}

const total = buckets.sku.length + buckets.tier.length + buckets.ask.length;
console.log(`คัด ${total} ค่า จาก ${data.filter((d) => d.variants?.length).length} หน้า\n`);
console.log(`  ✅ เป็น SKU          ${String(buckets.sku.length).padStart(3)}  ของสำเร็จรูป/ชนิดวัสดุ`);
console.log(`  ⛔ ไม่ใช่ SKU        ${String(buckets.tier.length).padStart(3)}  ขั้นราคาตามขนาด + คำที่เป็นกระบวนการ`);
console.log(`  ❓ ต้องคนตัดสิน      ${String(buckets.ask.length).padStart(3)}  หน้าตัดจากแผ่นแต่ค่าไม่ใช่ขนาด`);

console.log(`\n── กอง ✅ เป็น SKU แยกตามหน้า ──`);
const byPage = new Map();
for (const r of buckets.sku) {
  if (!byPage.has(r.page)) byPage.set(r.page, []);
  byPage.get(r.page).push(r.value);
}
for (const [page, vs] of [...byPage].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${page.padEnd(22)} ${String(vs.length).padStart(2)} · ${vs.join(" · ").slice(0, 105)}`);
}

console.log(`\n── กอง ❓ ต้องคนตัดสิน ──`);
const askPage = new Map();
for (const r of buckets.ask) {
  if (!askPage.has(r.page)) askPage.set(r.page, []);
  askPage.get(r.page).push(r.value);
}
for (const [page, vs] of [...askPage].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
  console.log(`  ${page.padEnd(22)} ${String(vs.length).padStart(2)} · ${vs.join(" · ").slice(0, 105)}`);
}

writeFileSync(`${CACHE}classified.json`, JSON.stringify(buckets, null, 1));
console.log(`\n💾 ${CACHE}classified.json — ยังไม่แตะคลัง · ดูเต็ม ๆ: --list=sku | tier | ask`);
process.exit(0);
