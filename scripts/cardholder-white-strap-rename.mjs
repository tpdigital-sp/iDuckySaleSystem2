#!/usr/bin/env node
/**
 * CARD HOLDER พลาสติกขาว (cardholder-white): บอกในชื่อตัวเลือกว่าได้ "สายขาว" (เจ้าของร้านสั่ง 17 ก.ย. 69 · OD-260914-8407)
 *   "การ์ดพลาสติกขาว (สกรีนเค่ตัวการ์ด)" → "การ์ดพลาสติกขาว (สกรีนแค่ตัวการ์ด) + สายขาว"
 *
 *   node scripts/cardholder-white-strap-rename.mjs           # ดูผลก่อน (ไม่เขียน)
 *   node scripts/cardholder-white-strap-rename.mjs --write   # เขียนจริง
 *
 * ทำไมต้องอยู่ในชื่อ: คำว่า "แถมสายคล้องคอสีขาวเปล่า" เดิมอยู่แค่ใน desc ของการ์ดตัวเลือก
 *   บรรทัด "แบบ:" ในออเดอร์/ใบงาน/สถานีแพ็คโชว์แต่ชื่อ → ทีมงานไม่เห็นว่าต้องใส่สายขาว ลูกค้ากวาดตาก็ไม่เห็น
 *   (แก้ "เค่" ที่พิมพ์ตก → "แค่" ไปด้วยในรอบเดียว — ไหน ๆ คีย์ก็เปลี่ยนอยู่แล้ว)
 *
 * ⚠️ ชื่อนี้เป็นคีย์ pricing.cells (driverLabels = ["แบบ"]) → ขยับพร้อมกัน 3 ที่ ([[iducky-rename-choice-substring-trap]])
 *   1) สินค้า — ชื่อตัวเลือก · คีย์ cells ของ data.pricing + priceRates ทุกเรท · กฎ/ข้อความที่เอ่ยชื่อเต็ม · savedAt
 *   2) ออเดอร์ทุกใบที่มีรายการนี้ — sel + selections (ทุกจออ่าน sel ก่อน [[iducky-edit-selections-sel-first]]) ราคาไม่แตะ
 *   3) price_links ที่ยังไม่หมดอายุ — spec.s + lines
 * จับ "ตรงตัว" ทุกจุด · รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PRODUCT_ID = "cardholder-white";
const GROUP = "แบบ";
const OLD = "การ์ดพลาสติกขาว (สกรีนเค่ตัวการ์ด)";
const NEW = "การ์ดพลาสติกขาว (สกรีนแค่ตัวการ์ด) + สายขาว";

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

/** เปลี่ยนคีย์ cells โดยคงลำดับเดิม — คีย์อาจเป็น "ก│ข" หลายแกน จับทีละท่อน */
function renameCells(cells) {
  let n = 0;
  const out = {};
  for (const [k, v] of Object.entries(cells ?? {})) {
    const nk = k
      .split("│")
      .map((part) => (part === OLD ? (n++, NEW) : part))
      .join("│");
    out[nk] = v;
  }
  return { out, n };
}
/** ไล่ทั้งก้อน เปลี่ยนสตริงที่ "เท่ากับ OLD ทั้งคำ" (กฎ showWhen/allow/ของแถม ฯลฯ ที่อ้างชื่อตัวเลือก) */
function renameExact(node, path, hits) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (v === OLD) (node[i] = NEW), hits.push(`${path}[${i}]`);
      else if (v && typeof v === "object") renameExact(v, `${path}[${i}]`, hits);
    });
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (v === OLD) (node[k] = NEW), hits.push(`${path}.${k}`);
      else if (v && typeof v === "object") renameExact(v, `${path}.${k}`, hits);
    }
  }
}

// ───────── 1) สินค้า ─────────
const { data: prow, error: pErr } = await sb.from("products").select("id,data").eq("id", PRODUCT_ID).maybeSingle();
if (pErr || !prow) die("อ่านสินค้าไม่ได้: " + (pErr?.message ?? "ไม่เจอ"));
const d = structuredClone(prow.data);
const log = [];
const group = (d.options ?? []).filter((g) => g.label === GROUP);
if (group.length !== 1) die(`กลุ่ม "${GROUP}" มี ${group.length} กลุ่ม (คาด 1)`);
const names = group[0].choices.map((c) => c.name);
if (names.includes(OLD) && names.includes(NEW)) die("มีทั้งชื่อเดิมและชื่อใหม่ในกลุ่มเดียวกัน");
if (!names.includes(OLD) && !names.includes(NEW)) die("ไม่เจอตัวเลือกทั้งชื่อเดิมและชื่อใหม่: " + names.join(" | "));
const priceBefore = JSON.stringify(Object.values(prow.data.pricing?.cells ?? {}));
if (d.pricing?.cells) {
  const r = renameCells(d.pricing.cells);
  d.pricing.cells = r.out;
  if (r.n) log.push(`data.pricing ${r.n} ช่อง`);
}
for (const rate of d.priceRates ?? []) {
  if (!rate.pricing?.cells) continue;
  const r = renameCells(rate.pricing.cells);
  rate.pricing.cells = r.out;
  if (r.n) log.push(`เรท "${rate.label}" ${r.n} ช่อง`);
}
const hits = [];
renameExact(d, "data", hits);
if (hits.length) log.push(`ชื่อตรงตัว ${hits.length} จุด (${hits.join(", ")})`);
const productChanged = log.length > 0;
console.log(`สินค้า ${PRODUCT_ID}: ${productChanged ? log.join(" · ") : "ทำไปแล้ว"}`);
// กันพลาด: ต้องไม่เหลือชื่อเดิมที่ไหนเลย (รวมในข้อความ) และตัวเลขราคาต้องเท่าเดิมทุกช่องตามลำดับเดิม
const leftover = JSON.stringify(d).split(OLD).length - 1;
if (leftover) die(`ยังเหลือชื่อเดิมอยู่ในข้อความ ${leftover} จุด — ดูก่อนว่าอยู่ตรงไหน`);
if (JSON.stringify(Object.values(d.pricing?.cells ?? {})) !== priceBefore) die("ตัวเลขราคาขยับ — หยุด");

// ───────── 2) ออเดอร์ทุกใบที่มีรายการนี้ ─────────
const orderFix = [];
for (let from = 0; ; from += 500) {
  const { data: rows, error } = await sb.from("orders").select("id,data").order("id").range(from, from + 499);
  if (error) die("อ่านออเดอร์ไม่ได้: " + error.message);
  for (const row of rows) {
    if (!JSON.stringify(row.data?.items ?? "").includes(OLD)) continue;
    const o = structuredClone(row.data);
    let n = 0;
    for (const it of o.items ?? []) {
      if (it.productId !== PRODUCT_ID) continue;
      if (it.sel?.[GROUP] === OLD) (it.sel[GROUP] = NEW), n++;
      if (typeof it.selections === "string") {
        const next = it.selections
          .split(" · ")
          .map((seg) => (seg === `${GROUP}: ${OLD}` ? `${GROUP}: ${NEW}` : seg))
          .join(" · ");
        if (next !== it.selections) (it.selections = next), n++;
      }
    }
    if (n) orderFix.push({ id: row.id, data: o, n, status: row.data.status });
  }
  if (rows.length < 500) break;
}
console.log(`ออเดอร์: ${orderFix.length ? orderFix.map((o) => `${o.id} (${o.status} · ${o.n} จุด)`).join(", ") : "ไม่มีที่ต้องแก้"}`);

// ───────── 3) ลิงก์ราคาที่ยังไม่หมดอายุ ─────────
const { data: links, error: lErr } = await sb.from("price_links").select("code,data");
if (lErr) die("อ่าน price_links ไม่ได้: " + lErr.message);
const linkFix = [];
for (const l of links) {
  const ld = l.data;
  if (ld?.productId !== PRODUCT_ID) continue;
  if (ld.expiresAt && new Date(ld.expiresAt) < new Date()) continue;
  const nd = structuredClone(ld);
  let n = 0;
  if (nd.spec?.s?.[GROUP] === OLD) (nd.spec.s[GROUP] = NEW), n++;
  for (const line of nd.lines ?? []) {
    if (Array.isArray(line) && line[0] === GROUP && line[1] === OLD) (line[1] = NEW), n++;
  }
  if (n) linkFix.push({ code: l.code, data: nd });
}
console.log(`ลิงก์ราคา: ${linkFix.length ? linkFix.map((l) => l.code).join(", ") : "ไม่มีที่ต้องแก้"}`);

// (สแกนตาราง products ทั้งตารางแล้ว 17 ก.ย. 69 — ชื่อเดิมมีแค่ในแถว cardholder-white ไม่มีของแถม/คลัง preset อ้างถึง)

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าโอเค)");
  process.exit(0);
}

const now = new Date().toISOString();
if (productChanged) {
  d.savedAt = now;
  const { data: w, error } = await sb.from("products").update({ data: d }).eq("id", PRODUCT_ID).select("id");
  if (error || w?.length !== 1) die("เขียนสินค้าไม่ลง: " + (error?.message ?? `${w?.length} แถว`));
}
for (const o of orderFix) {
  // ไม่แตะ savedAt ของออเดอร์ — หน้าจอที่เปิดค้างจะได้ไม่เด้งว่ามีคนอื่นแก้ (เปลี่ยนแค่ป้ายชื่อ ไม่ใช่เนื้องาน)
  const { data: w, error } = await sb.from("orders").update({ data: o.data }).eq("id", o.id).select("id");
  if (error || w?.length !== 1) die(`เขียนออเดอร์ ${o.id} ไม่ลง: ` + (error?.message ?? `${w?.length} แถว`));
}
for (const l of linkFix) {
  const { data: w, error } = await sb.from("price_links").update({ data: l.data }).eq("code", l.code).select("code");
  if (error || w?.length !== 1) die(`เขียนลิงก์ราคา ${l.code} ไม่ลง: ` + (error?.message ?? `${w?.length} แถว`));
}

// ───────── อ่านกลับเทียบ ─────────
const { data: pb } = await sb.from("products").select("data").eq("id", PRODUCT_ID).maybeSingle();
const bd = pb.data;
const bNames = bd.options.find((g) => g.label === GROUP).choices.map((c) => c.name);
if (!bNames.includes(NEW) || bNames.includes(OLD) || bNames.length !== names.length) die("อ่านกลับ: ชื่อตัวเลือกไม่ตรง " + bNames.join(","));
const tables = [bd.pricing, ...(bd.priceRates ?? []).map((r) => r.pricing)].filter((t) => t?.cells);
for (const t of tables) {
  if (!(NEW in t.cells) || OLD in t.cells) die("อ่านกลับ: ช่องราคาไม่ตรง");
}
if (JSON.stringify(Object.values(bd.pricing.cells)) !== priceBefore) die("อ่านกลับ: ตัวเลขราคาขยับ");
for (const o of orderFix) {
  const { data: ob } = await sb.from("orders").select("data").eq("id", o.id).maybeSingle();
  if (JSON.stringify(ob.data.items).includes(OLD)) die(`อ่านกลับ: ออเดอร์ ${o.id} ยังมีชื่อเดิม`);
}
console.log(`\n✅ เสร็จ — ตารางราคา ${tables.length} ตาราง · ราคา "${NEW}" = ${JSON.stringify(bd.pricing.cells[NEW])} · ออเดอร์ ${orderFix.length} ใบ · ลิงก์ราคา ${linkFix.length}`);
