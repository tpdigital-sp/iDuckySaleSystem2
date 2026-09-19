#!/usr/bin/env node
/**
 * paper-art-pet: เปลี่ยนชื่อสินค้า (เจ้าของร้านสั่ง 19 ก.ย. 69)
 *   "กระดาษอาร์ตมัน PET" → "งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET"
 *   ชื่อเดิมอ่านเหมือนกระดาษชนิดเดียว ทั้งที่ขาย 2 วัสดุ (อาร์ตมัน 130–400 แกรม + แผ่น PET ขาว/ใส)
 *
 *   node scripts/paper-art-pet-rename.mjs           # ดูผลก่อน (ไม่เขียน)
 *   node scripts/paper-art-pet-rename.mjs --write   # เขียนจริง
 *
 * แตะ: data.name + คอลัมน์กระจก name ([[iducky-script-write-product]]) · ข้อความ seo ที่เอ่ยชื่อเดิม · savedAt
 * ไม่แตะ: data.slug (เจ้าของร้านเลือกคงลิงก์เดิม /products/กระดาษอาร์ตมัน-PET — ระบบไม่มี alias) ·
 *         ชื่อที่แช่ไว้ในออเดอร์เก่า (เป็นประวัติ ณ วันสั่ง) · ตัวเลือก/ราคา
 * รันซ้ำได้ · อ่านกลับเทียบ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PRODUCT_ID = "paper-art-pet";
const OLD = "กระดาษอาร์ตมัน PET";
const OLD_SEO = "กระดาษอาร์ตมัน | PET"; // รูปที่ตัวสร้าง SEO เคยเขียนไว้
const NEW = "งานพิมพ์กระดาษอาร์ตมัน & แผ่นพลาสติก PET";
const KEYWORD = "กระดาษอาร์ตมัน แผ่นพลาสติก PET"; // คำค้น: ไม่ใส่ "งานพิมพ์" ซ้อน "รับพิมพ์"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => {
  console.error("⛔ " + m);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
if (error || !row) die("อ่านสินค้าไม่ได้: " + error?.message);
const data = row.data;
const slugBefore = data.slug;

const changes = [];
if (data.name !== NEW) changes.push(`data.name: "${data.name}" → "${NEW}"`), (data.name = NEW);
if (row.name !== NEW) changes.push(`คอลัมน์ name: "${row.name}" → "${NEW}"`);

/** ไล่ข้อความใน seo ทั้งก้อน (title/description/faqs ฯลฯ) แทนชื่อเดิมทั้ง 2 รูป */
function walk(node, path) {
  for (const k of Object.keys(node ?? {})) {
    const v = node[k];
    if (typeof v === "string") {
      // "รับพิมพ์ <ชื่อ>" + ชื่อใหม่ขึ้นต้น "งานพิมพ์" = คำซ้ำ → ตัดคำนำหน้าออก
      const nv = (path === "seo.keywords" ? v.replaceAll(OLD_SEO, KEYWORD) : v)
        .replaceAll(`รับพิมพ์ ${OLD_SEO} เป็นลาย`, `${NEW} พิมพ์เป็นลาย`)
        .replaceAll(`รับพิมพ์/รับทำ ${OLD_SEO}`, `รับทำ ${NEW}`)
        .replaceAll(`รับพิมพ์ ${OLD_SEO}`, NEW)
        .replaceAll(OLD_SEO, NEW)
        .replaceAll(OLD, NEW);
      if (nv !== v) changes.push(`${path}.${k}:\n      - ${v}\n      + ${nv}`), (node[k] = nv);
    } else if (v && typeof v === "object") walk(v, `${path}.${k}`);
  }
}
if (data.seo) walk(data.seo, "seo");

// ที่อื่นในก้อนยังเอ่ยชื่อเดิมอยู่ไหม — แค่รายงาน ไม่แก้เอง
const rest = JSON.stringify({ ...data, seo: undefined, slug: undefined });
for (const o of [OLD, OLD_SEO]) if (rest.includes(o)) console.log(`ℹ️ ยังมี "${o}" ในส่วนอื่นของ data (ไม่ได้แตะ)`);

// ───────── ออเดอร์ที่มีรายการนี้ — ชื่อรายการแช่ไว้ตอนสั่ง (เจ้าของร้านสั่งให้เปลี่ยนตาม · OD-260916-2955) ─────────
// ต้องใส่ --orders ด้วยถึงจะแตะออเดอร์ · จับเฉพาะ item.name ที่ "เท่ากับชื่อเดิมทั้งคำ" ของ productId นี้
// ราคา/รายละเอียด/savedAt ไม่แตะ (เปลี่ยนแค่ป้ายชื่อ)
const ORDERS = process.argv.includes("--orders");
const renameItems = (o) => {
  let n = 0;
  for (const it of o.items ?? []) if (it.productId === PRODUCT_ID && it.name === OLD) (it.name = NEW), n++;
  return n;
};
const orderFix = [];
for (let from = 0; ; from += 500) {
  const { data: rows, error: oe } = await sb.from("orders").select("id,data").order("id").range(from, from + 499);
  if (oe) die("อ่านออเดอร์ไม่ได้: " + oe.message);
  for (const r of rows) {
    const n = renameItems(structuredClone(r.data));
    if (n) orderFix.push({ id: r.id, n, status: r.data.status });
  }
  if (rows.length < 500) break;
}
console.log(`ออเดอร์ที่ยังเป็นชื่อเดิม ${orderFix.length} ใบ: ${orderFix.map((o) => `${o.id} (${o.status} · ${o.n})`).join(", ") || "-"}`);

if (!changes.length && !orderFix.length) {
  console.log("✓ เป็นชื่อใหม่อยู่แล้ว ไม่มีอะไรต้องเขียน");
  process.exit(0);
}
if (changes.length) console.log(changes.map((c) => "  • " + c).join("\n"));
if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนสินค้า · --write --orders เขียนออเดอร์ด้วย)");
  process.exit(0);
}

if (changes.length) {
  data.savedAt = new Date().toISOString();
  const { data: upd, error: e2 } = await sb.from("products").update({ name: NEW, data }).eq("id", PRODUCT_ID).select("id");
  if (e2) die("เขียนไม่ได้: " + e2.message);
  if (upd?.length !== 1) die(`โดน ${upd?.length ?? 0} แถว (ควรเป็น 1)`);

  const { data: back } = await sb.from("products").select("name,data").eq("id", PRODUCT_ID).single();
  if (back?.name !== NEW || back?.data?.name !== NEW) die("อ่านกลับแล้วชื่อไม่ตรง");
  if (back.data.savedAt !== data.savedAt) die("อ่านกลับแล้ว savedAt ไม่ตรง");
  if (back.data.slug !== slugBefore) die("slug เปลี่ยน — ไม่ควรเกิด");
  if (JSON.stringify(back.data.seo ?? null).includes(OLD_SEO)) die("seo ยังมีชื่อเดิม");
}
let wrote = 0;
for (const o of ORDERS ? orderFix : []) {
  // อ่านสดอีกรอบก่อนเขียนทีละใบ — ออเดอร์มีคนแก้ตลอด อย่าเขียนทับด้วยก้อนที่อ่านไว้ตอนสแกน
  const { data: fresh, error: fe } = await sb.from("orders").select("data").eq("id", o.id).single();
  if (fe) die(`อ่านออเดอร์ ${o.id} ไม่ได้: ` + fe.message);
  const totalBefore = JSON.stringify(fresh.data.total ?? null);
  if (!renameItems(fresh.data)) continue;
  const { data: w, error: we } = await sb.from("orders").update({ data: fresh.data }).eq("id", o.id).select("id");
  if (we || w?.length !== 1) die(`เขียนออเดอร์ ${o.id} ไม่ลง: ` + (we?.message ?? `${w?.length} แถว`));
  const { data: ob } = await sb.from("orders").select("data").eq("id", o.id).single();
  if ((ob.data.items ?? []).some((it) => it.productId === PRODUCT_ID && it.name === OLD)) die(`อ่านกลับ: ออเดอร์ ${o.id} ยังมีชื่อเดิม`);
  if (JSON.stringify(ob.data.total ?? null) !== totalBefore) die(`อ่านกลับ: ยอดออเดอร์ ${o.id} ขยับ`);
  wrote++;
}
console.log(`\n✅ เขียนแล้ว อ่านกลับตรง · ออเดอร์ ${wrote} ใบ · ลิงก์เดิมคงไว้: /products/${slugBefore}`);
