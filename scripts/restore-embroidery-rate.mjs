/**
 * คืนเรทราคา "งานปัก" ให้สินค้าเสื้อ 4 ตัว
 *
 *   node scripts/restore-embroidery-rate.mjs            # ดูว่าจะเขียนอะไร (ไม่เขียนจริง)
 *   node scripts/restore-embroidery-rate.mjs --write    # เขียนลง Supabase
 *
 * ทำไมต้องมีสคริปต์นี้ — เรท "งานปัก" หายจากฐานข้อมูลทั้ง 4 ตัว เพราะหน้าแก้ไขสินค้า
 * (ProductEditor) ประกอบตารางราคาของ "ทุกเรท" ขึ้นใหม่จากแกนของเรทหลักเสมอ
 * (pricingColumns(draft.options, draft.pricing.driverLabels)) เรทปักใช้แกนของตัวเอง
 * ("ขนาดปัก ด้านหน้า") คีย์จึงไม่ตรงสักช่อง → ตารางว่าง → เรทถูกตัดทิ้งเงียบ ๆ ตอนกดบันทึก
 * แก้ที่โค้ดแล้วใน ProductEditor (เก็บ driverLabels ของแต่ละเรท + ไม่ตัดเรททิ้งถ้าประกอบใหม่ไม่ได้)
 * สคริปต์นี้แตะเฉพาะ data.priceRates — ไม่ยุ่งกับตัวเลือก/แท็บ/ภาพ ที่ทีมงานแก้ไว้หลังจากนั้น
 *
 * ราคาปักมาจากตารางบนเว็บร้าน (iduckyofficial-pricelists.com/tshirtprinting)
 * ชุดเดียวกับที่สคริปต์สร้างสินค้าแต่ละตัวใช้ (add-oversize / add-crop / add-yuedpao-blank / awesome-bkk-apply)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

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

const IMG = (dir, file) =>
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/${dir}/${file}`;

const UNIT = "ตัว";
const EMB_LABEL = "ขนาดปัก ด้านหน้า";
const RATE_EMB = "งานปัก";
const EMB_DESC = "ปักด้ายลงเนื้อผ้าโดยตรง ผิวสัมผัสนูน ดูพรีเมียม ทนทานที่สุด";
const E10 = "ไม่เกิน 10 ซม.";
const E15 = "ไม่เกิน 15 ซม.";
const E20 = "ไม่เกิน 20 ซม.";
/** ทั้ง 4 ตัวใช้ช่วงจำนวนชุดเดียวกันในตารางปัก (แม้เรทพิมพ์ของบางตัวจะมีช่วงต่างออกไป) */
const TIERS = [
  { upTo: 10, label: "1-10 ตัว" },
  { upTo: 29, label: "11-29 ตัว" },
  { upTo: 49, label: "30-49 ตัว" },
  { upTo: null, label: "50 ตัวขึ้นไป" },
];

const TARGETS = [
  {
    id: "oversize",
    expect: "เสื้อ OVER SIZE",
    imageSrc: IMG("oversize", "rate-emb.jpg"),
    cells: { [E10]: [650, 620, 580, 560], [E15]: [850, 820, 780, 760], [E20]: [1050, 1020, 980, 960] },
  },
  {
    id: "crop",
    expect: "เสื้อ CROP",
    imageSrc: IMG("crop", "rate-emb.jpg"),
    cells: { [E10]: [370, 340, 310, 300], [E15]: [570, 540, 510, 500] },
  },
  {
    id: "new-mt2eng6u-7593",
    expect: "เสื้อยี่ห้อ AWESOME.BKK",
    imageSrc: IMG("awesome-bkk", "rate-emb-v1.jpg"),
    cells: { [E10]: [650, 620, 580, 560], [E15]: [850, 820, 780, 760], [E20]: [1050, 1020, 980, 960] },
  },
  {
    id: "yuedpao-blank",
    expect: "เสื้อ Unisex YUEDPAO (ยืดเปล่า)",
    imageSrc: IMG("yuedpao-blank", "rate-emb.jpg"),
    cells: { [E10]: [450, 420, 380, 360], [E15]: [650, 620, 580, 560], [E20]: [850, 820, 780, 760] },
  },
];

let changed = 0;
for (const t of TARGETS) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", t.id).maybeSingle();
  if (error || !row) {
    console.log(`❌ ${t.id} — หาไม่เจอ ${error?.message ?? ""}`);
    continue;
  }
  const d = row.data;
  // กันรันทับสินค้าผิดตัว ถ้า id ถูกใช้ซ้ำวันหลัง
  if (d.name !== t.expect) {
    console.log(`❌ ${t.id} — ชื่อไม่ตรงที่คาด ("${d.name}" ≠ "${t.expect}") ข้ามไว้ก่อน`);
    continue;
  }
  const rates = d.priceRates ?? [];
  if (rates.some((r) => r.label === RATE_EMB || r.id === "embroidery")) {
    console.log(`✅ ${t.id} — มีเรท "${RATE_EMB}" อยู่แล้ว ไม่ต้องทำอะไร`);
    continue;
  }
  // ตัวเลือกที่เป็นแกนของตารางปักต้องยังอยู่ ไม่งั้นเรทที่คืนไปก็ยังใช้ไม่ได้
  const axis = (d.options ?? []).find((o) => o.label === EMB_LABEL);
  if (!axis) {
    console.log(`❌ ${t.id} — ไม่มีกลุ่มตัวเลือก "${EMB_LABEL}" แล้ว ต้องสร้างกลุ่มก่อน`);
    continue;
  }
  const names = axis.choices.map((c) => c.name);
  const missing = Object.keys(t.cells).filter((k) => !names.includes(k));
  if (missing.length) {
    console.log(`❌ ${t.id} — ชื่อขนาดปักไม่ตรงกับตัวเลือกในสินค้า: ${missing.join(" · ")}`);
    continue;
  }
  const rate = {
    id: "embroidery",
    label: RATE_EMB,
    desc: EMB_DESC,
    imageSrc: t.imageSrc,
    freeMixBelowQty: 11,
    minPerDesign: 3,
    pricing: { unit: UNIT, driverLabels: [EMB_LABEL], tiers: TIERS, cells: t.cells },
  };
  const next = { ...d, priceRates: [...rates, rate] };

  console.log(`🧵 ${t.id} (${d.name}) — เพิ่มเรท "${RATE_EMB}" ต่อท้าย ${rates.length} เรทเดิม`);
  for (const [k, v] of Object.entries(t.cells)) console.log(`     ${k}: ${v.join(" / ")} บาท/ตัว`);
  if (!WRITE) continue;

  const { error: upErr } = await sb.from("products").update({ data: next }).eq("id", t.id);
  if (upErr) console.log(`   ❌ เขียนไม่สำเร็จ: ${upErr.message}`);
  else {
    changed++;
    console.log("   ✅ บันทึกแล้ว");
  }
}

console.log(WRITE ? `\nเสร็จ — แก้ไป ${changed} ตัว` : "\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง)");
