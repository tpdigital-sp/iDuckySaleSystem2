#!/usr/bin/env node
/**
 * อะคริลิคกระจก (new-mt2rqayf-7835) — เพิ่มรูปแบบงาน "เข็มกลัดกระจก" (ผู้ใช้สั่ง 9 ต.ค. 69)
 *
 *   python3 scripts/acrylic-mirror-brooch-art.py   # ทำภาพการ์ดก่อน (ครั้งแรก/แก้ภาพ)
 *   node scripts/acrylic-mirror-brooch.mjs         # ดูก่อน (ไม่เขียน)
 *   node scripts/acrylic-mirror-brooch.mjs --write # อัปภาพ + บันทึกจริง + อ่านกลับ
 *
 * กติการาคา (ผู้ใช้เคาะ): ใช้ตารางเดียวกับพวงกุญแจกระจกทุกเรท (ตัวชิ้นงานราคาเท่ากันทุกรูปแบบอยู่แล้ว)
 *   • ปลีก 1-10 ชิ้น = ราคาตารางล้วน รวมค่าอะไหล่เข็มกลัดแล้ว
 *   • ส่ง 11 ชิ้นขึ้นไป (รวมเรทตัวแทน minQty 11) = ราคาตาราง + ค่าอะไหล่เข็มกลัด
 *   → โคลนกลุ่ม "อะไหล่เข็มกลัด" จากเข็มกลัดอะคริลิค (id "1") ทั้งก้อน (ราคา P1-P7 · ภาพ · stockItemId
 *     ตัดสต๊อกอะไหล่ตัวเดียวกัน) · extraFromQty 11 = ตรรกะเดียวกับตะขอของพวงกุญแจกระจก
 *   → เกตด้วย showWhen รูปแบบงาน = เข็มกลัดกระจก (ไม่โผล่ตอนเลือกพวงกุญแจ/สแตนดี้)
 *
 * รันซ้ำได้ (idempotent) — โคลนกลุ่มอะไหล่ใหม่จากต้นทางทุกครั้ง ข้อความที่แก้แล้วไม่แก้ซ้ำ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const TGT_ID = "new-mt2rqayf-7835"; // อะคริลิคกระจก
const SRC_ID = "1"; // เข็มกลัดอะคริลิค — ต้นแบบกลุ่มอะไหล่
const FORM_GROUP = "รูปแบบงาน";
const FORM_BROOCH = "เข็มกลัดกระจก";
const PART_GROUP = "อะไหล่เข็มกลัด";
const PART_SECTION = "3. อะไหล่เข็มกลัด";
const PART_FROM_QTY = 11;
const KEY = "products/acrylic-mirror/form-brooch-v1.jpg";
const LOCAL_IMG = new URL("./assets/acrylic-mirror/form-brooch.jpg", import.meta.url);

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
const IMG = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${KEY}`;
const die = (m) => {
  console.error(`⛔ ${m}`);
  process.exit(1);
};
const load = async (id) => {
  const { data, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) die(`โหลด ${id} ไม่ได้ — ${error.message}`);
  return data;
};
const tgt = await load(TGT_ID);
const src = await load(SRC_ID);
const p = JSON.parse(JSON.stringify(tgt.data));
const log = [];
const optOf = (data, label) => (data.options ?? []).find((o) => o.label === label);

/* ── 1) การ์ดที่ 3 ในกลุ่ม "รูปแบบงาน" ─────────────────────────────────── */
const form = optOf(p, FORM_GROUP) ?? die(`ไม่พบกลุ่ม ${FORM_GROUP}`);
const card = {
  desc: "ชิ้นงานเนื้อกระจก + ติดอะไหล่เข็มกลัดด้านหลัง เลือกอะไหล่ได้ 7 แบบด้านล่าง (1-10 ชิ้น รวมค่าอะไหล่แล้ว)",
  name: FORM_BROOCH,
  imageSrc: IMG,
};
const at = form.choices.findIndex((c) => c.name === FORM_BROOCH);
if (at >= 0) form.choices[at] = { ...form.choices[at], ...card };
else form.choices.push(card), log.push(`＋ การ์ด "${FORM_BROOCH}" ในกลุ่ม ${FORM_GROUP}`);
form.note =
  "ราคาตัวชิ้นงานเท่ากันทุกแบบ ต่างกันที่ค่าอะไหล่\n" +
  "• **พวงกุญแจ** — คิดค่าตะขอ/ห่วงตามแบบที่เลือก\n" +
  "• **สแตนดี้** — คิดค่าฐานตามขนาด/ทรง/สีฐาน\n" +
  "• **เข็มกลัด** — 1-10 ชิ้นรวมค่าอะไหล่แล้ว · 11 ชิ้นขึ้นไปคิดค่าอะไหล่เพิ่ม";

/* ── 2) กลุ่ม "อะไหล่เข็มกลัด" โคลนจากเข็มกลัดอะคริลิค ─────────────────── */
const srcPart = optOf(src.data, PART_GROUP) ?? die(`ต้นทาง ${SRC_ID} ไม่มีกลุ่ม ${PART_GROUP}`);
if (srcPart.extraFromQty !== PART_FROM_QTY) die(`ต้นทาง extraFromQty = ${srcPart.extraFromQty} ไม่ใช่ ${PART_FROM_QTY} — เช็คกติกาก่อน`);
const part = {
  ...JSON.parse(JSON.stringify(srcPart)),
  section: PART_SECTION,
  showWhen: { label: FORM_GROUP, choices: [FORM_BROOCH] },
  extraFromQty: PART_FROM_QTY,
};
const old = p.options.findIndex((o) => o.label === PART_GROUP);
if (old >= 0) p.options.splice(old, 1);
// วางต่อจากกลุ่มตะขอ/สีตะขอชุดสุดท้าย (ก่อนกลุ่มฐานสแตนดี้)
const baseAt = p.options.findIndex((o) => o.label === "ฐานสแตนดี้");
p.options.splice(baseAt >= 0 ? baseAt : p.options.length, 0, part);
log.push(`${old >= 0 ? "↻" : "＋"} กลุ่ม "${PART_GROUP}" ${part.choices.length} ตัว: ${part.choices.map((c) => `${c.name} +${c.extra}`).join(" · ")}`);

/* ── 3) ข้อความหน้าสินค้า / SEO ────────────────────────────────────────── */
const swap = (obj, key, from, to) => {
  if (typeof obj?.[key] !== "string" || obj[key].includes("เข็มกลัด")) return;
  if (!obj[key].includes(from)) return log.push(`⚠️ ไม่เจอข้อความเดิมใน ${key} — ข้าม`);
  obj[key] = obj[key].replace(from, to);
  log.push(`✎ ${key}`);
};
swap(p, "description", "ทำได้ทั้งพวงกุญแจและสแตนดี้กระจก", "ทำได้ทั้งพวงกุญแจ สแตนดี้ และเข็มกลัดกระจก");
if (p.seo) {
  swap(p.seo, "title", "พวงกุญแจ / สแตนดี้", "พวงกุญแจ / สแตนดี้ / เข็มกลัด");
  swap(p.seo, "description", "ทำได้ทั้งพวงกุญแจและสแตนดี้", "ทำได้ทั้งพวงกุญแจ สแตนดี้ และเข็มกลัด");
  if (Array.isArray(p.seo.keywords) && !p.seo.keywords.includes("เข็มกลัดกระจก")) {
    p.seo.keywords.splice(4, 0, "เข็มกลัดกระจก", "รับทำเข็มกลัดอะคริลิค");
    log.push("✎ seo.keywords");
  }
  const faq = (p.seo.faqs ?? []).find((f) => f.q === "อะคริลิคกระจกทำเป็นอะไรได้บ้าง?");
  if (faq && !faq.a.includes("เข็มกลัด")) {
    faq.a =
      "หน้านี้ทำได้ 3 แบบ — พวงกุญแจกระจก (เลือกตะขอ/ห่วงกว่า 30 แบบ) · สแตนดี้กระจก (เลือกฐานอะคริลิคตามขนาด/ทรง/สี) · " +
      "เข็มกลัดกระจก (เลือกอะไหล่เข็มกลัด 7 แบบ — 1-10 ชิ้นรวมค่าอะไหล่แล้ว 11 ชิ้นขึ้นไปคิดเพิ่ม ชิ้นละ 3-10 บาท) " +
      "ราคาตัวชิ้นงานเท่ากันทุกแบบ ต่างกันที่ค่าอะไหล่";
    log.push("✎ seo.faqs[ทำเป็นอะไรได้บ้าง]");
  }
}
const info = (p.tabs ?? [])[0];
const BROOCH_LINE =
  "• เข็มกลัด: ติดอะไหล่เข็มกลัดด้านหลังให้ (P1/P2/P3/P4/P7) — 1-10 ชิ้นรวมค่าอะไหล่ในราคาแล้ว · 11 ชิ้นขึ้นไป ราคาตาราง + ค่าอะไหล่ชิ้นละ 3-10 บาทตามแบบ";
if (info && typeof info.text === "string" && !info.text.includes("• เข็มกลัด:")) {
  const lines = info.text.split("\n");
  const i = lines.findIndex((l) => l.startsWith("• สแตนดี้:"));
  lines.splice(i >= 0 ? i + 1 : lines.length, 0, BROOCH_LINE);
  info.text = lines.join("\n");
  log.push(`✎ แท็บ "${info.title ?? info.label}" + บรรทัดเข็มกลัด`);
}

/* ── ตรวจก่อนเขียน ─────────────────────────────────────────────────────── */
const f2 = optOf(p, FORM_GROUP);
if (f2.choices.map((c) => c.name).join("|") !== "พวงกุญแจกระจก|สแตนดี้กระจก|เข็มกลัดกระจก") die("ลำดับการ์ดรูปแบบงานไม่ตรง");
if (JSON.stringify(p.pricing) !== JSON.stringify(tgt.data.pricing)) die("ตารางราคาถูกแตะ — ห้าม");
if (JSON.stringify(p.priceRates) !== JSON.stringify(tgt.data.priceRates)) die("เรทราคาถูกแตะ — ห้าม");
for (const g of p.options) {
  if (g.showWhen?.label === FORM_GROUP && g.label !== PART_GROUP && g.showWhen.choices.includes(FORM_BROOCH)) die(`กลุ่ม ${g.label} ดันโผล่ตอนเลือกเข็มกลัด`);
}
console.log(`📦 ${tgt.name} (${TGT_ID}) — กลุ่มทั้งหมด ${p.options.length}`);
for (const l of log) console.log("  ", l);
if (process.argv.includes("--json")) (await import("node:fs")).writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(p));
if (!WRITE) {
  console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const upImg = await sb.storage.from("product-images").upload(KEY, readFileSync(LOCAL_IMG), { contentType: "image/jpeg", upsert: true });
if (upImg.error) die(`อัปภาพไม่ได้ — ${upImg.error.message}`);
p.savedAt = new Date().toISOString();
const up = await sb.from("products").update({ data: p }).eq("id", TGT_ID).select("data");
if (up.error) die(`บันทึกไม่ได้ — ${up.error.message}`);
const back = (await load(TGT_ID)).data;
if (back.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
if (!optOf(back, PART_GROUP)) die("อ่านกลับไม่เจอกลุ่มอะไหล่");
console.log(`\n✅ บันทึกแล้ว · ภาพ ${IMG}`);
