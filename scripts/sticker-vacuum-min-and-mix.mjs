#!/usr/bin/env node
/**
 * สติ๊กเกอร์สูญญากาศ (sticker-vacuum) — ขั้นต่ำ 20 ชิ้น + กติกาคละลาย 5 ชิ้น/ลาย
 *
 *   node scripts/sticker-vacuum-min-and-mix.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/sticker-vacuum-min-and-mix.mjs --write
 *
 * ผู้ใช้สั่ง 26 ส.ค. 69:
 *   1. ราคาพิมพ์ 2 ด้าน บวกเพิ่มตามขนาด (6-8 +3 · 9-11 +5 · 12-13 +8 · 14-15 +10 · >15 ซม.ละ 2.5)
 *      → ส่วนต่างนี้ฝังอยู่ในตารางราคาทุกช่วงจำนวนอยู่แล้ว สคริปต์เช็คซ้ำทุกช่อง ไม่ตรง = หยุด
 *   2. เริ่มต้นสั่ง 20 ชิ้น → เดิมเป็นแค่ "ช่วงราคาแรก" หน้าเว็บยังกดลงไป 1 ชิ้นได้
 *      สินค้าตัวนี้ยังไม่มี priceRates เลย (ใช้ pricing เดี่ยว) จึงห่อตารางเดิมเป็นเรทที่ 1
 *      แล้วตั้ง minQty=20 + hardMinQty → ช่องจำนวนเริ่มที่ 20 กดลดต่ำกว่านี้ไม่ได้
 *   3. คละลาย 1 ลายต่อ 5 ชิ้น เกินจากนั้นลายละ 5 บาท → minPerDesign=5 + extraDesignFee=5
 *      (ไม่บล็อก — จ่ายเพิ่มเพื่อคละเกินโควตาได้ เหมือน Photo card pvc)
 *   + แก้ข้อความ terms / รายละเอียดเพิ่มเติม / วิธีสั่งงาน / คำโปรย ให้ตรงกติกาใหม่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticker-vacuum";
const EXPECT_NAME = "สติ๊กเกอร์สูญญากาศ";
const MIN_QTY = 20;
const PER_DESIGN = 5;
const DESIGN_FEE = 5;
/** ส่วนต่าง "พิมพ์ 2 ด้าน − พิมพ์ 1 ด้าน" ที่ต้องเป็นจริงทุกช่วงจำนวน (บาท/ชิ้น) */
const SIDE2_DIFF = { 6: 3, 7: 3, 8: 3, 9: 5, 10: 5, 11: 5, 12: 8, 13: 8, 14: 10, 15: 10 };

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const { data: rows, error } = await sb.from("products").select("*").eq("id", ID);
if (error) die(error.message);
const row = rows?.[0];
if (!row) die(`ไม่พบสินค้า id=${ID}`);
if (row.name !== EXPECT_NAME) die(`ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
const d = row.data;

// ── 1. ตรวจส่วนต่างพิมพ์ 2 ด้านในตารางราคา (ไม่แก้ตัวเลข แค่ยืนยันว่าตรงที่สั่ง) ──
const cells = d.pricing?.cells;
if (!cells) die("ไม่พบ pricing.cells");
console.log("ส่วนต่างพิมพ์ 2 ด้าน (ทุกช่วงจำนวน):");
for (const [cm, want] of Object.entries(SIDE2_DIFF)) {
  const one = cells[`${cm}×${cm} ซม.│พิมพ์ 1 ด้าน`];
  const two = cells[`${cm}×${cm} ซม.│พิมพ์ 2 ด้าน`];
  if (!one || !two) die(`ไม่พบแถวราคาขนาด ${cm}×${cm} ซม.`);
  const got = [...new Set(one.map((v, i) => +(two[i] - v).toFixed(2)))];
  if (got.length !== 1 || got[0] !== want) die(`ขนาด ${cm} ซม. ส่วนต่างควรเป็น +${want} แต่ได้ ${got.join("/")}`);
  console.log(`  ${cm}×${cm} ซม. → +${want} บาท/ชิ้น ✓`);
}

// ── 2. ขั้นต่ำ 20 ชิ้น — ห่อตารางเดิมเป็นเรทที่ 1 (สินค้านี้ยังไม่มี priceRates) ──
const rates = d.priceRates ?? [];
const r1 = rates[0] ?? { id: "r1", label: "เรทที่ 1" };
r1.pricing = d.pricing;
r1.minQty = MIN_QTY;
// ── 3. คละลาย 5 ชิ้น/ลาย · เกินโควตาลายละ 5 บาท (ไม่บล็อก) ──
r1.minPerDesign = PER_DESIGN;
r1.extraDesignFee = DESIGN_FEE;
d.priceRates = [r1, ...rates.slice(1)];
d.hardMinQty = true;
// pricing ระดับสินค้าคือตารางของเรทแรกเสมอ — ต้องไม่หลุดจากกัน
d.pricing = r1.pricing;

// ── 4. ข้อความให้ตรงกติกาใหม่ ──
const TERMS_OLD = "สั่งขั้นต่ำ 20 ชิ้น (ช่วงราคาแรกของเว็บคือ 20-30 ชิ้น)";
const TERMS_NEW =
  "สั่งขั้นต่ำ 20 ชิ้น (ช่วงราคาแรกของเว็บคือ 20-30 ชิ้น) · คละลายได้ 5 ชิ้นต่อ 1 ลาย เกินจากนั้นคิดเพิ่มลายละ 5 บาท";
if (d.terms?.includes(TERMS_NEW)) console.log("\nterms: ตรงอยู่แล้ว");
else if (d.terms?.includes(TERMS_OLD)) d.terms = d.terms.replace(TERMS_OLD, TERMS_NEW);
else die(`ไม่พบบรรทัด terms เดิมที่คาด — เช็คข้อความก่อนเขียนทับ:\n${d.terms}`);

const tabBy = (t) => (d.tabs ?? []).find((x) => x.title === t);

// แท็บรายละเอียดเพิ่มเติม — แทรกหัวข้อ "จำนวนสั่ง / คละลาย" ก่อนหัวข้อขนาดใหญ่กว่า 15 ซม.
const tDetail = tabBy("รายละเอียดเพิ่มเติม");
if (!tDetail) die('ไม่พบแท็บ "รายละเอียดเพิ่มเติม"');
const MIX_BLOCK =
  "จำนวนสั่ง / คละลาย::\n" +
  "• สั่งขั้นต่ำ 20 ชิ้น\n" +
  "• คละลายได้ 5 ชิ้นต่อ 1 ลาย — สั่ง 20 ชิ้น คละได้ 4 ลาย · 50 ชิ้น คละได้ 10 ลาย · 100 ชิ้น คละได้ 20 ลาย\n" +
  "• อยากคละมากกว่าโควตา คิดเพิ่มลายละ 5 บาท (ไม่ต้องเพิ่มจำนวนสั่ง)\n\n";
const ANCHOR = "ขนาดใหญ่กว่า 15 ซม.::";
if (tDetail.text.includes("จำนวนสั่ง / คละลาย::")) console.log("แท็บรายละเอียด: มีหัวข้อคละลายแล้ว");
else if (tDetail.text.includes(ANCHOR)) tDetail.text = tDetail.text.replace(ANCHOR, MIX_BLOCK + ANCHOR);
else die(`ไม่พบหัวข้อ "${ANCHOR}" ในแท็บรายละเอียดเพิ่มเติม`);

// แท็บวิธีสั่งงาน — เติมบรรทัดคละลายต่อจากบรรทัดใส่จำนวน
const tHow = tabBy("วิธีสั่งงาน");
if (!tHow) die('ไม่พบแท็บ "วิธีสั่งงาน"');
const HOW_OLD = "• เลือกขนาด → เลือกพิมพ์ 1 ด้าน หรือ 2 ด้าน → ใส่จำนวน (ขั้นต่ำ 20 ชิ้น)";
const HOW_NEW =
  HOW_OLD + "\n• คละลายได้ 5 ชิ้นต่อ 1 ลาย (สั่ง 20 ชิ้น = คละได้ 4 ลาย) เกินจากนั้นคิดเพิ่มลายละ 5 บาท";
if (tHow.text.includes(HOW_NEW.split("\n")[1])) console.log("แท็บวิธีสั่งงาน: มีบรรทัดคละลายแล้ว");
else if (tHow.text.includes(HOW_OLD)) tHow.text = tHow.text.replace(HOW_OLD, HOW_NEW);
else die('ไม่พบบรรทัด "ใส่จำนวน (ขั้นต่ำ 20 ชิ้น)" ในแท็บวิธีสั่งงาน');

// คำโปรยหน้าสินค้า
const DESC_TAIL = " · สั่งขั้นต่ำ 20 ชิ้น คละลายได้ 5 ชิ้นต่อ 1 ลาย";
if (!d.description.includes(DESC_TAIL.trim())) d.description += DESC_TAIL;

d.savedAt = new Date().toISOString();

console.log(`\nขั้นต่ำ: ${MIN_QTY} ${d.pricing.unit} (hardMinQty = ช่องจำนวนเริ่มที่ ${MIN_QTY} กดลดต่ำกว่านี้ไม่ได้)`);
console.log(`คละลาย: ${PER_DESIGN} ชิ้น/ลาย · เกินโควตาลายละ ${DESIGN_FEE} บาท`);
console.log(`เรทราคา: ${d.priceRates.length} เรท (${d.priceRates.map((r) => r.label).join(", ")}) — เรทเดียว หน้าเว็บไม่โชว์แผงเลือกเรท`);
console.log(`terms: ${d.terms.split("\n").find((l) => l.includes("คละลาย"))}`);

if (!WRITE) {
  console.log("\n(dry-run — เติม --write เพื่อเขียนจริง)");
  process.exit(0);
}

const { data: wrote, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (e2) die(e2.message);
if (!wrote?.length) die("update ไม่โดนแถวไหนเลย (0 rows) — เช็ค id/สิทธิ์");

// อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
const { data: back } = await sb.from("products").select("data").eq("id", ID);
const b = back[0].data;
const br = b.priceRates?.[0];
const ok =
  b.hardMinQty === true &&
  br?.minQty === MIN_QTY &&
  br?.minPerDesign === PER_DESIGN &&
  br?.extraDesignFee === DESIGN_FEE &&
  Object.keys(br?.pricing?.cells ?? {}).length === Object.keys(b.pricing?.cells ?? {}).length &&
  b.terms.includes(TERMS_NEW) &&
  b.tabs.find((t) => t.title === "รายละเอียดเพิ่มเติม").text.includes("จำนวนสั่ง / คละลาย::");
console.log(
  `อ่านกลับ: hardMinQty=${JSON.stringify(b.hardMinQty)} · minQty=${br?.minQty} · minPerDesign=${br?.minPerDesign} · extraDesignFee=${br?.extraDesignFee} · ช่องราคาในเรท=${Object.keys(br?.pricing?.cells ?? {}).length} · terms ${b.terms.includes(TERMS_NEW) ? "ใหม่แล้ว" : "❌ ยังเก่า"}`
);
if (!ok) die("เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง — ยังไม่เสร็จ");
console.log("✓ เขียน Supabase แล้ว (ยืนยันจากการอ่านกลับ)");
