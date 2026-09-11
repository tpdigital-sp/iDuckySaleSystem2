#!/usr/bin/env node
/**
 * Magnet Bookmark ที่คั่นหนังสือแม่เหล็ก (magnetbookmark) — กติกาขายเป็นเซ็ต + คละลาย
 *
 *   node scripts/magnet-bookmark-set-mix.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/magnet-bookmark-set-mix.mjs --write
 *
 * เจ้าของร้านสั่ง 11 ก.ย. 69:
 *   • ขายเป็นเซ็ต 1 เซ็ต = 5 ชิ้น
 *   • ราคาปลีก 1-3 เซ็ต คละลายได้อิสระ — 1 เซ็ตคละได้ 5 ลาย · 3 เซ็ตคละได้ 15 ลาย
 *   • ตั้งแต่ 4 เซ็ตขึ้นไป รวมในราคา 1 ลาย/เซ็ต · คละเกินบวกลายละ 5 บาท (4 เซ็ต คละ 5 ลาย = +5)
 *
 * สูตรสินค้าเซ็ต (แบบเดียวกับ jibbitz-shoe · ดู memory iducky-tiered-pricing):
 *   priceRates[]: minPerDesign 1 + freeMixBelowQty 4 + extraDesignFee 5   (ทั้งเรทปกติและเรทตัวแทน)
 *   options "ขนาดไดคัท" ทุกตัวเลือก: perUnit 5 (เพดานลายช่วงคละอิสระ = 5 × เซ็ต)
 *                                    + piecesPerUnit 5 (ช่องจำนวนต่อลาย/บรรทัด 📐 นับเป็นชิ้น)
 *   ⚠️ ห้ามมี tierByDesign / mixRule / hardMaxDesigns (ทับกติกานี้เงียบ ๆ) — ลบทิ้งถ้าเจอ
 *   ไม่แตะตารางราคา (pricing / priceRates[].pricing) และไม่แตะชื่อกลุ่ม/ตัวเลือก (เป็นแกน driverLabels)
 *
 * รันซ้ำได้ · ตรวจชื่อสินค้าก่อนเขียน · อ่านกลับเทียบทุกค่า + savedAt
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "magnetbookmark";
const EXPECT_NAME = "Magnet Bookmark (ที่คั่นหนังสือแม่เหล็ก)";
const SIZE_OPT = "ขนาดไดคัท";
const PER = 5;
const RATE_FIELDS = { minPerDesign: 1, freeMixBelowQty: 4, extraDesignFee: 5 };

const MIX_TERMS =
  "คละลายได้: สั่ง 1-3 เซ็ต คละได้อิสระ เซ็ตละ 5 ลาย (3 เซ็ต = 15 ลาย) · ตั้งแต่ 4 เซ็ตขึ้นไป รวมในราคา 1 ลายต่อเซ็ต คละเกินบวกลายละ 5 บาท (เช่น 4 เซ็ต คละ 5 ลาย บวก 5 บาท)";
const OLD_TERMS_HEAD = "จำหน่ายเป็นเซ็ต | 1 เซ็ต = 5 ชิ้น (1 แบบ | 1 ขนาด : 1 ชุด)";
const NEW_TERMS_HEAD = "จำหน่ายเป็นเซ็ต | 1 เซ็ต = 5 ชิ้น (1 ขนาด : 1 เซ็ต)\n" + MIX_TERMS;
const OLD_TAB_LINE = "• จำหน่ายเป็นเซ็ต 1 เซ็ต จำนวน 5 ชิ้น — 1 แบบ | 1 ขนาด : 1 ชุด";
const NEW_TAB_LINE = "• จำหน่ายเป็นเซ็ต 1 เซ็ต จำนวน 5 ชิ้น (1 ขนาดต่อ 1 เซ็ต)\n• " + MIX_TERMS;
const HIGHLIGHT = "1-3 เซ็ต คละลายได้อิสระ · 4 เซ็ตขึ้นไป คละเกิน 1 ลาย/เซ็ต บวกลายละ 5 บาท";
const FAQ = {
  q: "คละลายได้ไหม คิดเพิ่มยังไง?",
  a: "ได้ครับ สั่ง 1-3 เซ็ต คละได้อิสระ เซ็ตละ 5 ลาย (1 เซ็ต = 5 ลาย · 3 เซ็ต = 15 ลาย) ไม่คิดเพิ่ม · ตั้งแต่ 4 เซ็ตขึ้นไป รวมในราคา 1 ลายต่อเซ็ต คละเกินบวกลายละ 5 บาท เช่น สั่ง 4 เซ็ต คละ 5 ลาย บวกเพิ่ม 5 บาท",
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;
const changes = [];
const log = (s) => changes.push(s);

/* 1) เรทราคา — ทุกเรท (ปกติ + ตัวแทน) */
if (!Array.isArray(d.priceRates) || !d.priceRates.length) die("ไม่พบ priceRates");
for (const r of d.priceRates) {
  for (const [k, v] of Object.entries(RATE_FIELDS)) {
    if (r[k] !== v) {
      log(`เรท ${r.id}: ${k} ${r[k] ?? "-"} → ${v}`);
      r[k] = v;
    }
  }
  if (r.underMinPieceFee != null) {
    log(`เรท ${r.id}: ลบ underMinPieceFee ${r.underMinPieceFee} (ขัดกับกติกาลายละ 5)`);
    delete r.underMinPieceFee;
  }
}
/* 2) ธงที่ทับกติกา */
for (const k of ["tierByDesign", "mixRule", "hardMaxDesigns"]) {
  if (d[k] != null) {
    log(`ลบ data.${k} (${JSON.stringify(d[k])})`);
    delete d[k];
  }
}
/* 3) ชิ้นต่อเซ็ตที่กลุ่ม "ขนาดไดคัท" */
const opt = (d.options ?? []).find((o) => o.label === SIZE_OPT);
if (!opt) die(`ไม่พบกลุ่ม "${SIZE_OPT}"`);
if (opt.choices.length !== 3) die(`กลุ่ม "${SIZE_OPT}" มี ${opt.choices.length} ตัวเลือก (คาด 3) — โครงสร้างเปลี่ยน ดูก่อน`);
for (const c of opt.choices) {
  if (c.perUnit !== PER) {
    log(`${c.name}: perUnit ${c.perUnit ?? "-"} → ${PER}`);
    c.perUnit = PER;
  }
  if (c.piecesPerUnit !== PER) {
    log(`${c.name}: piecesPerUnit ${c.piecesPerUnit ?? "-"} → ${PER}`);
    c.piecesPerUnit = PER;
  }
}
/* 4) ข้อความ */
if (typeof d.terms === "string" && d.terms.includes(OLD_TERMS_HEAD)) {
  d.terms = d.terms.replace(OLD_TERMS_HEAD, NEW_TERMS_HEAD);
  log("terms: ใส่กติกาคละลาย");
} else if (!(d.terms ?? "").includes(MIX_TERMS)) {
  die("terms ไม่ตรงแบบที่คาดและยังไม่มีกติกาคละ — ดูก่อน");
}
const tab0 = (d.tabs ?? [])[0];
if (tab0?.text?.includes(OLD_TAB_LINE)) {
  tab0.text = tab0.text.replace(OLD_TAB_LINE, NEW_TAB_LINE);
  log("tabs[0]: ใส่กติกาคละลาย");
} else if (!(tab0?.text ?? "").includes(MIX_TERMS)) {
  die("tabs[0] ไม่ตรงแบบที่คาดและยังไม่มีกติกาคละ — ดูก่อน");
}
if (!Array.isArray(d.highlights)) d.highlights = [];
if (!d.highlights.includes(HIGHLIGHT)) {
  const i = d.highlights.findIndex((h) => h.startsWith("ขายเป็นเซ็ต"));
  d.highlights.splice(i >= 0 ? i + 1 : d.highlights.length, 0, HIGHLIGHT);
  log("highlights: เพิ่มจุดเด่นกติกาคละ");
}
d.seo ??= {};
d.seo.faqs ??= [];
const fi = d.seo.faqs.findIndex((f) => f.q === FAQ.q);
if (fi < 0) {
  const after = d.seo.faqs.findIndex((f) => f.q.startsWith("สั่งขั้นต่ำ"));
  d.seo.faqs.splice(after >= 0 ? after + 1 : d.seo.faqs.length, 0, { ...FAQ });
  log("faqs: เพิ่มคำถามคละลาย");
} else if (d.seo.faqs[fi].a !== FAQ.a) {
  d.seo.faqs[fi].a = FAQ.a;
  log("faqs: อัปเดตคำตอบคละลาย");
}

if (!changes.length) {
  console.log("= ไม่มีอะไรต้องแก้ (ตรงกติกาแล้ว)");
  process.exit(0);
}
console.log(changes.map((c) => "→ " + c).join("\n"));
if (!WRITE) {
  console.log(`\n(dry-run) ${changes.length} รายการ — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}

d.savedAt = new Date().toISOString();
const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (updErr) die(updErr.message);
if (!upd?.length) die("update โดน 0 แถว");

/* อ่านกลับเทียบค่าจริง */
const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", ID).single();
if (backErr) die(backErr.message);
const b = back.data;
for (const r of b.priceRates)
  for (const [k, v] of Object.entries(RATE_FIELDS)) if (r[k] !== v) die(`อ่านกลับไม่ตรง: เรท ${r.id}.${k} = ${r[k]}`);
for (const k of ["tierByDesign", "mixRule", "hardMaxDesigns"]) if (b[k] != null) die(`อ่านกลับยังมี ${k}`);
const bo = (b.options ?? []).find((o) => o.label === SIZE_OPT);
for (const c of bo?.choices ?? []) if (c.perUnit !== PER || c.piecesPerUnit !== PER) die(`อ่านกลับไม่ตรง: ${c.name} perUnit=${c.perUnit} piecesPerUnit=${c.piecesPerUnit}`);
if (!b.terms?.includes(MIX_TERMS)) die("อ่านกลับ terms ไม่มีกติกาคละ");
if (!b.tabs?.[0]?.text?.includes(MIX_TERMS)) die("อ่านกลับ tabs[0] ไม่มีกติกาคละ");
if (!b.highlights?.includes(HIGHLIGHT)) die("อ่านกลับ highlights ไม่มี");
if (!b.seo?.faqs?.some((f) => f.q === FAQ.q && f.a === FAQ.a)) die("อ่านกลับ faq ไม่มี");
if (b.savedAt !== d.savedAt) die(`savedAt อ่านกลับไม่ตรง (${b.savedAt})`);
if (JSON.stringify(b.pricing) !== JSON.stringify(d.pricing)) die("pricing เปลี่ยน?! ไม่ควรเกิด");
console.log(`\n✓ เขียนแล้ว ${changes.length} รายการ · savedAt ${d.savedAt} · อ่านกลับตรงทุกข้อ`);
