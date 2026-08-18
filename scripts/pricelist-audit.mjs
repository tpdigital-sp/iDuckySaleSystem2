#!/usr/bin/env node
/**
 * เทียบสินค้าบนเว็บตารางราคา (iduckyofficial-pricelists.com) กับสินค้าในระบบหลังบ้าน
 *
 *   node scripts/pricelist-audit.mjs             # ใช้แคชหน้าเว็บที่ดึงไว้
 *   node scripts/pricelist-audit.mjs --refresh   # ดึงหน้าเว็บใหม่ทุกหน้า
 *
 * ตัวตัดสินว่า "หน้านั้นมีสินค้ากี่ตัว" ใช้กติกาเดียวกับหน้านำเข้า (src/lib/server/wix-scrape.ts)
 * คือ 1 ตารางราคา = 1 สินค้า และชื่อสินค้า = ข้อความก้อนสุดท้ายก่อนตาราง
 * เพื่อให้ชื่อที่ได้ตรงกับชื่อที่ถูกนำเข้ามาในระบบจริง ๆ
 *
 * ผลลัพธ์: .cache/pricelist-audit.json  (อ่านอย่างเดียว ไม่แตะฐานข้อมูล)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const REFRESH = process.argv.includes("--refresh");
const HOST = "https://www.iduckyofficial-pricelists.com";
const UA = "Mozilla/5.0 (compatible; iDuckyAudit/1.0)";
const CACHE = ".cache/pricelist-pages/";
const OUT = ".cache/pricelist-audit.json";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

// ── ตัวช่วยอ่าน HTML (ยกมาจาก wix-scrape.ts ให้ผลลัพธ์ตรงกับหน้านำเข้า) ──
const decode = (s) =>
  String(s)
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&deg;/g, "°").replace(/&times;/g, "×")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (s) => decode(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const BADNAME = /^\(|^\*|ADD ON|^เพิ่มเติม|บวกเพิ่ม|ทำได้เฉพาะ|^เรทราคา|=|สั่งขั้นต่ำ|มีความหนา|^\d+([.,]\d+)?\s*x\s*\d+|^\d+\s*ชุดจำนวน|^\d+\s*ชิ้น|^\d+\s*หลา/;
const parseRows = (t) =>
  [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => strip(c[1]))
  );

/** สินค้าที่หน้านำเข้าจะตรวจเจอในหน้านี้ (1 ตาราง = 1 สินค้า) */
function detect(html) {
  const out = [];
  for (const mt of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const before = html.slice(Math.max(0, mt.index - 1400), mt.index);
    const labels = [...before.matchAll(/wixui-rich-text__text[^>]*>([\s\S]*?)<\/(?:p|span|div|h[1-6])>/g)]
      .map((m) => strip(m[1])).filter((t) => t && t.length < 70);
    const name = [...labels].reverse().find((t) => t.length >= 3 && !BADNAME.test(t)) || "";
    const rows = parseRows(mt[0]).filter((r) => r.length);
    const head = rows[0] || [];
    const bad = !name || rows.length < 2 || /ADD ON|เพิ่มเติม/.test(name) || /เพิ่มเติม/.test(head[0] || "");
    out.push({ name, ok: !bad, rows: rows.length });
  }
  return out;
}

// ── 1. รายชื่อหน้า + HTML ──
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
const sitemap = await fetch(`${HOST}/pages-sitemap.xml`, { headers: { "User-Agent": UA } }).then((r) => r.text());
const slugs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1].replace(`${HOST}/`, "").replace(/\/$/, ""))
  .filter((s) => s && !s.startsWith("http"));

async function pageHtml(slug) {
  const file = CACHE + encodeURIComponent(decodeURIComponent(slug)) + ".html";
  if (!REFRESH && existsSync(file)) return readFileSync(file, "utf8");
  const r = await fetch(`${HOST}/${slug}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const h = await r.text();
  writeFileSync(file, h);
  await new Promise((z) => setTimeout(z, 250));
  return h;
}

/** หน้าที่ไม่ใช่หน้าสินค้า — ไม่นับรวมในสถิติ */
const NOT_PRODUCT = new Set([
  "about-4", "team", "conditions", "productionlimitations", "laminate",
  "acrylic-kit", "coloracrylic", "partskeychain", "package",
]);

const pages = [];
for (const slug of slugs) {
  let html;
  try { html = await pageHtml(slug); } catch (e) { pages.push({ slug, error: String(e.message), items: [] }); continue; }
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || slug;
  pages.push({
    slug: decodeURIComponent(slug),
    title: strip(title).replace(/\s*\|\s*iDuckyOfficial\s*$/i, "").trim() || decodeURIComponent(slug),
    url: `${HOST}/${slug}`,
    notProduct: NOT_PRODUCT.has(decodeURIComponent(slug)),
    items: detect(html).filter((d) => d.ok).map((d) => ({ title: d.name })),
  });
}

// ── 2. สินค้าในระบบ ──
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from("products").select("id,category,data");
if (error) throw error;
const prods = data
  .filter((r) => !r.id.startsWith("__") && r.category !== "__presets__" && r.data?.name)
  .map((r) => ({
    id: r.id, name: r.data.name, category: r.category,
    published: !r.data.hidden, reviewed: !!r.data.reviewed,
    hasImage: !!(r.data.imageSrc || r.data.images?.some?.((i) => i.src)),
    hasPricing: !!(r.data.pricing || r.data.priceRates?.length),
  }));

// ── 3. จับคู่ ชื่อบนเว็บ ↔ ชื่อในระบบ ──
const norm = (s) => String(s).toLowerCase()
  .replace(/[\s​]+/g, "")
  .replace(/[()（）[\]{}|/\\,.·•:;'"“”‘’\-–—_+*#!?]/g, "")
  .replace(/[์็่้๊๋ํ]/g, "");
/** ชุดตัวอักษรคู่ (bigram) ไว้วัดความคล้าย */
const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
const dice = (a, b) => {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const x of A) if (B.has(x)) hit++;
  return (2 * hit) / (A.size + B.size);
};

const pool = prods.map((p) => ({ ...p, key: norm(p.name), used: false }));
const flat = [];
for (const pg of pages) for (const it of pg.items) flat.push({ pg, it, key: norm(it.title) });

/** รอบที่ 1 ชื่อตรงกันเป๊ะ · รอบที่ 2 ชื่อหนึ่งอยู่ในอีกชื่อ · รอบที่ 3 คล้ายกัน ≥ 0.72 */
for (const x of flat) {
  const hit = pool.find((p) => !p.used && p.key === x.key);
  if (hit) { hit.used = true; x.hit = { p: hit, how: "ชื่อตรงกัน" }; }
}
for (const x of flat) {
  if (x.hit || x.key.length < 5) continue;
  const hit = pool.find((p) => !p.used && p.key.length >= 5 && (p.key.includes(x.key) || x.key.includes(p.key)));
  if (hit) { hit.used = true; x.hit = { p: hit, how: "ชื่อครอบคลุมกัน" }; }
}
for (const x of flat) {
  if (x.hit || x.key.length < 5) continue;
  let best = null, score = 0;
  for (const p of pool) {
    if (p.used || p.key.length < 5) continue;
    const s = dice(x.key, p.key);
    if (s > score) { score = s; best = p; }
  }
  if (best && score >= 0.72) { best.used = true; x.hit = { p: best, how: `ชื่อคล้ายกัน ${Math.round(score * 100)}%` }; }
}

const report = pages.map((pg) => ({
  slug: pg.slug, title: pg.title, url: pg.url, notProduct: !!pg.notProduct, error: pg.error ?? null,
  items: pg.items.map((it) => {
    const x = flat.find((y) => y.pg === pg && y.it === it);
    const h = x?.hit;
    return {
      title: it.title,
      status: !h ? "missing" : h.p.published ? "published" : "draft",
      match: h?.how ?? null, id: h?.p.id ?? null, name: h?.p.name ?? null,
      category: h?.p.category ?? null, reviewed: h?.p.reviewed ?? false,
      hasImage: h?.p.hasImage ?? false, hasPricing: h?.p.hasPricing ?? false,
    };
  }),
}));
const extras = pool.filter((p) => !p.used)
  .map((p) => ({ id: p.id, name: p.name, category: p.category, published: p.published }));

const counted = report.filter((r) => !r.notProduct && !r.error).flatMap((r) => r.items);
const sum = {
  pages: report.length,
  pagesCounted: report.filter((r) => !r.notProduct && !r.error).length,
  items: counted.length,
  published: counted.filter((i) => i.status === "published").length,
  draft: counted.filter((i) => i.status === "draft").length,
  missing: counted.filter((i) => i.status === "missing").length,
  adminTotal: prods.length,
  adminPublished: prods.filter((p) => p.published).length,
  extras: extras.length,
};

writeFileSync(OUT, JSON.stringify({ sum, report, extras, generatedAt: new Date().toISOString() }, null, 1));
console.log(sum);
console.log(`\n💾 ${OUT}`);
