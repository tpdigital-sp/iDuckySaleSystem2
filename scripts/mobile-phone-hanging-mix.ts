/**
 * MOBILE PHONE HANGING — ตั้ง "การคละลาย" ให้เหมือนหน้าที่เปิดขวดทรงกลม (otheracrylicproducts4-5)
 * (ตามที่ผู้ใช้สั่ง 24 ส.ค. 69)
 *
 *   npx tsx scripts/mobile-phone-hanging-mix.ts            # ดูสิ่งที่จะเปลี่ยน (ไม่เขียนจริง)
 *   npx tsx scripts/mobile-phone-hanging-mix.ts --write    # เขียนลง Supabase
 *
 * ต่างจาก cable-care ตรงที่สินค้านี้ "ยังไม่มี priceRates เลย" (มีแต่ pricing เก่า 2 ขนาด)
 * → ยกตาราง pricing เดิมขึ้นเป็นเรทเดียว แล้วใส่กติกาคละชุดเดียวกับที่เปิดขวด:
 *   minPerDesign 1 · extraDesignFee 5 · freeMixBelowQty 11
 * ขายเป็นเซ็ต เซ็ตละ 2 ชิ้น (ตาม terms เดิม) → ตั้ง perUnit 2 บนตัวเลือกขนาดทั้งสองตัว
 * ระบบคละนับเพดานลายจากจำนวนชิ้น (perUnitCapacity) → 1 เซ็ตคละได้ 2 ลาย เหมือนที่เปิดขวด
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { includedDesigns, maxDesignsFor, type Product, type PriceRate } from "../src/lib/products";

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

const ID = "mobile-phone-hanging-2";
/** เซ็ตละ 2 ชิ้น — ตัวเลขเดียวกับที่เปิดขวดทรงกลม */
const PER_UNIT = 2;
/** กติกาคละชุดเดียวกับ otheracrylicproducts4-5 (r1) */
const MIX = { minPerDesign: 1, extraDesignFee: 5, freeMixBelowQty: 11 };

const MIX_TAB = {
  title: "รายละเอียดเพิ่มเติม",
  text: [
    "• ขายเป็นเซ็ต 1 เซ็ตได้ 2 ชิ้น · วัสดุเป็นพลาสติก นิ่ม งอได้",
    "• จำนวน 1-10 เซ็ต คละลายได้อิสระ — สั่ง 1 เซ็ตคละได้มากสุด 2 ลาย · 2 เซ็ตคละได้ 4 ลาย (ตามจำนวนชิ้น)",
    "• จำนวน 11 เซ็ตขึ้นไป คละได้เซ็ตละ 1 ลาย — คละเกินโควตา บวกเพิ่มลายละ 5 บาท",
    "• ทางร้านใช้สี RGB สีงานสกรีนอาจสว่างกว่าหรือดรอปลง ±5-15% ตามไฟล์งาน",
  ].join("\n"),
};
const MIX_FAQ = {
  q: "คละลายได้ไหม?",
  a: "จำนวน 1-10 เซ็ต คละลายได้อิสระตามจำนวนชิ้น (1 เซ็ตคละได้ 2 ลาย, 2 เซ็ตคละได้ 4 ลาย) · 11 เซ็ตขึ้นไปคละได้เซ็ตละ 1 ลาย เกินโควตาบวกเพิ่มลายละ 5 บาท",
};
const MIX_HIGHLIGHT = "1-10 เซ็ต คละลายอิสระ (เซ็ตละ 2 ลาย)";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
  if (error) throw error;
  const p = row.data as Product;
  if (!p.pricing) throw new Error("สินค้านี้ไม่มีตาราง pricing — โครงไม่ตรงกับที่สคริปต์คาด");

  // ยกตารางเดิมขึ้นเป็นเรทเดียว + กติกาคละของที่เปิดขวด — รันซ้ำได้ (ทับ r1 ด้วยค่าล่าสุดจาก pricing)
  const rate: PriceRate = {
    id: "r1",
    label: "MOBILE PHONE HANGING",
    desc: "ขายเป็นเซ็ต เซ็ตละ 2 ชิ้น · วัสดุเป็นพลาสติก นิ่ม งอได้",
    pricing: p.pricing,
    ...MIX,
  };

  const next: Product = {
    ...p,
    priceRates: [rate],
    // เซ็ตละ 2 ชิ้น → perUnit 2 บนตัวเลือกขนาดทุกตัว (เพดานคละนับจากจำนวนชิ้น)
    options: (p.options ?? []).map((o) =>
      o.label === "ขนาด" ? { ...o, choices: o.choices.map((c) => ({ ...c, perUnit: PER_UNIT })) } : o
    ),
    // วางหัวข้อคละลายไว้แท็บแรกเหมือนหน้าที่เปิดขวด (รันซ้ำ = ทับของเดิม)
    tabs: [MIX_TAB, ...(p.tabs ?? []).filter((t) => t.title !== MIX_TAB.title)],
    highlights: [
      ...(p.highlights ?? []).filter((h) => !h.includes("คละลาย") && h !== "ราคาปรับตามจำนวน"),
      MIX_HIGHLIGHT,
    ],
    seo: p.seo
      ? { ...p.seo, faqs: [...(p.seo.faqs ?? []).filter((f) => !f.q.includes("คละลาย")), MIX_FAQ] }
      : p.seo,
  };

  console.log("— เรทใหม่:", { label: rate.label, desc: rate.desc, ...MIX });
  console.log("— แกนตาราง:", rate.pricing.driverLabels, "| ขนาดในตาราง:", Object.keys(rate.pricing.cells));
  console.log("— ตัวเลือกใหม่:", JSON.stringify(next.options, null, 1));
  for (const qty of [1, 2, 10, 11, 25, 50])
    console.log(
      `   สั่ง ${qty} เซ็ต → รวมในราคา ${includedDesigns(rate, qty, PER_UNIT)} ลาย · คละได้สูงสุด ${maxDesignsFor(rate, qty, PER_UNIT)} ลาย`
    );
  console.log("— แท็บแรก:", MIX_TAB.title, "\n" + MIX_TAB.text);
  console.log("— highlights:", next.highlights);
  console.log("— FAQ:", MIX_FAQ.q);

  if (!WRITE) {
    console.log("\n(ยังไม่เขียนจริง — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb
      .from("products")
      .update({ data: { ...next, savedAt: new Date().toISOString() } })
      .eq("id", ID);
    if (upErr) throw upErr;
    console.log("\n✅ บันทึกลง Supabase แล้ว");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
