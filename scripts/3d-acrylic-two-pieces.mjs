#!/usr/bin/env node
/**
 * 3D Acrylic — เขียนกำกับให้ชัดว่า "1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้)"
 *
 *   node scripts/3d-acrylic-two-pieces.mjs           # ดูว่าจะแก้อะไรบ้าง (ไม่เขียนจริง)
 *   node scripts/3d-acrylic-two-pieces.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ตามตารางราคาหน้า 3D Acrylic: ราคาเริ่มต้น = อะคริลิค 2 ชิ้น สกรีน 1 ด้าน/ชิ้น
 * คิดราคาจากชิ้นที่ใหญ่ที่สุด — หน้าเว็บมีดรอปดาวน์ "ขนาด" ช่องเดียว จึงต้องบอกลูกค้าว่า
 * ให้เลือกตามชิ้นใหญ่สุด แล้วเขียนขนาดชิ้นที่เหลือในหมายเหตุถึงร้าน
 * แตะเฉพาะข้อความ ไม่แตะตารางราคา/ตัวเลือกที่มีผลกับเงิน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "3d-acrylic";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const NOTE =
  "1 ชุด = อะคริลิค 2 ชิ้น (สกรีน 1 ด้าน/ชิ้น) เลือกขนาดได้ 2-6cm คนละขนาดก็ได้ — " +
  "เลือกตรงนี้ตามชิ้นที่ใหญ่ที่สุด แล้วบอกขนาดอีกชิ้นในช่อง “หมายเหตุถึงร้าน”";

const changes = [];
const set = (what, before, after) => {
  if (before === after) return false;
  changes.push({ what, before, after });
  return true;
};

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;

// ── ข้อความกำกับใต้กลุ่ม "ขนาด" บนแผงสั่งซื้อ (จุดที่ลูกค้ามองตอนกำลังเลือก) ──
const sizeOpt = (p.options ?? []).find((o) => o.label === "ขนาด");
if (!sizeOpt) throw new Error("ไม่พบกลุ่มตัวเลือก 'ขนาด' — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์");
if (set("options[ขนาด].note", sizeOpt.note ?? "(ว่าง)", NOTE)) sizeOpt.note = NOTE;

// ── คำอธิบาย / ไฮไลต์ / เงื่อนไข ──
const desc =
  "1 ชุดได้อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้) สกรีน 1 ด้าน/ชิ้น คิดราคาจากชิ้นที่ใหญ่ที่สุด — " +
  "อะคริลิคหนา 3mm พิมพ์ระบบ UV Printing ไดคัทตามแบบ นำมาประกบกันให้เห็นมิติแบบ 3D " +
  "เลือกงานสกรีนและชนิดอะคริลิคได้ ทำเป็นพวงกุญแจ Griptok สแตนดี้ หรืออย่างอื่นก็ได้";
if (set("description", p.description, desc)) p.description = desc;

const hl0 = "1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้)";
const hl1 = "อะคริลิคหนา 3mm ไดคัทตามแบบ ประกบให้เห็นมิติ 3D";
if (p.highlights?.length >= 2) {
  if (set("highlights[0]", p.highlights[0], hl0)) p.highlights[0] = hl0;
  if (set("highlights[1]", p.highlights[1], hl1)) p.highlights[1] = hl1;
}

const termsOld = "1 ชุด = อะคริลิค 2 ชิ้น (เลือกขนาดได้) — ทางร้านคิดราคาจากชิ้นที่ใหญ่ที่สุด";
const termsNew = "1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้) — ทางร้านคิดราคาจากชิ้นที่ใหญ่ที่สุด";
if (typeof p.terms === "string" && p.terms.includes(termsOld)) {
  const t = p.terms.replace(termsOld, termsNew);
  if (set("terms (บรรทัดแรก)", termsOld, termsNew)) p.terms = t;
}

// ── ป้ายใต้รูปแรก ──
if (p.images?.[0]) {
  const lb = "3D Acrylic — 1 ชุด = อะคริลิค 2 ชิ้น";
  if (set("images[0].label", p.images[0].label, lb)) p.images[0].label = lb;
}

// ── แท็บรายละเอียด / วิธีสั่งงาน ──
const tabEdit = (title, from, to) => {
  const tab = (p.tabs ?? []).find((t) => t.title === title);
  if (!tab?.text?.includes(from)) return;
  if (set(`tabs[${title}]`, from, to)) tab.text = tab.text.replace(from, to);
};
tabEdit(
  "รายละเอียดเพิ่มเติม",
  "• งานอะคริลิค 2 ชิ้นซ้อนประกบกันให้เห็นมิติ (3D) — อะคริลิคหนา 3mm พิมพ์ระบบ UV Printing ไดคัทตามแบบ",
  "• 1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้) นำมาประกบกันให้เห็นมิติ (3D) — อะคริลิคหนา 3mm พิมพ์ระบบ UV Printing ไดคัทตามแบบ"
);
tabEdit(
  "วิธีสั่งงาน",
  "• เลือกขนาด → งานสกรีน → ชนิดอะคริลิค → ใส่จำนวน (นับเป็นชุด ชุดละ 2 ชิ้น)",
  "• เลือกขนาด (ยึดชิ้นที่ใหญ่ที่สุด) → งานสกรีน → ชนิดอะคริลิค → ใส่จำนวน (นับเป็นชุด ชุดละ 2 ชิ้น) — ชิ้นที่เล็กกว่าเขียนขนาดบอกในช่อง “หมายเหตุถึงร้าน”"
);

// ── SEO ──
if (p.seo) {
  const title = "รับทำ 3D Acrylic 1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm";
  if (set("seo.title", p.seo.title, title)) p.seo.title = title;

  const sdesc =
    "รับทำ/รับผลิต 3D Acrylic — 1 ชุดได้อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm (คนละขนาดก็ได้) สกรีน 1 ด้าน/ชิ้น " +
    "หนา 3mm ไดคัทตามแบบ พิมพ์ระบบ UV เริ่มต้นชุดละ 70 บาท · เลือกสกรีน 1-4 เลเยอร์ · ทำเป็นพวงกุญแจ Griptok สแตนดี้ได้";
  if (set("seo.description", p.seo.description, sdesc)) p.seo.description = sdesc;

  const faq = (p.seo.faqs ?? []).find((f) => f.q === "1 ชุด ได้กี่ชิ้น?");
  if (faq) {
    const a =
      "1 ชุด = อะคริลิค 2 ชิ้น เลือกขนาดได้ 2-6cm จะคนละขนาดก็ได้ นำมาประกบกันเป็นงาน 3D ชิ้นเดียว — " +
      "ทางร้านคิดราคาจากชิ้นที่ใหญ่ที่สุด";
    if (set("seo.faqs[1 ชุด ได้กี่ชิ้น?]", faq.a, a)) faq.a = a;
  }
  const qNew = "อะคริลิค 2 ชิ้นเลือกคนละขนาดได้ไหม?";
  if (p.seo.faqs && !p.seo.faqs.some((f) => f.q === qNew)) {
    const a =
      "ได้ครับ 1 ชุดเลือกขนาดได้ตั้งแต่ 2-6cm ทั้ง 2 ชิ้นไม่ต้องเท่ากัน — " +
      "เลือกขนาดบนหน้าเว็บตามชิ้นที่ใหญ่ที่สุด แล้วบอกขนาดชิ้นที่เหลือในช่อง “หมายเหตุถึงร้าน”";
    changes.push({ what: "seo.faqs (เพิ่มข้อใหม่)", before: "(ไม่มี)", after: `${qNew} / ${a}` });
    p.seo.faqs.splice(2, 0, { q: qNew, a });
  }
}

for (const c of changes) {
  console.log(`\n■ ${c.what}\n  เดิม: ${String(c.before).replace(/\n/g, " ⏎ ")}\n  ใหม่: ${String(c.after).replace(/\n/g, " ⏎ ")}`);
}
console.log(`\nรวม ${changes.length} จุด`);

if (!changes.length) process.exit(0);
if (!WRITE) {
  console.log("(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  process.exit(0);
}

// อัปเดต savedAt ด้วย — แท็บหน้าแก้ไขสินค้าที่เปิดค้างไว้จะถูกบล็อกไม่ให้บันทึกทับ (ต้อง F5 ก่อน)
p.savedAt = new Date().toISOString();
const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", ID);
if (upErr) throw upErr;
console.log("บันทึกแล้ว ✓");
