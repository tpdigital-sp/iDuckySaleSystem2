/**
 * พวงกุญแจอะคริลิค (keyring-copy-copy) — "ติ่งห้อย" (ผู้ใช้สั่ง 26 ส.ค. 69 · ปรับ 3 รอบ)
 *
 * รอบ 1 — เพิ่มติ่งห้อย ใช้ตรรกะราคาชุดเดียวกับ Griptok อะคริลิค + เลือกจำนวน/ขนาดได้
 * รอบ 2 — เพดาน: ขนาดไม่เกิน 10 ซม. · จำนวนไม่เกิน 5 ชิ้น
 * รอบ 3 — หน้าตาต้องเป็น "แบบภาพที่ 1" = ทรงเดียวกับ Shake Shake กลุ่มตัวน้อยขนาดพิเศษ:
 *         **แถวละ 1 ขนาด ระบุจำนวนของตัวเอง ติ๊กพร้อมกันหลายขนาดได้ · ราคาบนแถวคือราคาเต็มต่อชิ้นแล้ว**
 *         → เลิกแยกเป็น 2 กลุ่ม (ติ่งห้อย + ขนาดติ่งห้อย) รวมเหลือกลุ่มเดียว
 *
 * ราคาต่อติ่งห้อย 1 ชิ้น = ค่าติ่งห้อยตามขั้นจำนวน + ค่าเพิ่มขนาด (ซม. ละ 10 นับจากมาตรฐาน 2 ซม.)
 *   ขั้นจำนวน (นับต่อลาย เพราะสินค้านี้ tierByDesign เหมือน Griptok):
 *     1-10 ชิ้น 20 · 11-29 ชิ้น 15 · 30 ชิ้นขึ้นไป 12
 *   → 2 ซม. 20/15/12 · 3 ซม. 30/25/22 · … · 10 ซม. 100/95/92
 *
 * ⚠️ ทำไมต้องมีกลไกใหม่ extraSmall/extraSmallUpToQty (เพิ่มใน products.ts รอบนี้):
 *    ของเดิม +฿ ต่อตัวเลือกมีแค่ 2 ขั้น (extraBelow / extra ตัดที่ extraFromQty)
 *    ขั้นที่ 3 ของ Griptok ใช้ smallQtyFee ซึ่งเป็น "เลขเหมาเลขเดียวทั้งกลุ่ม คิดแทนราคาตัวเลือก"
 *    พอแถวแต่ละขนาดราคาไม่เท่ากัน ค่าเหมาจะกลืนส่วนต่างขนาดหายทั้งช่วง 1-10 ชิ้น
 *    → เติมขั้นที่ 3 แบบตั้งราคาแยกได้ทุกแถวแทน (smallQtyFee ของกลุ่มนี้ถูกถอดทิ้งแล้ว)
 *
 * ⚠️ ไม่ใส่ imageSrc ให้ตัวเลือก — รูปติ่งห้อยที่มีในระบบเป็นรูป Griptok (griptok-acrylic/charm-1.jpg)
 *    แกลเลอรีหน้าสินค้าดูดรูปตัวเลือกเข้ามาเอง จะกลายเป็นรูป Griptok โผล่ในหน้าพวงกุญแจ
 *
 *   node scripts/keyring-charm-addon.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/keyring-charm-addon.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-copy-copy"; // slug "keyring" — https://iduckystore.com/products/keyring
const GROUP = "ติ่งห้อย";
const OLD_SIZE_GROUP = "ขนาดติ่งห้อย"; // กลุ่มแยกของรอบก่อน — รอบนี้ยุบรวม ต้องถอดทิ้ง

const FEE_SMALL = 20; // 1-10 ชิ้น
const SMALL_UPTO = 10;
const FEE_MID = 15; // 11-29 ชิ้น
const FEE_BIG = 12; // 30 ชิ้นขึ้นไป
const TIER_FROM = 30;

const BASE_CM = 2; // ติ่งห้อยมาตรฐานตามตารางร้าน (ราคาข้างบนคือของขนาดนี้)
const MAX_CM = 10; // เพดานขนาด
const PER_CM = 10; // ใหญ่กว่ามาตรฐาน คิดเพิ่ม ซม. ละ 10 บาท
const QTY_MAX = 5; // เพดานจำนวนต่อแถว (ต่อพวงกุญแจ 1 อัน)

// บรรทัดติ่งห้อยในแท็บ Add-on — จับด้วย "ขึ้นต้นบรรทัดว่า" แล้วเขียนทับทั้งบรรทัด
// (ไม่จับข้อความเต็ม ๆ เพราะเพดานขนาด/จำนวนถูกปรับได้เรื่อย ๆ รันรอบหน้าจะไม่ตรงกับของที่เขียนไว้รอบก่อน)
const TERMS_HEAD = "• ส่วนเสริมติ่งห้อย";
const TERMS_NEW =
  `${TERMS_HEAD} (มาตรฐาน ${BASE_CM}cm): 1-${SMALL_UPTO} ชิ้น ${FEE_SMALL}.- / 11-${TIER_FROM - 1} ชิ้น ${FEE_MID}.- / ${TIER_FROM} ชิ้นขึ้นไป ${FEE_BIG}.- ` +
  `(เรทที่ 2 สั่ง 50 ชิ้นขึ้นไป = ${FEE_BIG}.-) · ใหญ่กว่า ${BASE_CM}cm คิดเพิ่ม cm ละ ${PER_CM}.- สูงสุด ${MAX_CM}cm · ` +
  `เลือกได้หลายขนาด แต่ละขนาดระบุจำนวนเอง (สูงสุดขนาดละ ${QTY_MAX} ชิ้นต่อพวงกุญแจ 1 อัน)`;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const data = row.data;
const opts = (data.options ??= []);

// ⚠️ ชื่อกลุ่มต้องไม่ชนแกนตารางราคา (ดู [[iducky-price-driver-trap]]) — "ขนาด" เป็นแกนอยู่แล้ว
const drivers = new Set(
  [data.pricing, ...(data.priceRates ?? [])].flatMap((p) => p?.pricing?.driverLabels ?? p?.driverLabels ?? [])
);
if (drivers.has(GROUP)) throw new Error(`❌ "${GROUP}" ชนกับแกนตารางราคา (${[...drivers].join(", ")}) — เปลี่ยนชื่อกลุ่ม`);

/* แถวละ 1 ขนาด · ราคาบนแถว = ราคาเต็มต่อติ่งห้อย 1 ชิ้น (ค่าติ่งห้อย + ค่าเพิ่มขนาด) */
const overCm = (cm) => cm - BASE_CM;
const choices = [];
for (let cm = BASE_CM; cm <= MAX_CM; cm++) {
  choices.push({
    name: cm === BASE_CM ? `ติ่งห้อย ${cm} ซม. (มาตรฐาน)` : `ติ่งห้อย ${cm} ซม.`,
    qty: true,
    qtyUnit: "ชิ้น",
    qtyMax: QTY_MAX,
    extraSmall: FEE_SMALL + PER_CM * overCm(cm), // 1-10 ชิ้น
    extraBelow: FEE_MID + PER_CM * overCm(cm), // 11-29 ชิ้น
    extra: FEE_BIG + PER_CM * overCm(cm), // 30 ชิ้นขึ้นไป
  });
}

const CHARM_OPTION = {
  label: GROUP,
  display: "multi",
  collapsible: true, // 🔘 ของเสริม — ปิดไว้ก่อน (ปิดสวิตช์ = ล้างที่ติ๊ก)
  extraSmallUpToQty: SMALL_UPTO,
  extraFromQty: TIER_FROM,
  note:
    `อะคริลิคตัวเล็ก ๆ ห้อยด้านข้างพวงกุญแจ · **ติ๊กได้หลายขนาดพร้อมกัน แต่ละขนาดระบุจำนวนชิ้นของตัวเอง** ` +
    `(ขนาดละไม่เกิน ${QTY_MAX} ชิ้น ต่อพวงกุญแจ 1 อัน) · **ราคาที่เห็นคือราคาเต็มต่อติ่งห้อย 1 ชิ้นแล้ว** ` +
    `(ค่าติ่งห้อย + ค่าเพิ่มขนาด ซม. ละ ${PER_CM} บาท นับจากมาตรฐาน ${BASE_CM} ซม.) · ` +
    `ราคาสลับตามจำนวนพวงกุญแจที่สั่งต่อลาย: 1-${SMALL_UPTO} ชิ้น · 11-${TIER_FROM - 1} ชิ้น · ${TIER_FROM} ชิ้นขึ้นไป ถูกลงตามลำดับ`,
  choices,
};

const log = [];

/* กลุ่มขนาดแยกของรอบก่อน — ยุบรวมมาไว้ในกลุ่มเดียวแล้ว ถอดทิ้ง */
const oldAt = opts.findIndex((o) => o.label === OLD_SIZE_GROUP);
if (oldAt >= 0) {
  opts.splice(oldAt, 1);
  log.push(`ถอดกลุ่มเก่า "${OLD_SIZE_GROUP}" (ยุบรวมเข้ากลุ่ม "${GROUP}" แล้ว)`);
}

/* กลุ่มติ่งห้อย — รันซ้ำได้ เจอแล้วอัปทับที่เดิม ไม่เจอก็ต่อท้ายรายการ */
const at = opts.findIndex((o) => o.label === GROUP);
if (at >= 0) {
  const same = JSON.stringify(opts[at]) === JSON.stringify(CHARM_OPTION);
  opts[at] = CHARM_OPTION;
  log.push(same ? `กลุ่ม "${GROUP}" เหมือนเดิม (#${at + 1})` : `อัปทับกลุ่ม "${GROUP}" (#${at + 1})`);
} else {
  opts.push(CHARM_OPTION);
  log.push(`เพิ่มกลุ่ม "${GROUP}" ท้ายรายการ (#${opts.length})`);
}

/* แท็บ Add-on — เขียนบรรทัดติ่งห้อยใหม่ให้ตรงราคา/กติกาปัจจุบัน */
let termsHit = 0;
for (const tab of data.tabs ?? []) {
  if (typeof tab.text !== "string") continue;
  const lines = tab.text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(TERMS_HEAD));
  if (i < 0) continue;
  lines[i] = TERMS_NEW;
  tab.text = lines.join("\n");
  termsHit++;
}
log.push(termsHit ? `แท็บ Add-on: เขียนบรรทัดติ่งห้อยใหม่ (${termsHit} ที่)` : "⚠️ แท็บ Add-on: ไม่เจอบรรทัดติ่งห้อย — เช็คเอง");

log.forEach((l) => console.log("•", l));
console.log(`\n  บันไดราคาต่อติ่งห้อย 1 ชิ้น (1-${SMALL_UPTO} / 11-${TIER_FROM - 1} / ${TIER_FROM}+ ชิ้นต่อลาย):`);
for (const c of choices)
  console.log(`    ${c.name.padEnd(26)} ${String(c.extraSmall).padStart(3)} · ${String(c.extraBelow).padStart(3)} · ${String(c.extra).padStart(3)} บาท`);
console.log(`\n  ตัวอย่าง: สั่ง 5 ชิ้น · ติ่งห้อย 3 ซม. 2 ชิ้น + 6 ซม. 1 ชิ้น → ${30 * 2} + ${60} = ${30 * 2 + 60} บาท/พวงกุญแจ`);
console.log(`  ลำดับกลุ่ม (ท้าย ๆ): ${opts.slice(-3).map((o) => o.label).join(" › ")}`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
