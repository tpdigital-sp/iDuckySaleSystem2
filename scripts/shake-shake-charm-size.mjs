/**
 * Shake Shake Acrylic (พวงกุญแจเขย่า) — ตัวน้อยเขย่า "ขนาดพิเศษ" (ผู้ใช้สั่ง 26 ส.ค. 69)
 *
 * ที่มาของโจทย์ (สั่งมา 3 รอบ ปรับทีละสเต็ป):
 *   รอบ 1 — ตัวน้อยเพิ่มขนาดได้ ซม. ละ 10 บาท · กรอกจำนวนเองได้ · มีปุ่มเปิด-ปิด
 *   รอบ 2 — ปุ่มเปิด-ปิดต้องอยู่ที่แถวเพิ่มขนาด ไม่ใช่คร่อมทั้งกลุ่มตัวน้อยเขย่า → แยกเป็นกลุ่มของตัวเอง
 *           (ระบบมี collapsible แค่ระดับกลุ่ม — แพตเทิร์นเดียวกับ acrylic-dookdik / Acrylic Kit)
 *   รอบ 3 — ขนาดกับจำนวนต้องอิสระจากแถว 2-2.5 ซม. และ "เลือกได้หลายขนาด หลายจำนวน"
 *           → เลิกใช้ช่องกรอก ซม. ช่องเดียว เปลี่ยนเป็น **บันไดขนาด 3/4/5/6 ซม. แถวละ 1 ขนาด
 *             ระบุจำนวน "ตัว" ของตัวเอง** ติ๊กพร้อมกันหลายขนาดได้
 *
 * วิธีคิดเงิน (ผู้ใช้เลือก "แถวขนาด = ตัวน้อยเต็มตัว" 26 ส.ค. 69):
 *   ราคาแต่ละแถว = ค่าตัวน้อยมาตรฐาน + ค่าเพิ่มขนาด (ซม. ละ 10 นับจาก 2.5 ซม. ปัดขึ้น)
 *   → ตัวใหญ่ **ไม่ต้องนับซ้ำ** ในแถว 2-2.5 ซม. · ค่าตัวน้อยมาตรฐานอ่านสดจากแถวนั้น (20 ปลีก / 15 ส่ง)
 *     จึงเลื่อนตามเมื่อราคาตารางเปลี่ยน — ไม่ต้องแก้เลขในสคริปต์
 *
 *   ปลีก 1-10 ชุด: 3 ซม. 30 · 4 ซม. 40 · 5 ซม. 50 · 6 ซม. 60
 *   ส่ง 11+ ชุด:   3 ซม. 25 · 4 ซม. 35 · 5 ซม. 45 · 6 ซม. 55
 *   (ตั้ง extraFromQty = 11 ที่กลุ่ม + extra/extraBelow ที่ตัวเลือก — ชุดเดียวกับแถว 2-2.5 ซม.)
 *
 * ⚠️ ห้ามยุบกลับไปรวมกับกลุ่ม "ตัวน้อยเขย่า": สวิตช์ต้องอยู่ที่กลุ่มขนาดพิเศษเท่านั้น (ผู้ใช้สั่งรอบ 2)
 *
 *   node scripts/shake-shake-charm-size.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/shake-shake-charm-size.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2rp5i3-9488";
const CHARM_GROUP = "ตัวน้อยเขย่า";
const CHARM_STD = "ตัวน้อยเขย่า ขนาด 2-2.5 ซม."; // แถวมาตรฐาน (อ่านราคาฐานจากตรงนี้)
const SIZE_GROUP = "ตัวน้อยเขย่า ขนาดพิเศษ"; // ชื่อนี้ = ข้อความบนแถวสวิตช์ตอนปิดอยู่
const STD_CM = 2.5; // ขนาดมาตรฐานสูงสุด — ส่วนที่เกินคิด ซม. ละ PER_CM (ปัดขึ้นเต็ม ซม.)
const PER_CM = 10;
const SIZES = [3, 4, 5, 6]; // ผู้ใช้เลือกช่วงถึง 6 ซม. (เท่ากับขนาดกรอบเริ่มต้น)
const QTY_MAX = 20; // จำนวนตัวสูงสุดต่อขนาด
const RETAIL_FROM_QTY = 11; // 1-10 ชุด = เรทปลีก · 11+ = เรทส่ง (ชุดเดียวกับกลุ่มตัวน้อย)

// ประโยคท้าย note ของกลุ่มตัวน้อยเขย่า — ของรอบก่อน ๆ ต้องถูกถอดก่อนใส่ของรอบนี้ (รันซ้ำได้)
const OLD_NOTE_TAILS = [
  " · อยากได้ตัวน้อยใหญ่กว่ามาตรฐาน ติ๊ก **เพิ่มขนาดตัวน้อย** แล้วระบุจำนวน ซม. ที่เพิ่มจาก 2.5 ซม. (**ซม. ละ 10 บาท** คิดต่อ 1 ชุด) เช่น อยากได้ตัวน้อย 4 ซม. = เพิ่ม 1.5 ซม. ปัดเป็น 2 ซม.",
];
const NOTE_TAIL = ` · อยากได้ตัวน้อยใหญ่กว่านี้ เปิดสวิตช์ **${SIZE_GROUP}** ด้านล่าง (เลือกได้หลายขนาด แยกจำนวนของใครของมัน)`;

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

// ⚠️ ชื่อกลุ่มต้องไม่ชนแกนตารางราคา (ดู [[iducky-price-driver-trap]])
const drivers = new Set(
  [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].flatMap((p) => p?.driverLabels ?? [])
);
if (drivers.has(SIZE_GROUP)) throw new Error(`❌ "${SIZE_GROUP}" ชนกับแกนตารางราคา — เปลี่ยนชื่อกลุ่ม`);

const charm = opts.find((o) => o.label === CHARM_GROUP);
if (!charm) throw new Error(`❌ ไม่เจอกลุ่ม "${CHARM_GROUP}" ในสินค้า ${ID}`);
const std = charm.choices.find((c) => c.name === CHARM_STD);
if (!std) throw new Error(`❌ ไม่เจอแถว "${CHARM_STD}" — ราคาฐานตัวน้อยเปลี่ยนชื่อ? เช็คก่อนรัน`);
// ราคาฐานตัวน้อยอ่านสดจากแถวมาตรฐาน (จะได้เลื่อนตามเมื่อตารางเว็บเปลี่ยน)
const BASE_WS = std.extra ?? 0; // เรทส่ง 11+ ชุด
const BASE_RT = std.extraBelow ?? BASE_WS; // เรทปลีก 1-10 ชุด
if (!BASE_WS || !BASE_RT) throw new Error("❌ อ่านราคาฐานตัวน้อยไม่ได้ (extra/extraBelow ว่าง)");
if ((charm.extraFromQty ?? 0) !== RETAIL_FROM_QTY)
  throw new Error(`❌ กลุ่ม "${CHARM_GROUP}" extraFromQty = ${charm.extraFromQty} ไม่ใช่ ${RETAIL_FROM_QTY} — เรทเปลี่ยน เช็คก่อน`);

const overCm = (cm) => Math.ceil(cm - STD_CM); // ซม. ที่เกินมาตรฐาน ปัดขึ้นเต็ม ซม.
const SIZE_OPTION = {
  label: SIZE_GROUP,
  display: "multi",
  collapsible: true, // 🔘 สวิตช์อยู่ที่กลุ่มนี้ = อยู่ที่แถวขนาดพิเศษพอดี (ผู้ใช้สั่งรอบ 2)
  extraFromQty: RETAIL_FROM_QTY,
  note:
    `ตัวน้อยที่ใหญ่กว่ามาตรฐาน 2-2.5 ซม. — **ติ๊กได้หลายขนาดพร้อมกัน แต่ละขนาดระบุจำนวนตัวของตัวเอง** ` +
    `เช่น 4 ซม. 2 ตัว + 6 ซม. 1 ตัว · **ราคาที่เห็นคือราคาต่อตัวเต็ม ๆ แล้ว** (ค่าตัวน้อย + ค่าเพิ่มขนาด ซม. ละ ${PER_CM} บาท) ` +
    `จึง **ไม่ต้องนับซ้ำในแถว 2-2.5 ซม.** · ราคาสลับเรทปลีก/ส่งตามจำนวนชุดเหมือนตัวน้อยมาตรฐาน`,
  choices: SIZES.map((cm) => ({
    name: `ตัวน้อย ${cm} ซม.`,
    qty: true,
    qtyUnit: "ตัว",
    qtyMax: QTY_MAX,
    extra: BASE_WS + PER_CM * overCm(cm),
    extraBelow: BASE_RT + PER_CM * overCm(cm),
  })),
};

const log = [];

/* 1) กลุ่มตัวน้อยเขย่า — ไม่มีสวิตช์ · ไม่มีตัวเลือกเพิ่มขนาดปนอยู่ · note ชี้ทางไปกลุ่มใหม่ */
if (charm.collapsible) { delete charm.collapsible; log.push(`ถอด collapsible ออกจากกลุ่ม "${CHARM_GROUP}"`); }
const had = charm.choices.length;
charm.choices = charm.choices.filter((c) => c.name === CHARM_STD);
if (charm.choices.length !== had) log.push(`ถอดตัวเลือกเพิ่มขนาดแบบเก่าออกจากกลุ่ม "${CHARM_GROUP}" (${had} → ${charm.choices.length} แถว)`);
const noteWas = charm.note ?? "";
let note = noteWas;
for (const t of [...OLD_NOTE_TAILS, NOTE_TAIL]) note = note.split(t).join("");
charm.note = note + NOTE_TAIL;
if (charm.note !== noteWas) log.push(`อัปข้อความ note ของกลุ่ม "${CHARM_GROUP}" ให้ชี้ไปกลุ่มขนาดพิเศษ`);

/* 2) กลุ่มขนาดพิเศษ — สร้าง/อัปทับ วางต่อจากกลุ่มตัวน้อยเขย่าทันที */
const at = opts.findIndex((o) => o.label === SIZE_GROUP);
if (at >= 0) {
  opts[at] = SIZE_OPTION;
  log.push(`อัปทับกลุ่ม "${SIZE_GROUP}" (ตำแหน่งเดิม #${at + 1})`);
} else {
  const pos = opts.indexOf(charm) + 1;
  opts.splice(pos, 0, SIZE_OPTION);
  log.push(`เพิ่มกลุ่ม "${SIZE_GROUP}" ที่ตำแหน่ง #${pos + 1} (ต่อจาก "${CHARM_GROUP}")`);
}
// กลุ่มเพิ่มขนาดของรอบก่อน (ช่องกรอก ซม. ช่องเดียว) ถ้ายังค้างอยู่ ให้ถอดทิ้ง
const stale = opts.findIndex((o) => o.label === "เพิ่มขนาดตัวน้อยเขย่า");
if (stale >= 0) { opts.splice(stale, 1); log.push('ถอดกลุ่มเก่า "เพิ่มขนาดตัวน้อยเขย่า" (ช่องกรอก ซม. ช่องเดียว) ทิ้ง'); }

log.forEach((l) => console.log("•", l));
if (!log.length) console.log("• ไม่มีอะไรต้องแก้");
console.log(`\n  ราคาฐานตัวน้อยที่อ่านได้: ปลีก ${BASE_RT} · ส่ง ${BASE_WS} บาท/ตัว`);
console.log(`  บันไดขนาดพิเศษ (ปัดขึ้นจาก ${STD_CM} ซม. · ซม. ละ ${PER_CM}):`);
for (const c of SIZE_OPTION.choices)
  console.log(`    ${c.name.padEnd(16)} เกิน ${overCm(+c.name.match(/[\d.]+/)[0])} ซม. → ปลีก ${c.extraBelow} · ส่ง ${c.extra} บาท/ตัว`);
console.log(`\n  ลำดับกลุ่ม: ${opts.map((o) => o.label).join(" › ")}`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
