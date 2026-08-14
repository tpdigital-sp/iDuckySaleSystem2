#!/usr/bin/env node
/**
 * ดึงรายการสินค้า + "แบบ/ขนาด" จากเว็บตารางราคา iduckyofficial-pricelists.com
 *
 *   node scripts/pricelist-scrape.mjs            # ดึง (แคชไว้) + สรุป
 *   node scripts/pricelist-scrape.mjs --refresh  # ดึงใหม่ ไม่ใช้แคช
 *   node scripts/pricelist-scrape.mjs --page=blanket   # เจาะดูหน้าเดียว
 *
 * โครงหน้าเว็บ (Wix): ตารางราคาแถวแรก = หัวคอลัมน์ = "แบบ/ขนาด" ของสินค้านั้น
 * คอลัมน์แรกเป็นช่วงจำนวน (1-10 ผืน) ที่เหลือคือมิติที่กินสต๊อกจริง
 *
 * สคริปต์นี้ "อ่านอย่างเดียว" — ไม่เขียนคลัง ไม่แตะ Supabase
 * ผลลัพธ์เก็บเป็น JSON ให้ขั้นต่อไปเอาไปสร้าง SKU หลังคนตรวจแล้ว
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REFRESH = process.argv.includes("--refresh");
const ONE = (process.argv.find((a) => a.startsWith("--page=")) || "").split("=")[1];
const HOST = "https://www.iduckyofficial-pricelists.com";
const CACHE = new URL("../.cache/pricelist/", import.meta.url).pathname;
const UA = "Mozilla/5.0 (compatible; iDuckyStockSync/1.0)";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&deg;/g, "°")
    .replace(/&times;/g, "×")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** หัวคอลัมน์ที่ "ไม่ใช่แบบสินค้า" — ช่วงจำนวน/ราคา/หมายเหตุ */
const NOT_VARIANT =
  /^(จำนวน|ราคา|หน่วย|ชิ้น|ผืน|ใบ|อัน|ตัว|แผ่น|ชุด|บาท|ขนาด|แบบ|รายการ|-|\d+\s*[-–]\s*\d+|\d+\s*ขึ้นไป)$/i;

if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

async function getPage(slug) {
  const file = `${CACHE}${encodeURIComponent(slug)}.html`;
  if (!REFRESH && existsSync(file)) return readFileSync(file, "utf8");
  const res = await fetch(`${HOST}/${slug}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  writeFileSync(file, html);
  await new Promise((r) => setTimeout(r, 350)); // เว้นจังหวะ ไม่ยิงรัวใส่เว็บตัวเอง
  return html;
}

/** ดึงตารางทั้งหมดในหน้า → { headers, rowCount } */
function tablesOf(html) {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((t) => {
    const rows = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
      [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
    );
    return { headers: rows[0] ?? [], rowCount: rows.length };
  });
}

/** แบบ/ขนาดของสินค้าหน้านั้น = หัวคอลัมน์ทุกตาราง หักคอลัมน์แรกและคำที่ไม่ใช่แบบ */
function variantsOf(html) {
  const out = new Set();
  for (const t of tablesOf(html)) {
    for (const h of t.headers.slice(1)) {
      const v = h.trim();
      if (!v || NOT_VARIANT.test(v) || v.length > 40) continue;
      out.add(v);
    }
  }
  return [...out];
}

// ── รายชื่อหน้า ──
const smap = await fetch(`${HOST}/pages-sitemap.xml`, { headers: { "User-Agent": UA } }).then((r) => r.text());
const slugs = [...smap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(`${HOST}/`, "").replace(/\/$/, ""))
  .filter((s) => s && !s.startsWith("http"));

const targets = ONE ? [ONE] : slugs;
const results = [];
for (const slug of targets) {
  try {
    const html = await getPage(slug);
    const tbl = tablesOf(html);
    results.push({ slug, tables: tbl.length, variants: variantsOf(html) });
  } catch (e) {
    results.push({ slug, error: String(e.message) });
  }
}

// ── เทียบกับสินค้าใน Supabase (slug ของเว็บตารางราคา ≈ id สินค้า) ──
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows } = await sb.from("products").select("id,data").neq("category", "__presets__");
const prods = (rows ?? []).filter((r) => r.data?.name && !r.id.startsWith("__"));
/** สินค้าที่ id ขึ้นต้นด้วย slug (casephone → casephone, casephone-4, casephone-clear) */
const matchProducts = (slug) => prods.filter((p) => p.id === slug || p.id.startsWith(`${slug}-`));

const ok = results.filter((r) => !r.error);
const totalVariants = ok.reduce((s, r) => s + r.variants.length, 0);
console.log(`ดึง ${ok.length}/${results.length} หน้า · เจอแบบ/ขนาดรวม ${totalVariants} ค่า\n`);

const sorted = [...ok].sort((a, b) => b.variants.length - a.variants.length);
for (const r of sorted.slice(0, ONE ? 99 : 22)) {
  const ps = matchProducts(r.slug);
  console.log(`${r.slug.padEnd(24)} ${String(r.variants.length).padStart(3)} แบบ · ${String(r.tables).padStart(2)} ตาราง · สินค้าในระบบ ${ps.length}`);
  if (r.variants.length) console.log(`      ${r.variants.slice(0, 8).join(" · ").slice(0, 130)}${r.variants.length > 8 ? " …" : ""}`);
}
const noMatch = ok.filter((r) => matchProducts(r.slug).length === 0);
console.log(`\nหน้าที่จับคู่กับสินค้าในระบบไม่ได้: ${noMatch.length}`);
if (noMatch.length) console.log(`   ${noMatch.map((r) => r.slug).join(" · ").slice(0, 300)}`);
const failed = results.filter((r) => r.error);
if (failed.length) console.log(`\n⚠️ ดึงไม่สำเร็จ ${failed.length}: ${failed.map((r) => `${r.slug}(${r.error})`).join(" · ")}`);

const outFile = `${CACHE}variants.json`;
writeFileSync(outFile, JSON.stringify(results, null, 1));
console.log(`\n💾 เก็บผลไว้ที่ ${outFile} — ยังไม่แตะคลังสต๊อก`);
process.exit(0);
