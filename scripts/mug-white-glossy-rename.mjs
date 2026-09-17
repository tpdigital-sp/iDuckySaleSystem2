#!/usr/bin/env node
/**
 * แก้วมัค 11 oz (mug-11oz): เปลี่ยนชื่อตัวเลือก "แก้วขาว" → "แก้วขาวเงา" (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 *   node scripts/mug-white-glossy-rename.mjs           # ดูผลก่อน (ไม่เขียน)
 *   node scripts/mug-white-glossy-rename.mjs --write   # เขียนจริง
 *
 * ⚠️ ใช้ scripts/rename-choice.mts ไม่ได้ — ตัวนั้นแทนที่แบบ substring ทั้งก้อน
 *    "แก้วขาว" เป็นส่วนหนึ่งของ "แก้วขาวขุ่น" → จะกลายเป็น "แก้วขาวเงาขุ่น" ไปด้วย
 *    ที่นี่จับชื่อ "ตรงตัว" เท่านั้น (ชื่อตัวเลือก · คีย์ช่องราคา) ส่วนข้อความจับด้วย lookahead ไม่ให้โดน "แก้วขาวขุ่น"
 *
 * แก้ 3 ที่ให้ขยับพร้อมกัน:
 *   1) สินค้า mug-11oz — ชื่อตัวเลือกกลุ่ม "ประเภท" · คีย์ cells ของ data.pricing + priceRates ทุกเรท (ตัวจริง+เงา+ตัวแทน)
 *      · ข้อความ terms / desc ที่เอ่ยถึง "แก้วขาว" · savedAt (ISO)
 *   2) ออเดอร์ OD-260915-6217 — sel["ประเภท"] + selections (ต้องเขียนทั้งคู่ ทุกจออ่าน sel ก่อน) ราคาไม่เปลี่ยน
 *   3) ลิงก์ราคา 5ZSH4 (ยังไม่หมดอายุ) — spec.s + lines ไม่งั้นปุ่ม "สั่งตามสเปคนี้" หาช่องราคาไม่เจอ
 * รันซ้ำได้ — เช็คทีละจุดว่าทำไปแล้วหรือยัง
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const PRODUCT_ID = "mug-11oz";
const ORDER_ID = "OD-260915-6217";
const GROUP = "ประเภท";
const OLD = "แก้วขาว";
const NEW = "แก้วขาวเงา";

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

/** "แก้วขาว" ที่ไม่ได้ตามด้วย "ขุ่น"/"เงา" — ใช้กับข้อความ */
const textRe = /แก้วขาว(?!ขุ่น|เงา)/g;
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

// ───────── 1) สินค้า ─────────
const { data: prow, error: pErr } = await sb.from("products").select("id,data").eq("id", PRODUCT_ID).maybeSingle();
if (pErr || !prow) die("อ่านสินค้าไม่ได้: " + (pErr?.message ?? "ไม่เจอ"));
const d = structuredClone(prow.data);
const log = [];
const group = (d.options ?? []).filter((g) => g.label === GROUP);
if (group.length !== 1) die(`กลุ่ม "${GROUP}" มี ${group.length} กลุ่ม (คาด 1)`);
const names = group[0].choices.map((c) => c.name);
if (names.includes(OLD) && names.includes(NEW)) die("มีทั้งชื่อเดิมและชื่อใหม่ในกลุ่มเดียวกัน");
for (const c of group[0].choices) {
  if (c.name === OLD) {
    c.name = NEW;
    log.push(`ชื่อตัวเลือก → ${NEW}`);
  }
  if (typeof c.desc === "string" && textRe.test(c.desc)) {
    c.desc = c.desc.replace(textRe, NEW);
    log.push(`desc ของ "${c.name}"`);
  }
  textRe.lastIndex = 0;
}
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
if (typeof d.terms === "string" && d.terms.match(textRe)) {
  d.terms = d.terms.replace(textRe, NEW);
  log.push("terms");
}
const productChanged = log.length > 0;
console.log(`สินค้า ${PRODUCT_ID}: ${productChanged ? log.join(" · ") : "ทำไปแล้ว"}`);
// กันพลาด: หลังแก้ต้องไม่เหลือ "แก้วขาว" ตรงตัวในชื่อ/คีย์ และ "แก้วขาวขุ่น" ต้องอยู่ครบ
const after = JSON.stringify(d);
if (after.includes("แก้วขาวเงาขุ่น") || after.includes("แก้วขาวเงาเงา")) die("แทนที่เกิน — หยุด");
if (after.split("แก้วขาวขุ่น").length !== JSON.stringify(prow.data).split("แก้วขาวขุ่น").length) die("จำนวน 'แก้วขาวขุ่น' เปลี่ยน — หยุด");

// ───────── 2) ออเดอร์ ─────────
const { data: orow, error: oErr } = await sb.from("orders").select("id,data").eq("id", ORDER_ID).maybeSingle();
if (oErr || !orow) die("อ่านออเดอร์ไม่ได้: " + (oErr?.message ?? "ไม่เจอ"));
const o = structuredClone(orow.data);
let orderChanged = 0;
for (const it of o.items ?? []) {
  if (it.productId !== PRODUCT_ID) continue;
  if (it.sel?.[GROUP] === OLD) {
    it.sel[GROUP] = NEW;
    orderChanged++;
  }
  if (typeof it.selections === "string") {
    const next = it.selections
      .split(" · ")
      .map((seg) => (seg === `${GROUP}: ${OLD}` ? `${GROUP}: ${NEW}` : seg))
      .join(" · ");
    if (next !== it.selections) {
      it.selections = next;
      orderChanged++;
    }
  }
}
console.log(`ออเดอร์ ${ORDER_ID}: ${orderChanged ? `แก้ ${orderChanged} จุด (sel + selections)` : "ทำไปแล้ว"}`);

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
  if (nd.spec?.s?.[GROUP] === OLD) {
    nd.spec.s[GROUP] = NEW;
    n++;
  }
  for (const line of nd.lines ?? []) {
    if (Array.isArray(line) && line[0] === GROUP && line[1] === OLD) {
      line[1] = NEW;
      n++;
    }
  }
  if (n) linkFix.push({ code: l.code, data: nd });
}
console.log(`ลิงก์ราคา: ${linkFix.length ? linkFix.map((l) => l.code).join(", ") : "ไม่มีที่ต้องแก้"}`);

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
if (orderChanged) {
  o.savedAt = now;
  const { data: w, error } = await sb.from("orders").update({ data: o }).eq("id", ORDER_ID).select("id");
  if (error || w?.length !== 1) die("เขียนออเดอร์ไม่ลง: " + (error?.message ?? `${w?.length} แถว`));
}
for (const l of linkFix) {
  const { data: w, error } = await sb.from("price_links").update({ data: l.data }).eq("code", l.code).select("code");
  if (error || w?.length !== 1) die(`เขียนลิงก์ราคา ${l.code} ไม่ลง: ` + (error?.message ?? `${w?.length} แถว`));
}

// ───────── อ่านกลับเทียบ ─────────
const { data: pb } = await sb.from("products").select("data").eq("id", PRODUCT_ID).maybeSingle();
const bd = pb.data;
const bNames = bd.options.find((g) => g.label === GROUP).choices.map((c) => c.name);
if (!bNames.includes(NEW) || bNames.includes(OLD)) die("อ่านกลับ: ชื่อตัวเลือกไม่ตรง " + bNames.join(","));
const tables = [bd.pricing, ...(bd.priceRates ?? []).map((r) => r.pricing)].filter((t) => t?.cells);
for (const t of tables) {
  const row = t.cells[NEW];
  if (!Array.isArray(row) || row.length !== t.tiers.length || OLD in t.cells) die("อ่านกลับ: ช่องราคาไม่ตรง");
}
if (JSON.stringify(bd.pricing.cells) !== JSON.stringify(bd.priceRates[0].pricing.cells)) die("อ่านกลับ: pricing ตัวจริงกับเงาไม่ตรงกัน");
const { data: ob } = await sb.from("orders").select("data").eq("id", ORDER_ID).maybeSingle();
const bit = ob.data.items.find((it) => it.productId === PRODUCT_ID);
if (bit.sel[GROUP] !== NEW || !bit.selections.includes(`${GROUP}: ${NEW} · `)) die("อ่านกลับ: ออเดอร์ไม่ตรง");
console.log(`\n✅ เสร็จ — ตารางราคา ${tables.length} ตาราง · ราคา "${NEW}" เรทแรก = ${bd.pricing.cells[NEW].join("/")}`);
