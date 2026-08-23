#!/usr/bin/env node
/**
 * 3D Acrylic — ประกอบ "ตัวเลือก + ตารางราคา" ทั้งใบจากตัวเลขสดบนเว็บตารางราคา
 *
 *   node scripts/3d-acrylic-build.mjs           # เทียบให้ดูว่าต่างจากในระบบตรงไหน (ไม่เขียน)
 *   node scripts/3d-acrylic-build.mjs --write   # เขียนลงฐานข้อมูล
 *
 * ที่มา: https://www.iduckyofficial-pricelists.com/otheracrylicproducts  บล็อก "3D Acrylic"
 *   "อะคริลิค จำนวน 2 ชิ้น (เลือกขนาดได้) | สกรีน 1 ด้าน / ชิ้น" + กล่อง ADD ON บนโปสเตอร์
 *
 * ── โครงตัวเลือก (ทางร้านสั่ง 23 ส.ค. 69: "ชิ้นที่ 1 กับ 2 ต้องเลือกแยกกันได้") ──
 *   ขนาดชิ้นที่ 1 · งานสกรีน (ชิ้นที่ 1) · ชนิดอะคริลิค (ชิ้นที่ 1)   ← 3 แกนของตารางราคา
 *   ขนาดชิ้นที่ 2 · งานสกรีน (ชิ้นที่ 2) · ชนิดอะคริลิค (ชิ้นที่ 2)   ← บวกเพิ่มด้วย +฿ ของตัวเลือก
 *   เพิ่มจำนวนชิ้น (ชิ้นที่ 3 ขึ้นไป)                                ← ติ๊กหลายอย่าง + ระบุจำนวน
 *
 * สูตรราคา 1 ชุด — ADD ON บนเว็บเป็นราคา "ต่อชิ้น" คิดแยกทีละชิ้นตามขนาดของชิ้นนั้นเอง:
 *   ช่องตาราง = ฐาน[ขนาดชิ้นที่ 1][ช่วงจำนวน] + ค่าสกรีน[ขนาด1][สกรีน1] + ค่าอคล.พิเศษ[ขนาด1][อคล1]
 *   + ฿ ของกลุ่มชิ้นที่ 2 = ค่าสกรีน[ขนาด2][สกรีน2] + ค่าอคล.พิเศษ[ขนาด2][อคล2]
 *   ราคาฐานคิดจากชิ้นที่ใหญ่ที่สุด = ชิ้นที่ 1 (มีกฎบังคับให้ชิ้นที่ 2 ไม่เกินชิ้นที่ 1 อยู่แล้ว)
 *   ⇒ เลือกเหมือนกันทั้ง 2 ชิ้น ได้ยอดเท่าโครงเดิมเป๊ะ · เลือกต่างกันถึงจะเห็นราคาต่าง
 *
 * ⚠️ ค่าสกรีน/อคล.พิเศษ ต่างกันตาม "ช่วงขนาด" (2-5cm กับ 6cm) แต่ +฿ ของตัวเลือกเก็บได้ค่าเดียว
 *    จึงแตกกลุ่มของชิ้นที่ 2 เป็นใบละช่วงขนาด แล้วใช้ showWhen สลับให้เห็นทีละใบ
 *    (ช่วงขนาดคำนวณจากตัวเลขบนเว็บเอง ไม่ได้พิมพ์ทับ — เว็บเปลี่ยนกี่ช่วงก็แตกตาม)
 *    ผลข้างเคียง: สลับขนาดชิ้นที่ 2 ข้ามช่วง 5↔6cm แล้วตัวเลือกสกรีน/อะคริลิคของชิ้นที่ 2 จะเด้งกลับค่าตั้งต้น
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetch3dAcrylicPrices, fetchKeyringRate1 } from "./3d-acrylic-prices.mjs";

const WRITE = process.argv.includes("--write");
const ID = "3d-acrylic";
const EXPECT_NAME = "3D Acrylic";

const SIZE1 = "ขนาดชิ้นที่ 1";
const SIZE2 = "ขนาดชิ้นที่ 2";
const SCREEN1 = "งานสกรีน (ชิ้นที่ 1)";
const ACRYLIC1 = "ชนิดอะคริลิค (ชิ้นที่ 1)";
const SCREEN2 = "งานสกรีน (ชิ้นที่ 2)";
const ACRYLIC2 = "ชนิดอะคริลิค (ชิ้นที่ 2)";
const EXTRA = "เพิ่มจำนวนชิ้น";
/** ชื่อกลุ่มเดิมก่อนแยกเป็นรายชิ้น — ใช้ยกภาพประจำตัวเลือกและค่าที่ตั้งไว้เดิมมาให้ */
const OLD_SCREEN = "งานสกรีน";
const OLD_ACRYLIC = "ชนิดอะคริลิค";

/** งานสกรีนที่ร้านรับทำ → แถว ADD ON บนเว็บ (null = ราคาฐาน "สกรีน 1 ด้าน/ชิ้น" ไม่บวกเพิ่ม) */
const SCREENS = [
  { name: "สกรีน 1 ด้าน (ใต้)", addon: null, popular: true },
  { name: "สกรีน 1 ด้าน (บน)", addon: null },
  { name: "สกรีน 2 ด้าน (ใต้-บน)", addon: "สกรีน 2 ด้าน", popular: true },
  { name: "สกรีน 2 ด้าน (บน-บน)", addon: "สกรีน 2 ด้าน" },
  // ⛔ ไม่มี "สกรีน 3 / 4 เลเยอร์" — งานตัวนี้สกรีนได้แค่ 1 หรือ 2 ด้านต่อชิ้น (ทางร้านยืนยัน 23 ส.ค. 69)
  //    แถว ADD ON ของ 3/4 เลเยอร์ยังมีบนเว็บ แต่เป็นของสินค้าอื่น จึงไม่เอามาใช้กับ 3D Acrylic
];
/** ชนิดอะคริลิค → บวกค่าอคล.พิเศษไหม (ใส กับ ขาวขุ่น C-02 ราคาเท่ากัน) */
const ACRYLICS = [
  { name: "อะคริลิคใส", special: false },
  { name: "อะคริลิคขาวขุ่น C-02", special: false },
  { name: "อะคริลิคพิเศษ (สี / โฮโลแกรม / กลิตเตอร์)", special: true },
];

/**
 * 🏷 ค่าอะคริลิคพิเศษ — ทางร้านยืนยันให้ยึด "ตามโปสเตอร์" (2-5cm +5 · 6-8cm +8 · 9-10cm +10)
 * ทุกช่วงจำนวน ไม่แยกปลีก/ส่ง · ตัวเลขชุดนั้นตรงกับแถว "(เรทราคาส่ง) อคล.พิเศษ" บนเว็บพอดี
 */
const SPECIAL_RATE_ROW = "wholesale";

/** กล่อง "เพิ่มจำนวนชิ้น" บนโปสเตอร์ — ราคาปลีกต่อ 1 ซม. ของชิ้นที่เพิ่ม */
const EXTRA_PER_CM = { สกรีน: 15, ไม่สกรีน: 10 };
/** "จำนวน 11 ชิ้นขึ้นไป คิดราคาเรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1)" */
const EXTRA_WHOLESALE_TIER = "11-29 ชิ้น";
const EXTRA_WHOLESALE_FROM_QTY = 11;
/** ต่อท้ายชื่อตัวเลือกของชิ้นที่เพิ่มเมื่อเลือกอะคริลิคพิเศษ (ไม่ต่อท้าย = ใส/ขาวขุ่น ราคาเท่ากัน) */
const EXTRA_SPECIAL_SUFFIX = " · อคล.พิเศษ";

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

const web = await fetch3dAcrylicPrices();
const rate1 = await fetchKeyringRate1();
const SPECIAL_RATE = web.special[SPECIAL_RATE_ROW];
const SIZES = web.sizes;

const screenFee = (size, s) => (s.addon ? (web.screen[s.addon][size] ?? 0) : 0);
const specialFee = (size, a) => (a.special ? (SPECIAL_RATE[size] ?? 0) : 0);

console.log(`📥 ขนาด ${SIZES.join(" / ")} · ช่วงจำนวน ${web.tiers.join(" / ")}`);
console.log(`   ค่าอคล.พิเศษ/ชิ้น: ${SIZES.map((s) => `${s} +${SPECIAL_RATE[s]}`).join(" · ")}`);
for (const s of SCREENS.filter((x) => x.addon))
  console.log(`   ${s.name.padEnd(22)}: ${SIZES.map((z) => `${z} +${screenFee(z, s)}`).join(" · ")}`);

// ── อ่านสินค้าเดิม ──
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
if (p.name !== EXPECT_NAME) throw new Error(`สินค้า id "${ID}" ตอนนี้ชื่อ "${p.name}" ไม่ใช่ "${EXPECT_NAME}" — หยุดก่อน`);

const oldOpt = (label) => (p.options ?? []).find((o) => o.label === label);
/** ยกภาพประจำตัวเลือกของเดิมมาให้ (กลุ่มถูกเปลี่ยนชื่อ/สร้างใหม่ ภาพจะได้ไม่หาย) */
const imageOf = (labels, choiceName) => {
  for (const l of labels) {
    const hit = oldOpt(l)?.choices?.find((c) => c.name === choiceName)?.imageSrc;
    if (hit) return hit;
  }
  return undefined;
};
const withImage = (labels, c) => {
  const src = imageOf(labels, c.name);
  return src ? { ...c, imageSrc: src } : c;
};

// ── 1) ตารางราคา: ฐาน + ค่าของ "ชิ้นที่ 1" เท่านั้น (ชิ้นที่ 2 ไปอยู่ใน +฿ ของกลุ่มตัวเอง) ──
const cells = {};
for (const size of SIZES)
  for (const s of SCREENS)
    for (const a of ACRYLICS)
      cells[`${size}│${s.name}│${a.name}`] = web.base[size].map((b) => b + screenFee(size, s) + specialFee(size, a));

// ── 2) กลุ่มของชิ้นที่ 2: แตกตาม "ช่วงขนาดที่ค่าบวกเพิ่มเท่ากัน" (คำนวณจากตัวเลขบนเว็บเอง) ──
const feeKey = (size) => JSON.stringify([...SCREENS.map((s) => screenFee(size, s)), ...ACRYLICS.map((a) => specialFee(size, a))]);
const bands = [];
for (const size of SIZES) {
  const key = feeKey(size);
  const hit = bands.find((b) => b.key === key);
  if (hit) hit.sizes.push(size);
  else bands.push({ key, sizes: [size], ref: size });
}
console.log(`\n🎚 ช่วงขนาดของค่าบวกเพิ่ม: ${bands.map((b) => b.sizes.join("/")).join("  |  ")}`);

/** ใบแรกใช้ชื่อกลุ่มล้วน ๆ · ใบต่อ ๆ ไปต่อท้ายด้วยช่วงขนาด (ชื่อกลุ่มซ้ำกันไม่ได้ selections คีย์ด้วย label) */
const bandLabel = (base, b, i) => (i === 0 ? base : `${base} · ขนาด ${b.sizes.join("/")}`);

const piece2Groups = [];
bands.forEach((b, i) => {
  const showWhen = { label: SIZE2, choices: b.sizes };
  piece2Groups.push({
    label: bandLabel(SCREEN2, b, i),
    showWhen,
    note: "เลือกแยกจากชิ้นที่ 1 ได้ — คิดเพิ่มตามขนาดของชิ้นที่ 2 เอง",
    choices: SCREENS.map((s) =>
      withImage([SCREEN2, bandLabel(SCREEN2, b, i), OLD_SCREEN, SCREEN1], {
        name: s.name,
        ...(s.popular ? { popular: true } : {}),
        ...(screenFee(b.ref, s) ? { extra: screenFee(b.ref, s) } : {}),
      })
    ),
  });
  piece2Groups.push({
    label: bandLabel(ACRYLIC2, b, i),
    showWhen,
    note: "ชิ้นที่ 2 ใช้อะคริลิคคนละชนิดกับชิ้นที่ 1 ได้",
    choices: ACRYLICS.map((a) =>
      withImage([ACRYLIC2, bandLabel(ACRYLIC2, b, i), OLD_ACRYLIC, ACRYLIC1], {
        name: a.name,
        ...(specialFee(b.ref, a) ? { extra: specialFee(b.ref, a) } : {}),
      })
    ),
  });
});

// ── 3) กลุ่ม "เพิ่มจำนวนชิ้น" — ขนาด × สกรีน/ไม่สกรีน × ใส/พิเศษ ──
const extraChoices = [];
for (const [kind, perCm] of Object.entries(EXTRA_PER_CM)) {
  for (const size of SIZES) {
    const cm = Number(size.replace("cm", ""));
    const retail = cm * perCm;
    /**
     * เรทส่งของชิ้นที่เพิ่มมาจากตารางแผ่นอะคริลิคเรทที่ 1 ซึ่งเป็นราคา "แผ่นที่สกรีนแล้ว"
     * งานไม่สกรีนจึงไม่ควรแพงกว่าราคาปลีกของตัวเอง — กันด้วย min() ไม่ให้สั่งเยอะแล้วแพงขึ้น
     */
    const wholesale = Math.min(retail, rate1.cell(size, EXTRA_WHOLESALE_TIER));
    for (const special of [false, true]) {
      const sp = special ? (SPECIAL_RATE[size] ?? 0) : 0;
      extraChoices.push({
        name: `${size} · ${kind}${special ? EXTRA_SPECIAL_SUFFIX : ""}`,
        qty: true,
        qtyMax: 10,
        extraBelow: retail + sp,
        extra: wholesale + sp,
      });
    }
  }
}
const extraGroup = {
  label: EXTRA,
  display: "multi",
  extraFromQty: EXTRA_WHOLESALE_FROM_QTY,
  note:
    "1 ชุดได้อะคริลิค 2 ชิ้นอยู่แล้ว — อยากได้มากกว่านั้นติ๊กแบบของชิ้นที่เพิ่มแล้วใส่จำนวน " +
    "(งานสกรีน ซม.ละ 15 บาท · ไม่สกรีน ซม.ละ 10 บาท ต่อ 1 ชิ้น · อคล.พิเศษบวกเพิ่มตามขนาด) " +
    "— สั่งตั้งแต่ 11 ชุดขึ้นไป คิดเรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1) ให้อัตโนมัติ",
  choices: extraChoices.map((c) => withImage([EXTRA], c)),
};

// ── 4) ประกอบ options ใหม่ทั้งชุด (คงกลุ่มอื่นที่ไม่เกี่ยวไว้ตามเดิม) ──
const keepSize = (label) => {
  const o = oldOpt(label);
  if (!o) throw new Error(`ไม่พบกลุ่ม "${label}" — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์`);
  return o;
};
const size1 = keepSize(SIZE1);
const size2 = keepSize(SIZE2);
const known = new Set([SIZE1, SIZE2, SCREEN1, ACRYLIC1, OLD_SCREEN, OLD_ACRYLIC, EXTRA, ...piece2Groups.map((g) => g.label)]);
const untouched = (p.options ?? []).filter((o) => !known.has(o.label));

const screen1Group = {
  ...(oldOpt(SCREEN1) ?? oldOpt(OLD_SCREEN) ?? {}),
  label: SCREEN1,
  note: "ชิ้นฐาน — ราคาในตารางรวมค่าสกรีนของชิ้นนี้แล้ว",
  choices: SCREENS.map((s) => withImage([SCREEN1, OLD_SCREEN], { name: s.name, ...(s.popular ? { popular: true } : {}) })),
};
const acrylic1Group = {
  ...(oldOpt(ACRYLIC1) ?? oldOpt(OLD_ACRYLIC) ?? {}),
  label: ACRYLIC1,
  note: "ชิ้นฐาน — ราคาในตารางรวมค่าอะคริลิคของชิ้นนี้แล้ว",
  choices: ACRYLICS.map((a) => withImage([ACRYLIC1, OLD_ACRYLIC], { name: a.name })),
};

const options = [size1, screen1Group, acrylic1Group, size2, ...piece2Groups, extraGroup, ...untouched];

// ── 5) ข้อความที่ต้องตามไปแก้เพราะโครงตัวเลือกเปลี่ยน ──
/**
 * ตารางราคาบนหน้าสินค้าอ่านจาก pricing.cells ตรง ๆ = รวมค่าของ "ชิ้นที่ 1" เท่านั้น
 * ส่วนราคาต่อชุดที่โชว์ใหญ่ ๆ รวมของชิ้นที่ 2 ด้วย — ต้องเขียนกำกับ ไม่งั้นลูกค้าเห็นสองตัวเลขแล้วงง
 */
const RATE_NOTE = "ตัวเลขในตารางรวมค่าสกรีน/ชนิดอะคริลิคของชิ้นที่ 1 แล้ว ส่วนของชิ้นที่ 2 บวกเพิ่มตามที่เลือก";
const texts = [];
for (const r of p.priceRates ?? []) {
  if (typeof r.desc !== "string" || r.desc.includes(RATE_NOTE)) continue;
  r.desc = `${r.desc} · ${RATE_NOTE}`;
  texts.push(`priceRates[${r.label}].desc`);
}
/** แก้ข้อความแบบรันซ้ำได้ — เจอข้อความใหม่อยู่แล้วก็ข้าม (ของเก่าบางอันเป็นคำนำหน้าของใหม่) */
const swap = (obj, key, from, to) => {
  if (typeof obj?.[key] !== "string" || obj[key].includes(to) || !obj[key].includes(from)) return;
  obj[key] = obj[key].replace(from, to);
  texts.push(`${key}: ${to.slice(0, 60)}…`);
};
const tab = (title) => (p.tabs ?? []).find((t) => t.title === title);
swap(
  tab("รายละเอียดเพิ่มเติม"),
  "text",
  "• ราคาในตารางคือ 1 ชุด (อะคริลิค 2 ชิ้น) สกรีน 1 ด้านต่อชิ้น — คิดราคาจากชิ้นที่ใหญ่ที่สุด",
  "• ราคาในตารางคือ 1 ชุด (อะคริลิค 2 ชิ้น) สกรีน 1 ด้านต่อชิ้น — คิดราคาจากชิ้นที่ใหญ่ที่สุด (= ชิ้นที่ 1)"
);
swap(
  tab("รายละเอียดเพิ่มเติม"),
  "text",
  "• เลือกงานสกรีนได้ 4 แบบ: 1 ด้าน / 2 ด้าน / 3 เลเยอร์ / 4 เลเยอร์ — ระบบบวกเพิ่มตามขนาดให้อัตโนมัติ (คิดต่อชิ้น × 2 ชิ้น)",
  "• งานสกรีนและชนิดอะคริลิคเลือกแยกกันได้ทีละชิ้น (ชิ้นที่ 1 / ชิ้นที่ 2) — ระบบบวกเพิ่มตามขนาดของชิ้นนั้น ๆ ให้อัตโนมัติ"
);
/** ลบทั้งบรรทัด (ใช้กับข้อความที่ไม่เกี่ยวแล้ว ไม่ใช่แค่แก้คำ) */
const dropLine = (obj, key, line) => {
  if (typeof obj?.[key] !== "string" || !obj[key].includes(line)) return;
  obj[key] = obj[key].replace(`${line}\n`, "").replace(line, "");
  texts.push(`${key}: ลบบรรทัด "${line.slice(0, 46)}…"`);
};

// ── ตัดข้อความที่ยังโฆษณาสกรีน 3-4 เลเยอร์ (ตอนนี้ไม่มีให้เลือกแล้ว) ──
if (!SCREENS.some((x) => /เลเยอร์/.test(x.name))) {
  const hl = (p.highlights ?? []).findIndex((h) => h.includes("3-4 เลเยอร์"));
  if (hl >= 0) {
    p.highlights[hl] = "เลือกสกรีน 1 ด้าน หรือ 2 ด้าน แยกทีละชิ้นได้";
    texts.push(`highlights[${hl}]`);
  }
  dropLine(tab("การเตรียมไฟล์"), "text", "• สกรีน 3-4 เลเยอร์ ให้แยกเลเยอร์ตามลำดับ (ดูภาพตัวอย่างแต่ละแบบในแกลเลอรีสินค้า)");
  swap(
    tab("การเตรียมไฟล์"),
    "text",
    "(สกรีนใต้/บน · 2 ด้าน ใต้-บน/บน-บน · 3 และ 4 เลเยอร์)",
    "(สกรีนใต้/บน · 2 ด้าน ใต้-บน/บน-บน)"
  );
  swap(p.seo, "description", "เลือกสกรีน 1-4 เลเยอร์", "เลือกสกรีน 1 ด้าน หรือ 2 ด้าน");
  const fi = (p.seo?.faqs ?? []).findIndex((f) => /3 เลเยอร์|4 เลเยอร์/.test(f.q));
  if (fi >= 0) {
    texts.push(`seo.faqs: ลบข้อ "${p.seo.faqs[fi].q}"`);
    p.seo.faqs.splice(fi, 1);
  }
}

swap(
  tab("วิธีสั่งงาน"),
  "text",
  "• เลือกขนาดชิ้นที่ 1 (ชิ้นใหญ่สุด) → ขนาดชิ้นที่ 2 → งานสกรีน → ชนิดอะคริลิค → ใส่จำนวน (นับเป็นชุด ชุดละ 2 ชิ้น)",
  "• ชิ้นที่ 1 (ชิ้นใหญ่สุด): เลือกขนาด → งานสกรีน → ชนิดอะคริลิค · แล้วเลือกของชิ้นที่ 2 แยกอีกชุด\n• อยากได้เกิน 2 ชิ้นต่อชุด ติ๊กที่ “เพิ่มจำนวนชิ้น” แล้วใส่จำนวน → ใส่จำนวนชุด"
);

// ── 6) สรุปให้ดูก่อนเขียน ──
const before = p.pricing?.cells ?? {};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log(`\n🎛 กลุ่มตัวเลือก (${options.length}):`);
for (const o of options) {
  const was = oldOpt(o.label);
  console.log(`   ${was ? " " : "＋"} ${o.label}${o.showWhen ? `  [แสดงเมื่อ ${o.showWhen.label} = ${o.showWhen.choices.join("/")}]` : ""} — ${o.choices.length} ตัวเลือก`);
}
const gone = (p.options ?? []).filter((o) => !options.some((n) => n.label === o.label));
for (const g of gone) console.log(`   −  ${g.label} (ยุบ/เปลี่ยนชื่อ)`);

/**
 * กันราคาขยับโดยไม่ได้ตั้งใจ
 *  • รันครั้งแรก (ของเดิมยังเป็นโครงรวม 2 ชิ้นในช่องเดียว) — "เลือกเหมือนกันทั้ง 2 ชิ้น" ต้องได้ยอดเท่าเดิมเป๊ะ
 *  • รันซ้ำ (แยกรายชิ้นแล้ว) — ช่องในตารางต้องเท่าเดิมทุกช่อง
 */
const wasMerged = (p.pricing?.driverLabels ?? []).includes(OLD_SCREEN);
console.log(
  wasMerged
    ? "\n🔍 ของเดิมเป็นโครงรวม 2 ชิ้น — ตรวจว่าเลือกเหมือนกันทั้ง 2 ชิ้นแล้วยอดไม่ขยับ (ช่วง 1-10 ชุด):"
    : "\n🔍 แยกรายชิ้นอยู่แล้ว — ตรวจว่าช่องในตารางไม่ขยับ:"
);
let drift = 0;
for (const size of SIZES)
  for (const s of SCREENS)
    for (const a of ACRYLICS) {
      const key = `${size}│${s.name}│${a.name}`;
      const was = before[key];
      if (!was) continue;
      const now = wasMerged ? cells[key][0] + screenFee(size, s) + specialFee(size, a) : cells[key];
      const cmp = wasMerged ? was[0] : was;
      if (sameJson(cmp, now)) continue;
      drift++;
      if (drift <= 8) console.log(`   ⚠️ ${key}  เดิม ${JSON.stringify(cmp)} → ใหม่ ${JSON.stringify(now)}`);
    }
console.log(drift ? `   รวมต่างกัน ${drift} แบบ` : "   ✅ ตรงกันทุกแบบ");

const maxPiece2 = Math.max(
  ...bands.map((b) => Math.max(...SCREENS.map((s) => screenFee(b.ref, s))) + Math.max(...ACRYLICS.map((a) => specialFee(b.ref, a))))
);
const first = cells[`${SIZES[0]}│${SCREENS[0].name}│${ACRYLICS[0].name}`];
const price = first[0] + 0;
const priceMin = Math.min(...Object.values(cells).map((v) => v[v.length - 1]));
const priceMax = Math.max(...Object.values(cells).map((v) => v[0])) + maxPiece2;
if (texts.length) console.log(`\n📝 ข้อความที่ตามไปแก้: ${texts.length} จุด\n   ${texts.join("\n   ")}`);
console.log(`\n💰 เริ่มต้น ${price} · ต่ำสุด ${priceMin} · สูงสุด ${priceMax}   (ในระบบตอนนี้ ${p.price} / ${p.priceMin} / ${p.priceMax})`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าจะเขียนจริง)");
  console.log("หลังเขียนแล้ว: node scripts/3d-acrylic-art.mjs && node scripts/3d-acrylic-option-art.mjs --upload --write");
  process.exit(0);
}

p.options = options;
p.pricing = { ...p.pricing, cells, driverLabels: [SIZE1, SCREEN1, ACRYLIC1] };
for (const r of p.priceRates ?? [])
  if (r.pricing) r.pricing = { ...r.pricing, cells, driverLabels: [SIZE1, SCREEN1, ACRYLIC1] };
p.price = price;
p.priceMin = priceMin;
p.priceMax = priceMax;
p.savedAt = new Date().toISOString();

const { error: upErr } = await sb.from("products").update({ data: p, price }).eq("id", ID);
if (upErr) throw upErr;
console.log("\nบันทึกแล้ว ✓");
console.log("ต่อไป: node scripts/3d-acrylic-art.mjs && node scripts/3d-acrylic-option-art.mjs --upload --write");
