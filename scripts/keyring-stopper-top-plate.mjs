#!/usr/bin/env node
/**
 * "พวงกุญแจ + อะไหล่จุกสีใส" — งานนี้เป็นอะคริลิค 2 ชิ้นประกบกันด้วยจุกสีใส
 * สคริปต์นี้เพิ่ม "ขนาดแผ่นบน" เป็นแกนที่ 3 ของตารางราคา แล้วคิดราคาแผ่นบนเข้าไปในทุกช่อง
 *
 *   node scripts/keyring-stopper-top-plate.mjs           # ดูก่อน (ไม่เขียน · โชว์ราคาตัวอย่าง)
 *   node scripts/keyring-stopper-top-plate.mjs --write    # บันทึกจริง
 *
 * โครงราคาที่ร้านกำหนด (20 ส.ค. 69):
 *   • แผ่นล่าง = ชิ้นหลัก คิดตามตารางพวงกุญแจเดิมทุกอย่าง (ราคาแผ่น + ค่าสกรีน + จุกสีใส 10 บาท)
 *   • แผ่นบน   = คิดเหมือน "ติ่งห้อย" เริ่มที่ 2 ซม.
 *       เรทปลีก (1-10 ชิ้น)  20 บาท   ·   11-29 ชิ้น 15 บาท   ·   30 ชิ้นขึ้นไป 12 บาท
 *       3 ซม. ขึ้นไป บวกเพิ่มเซนละ 10 บาท  (3 ซม. = 30/25/22 · 4 ซม. = 40/35/32 … 10 ซม. = 100/95/92)
 *   • ค่าสกรีนคิดกับแผ่นบนด้วย ตามขนาดของแผ่นบนเอง (ใช้ส่วนต่างค่าสกรีนชุดเดียวกับแผ่นล่าง)
 *   • แผ่นบนเป็น "อะคริลิคใส" อย่างเดียว ไม่มีสีให้เลือก จึงไม่มีค่าสีพิเศษของแผ่นบน
 *   • ทุกออเดอร์ต้องมีแผ่นบนเสมอ (เลือก "ไม่มี" ไม่ได้ — งานนี้เป็น 2 ชิ้นตายตัว)
 *
 * วิธีทำ: ตารางราคาของสินค้านี้เป็น "เมทริกซ์หลายแกน" อยู่แล้ว (ขนาด × งานสกรีน)
 * เลยเติมแกนที่ 3 เข้าไป — 9 × 5 × 9 = 405 ช่อง × 6 ช่วงจำนวน ระบบคิดเงินรองรับ N แกนอยู่แล้ว
 * (ทางเลือกอื่นคือทำเป็น "ตัวเลือกบวกเพิ่ม" แต่ +฿ ต่อตัวเลือกเก็บได้แค่ 2 ช่วงราคา
 *  ขณะที่แผ่นบนต้องมี 3 ช่วง แถมค่าสกรีนยังผูกกับขนาดแผ่นบนอีก จึงต้องใช้ตารางเท่านั้น)
 *
 * ⚠️ ตัวนี้แก้ทั้ง pricing และ priceRates[].pricing (หน้าร้านอ่านจาก priceRates ก่อนเสมอ — ดู activeMatrix)
 * ⚠️ รันซ้ำไม่ได้ ถ้าย้ายไปเป็น 3 แกนแล้วจะหยุดให้เอง (คำนวณย้อนกลับไม่ได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-clear-stopper";

const BOTTOM_OLD = "ขนาดชิ้นงาน";
const BOTTOM = "ขนาดแผ่นล่าง";
const TOP = "ขนาดแผ่นบน (อะคริลิคใส)";
const SCREEN = "งานสกรีน";
const COLOR_OLD = "สีอะคริลิค";
const COLOR = "สีอะคริลิค (แผ่นล่าง)";
const BASE_SCREEN = "สกรีน 1 ด้าน (ใต้)"; // แถวที่ไม่มีค่าสกรีนเพิ่ม ใช้เป็นฐานวัดส่วนต่าง

const SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const sizeName = (cm) => `${cm} ซม.`;

/** ราคาแผ่นบนต่อชิ้น ตามขนาด × ช่วงจำนวน (index ของ tiers: 0 = 1-10 · 1 = 11-29 · 2+ = 30 ขึ้นไป) */
const topPlatePrice = (cm, tierIdx) => (tierIdx === 0 ? 20 : tierIdx === 1 ? 15 : 12) + (cm - 2) * 10;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);

if ((d.pricing?.driverLabels ?? []).includes(TOP)) {
  console.log("ย้ายไปเป็นตาราง 3 แกนเรียบร้อยแล้ว — ไม่ต้องรันซ้ำ");
  process.exit(0);
}

/* ── 1. ตารางราคา: เติมแกน "ขนาดแผ่นบน" ───────────────────────── */
const rebuild = (m, tag) => {
  if (!m?.cells) return null;
  if (JSON.stringify(m.driverLabels) !== JSON.stringify([BOTTOM_OLD, SCREEN]))
    throw new Error(`${tag}: แกนตารางไม่ใช่ [${BOTTOM_OLD}, ${SCREEN}] แล้ว (${JSON.stringify(m.driverLabels)}) — ตรวจก่อน`);

  /** ส่วนต่างค่าสกรีนของแต่ละขนาด เทียบกับ "สกรีน 1 ด้าน (ใต้)" — เอาไปคิดกับแผ่นบนตามขนาดแผ่นบน */
  const screenFee = (cm, screen) => {
    const base = m.cells[`${sizeName(cm)}│${BASE_SCREEN}`];
    const row = m.cells[`${sizeName(cm)}│${screen}`];
    if (!base || !row) throw new Error(`${tag}: ไม่มีช่อง ${sizeName(cm)}│${screen} หรือแถวฐาน — ตารางไม่ครบ`);
    return row[0] - base[0];
  };

  const screens = [...new Set(Object.keys(m.cells).map((k) => k.split("│")[1]))];
  const cells = {};
  for (const [key, prices] of Object.entries(m.cells)) {
    const [bottom, screen] = key.split("│");
    for (const top of SIZES) {
      cells[`${bottom}│${screen}│${sizeName(top)}`] = prices.map(
        (p, i) => p + topPlatePrice(top, i) + screenFee(top, screen)
      );
    }
  }
  m.driverLabels = [BOTTOM, SCREEN, TOP];
  m.cells = cells;
  return { tag, screens: screens.length, cells: Object.keys(cells).length };
};

const built = [rebuild(d.pricing, "pricing")];
for (const [i, r] of (d.priceRates ?? []).entries()) built.push(rebuild(r.pricing, `priceRates[${i}] ${r.label}`));

/* ── 2. ตัวเลือก: เปลี่ยนชื่อกลุ่มเดิม + เพิ่มกลุ่มขนาดแผ่นบน ───── */
for (const o of d.options ?? []) {
  if (o.label === BOTTOM_OLD) o.label = BOTTOM;
  if (o.label === COLOR_OLD) o.label = COLOR;
  for (const w of [o.showWhen, o.showWhenAlso]) {
    if (w?.label === BOTTOM_OLD) w.label = BOTTOM;
    if (w?.label === COLOR_OLD) w.label = COLOR;
  }
}

const topGroup = {
  label: TOP,
  display: "dropdown",
  choices: SIZES.map((cm) => ({ name: sizeName(cm) })),
};
const at = (d.options ?? []).findIndex((o) => o.label === BOTTOM);
if (at < 0) throw new Error(`ไม่เจอกลุ่ม "${BOTTOM}" — ตรวจก่อน`);
d.options.splice(at + 1, 0, topGroup);

/* ── 3. ราคาเริ่มต้นของสินค้า (การ์ดหน้ารายการ / SEO) ───────────── */
const all = Object.values((d.priceRates?.[0] ?? d).pricing.cells).flat();
const min = Math.min(...all);
const max = Math.max(...all);
const oldPrice = d.price;
d.price = min;

if (d.seo?.title) d.seo.title = d.seo.title.replace(`${oldPrice} บาท`, `${min} บาท`);

/* ── 4. ข้อความอธิบาย — ให้ลูกค้ารู้ว่างานนี้เป็น 2 ชิ้น ─────────── */
const cell = (b, s, t, i) => (d.priceRates?.[0] ?? d).pricing.cells[`${sizeName(b)}│${s}│${sizeName(t)}`][i];

d.description =
  "พวงกุญแจอะคริลิค 2 ชิ้นประกบกันด้วยอะไหล่จุกสีใส (แผ่นล่าง + แผ่นบนหมุน/ขยับได้) " +
  "พิมพ์ลายตามสั่ง อะคริลิคหนา 3 มม. พิมพ์ระบบ UV ไดคัทตามลาย " +
  "แผ่นล่างทำขนาด 2-10 ซม. เลือกสี/กลิตเตอร์/โฮโลแกรมได้ · แผ่นบนเป็นอะคริลิคใส 2-10 ซม. " +
  `เลือกงานสกรีน 1-2 ด้าน หรือ 3 เลเยอร์ เลือกตะขอ/ห่วงได้กว่า 30 แบบ ราคาเริ่ม ${min} บาท/ชิ้น (รวมทั้ง 2 แผ่นและจุกสีใสแล้ว)`;

const TOP_TAB = "แผ่นบน (ชิ้นที่ 2)";
d.tabs = (d.tabs ?? []).filter((t) => t.title !== TOP_TAB);
const tabAt = d.tabs.findIndex((t) => t.title === "อะไหล่จุกสีใส");
d.tabs.splice(tabAt < 0 ? d.tabs.length : tabAt + 1, 0, {
  title: TOP_TAB,
  text:
    "งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ::\n" +
    "• แผ่นล่าง = ชิ้นหลัก เลือกขนาด สี และงานสกรีนได้ตามปกติ\n" +
    "• แผ่นบน = ชิ้นที่ประกบทับด้วยจุกสีใส หมุน/ขยับได้ — เป็นอะคริลิคใสอย่างเดียว เลือกสีไม่ได้\n" +
    "• เลือกขนาดแผ่นบนแยกจากแผ่นล่างได้ ตั้งแต่ 2 ถึง 10 ซม.\n\n" +
    "ราคาแผ่นบน (รวมอยู่ในราคาที่แสดงแล้ว ไม่ต้องบวกเอง)::\n" +
    "• ขนาด 2 ซม. — 1-10 ชิ้น 20 บาท · 11-29 ชิ้น 15 บาท · 30 ชิ้นขึ้นไป 12 บาท ต่อชิ้น\n" +
    "• ขนาด 3 ซม. ขึ้นไป บวกเพิ่มเซนติเมตรละ 10 บาท (3 ซม. = 30/25/22 · 5 ซม. = 50/45/42 · 10 ซม. = 100/95/92)\n" +
    "• เลือกสกรีน 2 ด้าน หรือ 3 เลเยอร์ ค่าสกรีนคิดกับแผ่นบนด้วย ตามขนาดของแผ่นบนเอง\n\n" +
    "ตัวอย่างราคาต่อชิ้น (สกรีน 1 ด้าน · รวมทั้งชุดแล้ว)::\n" +
    `• แผ่นล่าง 5 ซม. + แผ่นบน 2 ซม. — สั่ง 1-10 ชิ้น ${cell(5, BASE_SCREEN, 2, 0)} บาท · 11-29 ชิ้น ${cell(5, BASE_SCREEN, 2, 1)} บาท · 50-199 ชิ้น ${cell(5, BASE_SCREEN, 2, 3)} บาท\n` +
    `• แผ่นล่าง 5 ซม. + แผ่นบน 3 ซม. — สั่ง 1-10 ชิ้น ${cell(5, BASE_SCREEN, 3, 0)} บาท · 11-29 ชิ้น ${cell(5, BASE_SCREEN, 3, 1)} บาท · 50-199 ชิ้น ${cell(5, BASE_SCREEN, 3, 3)} บาท\n` +
    `• แผ่นล่าง 10 ซม. + แผ่นบน 5 ซม. — สั่ง 1-10 ชิ้น ${cell(10, BASE_SCREEN, 5, 0)} บาท · 11-29 ชิ้น ${cell(10, BASE_SCREEN, 5, 1)} บาท · 50-199 ชิ้น ${cell(10, BASE_SCREEN, 5, 3)} บาท`,
  imageSize: "md",
});

// แท็บ "รายละเอียดเพิ่มเติม" — เติมบรรทัดบอกว่าเป็น 2 ชิ้น ต่อจากบรรทัดแรก
const main = d.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (main && !main.text.includes("แผ่นบน")) {
  const lines = main.text.split("\n");
  const i = lines.findIndex((l) => l.startsWith("•"));
  lines.splice(
    i < 0 ? lines.length : i,
    0,
    "• งานนี้เป็นอะคริลิค 2 ชิ้นเสมอ — แผ่นล่าง (ชิ้นหลัก) + แผ่นบนอะคริลิคใส ประกบด้วยจุกสีใสให้หมุน/ขยับได้",
    "• เลือกขนาดแผ่นบนแยกได้ 2-10 ซม. — ราคาแผ่นบนรวมอยู่ในราคาที่แสดงแล้ว (ดูแท็บ “แผ่นบน (ชิ้นที่ 2)”)"
  );
  main.text = lines.join("\n");
}

// FAQ ข้อราคา — ตัวเลขเดิมคิดจากแผ่นเดียว ต้องเขียนใหม่ให้ตรงกับตารางใหม่
const faq = (d.seo?.faqs ?? []).find((f) => f.q.includes("ราคาเท่าไหร่"));
if (faq)
  faq.a =
    `ราคารวมทั้ง 2 แผ่นและจุกสีใสแล้ว เริ่มต้นชิ้นละ ${min} บาท (แผ่นล่าง 2 ซม. + แผ่นบน 2 ซม. สกรีน 1 ด้าน ที่ 500 ชิ้นขึ้นไป) · ` +
    `สั่ง 1-10 ชิ้น แผ่นล่าง 5 ซม. + แผ่นบน 2 ซม. อยู่ที่ ${cell(5, BASE_SCREEN, 2, 0)} บาท/ชิ้น · ` +
    `แผ่นล่าง 10 ซม. + แผ่นบน 5 ซม. ${cell(10, BASE_SCREEN, 5, 0)} บาท/ชิ้น — ยิ่งสั่งเยอะยิ่งถูกตามตารางราคา`;

const faqTop = { q: "แผ่นบนคืออะไร คิดราคายังไง?", a: "" };
faqTop.a =
  "งานนี้เป็นอะคริลิค 2 ชิ้นประกบกันด้วยจุกสีใส แผ่นบนจึงเป็นส่วนหนึ่งของงานเสมอ (เลือกไม่เอาไม่ได้) " +
  "เป็นอะคริลิคใสอย่างเดียว เลือกขนาดแยกจากแผ่นล่างได้ 2-10 ซม. · ราคาแผ่นบนขนาด 2 ซม. อยู่ที่ 20 บาท (1-10 ชิ้น) " +
  "15 บาท (11-29 ชิ้น) 12 บาท (30 ชิ้นขึ้นไป) ขนาด 3 ซม. ขึ้นไปบวกเพิ่มเซนละ 10 บาท — รวมอยู่ในราคาที่แสดงแล้ว";
d.seo.faqs = [(d.seo.faqs ?? [])[0], faqTop, ...(d.seo.faqs ?? []).slice(1)].filter(Boolean);

/* ── สรุป ──────────────────────────────────────────────────────── */
console.log(`📦 ${d.name} (${ID})`);
built.filter(Boolean).forEach((b) => console.log(`   • ${b.tag}: ${b.cells} ช่อง (9 ขนาดล่าง × ${b.screens} งานสกรีน × 9 ขนาดบน)`));
console.log(`   • เปลี่ยนชื่อกลุ่ม "${BOTTOM_OLD}" → "${BOTTOM}" · "${COLOR_OLD}" → "${COLOR}"`);
console.log(`   • เพิ่มกลุ่ม "${TOP}" (2-10 ซม.) ต่อจากกลุ่มขนาดแผ่นล่าง`);
console.log(`   • ราคาเริ่มต้น ${oldPrice} → ${min} บาท (สูงสุด ${max} บาท) · แก้ FAQ/คำโปรย/แท็บให้ตรง`);
console.log("\n   ตัวอย่างช่องราคา (สกรีน 1 ด้าน (ใต้)) — 1-10 / 11-29 / 30-49 / 50-199 / 200-499 / 500+");
for (const [b, t] of [[2, 2], [5, 2], [5, 3], [10, 5], [10, 10]])
  console.log(`     ล่าง ${b} ซม. + บน ${t} ซม.  ${[0, 1, 2, 3, 4, 5].map((i) => cell(b, BASE_SCREEN, t, i)).join(" / ")}`);

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}
const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
