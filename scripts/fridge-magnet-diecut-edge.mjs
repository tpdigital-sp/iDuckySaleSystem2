#!/usr/bin/env node
/**
 * แม่เหล็กติดตู้เย็น (acrylicmagnet-3): เพิ่มกลุ่มตัวเลือก "ขอบไดคัท" — เจ้าของร้านสั่ง 8 ต.ค. 69
 *   "เพิ่มข้อมูลตัวเลือก กัดเข้าเนื้อ กับ มีขอบขาว"
 *
 *   • ไดคัทมีขอบขาว   (มาตรฐาน · ตัวเลือกแรก = ค่าเริ่มต้น)  ภาพกลาง shared/diecut-edge-border.jpg
 *   • ไดคัทกัดเข้าเนื้อ (ตัดชิดลาย · เผื่อตัดตก 2-3 มม.)        ภาพกลาง shared/diecut-edge-into.jpg
 *   ภาพ+คำอธิบายชุดเดียวกับกลุ่ม "ขอบไดคัท" ของสติ๊กเกอร์ (sticker-pp/sticker-solvent) ปรับคำให้เข้ากับ PET+Magnet
 *   ที่มาเกร็ด "ระยะตัดตก 2-3mm · การตัดอาจมีขอบขาวบ้างตามข้อจำกัดเครื่องตัด" = หน้า pricelists /acrylicmagnet
 *
 *   ไม่ใช่แกนราคา (ราคาต่อแผ่น A3 เท่าเดิมทั้ง 2 แบบ) · วางเป็นกลุ่มแรก section "1. ขอบไดคัท"
 *   กลุ่มขนาดชิ้นงาน 3 กลุ่มเลื่อนเป็น "2. ขนาดชิ้นงาน" (section เป็นแค่หัวกรอบ ไม่ใช่เป้า showWhen)
 *   + บรรทัด terms + FAQ ใน seo.faqs
 *
 *   node scripts/fridge-magnet-diecut-edge.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/fridge-magnet-diecut-edge.mjs --write
 *   รันซ้ำได้ — ถ้ามีกลุ่มอยู่แล้วจะอัปเดตเนื้อหาทับ (ชื่อตัวเลือกคงเดิม กันตะกร้า/ออเดอร์เก่าเพี้ยน)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const ID = "acrylicmagnet-3";
const SHARED = `${pick("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/public/product-images/products/shared`;

const GROUP = "ขอบไดคัท";
const SECTION_NEW = "1. ขอบไดคัท";
const SECTION_SIZE_OLD = "1. ขนาดชิ้นงาน";
const SECTION_SIZE_NEW = "2. ขนาดชิ้นงาน";
const BORDER = "ไดคัทมีขอบขาว";
const INTO = "ไดคัทกัดเข้าเนื้อ";

const option = {
  label: GROUP,
  section: SECTION_NEW,
  display: "cards",
  note: "เลือกได้ทั้ง 2 แบบ **ราคาเท่ากัน**\n• ขอบขาว = เผื่อเนื้อขาวรอบลาย 2-3 มม. ลายไม่โดนตัดกิน\n• กัดเข้าเนื้อ = ตัดชิดลาย ต้องเผื่อตัดตก (bleed) 2-3 มม. ในไฟล์\n• เครื่องตัดคลาดเคลื่อนได้ ±0.5-2 มม. ตามข้อจำกัดของเครื่อง",
  choices: [
    {
      name: BORDER,
      desc: "ตัดเว้นขอบขาวรอบลายไว้เล็กน้อย 2-3 มม. ลายไม่โดนตัดกิน ขอบชิ้นเรียบสวย — แบบมาตรฐานที่สั่งกันบ่อยสุด",
      imageSrc: `${SHARED}/diecut-edge-border.jpg`,
    },
    {
      name: INTO,
      desc: "ตัดชิดขอบลายพอดี ไม่เหลือขอบขาว ได้รูปทรงตามลายเป๊ะ · ไฟล์ต้องเผื่อตัดตก 2-3 มม. รอบลาย",
      imageSrc: `${SHARED}/diecut-edge-into.jpg`,
      selectedNote:
        "**กรณีกัดเข้าเนื้อ** ขอบงานอาจเห็นเส้นขาวของเนื้อ PET บาง ๆ บางจุด เพราะเครื่องตัดคลาดเคลื่อนได้ ±0.5-2 มม. · กรุณาเผื่อตัดตก 2-3 มม. ในไฟล์ หากไม่เผื่อทางร้านจะยืดขอบลายให้",
    },
  ],
};

const TERMS_ANCHOR = "*เริ่มต้นที่ขนาด 3×3 cm — ระบุขนาดที่ต้องการตอนสั่ง";
const TERMS_LINE =
  "*ขอบไดคัท เลือกได้ 2 แบบ ราคาเท่ากัน: มีขอบขาว (เผื่อเนื้อขาวรอบลาย 2-3 มม.) หรือกัดเข้าเนื้อ (ตัดชิดลาย ต้องเผื่อตัดตก 2-3 มม.) — การตัดอาจมีขอบขาวบ้าง ±0.5-2 มม. ตามข้อจำกัดของเครื่องตัด";

const FAQ_Q = "ไดคัทมีขอบขาว กับ กัดเข้าเนื้อ ต่างกันยังไง?";
const FAQ_A =
  "มีขอบขาว = ตัดเว้นเนื้อขาวรอบลายไว้ 2-3 มม. ลายไม่โดนตัดกิน เป็นแบบมาตรฐาน · กัดเข้าเนื้อ = ตัดชิดขอบลายพอดี ไม่เหลือขอบขาว ได้ทรงตามลายเป๊ะ แต่ไฟล์ต้องเผื่อตัดตก (bleed) 2-3 มม. และขอบอาจเห็นเส้นขาวของเนื้อวัสดุบาง ๆ บางจุดจากความคลาดเคลื่อนของเครื่องตัด ±0.5-2 มม. — ทั้ง 2 แบบราคาเท่ากัน เลือกได้ที่หัวข้อ \"ขอบไดคัท\" ตอนสั่ง";

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.data?.name !== "แม่เหล็กติดตู้เย็น") die(`ชื่อไม่ตรงที่คาด (${row.data?.name})`);
const d = row.data;
d.options ??= [];

// กันชื่อซ้ำกับแกนราคา/กลุ่มอื่น
const dup = d.options.filter((o) => o.label === GROUP);
if (dup.length > 1) die(`เจอกลุ่ม "${GROUP}" ${dup.length} กลุ่ม — เช็คโครงสร้างก่อน`);
for (const r of d.priceRates ?? []) if (r.pricing?.driverLabels?.includes?.(GROUP)) die(`"${GROUP}" เป็นแกนราคาของเรท ${r.label} — ห้ามแตะ`);

// 1) กลุ่มขอบไดคัท — เพิ่มเป็นกลุ่มแรก หรืออัปเดตเนื้อหาทับ (คงชื่อตัวเลือกเดิม)
let action;
if (dup.length === 1) {
  const cur = dup[0];
  const names = (cur.choices ?? []).map((c) => c.name);
  if (names.join("|") !== [BORDER, INTO].join("|")) die(`ชื่อตัวเลือกในกลุ่มเดิมไม่ตรง (${names.join(" / ")}) — ไม่เปลี่ยนชื่อให้เอง`);
  Object.assign(cur, option);
  action = "อัปเดตกลุ่มเดิม";
} else {
  d.options.unshift(option);
  action = "เพิ่มกลุ่มใหม่ (ตำแหน่งแรก)";
}

// 2) เลื่อนเลข section ของกลุ่มขนาดชิ้นงาน
let renum = 0;
for (const o of d.options) if (o.section === SECTION_SIZE_OLD) (o.section = SECTION_SIZE_NEW), renum++;

// 3) terms
if (!d.terms?.includes(TERMS_LINE)) {
  if (d.terms?.includes(TERMS_ANCHOR)) d.terms = d.terms.replace(TERMS_ANCHOR, TERMS_ANCHOR + "\n" + TERMS_LINE);
  else die(`ไม่พบ anchor ใน terms — โครงสร้างเปลี่ยน เช็คก่อน`);
}

// 4) FAQ
d.seo ??= {};
d.seo.faqs ??= [];
const faq = d.seo.faqs.find((f) => f.q === FAQ_Q);
if (faq) faq.a = FAQ_A;
else d.seo.faqs.push({ q: FAQ_Q, a: FAQ_A });

d.savedAt = new Date().toISOString();

console.log(`${ID}: ${action} "${GROUP}" → ${option.choices.map((c) => c.name).join(" / ")}`);
console.log(`section ขนาดชิ้นงาน เลื่อนเลข ${renum} กลุ่ม`);
console.log(`ลำดับกลุ่ม: ${d.options.map((o) => `${o.label} [${o.section}]`).join(" → ")}`);
console.log(`terms:\n${d.terms.split("\n").filter((l) => l.includes("ขอบไดคัท")).join("\n")}`);
console.log(`FAQ (${d.seo.faqs.length} ข้อ): "${FAQ_Q}"`);

if (WRITE) {
  const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
  if (e2) die(e2.message);
  // อ่านกลับเทียบ
  const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
  const g = back.data.options.find((o) => o.label === GROUP);
  if (!g || g.choices.length !== 2) die("อ่านกลับแล้วไม่เจอกลุ่ม — เช็คด่วน");
  console.log("✓ เขียนแล้ว · อ่านกลับ OK");
} else {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
}
process.exit(0);
