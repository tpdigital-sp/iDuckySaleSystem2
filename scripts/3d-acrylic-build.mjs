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
 *   เพิ่มจำนวนชิ้น (ชิ้นที่ 3 ขึ้นไป)                                ← ติ๊กแจ้ง แล้วแอดมินคิดราคาให้
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

/** กล่อง "เพิ่มจำนวนชิ้น" บนโปสเตอร์ — ราคาปลีกต่อ 1 ซม. ของชิ้นที่เพิ่ม (ใช้เป็นตัวเลขบอกลูกค้าคร่าว ๆ) */
const EXTRA_PER_CM = { สกรีน: 15, ไม่สกรีน: 10 };
/** เรทส่งของชิ้นที่เพิ่ม — "จำนวน 11 ชิ้นขึ้นไป คิดราคาเรทส่งตามตารางแผ่นอะคริลิค (เรทที่ 1)" */
const EXTRA_WHOLESALE_TIER = "11-29 ชิ้น";
/** สั่งกี่ชุดขึ้นไปถึงเปลี่ยนไปใช้เรทส่งของชิ้นที่เพิ่ม */
const EXTRA_WHOLESALE_FROM_QTY = 11;
/**
 * กฎขนาดเกินตารางบนโปสเตอร์ (เว็บตารางราคาไม่มีตัวเลขชุดนี้ จึงพิมพ์ไว้ตรงนี้ที่เดียว)
 *   "ตั้งแต่ 7 cm. ขึ้นไป เพิ่มขนาด cm.ละ 10 บาท / 1 ชิ้น (ราคาไม่รวมอะคริลิคพิเศษ)"
 *   "สกรีนเพิ่ม Layer / 1 ด้าน — เกิน 6 cm บวกเพิ่ม cm ละ 10"
 */
const OVERSIZE = { fromCm: 7, perCm: 10, screenOverCm: 6, screenPerCm: 10 };

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
/**
 * จับขนาดที่ "ค่าบวกเพิ่มเท่ากันเป๊ะ" มัดเป็นช่วงเดียวกัน แล้วทำกลุ่มตัวเลือกใบละช่วง
 * (+฿ ของตัวเลือกเก็บได้ค่าเดียว จะให้เปลี่ยนตามขนาดต้องแตกกลุ่มแล้วสลับด้วย showWhen)
 * ช่วงคำนวณจากตัวเลขจริง ไม่ได้พิมพ์ทับ — ราคาบนเว็บเปลี่ยนกี่ช่วงก็แตกตาม
 */
const bandsBy = (keyFn) => {
  const out = [];
  for (const size of SIZES) {
    const key = keyFn(size);
    const hit = out.find((b) => b.key === key);
    if (hit) hit.sizes.push(size);
    else out.push({ key, sizes: [size], ref: size });
  }
  return out;
};
const bands = bandsBy((size) =>
  JSON.stringify([...SCREENS.map((s) => screenFee(size, s)), ...ACRYLICS.map((a) => specialFee(size, a))])
);
console.log(`\n🎚 ช่วงขนาดของค่าบวกเพิ่ม (ชิ้นที่ 2): ${bands.map((b) => b.sizes.join("/")).join("  |  ")}`);

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

// ── 3) ชิ้นที่ 3 และ 4 — เปิด/ปิดได้ เลือกขนาด/สกรีน/อะคริลิคแยกเหมือนชิ้นที่ 1-2 ──
/**
 * โครง 1 ชิ้น = 4 ส่วน
 *   ก) สวิตช์ "ชิ้นที่ N"      ไม่คิดเงิน · ค่าตั้งต้น = ไม่เพิ่ม → อีก 3 กลุ่มซ่อนอยู่
 *   ข) ขนาดชิ้นที่ N          คิด "ราคาอะคริลิคเปล่า" = ซม.ละ 10 (เรทงานไม่สกรีนบนโปสเตอร์)
 *   ค) งานสกรีน (ชิ้นที่ N)   ไม่สกรีน = 0 · สกรีนแล้วบวกส่วนต่างเป็น ซม.ละ 5 (10 → 15 ตามโปสเตอร์)
 *                             + ค่าสกรีน 2 ด้านตามตาราง ADD ON
 *   ง) ชนิดอะคริลิค (ชิ้นที่ N)  อคล.พิเศษบวกตามขนาด เหมือนชิ้นที่ 1-2
 *
 * ⚠️ ส่วนต่างค่าสกรีนเป็น "ซม.ละ 5" จึงต่างกันทุกขนาด → กลุ่ม ค) แตกเป็นใบละขนาด (5 ใบ)
 *    ลูกค้าเห็นทีละใบเท่านั้น แต่ในหน้าแก้ไขหลังบ้านจะเห็นเป็นกลุ่มเยอะ — ตั้งใจแบบนี้
 */
const EXTRA_PIECES = [3, 4];
const PIECE_LABEL = { on: (n) => `เพิ่มชิ้นที่ ${n}`, off: (n) => `ไม่เพิ่มชิ้นที่ ${n}` };
const TOGGLE_N = (n) => `ชิ้นที่ ${n}`;
const SIZE_N = (n) => `ขนาดชิ้นที่ ${n}`;
const SCREEN_N = (n) => `งานสกรีน (ชิ้นที่ ${n})`;
const ACRYLIC_N = (n) => `ชนิดอะคริลิค (ชิ้นที่ ${n})`;
const NO_SCREEN = "ไม่สกรีน (อะคริลิคเปล่า)";
const cmOf2 = (sz) => Number(sz.replace("cm", ""));
/** ส่วนต่าง "สกรีนแล้ว" เทียบกับอะคริลิคเปล่า — ซม.ละ (15 − 10) ตามกล่องเพิ่มจำนวนชิ้นบนโปสเตอร์ */
const SCREEN_STEP_PER_CM = EXTRA_PER_CM["สกรีน"] - EXTRA_PER_CM["ไม่สกรีน"];

/** ราคาชิ้นเปล่าของชิ้นที่เพิ่ม — ช่วงปลีก / ช่วงส่ง (11 ชุดขึ้นไป) */
const bareRetail = (sz) => cmOf2(sz) * EXTRA_PER_CM["ไม่สกรีน"];
/**
 * ช่วงส่งยึด "เรทที่ 1" ของตารางแผ่นอะคริลิคพวงกุญแจ ซึ่งเป็นราคาแผ่นที่สกรีนแล้ว
 * ตัวเลขในกลุ่มขนาดเป็นชิ้นเปล่า จึงหักส่วนต่างค่าสกรีนออกก่อน (บวกกลับตอนเลือกสกรีน = ได้เรทที่ 1 พอดี)
 * แล้วกันด้วย min() ไม่ให้สั่งเยอะแล้วแพงกว่าสั่งน้อย
 */
const bareWholesale = (sz) =>
  Math.min(bareRetail(sz), rate1.cell(sz, EXTRA_WHOLESALE_TIER) - cmOf2(sz) * SCREEN_STEP_PER_CM);

/** ค่าสกรีนของชิ้นที่เพิ่ม ณ ขนาดหนึ่ง (ไม่สกรีน = 0) */
const extraScreenFee = (sz, s) => (s.none ? 0 : cmOf2(sz) * SCREEN_STEP_PER_CM + screenFee(sz, s));
/**
 * ลำดับตัวเลือก: เอา "สกรีน 1 ด้าน (ใต้)" ไว้ตัวแรก เพราะตัวแรกคือค่าตั้งต้น
 * เปิดชิ้นที่ 3 มาปุ๊บจะได้ราคาชิ้นสกรีน (ซม.ละ 15) ตรงกับพาดหัวบนโปสเตอร์ทันที
 * ส่วน "ไม่สกรีน" เป็นเคสรอง ไว้ท้ายสุด
 */
const EXTRA_SCREENS = [...SCREENS, { name: NO_SCREEN, none: true }];

const extraScreenBands = bandsBy((sz) => JSON.stringify(EXTRA_SCREENS.map((s) => extraScreenFee(sz, s))));
const extraAcrylicBands = bandsBy((sz) => String(SPECIAL_RATE[sz] ?? 0));
console.log(`🎚 ช่วงขนาด (ชิ้นที่ 3-4): สกรีน ${extraScreenBands.length} ใบ · อะคริลิค ${extraAcrylicBands.length} ใบ`);

const extraPieceGroups = [];
for (const n of EXTRA_PIECES) {
  const toggle = TOGGLE_N(n);
  const on = { label: toggle, choices: [PIECE_LABEL.on(n)] };
  // ชิ้นที่ 4 เปิดได้ต่อเมื่อเปิดชิ้นที่ 3 แล้ว — กันสั่งข้ามลำดับจนใบงานอ่านสับสน
  const prevOn = n > EXTRA_PIECES[0] ? { label: TOGGLE_N(n - 1), choices: [PIECE_LABEL.on(n - 1)] } : undefined;

  extraPieceGroups.push({
    label: toggle,
    ...(prevOn ? { showWhen: prevOn } : {}),
    note:
      `1 ชุดได้อะคริลิค 2 ชิ้นอยู่แล้ว — เพิ่มชิ้นที่ ${n} ได้ เลือกขนาด/งานสกรีน/ชนิดอะคริลิคแยกของตัวเอง ` +
      `(ชิ้นเปล่า ซม.ละ ${EXTRA_PER_CM["ไม่สกรีน"]} บาท · สกรีนแล้ว ซม.ละ ${EXTRA_PER_CM["สกรีน"]} บาท)`,
    choices: [{ name: PIECE_LABEL.off(n) }, { name: PIECE_LABEL.on(n) }].map((c) => withImage([toggle], c)),
  });

  extraPieceGroups.push({
    label: SIZE_N(n),
    display: "dropdown",
    showWhen: on,
    extraFromQty: EXTRA_WHOLESALE_FROM_QTY,
    note: `ต้องไม่ใหญ่กว่าชิ้นที่ 1 — ราคาฐานของชุดคิดจากชิ้นที่ใหญ่ที่สุด`,
    choices: SIZES.map((sz) =>
      withImage([SIZE_N(n)], { name: sz, extraBelow: bareRetail(sz), extra: bareWholesale(sz) })
    ),
  });

  extraScreenBands.forEach((b, i) => {
    extraPieceGroups.push({
      label: bandLabel(SCREEN_N(n), b, i),
      showWhen: { label: SIZE_N(n), choices: b.sizes },
      showWhenAlso: on,
      note: `ไม่สกรีนก็ได้ — ใช้เป็นชิ้นฐาน/ตัวเว้นระยะให้งานดูมีมิติขึ้น`,
      choices: EXTRA_SCREENS.map((s) =>
        withImage([bandLabel(SCREEN_N(n), b, i), SCREEN_N(n), SCREEN1], {
          name: s.name,
          ...(s.popular ? { popular: true } : {}),
          ...(extraScreenFee(b.ref, s) ? { extra: extraScreenFee(b.ref, s) } : {}),
        })
      ),
    });
  });

  extraAcrylicBands.forEach((b, i) => {
    extraPieceGroups.push({
      label: bandLabel(ACRYLIC_N(n), b, i),
      showWhen: { label: SIZE_N(n), choices: b.sizes },
      showWhenAlso: on,
      choices: ACRYLICS.map((a) =>
        withImage([bandLabel(ACRYLIC_N(n), b, i), ACRYLIC_N(n), ACRYLIC1], {
          name: a.name,
          ...(specialFee(b.ref, a) ? { extra: specialFee(b.ref, a) } : {}),
        })
      ),
    });
  });
}

/** เผื่อลูกค้าอยากได้เกิน 4 ชิ้น — เกินจากนี้ให้แอดมินคิดราคาเอง */
const EXTRA_ASK_CHOICE = "ต้องการมากกว่า 4 ชิ้น (ให้แอดมินคิดราคา)";
const extraGroup = {
  label: EXTRA,
  display: "multi",
  showWhen: { label: TOGGLE_N(EXTRA_PIECES[EXTRA_PIECES.length - 1]), choices: [PIECE_LABEL.on(EXTRA_PIECES[EXTRA_PIECES.length - 1])] },
  note:
    "หน้าเว็บเลือกได้ถึงชิ้นที่ 4 — อยากได้มากกว่านั้นติ๊กช่องนี้ แล้วบอกจำนวน/ขนาดในช่อง “หมายเหตุถึงร้าน” " +
    "หรือทักไลน์ร้าน แอดมินจะคิดราคาเพิ่มให้ (ติ๊กแล้วราคาจะขึ้นเป็น “รอแอดมินตีราคา”)",
  choices: [withImage([EXTRA], { name: EXTRA_ASK_CHOICE, askPrice: true })],
};

// ── 4) ประกอบ options ใหม่ทั้งชุด (คงกลุ่มอื่นที่ไม่เกี่ยวไว้ตามเดิม) ──
const keepSize = (label) => {
  const o = oldOpt(label);
  if (!o) throw new Error(`ไม่พบกลุ่ม "${label}" — หยุดก่อน ข้อมูลเปลี่ยนไปจากตอนเขียนสคริปต์`);
  return o;
};
const size1 = keepSize(SIZE1);
const size2 = keepSize(SIZE2);
const known = new Set([
  SIZE1, SIZE2, SCREEN1, ACRYLIC1, OLD_SCREEN, OLD_ACRYLIC, EXTRA,
  ...piece2Groups.map((g) => g.label),
  ...extraPieceGroups.map((g) => g.label),
]);
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

const options = [size1, screen1Group, acrylic1Group, size2, ...piece2Groups, ...extraPieceGroups, extraGroup, ...untouched];

// ── 4.1) กฎ: ทุกชิ้นที่เพิ่มต้องไม่ใหญ่กว่าชิ้นที่ 1 (ราคาฐานคิดจากชิ้นใหญ่สุด จะได้ไม่เพี้ยน) ──
const LIMITED = [SIZE2, ...EXTRA_PIECES.map((n) => SIZE_N(n))];
p.rules = (p.rules ?? []).filter((r) => !LIMITED.includes(r.limit?.label));
for (const target of LIMITED)
  SIZES.forEach((sz, i) => {
    if (i === SIZES.length - 1) return; // ชิ้นที่ 1 ใหญ่สุด = เลือกได้ทุกขนาด ไม่ต้องมีกฎ
    p.rules.push({ when: { label: SIZE1, choice: sz, choices: [sz] }, limit: { label: target, allow: SIZES.slice(0, i + 1) } });
  });

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

// ── 5.1) แท็บ "ตารางราคาบวกเพิ่ม" — รวมกฎราคาทุกข้อไว้ที่เดียว ──
/**
 * โจทย์จากทางร้าน (23 ส.ค. 69): แอดมินต้องตีราคางานนอกตาราง (ขนาดเกิน 6cm · เพิ่มชิ้น · อะไหล่)
 * แล้วต้องไปเปิดหาตัวเลขจากโปสเตอร์/เว็บตารางราคา/หน้าพวงกุญแจ คนละที่ — เลยรวมมาไว้ในหน้าสินค้าเลย
 * ลูกค้าเห็นด้วย จะได้กะงบเองได้ ไม่ต้องทักถามทุกเคส
 *
 * ตัวเลขทั้งหมด "ประกอบจากตัวแปรชุดเดียวกับที่ใช้คิดเงินจริง" — แก้ราคาที่เว็บแล้วรันสคริปต์ซ้ำ
 * แท็บนี้อัปเดตตามเอง ไม่มีทางค้างเป็นตัวเลขเก่า
 */
const PRICE_TAB_TITLE = "ตารางราคาบวกเพิ่ม";
/**
 * ใบราคาฉบับที่ร้านออกแบบไว้ วางไว้บนสุดของแท็บ — ลูกค้ากดขยายอ่านได้เหมือนที่ร้านส่งให้ทางไลน์
 * ไฟล์มาจากไดรฟ์ร้าน ย่อ + อัปด้วย 3d-acrylic-art.mjs → 3d-acrylic-option-art.mjs (LOOSE_UPLOADS)
 */
const PRICE_SHEET_URL = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${ID}/pricesheet-v1.jpg`;
const perSize = (fn) => SIZES.map((s) => `${s} ${fn(s)}`).join(" · ");
const cmOf = (s) => Number(s.replace("cm", ""));
/** ขนาดที่ตาราง ADD ON บนเว็บมี แต่หน้าเว็บยังไม่เปิดขาย (7cm ขึ้นไป) — ไว้ให้แอดมินตีราคา */
const overSizes = Object.keys(SPECIAL_RATE).filter((s) => cmOf(s) > cmOf(SIZES[SIZES.length - 1]) && cmOf(s) <= 10);
const priceTabText = [
  "ตัวเลขในหน้านี้คือกฎราคาที่ระบบใช้คิดเงินจริง รวมงานที่ต้องให้แอดมินตีราคาด้วย — ดูที่เดียวจบ",
  "",
  "ราคาฐาน 1 ชุด = อะคริลิค 2 ชิ้น (สกรีน 1 ด้าน/ชิ้น · อะคริลิคใส หรือ ขาวขุ่น C-02)::",
  ...web.tiers.map((t, i) => `• ${t} — ${SIZES.map((s) => `${s} ${web.base[s][i]}`).join(" · ")} บาท/ชุด`),
  "• คิดราคาจากชิ้นที่ใหญ่ที่สุดของชุด (= ชิ้นที่ 1)",
  "• คละลาย: 1-10 ชุด คละได้อิสระ · 11 ชุดขึ้นไป คละได้โดยลายละ 5 ชุดขึ้นไป",
  "",
  "ค่าสกรีนเพิ่ม (คิดต่อ 1 ชิ้น — ชิ้นที่ 1 กับชิ้นที่ 2 คิดแยกตามขนาดของชิ้นนั้นเอง)::",
  "• สกรีน 1 ด้าน (ใต้ หรือ บน) — รวมในราคาฐานแล้ว ไม่บวกเพิ่ม",
  `• สกรีน 2 ด้าน — ${perSize((s) => `+${web.screen["สกรีน 2 ด้าน"][s]}`)} บาท/ชิ้น`,
  `• ขนาดเกิน ${OVERSIZE.screenOverCm}cm — บวกเพิ่ม ซม.ละ ${OVERSIZE.screenPerCm} บาท ต่อ 1 ชิ้น`,
  "",
  "ค่าอะคริลิคพิเศษ — กลิตเตอร์ / สีพิเศษ / โฮโลแกรม (คิดต่อ 1 ชิ้น)::",
  `• ${perSize((s) => `+${SPECIAL_RATE[s]}`)} บาท/ชิ้น`,
  ...(overSizes.length ? [`• ขนาดใหญ่กว่านั้น — ${overSizes.map((s) => `${s} +${SPECIAL_RATE[s]}`).join(" · ")} บาท/ชิ้น`] : []),
  "• อะคริลิคใส และ ขาวขุ่น C-02 ไม่บวกเพิ่ม",
  "",
  "เพิ่มจำนวนชิ้น — ชิ้นที่ 3 ขึ้นไป (คิดแบบอะคริลิคใส)::",
  ...Object.entries(EXTRA_PER_CM).map(
    ([kind, perCm]) => `• งาน${kind} ซม.ละ ${perCm} บาท ต่อ 1 ชิ้น — ${perSize((s) => cmOf(s) * perCm)} บาท`
  ),
  `• 11 ชุดขึ้นไป คิดเรทส่งตามตารางแผ่นอะคริลิคของพวงกุญแจ เรทที่ 1 (${EXTRA_WHOLESALE_TIER}) — ${perSize((s) => rate1.cell(s, EXTRA_WHOLESALE_TIER))} บาท`,
  "• หน้าสั่งซื้อติ๊กช่อง “เพิ่มจำนวนชิ้น” แล้วบอกจำนวน/ขนาดในหมายเหตุ แอดมินจะคิดราคาให้",
  "",
  "ขนาดเกินตาราง::",
  `• ตั้งแต่ ${OVERSIZE.fromCm}cm ขึ้นไป เพิ่มขนาด ซม.ละ ${OVERSIZE.perCm} บาท ต่อ 1 ชิ้น (ยังไม่รวมค่าอะคริลิคพิเศษ)`,
  `• หน้าเว็บเปิดให้เลือก ${SIZES[0]}-${SIZES[SIZES.length - 1]} — ใหญ่กว่านี้ทักไลน์ร้าน แอดมินตีราคาให้`,
  "",
  "ราคานี้ยังไม่รวม::",
  "• ค่าอะไหล่ (ตะขอ / ห่วง / โซ่ / ฐานตั้ง / Griptok) — แจ้งแอดมินเพื่อคิดราคาเพิ่ม",
  "",
  "หมายเหตุ::",
  "• ทำได้ทั้งพวงกุญแจ · Griptok · สแตนดี้ และอื่น ๆ",
  "• ชิ้นงานที่ติดกาวจะเห็นคราบกาวบ้าง และตำแหน่งจุดที่ติดกาวอาจคลาดเคลื่อนจากแบบเล็กน้อย",
].join("\n");

/**
 * ── ฉบับ HTML: ตัวเลขราคาขึ้นเป็น "ตาราง" จริง ──
 * ฉบับข้อความล้วน (priceTabText) อ่านยากมาก เพราะราคาไล่เป็นแถวยาว "2cm 120 · 3cm 140 · …"
 * ต้องกวาดตาหาเลขทีละตัว แถมการ์ดในแท็บยังถูกไล่เลข 1-2-3 เหมือน "ขั้นตอน" ทั้งที่เป็นหมวดราคา
 * ตารางอ่านง่ายกว่ามาก — เทียบข้ามขนาด/ข้ามช่วงจำนวนได้ในสายตาเดียว
 *
 * ใส่สีกับเส้นด้วย inline style เพราะ HTML ก้อนนี้ไม่ผ่าน Tailwind (อยู่ใน dangerouslySetInnerHTML)
 * และตัวกรอง HTML ฝั่งเซิร์ฟเวอร์ตัดเฉพาะ <style>/<script>/on-handler — attribute style ยังอยู่ครบ
 */
const T_WRAP = 'style="overflow-x:auto;margin-top:10px"';
const T_TBL = 'style="border-collapse:collapse;width:100%;min-width:420px"';
const T_TH = 'style="background:#E8F3FD;color:#1B4B7E;font-weight:600;border:1px solid #D3E6F6;padding:7px 9px;text-align:center;white-space:nowrap"';
const T_RH = 'style="background:#F6FAFE;color:#1B4B7E;font-weight:600;border:1px solid #D3E6F6;padding:7px 9px;text-align:left;white-space:nowrap"';
const T_TD = 'style="border:1px solid #E4EFF8;padding:7px 9px;text-align:center;white-space:nowrap"';
const T_NOTE = 'style="margin-top:6px;color:#5B7A99"';
const T_H3 = 'style="margin-top:22px"';

/** ตารางที่คอลัมน์คือขนาด: rows = [ชื่อแถว, [ค่าแต่ละขนาด] หรือ ข้อความพาดยาว] */
const sizeTable = (head, rows) => `<div ${T_WRAP}><table ${T_TBL}>
<thead><tr><th ${T_TH}>${head}</th>${SIZES.map((s) => `<th ${T_TH}>${s}</th>`).join("")}</tr></thead>
<tbody>${rows
  .map(
    ([name, cells]) =>
      `<tr><th ${T_RH}>${name}</th>${
        typeof cells === "string"
          ? `<td ${T_TD} colspan="${SIZES.length}">${cells}</td>`
          : cells.map((c) => `<td ${T_TD}>${c}</td>`).join("")
      }</tr>`
  )
  .join("")}</tbody></table></div>`;

const priceTabHtml = [
  `<p>ราคาทั้งหมดของงาน 3D Acrylic อยู่ในหน้านี้ — ลูกค้ากะงบเองได้ แอดมินตีราคางานนอกตารางได้เลย</p>`,
  `<h3 ${T_H3}>1 · ราคาฐาน — 1 ชุด = อะคริลิค 2 ชิ้น</h3>`,
  `<p>สกรีน 1 ด้าน/ชิ้น · อะคริลิคใส หรือ ขาวขุ่น C-02 · <strong>คิดราคาจากชิ้นที่ใหญ่ที่สุด</strong> (= ชิ้นที่ 1)</p>`,
  sizeTable("จำนวนที่สั่ง", web.tiers.map((t, i) => [t, SIZES.map((sz) => web.base[sz][i])])),
  `<p ${T_NOTE}>คละลาย — 1-10 ชุด คละได้อิสระ · 11 ชุดขึ้นไป คละได้โดยลายละ 5 ชุดขึ้นไป</p>`,

  `<h3 ${T_H3}>2 · บวกเพิ่มรายชิ้น</h3>`,
  `<p>ชิ้นที่ 1 กับชิ้นที่ 2 <strong>เลือกแยกกันได้</strong> — คิดเพิ่มตามขนาดของชิ้นนั้นเอง (บาท/ชิ้น)</p>`,
  sizeTable("รายการ", [
    ["สกรีน 1 ด้าน (ใต้/บน)", "รวมในราคาฐานแล้ว ไม่บวกเพิ่ม"],
    ["สกรีน 2 ด้าน", SIZES.map((sz) => `+${web.screen["สกรีน 2 ด้าน"][sz]}`)],
    ["อะคริลิคพิเศษ (กลิตเตอร์ / สีพิเศษ / โฮโลแกรม)", SIZES.map((sz) => `+${SPECIAL_RATE[sz]}`)],
    ["อะคริลิคใส · ขาวขุ่น C-02", "ไม่บวกเพิ่ม"],
  ]),

  `<h3 ${T_H3}>3 · ชิ้นที่ 3 และ 4 (เพิ่มได้)</h3>`,
  `<p>ปกติ 1 ชุดได้ 2 ชิ้น — เพิ่มได้ถึงชิ้นที่ 4 แต่ละชิ้นเลือก <strong>ขนาด · งานสกรีน · ชนิดอะคริลิค</strong> ของตัวเองแยกกัน (บาท/ชิ้น)</p>`,
  sizeTable("ชิ้นที่เพิ่ม", [
    [`อะคริลิคเปล่า ไม่สกรีน (ซม.ละ ${EXTRA_PER_CM["ไม่สกรีน"]})`, SIZES.map((sz) => cmOf(sz) * EXTRA_PER_CM["ไม่สกรีน"])],
    [`สกรีน 1 ด้าน (ซม.ละ ${EXTRA_PER_CM["สกรีน"]})`, SIZES.map((sz) => cmOf(sz) * EXTRA_PER_CM["สกรีน"])],
    [
      "สกรีน 2 ด้าน",
      SIZES.map((sz) => cmOf(sz) * EXTRA_PER_CM["สกรีน"] + web.screen["สกรีน 2 ด้าน"][sz]),
    ],
    ["อะคริลิคพิเศษ (บวกจากราคาข้างบน)", SIZES.map((sz) => `+${SPECIAL_RATE[sz]}`)],
    [`สั่ง ${EXTRA_WHOLESALE_FROM_QTY} ชุดขึ้นไป — สกรีน 1 ด้าน (เรทส่ง)`, SIZES.map((sz) => rate1.cell(sz, EXTRA_WHOLESALE_TIER))],
  ]),
  `<p ${T_NOTE}>ชิ้นที่เพิ่มต้องไม่ใหญ่กว่าชิ้นที่ 1 · เปิดชิ้นที่ 4 ได้เมื่อเปิดชิ้นที่ 3 แล้ว · อยากได้มากกว่า 4 ชิ้น ทักไลน์ร้าน</p>`,

  `<h3 ${T_H3}>4 · งานที่ต้องให้แอดมินตีราคา</h3>`,
  `<p>หน้าเว็บเปิดให้เลือก ${SIZES[0]}-${SIZES[SIZES.length - 1]} — นอกเหนือจากนี้ทักไลน์ร้าน</p>`,
  "<ul>",
  `<li><strong>ขนาด ${OVERSIZE.fromCm}cm ขึ้นไป</strong> — บวกเพิ่ม ซม.ละ ${OVERSIZE.perCm} บาท ต่อ 1 ชิ้น (ยังไม่รวมค่าอะคริลิคพิเศษ)</li>`,
  `<li><strong>สกรีน 2 ด้าน ขนาดเกิน ${OVERSIZE.screenOverCm}cm</strong> — บวกเพิ่ม ซม.ละ ${OVERSIZE.screenPerCm} บาท ต่อ 1 ชิ้น</li>`,
  ...(overSizes.length
    ? [`<li><strong>อะคริลิคพิเศษขนาดใหญ่</strong> — ${overSizes.map((sz) => `${sz} +${SPECIAL_RATE[sz]}`).join(" · ")} บาท/ชิ้น</li>`]
    : []),
  `<li><strong>ค่าอะไหล่</strong> — ตะขอ / ห่วง / โซ่ / ฐานตั้ง / Griptok (ราคาในตารางยังไม่รวม)</li>`,
  "</ul>",

  `<h3 ${T_H3}>หมายเหตุ</h3>`,
  "<ul>",
  "<li>ทำได้ทั้งพวงกุญแจ · Griptok · สแตนดี้ และอื่น ๆ</li>",
  "<li>ชิ้นงานที่ติดกาวจะเห็นคราบกาวบ้าง และตำแหน่งจุดที่ติดกาวอาจคลาดเคลื่อนจากแบบเล็กน้อย</li>",
  "</ul>",
].join("\n");

p.tabs = p.tabs ?? [];
const pt = p.tabs.findIndex((t) => t.title === PRICE_TAB_TITLE);
const priceTab = {
  title: PRICE_TAB_TITLE,
  text: priceTabText, // สำรองไว้เผื่อ html หาย — หน้าเว็บใช้ html ก่อนเสมอ
  html: priceTabHtml,
  images: [PRICE_SHEET_URL],
  imagePos: "top", // ใบราคาอยู่บนสุด เห็นภาพรวมก่อน แล้วค่อยอ่านตัวเลขแยกข้อ
  imageSize: "lg", // เต็มความกว้าง — ใบราคาเป็นแนวนอน ตัวหนังสือเล็ก ย่อกว่านี้อ่านไม่ออก
  imageAlign: "center",
};
if (pt >= 0) {
  if (JSON.stringify({ ...p.tabs[pt], ...priceTab }) !== JSON.stringify(p.tabs[pt])) {
    p.tabs[pt] = { ...p.tabs[pt], ...priceTab };
    texts.push(`tabs[${PRICE_TAB_TITLE}] (อัปเดตเนื้อหา/ใบราคา)`);
  }
} else {
  const after = p.tabs.findIndex((t) => t.title === "รายละเอียดเพิ่มเติม");
  p.tabs.splice(after >= 0 ? after + 1 : p.tabs.length, 0, priceTab);
  texts.push(`tabs: เพิ่มแท็บ "${PRICE_TAB_TITLE}"`);
}

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
