/**
 * แผ่นอะคริลิค (acrylic-sheet) — สร้างจากการ "ทำซ้ำ" พวงกุญแจอะคริลิค (keyring-copy-copy) · 15 ก.ย. 69
 *
 *   node scripts/acrylic-sheet-from-keyring.mjs           # ดูผล (ไม่เขียนฐานข้อมูล)
 *   node scripts/acrylic-sheet-from-keyring.mjs --write   # บันทึกจริง
 *
 * ก๊อปทั้งชุดเหมือนปุ่ม "ทำซ้ำ" ในหน้าแอดมิน (ตัวเลือก 23 กลุ่ม · เรทราคา 4 เรท · แท็บ · SEO · รูป)
 * ต่างกันแค่ของที่ห้ามก๊อป:
 *   id / data.id · ชื่อ · ลิงก์ (slug) ใหม่ · sold = 0 · featured = false · ตัด reviewed (ป้าย "ตรวจแล้ว")
 *   hidden = true (สำเนาเริ่มเป็นฉบับร่างเสมอ ดู memory iducky-publish-workflow)
 *   savedAt = ISO ใหม่ · sort = เท่าต้นฉบับ (ให้อยู่ติดกันในลิสต์)
 *
 * เขียนคอลัมน์กระจก name/category/price/sold/featured/badge/sort ด้วย (ดู memory iducky-script-write-product)
 * รันซ้ำได้ · เขียนแล้วอ่านกลับเทียบทุกข้อ · สำรองต้นฉบับไว้ที่ backups/
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const SRC = "keyring-copy-copy";
const ID = "acrylic-sheet";
const NAME = "แผ่นอะคริลิค";
const SLUG = "แผ่นอะคริลิค-Acrylic-Sheet";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => {
  console.error("✗", m);
  process.exit(1);
};

// ── 1) อ่านต้นฉบับ ────────────────────────────────────────────────────────────
const { data: src, error: e1 } = await sb.from("products").select("id,name,price,category,sold,featured,badge,sort,data").eq("id", SRC).maybeSingle();
if (e1) die(`อ่านต้นฉบับไม่ได้: ${e1.message}`);
if (!src) die(`ไม่พบสินค้าต้นฉบับ ${SRC}`);
const d = src.data;
console.log(`ต้นฉบับ: ${src.name} (${SRC}) · ตัวเลือก ${d.options?.length ?? 0} กลุ่ม · เรท ${d.priceRates?.length ?? 0} · ${Math.round(JSON.stringify(src).length / 1024)} KB`);

// ── 2) เช็คว่าไม่ชนของเดิม ────────────────────────────────────────────────────
const { data: all, error: e2 } = await sb.from("products").select("id,name,data");
if (e2) die(`อ่านรายการสินค้าไม่ได้: ${e2.message}`);
const existing = all.find((p) => p.id === ID);
if (existing && existing.data?.__copiedFrom !== SRC) die(`มีสินค้า id ${ID} อยู่แล้ว (${existing.name}) — ไม่ใช่สำเนาที่สคริปต์นี้สร้าง ห้ามเขียนทับ`);
const slugClash = all.find((p) => p.id !== ID && p.data?.slug === SLUG);
if (slugClash) die(`ลิงก์ ${SLUG} ถูกใช้แล้วโดย ${slugClash.id}`);
if (existing) console.log(`(รันซ้ำ — เขียนทับสำเนาเดิม ${ID})`);

// ── 3) ปั้นสำเนา ──────────────────────────────────────────────────────────────
const copy = {
  ...d,
  id: ID,
  name: NAME,
  slug: SLUG,
  sold: 0,
  featured: false,
  hidden: true,
  savedAt: new Date().toISOString(),
  /** ร่องรอยว่าใครเป็นต้นฉบับ — ให้สคริปต์รันซ้ำรู้ว่าเขียนทับตัวเองได้ */
  __copiedFrom: SRC,
};
delete copy.reviewed;

// ── 4) สำรอง + เขียน ─────────────────────────────────────────────────────────
if (!WRITE) {
  console.log("\n— ดูอย่างเดียว (ยังไม่เขียน) ใส่ --write เพื่อบันทึกจริง —");
  console.log(`  id        ${SRC} → ${ID}`);
  console.log(`  ชื่อ       ${src.name} → ${NAME}`);
  console.log(`  ลิงก์      ${d.slug} → ${SLUG}`);
  console.log(`  หมวด      ${src.category} (เท่าเดิม) · ราคา ${src.price} · sort ${src.sort}`);
  console.log(`  ยอดขาย    ${d.sold} → 0 · featured ${d.featured ?? false} → false · reviewed ${d.reviewed ?? "-"} → ตัดทิ้ง`);
  console.log(`  สถานะ     ฉบับร่าง (hidden: true)`);
  console.log(`  ก๊อปมาด้วย ตัวเลือก ${copy.options?.length ?? 0} กลุ่ม · เรทราคา ${copy.priceRates?.length ?? 0} · แท็บ ${copy.tabs?.length ?? 0} · รูป ${copy.images?.length ?? 0} · FAQ ${copy.seo?.faq?.length ?? 0} · rules ${copy.rules?.length ?? 0}`);
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(new URL(`../backups/${SRC}-${stamp}.json`, import.meta.url), JSON.stringify(src, null, 2));

const row = {
  id: ID,
  name: NAME,
  category: src.category,
  price: src.price,
  sold: 0,
  featured: false,
  badge: src.badge ?? null,
  sort: src.sort,
  data: copy,
};
const { error: e3 } = await sb.from("products").upsert(row, { onConflict: "id" }).select("id");
if (e3) die(`เขียนไม่สำเร็จ: ${e3.message}`);

// ── 5) อ่านกลับเทียบทุกข้อ ───────────────────────────────────────────────────
const { data: back, error: e4 } = await sb.from("products").select("id,name,price,category,sold,featured,sort,data").eq("id", ID).maybeSingle();
if (e4 || !back) die(`อ่านกลับไม่ได้: ${e4?.message ?? "ไม่พบแถว"}`);
const b = back.data;
const checks = [
  ["คอลัมน์ id", back.id === ID],
  ["คอลัมน์ ชื่อ", back.name === NAME],
  ["คอลัมน์ หมวด", back.category === src.category],
  ["คอลัมน์ ราคา", back.price === src.price],
  ["คอลัมน์ ยอดขาย = 0", back.sold === 0],
  ["คอลัมน์ sort ติดต้นฉบับ", back.sort === src.sort],
  ["data.id", b.id === ID],
  ["data.name", b.name === NAME],
  ["data.slug", b.slug === SLUG],
  ["data.sold = 0", b.sold === 0],
  ["ฉบับร่าง (hidden)", b.hidden === true],
  ["ไม่มีป้ายตรวจแล้ว", b.reviewed === undefined],
  ["savedAt เป็น ISO string", typeof b.savedAt === "string" && !Number.isNaN(Date.parse(b.savedAt)) && b.savedAt === copy.savedAt],
  [`ตัวเลือกครบ ${d.options?.length ?? 0} กลุ่ม`, (b.options?.length ?? 0) === (d.options?.length ?? 0)],
  ["ชื่อกลุ่มตัวเลือกตรงทุกกลุ่ม", JSON.stringify((b.options ?? []).map((o) => o.label)) === JSON.stringify((d.options ?? []).map((o) => o.label))],
  [`เรทราคาครบ ${d.priceRates?.length ?? 0}`, (b.priceRates?.length ?? 0) === (d.priceRates?.length ?? 0)],
  ["ตารางราคาเรทแรกตรงต้นฉบับ", JSON.stringify(b.pricing) === JSON.stringify(d.pricing) && JSON.stringify(b.priceRates?.[0]?.pricing) === JSON.stringify(d.priceRates?.[0]?.pricing)],
  [`แท็บครบ ${d.tabs?.length ?? 0}`, (b.tabs?.length ?? 0) === (d.tabs?.length ?? 0)],
  [`รูปครบ ${d.images?.length ?? 0}`, (b.images?.length ?? 0) === (d.images?.length ?? 0)],
  [`กฎตัวเลือกครบ ${d.rules?.length ?? 0}`, (b.rules?.length ?? 0) === (d.rules?.length ?? 0)],
  ["ราคาต่ำสุด/สูงสุดเท่าต้นฉบับ", b.priceMin === d.priceMin && b.priceMax === d.priceMax],
  ["rating ติดมา (ขาดแล้วหน้าสินค้าพัง)", typeof b.rating === "number"],
];
let bad = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) bad++;
}
if (bad) die(`อ่านกลับไม่ตรง ${bad} ข้อ`);
console.log(`\n✓ สร้าง "${NAME}" (${ID}) แล้ว — ฉบับร่าง · หน้าแก้ไข /admin/products/${ID}`);
