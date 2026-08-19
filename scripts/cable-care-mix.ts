/**
 * CABLE CARE — ตั้ง "การคละลาย" ให้เหมือนหน้าที่เปิดขวดทรงกลม (otheracrylicproducts4-5)
 * (ตามที่ผู้ใช้สั่ง 19 ส.ค. 69)
 *
 *   npx tsx scripts/cable-care-mix.ts            # ดูสิ่งที่จะเปลี่ยน (ไม่เขียนจริง)
 *   npx tsx scripts/cable-care-mix.ts --write    # เขียนลง Supabase
 *
 * เทียบสองตัวแล้วพบว่า "ตัวเลขกติกาคละ" ของเรทตรงกันอยู่แล้ว
 *   minPerDesign 1 · extraDesignFee 5 · freeMixBelowQty 11
 * ที่ต่างจริงคือ ที่เปิดขวดมีตัวเลือกที่ตั้ง perUnit = 2 (1 ชุด = 2 ชิ้น)
 * ระบบคละนับ "เพดานลาย" จากจำนวนชิ้น (perUnitCapacity) → 1 ชุดคละได้ 2 ลาย
 * CABLE CARE ขายเป็นชุด ชุดละ 2 ชิ้นเหมือนกัน แต่ไม่มีตัวเลือกเลย perUnit จึงเป็น 1
 * → เพิ่มกลุ่มตัวเลือก "จำนวนต่อชุด" ที่ตั้ง perUnit 2 + ข้อความอธิบายคละลายชุดเดียวกัน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { includedDesigns, maxDesignsFor, type Product } from "../src/lib/products";

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

const ID = "cable-care";
/** ชุดละ 2 ชิ้น — ตัวเลขเดียวกับที่เปิดขวดทรงกลม */
const PER_UNIT = 2;
const SET_OPTION = {
  label: "จำนวนต่อชุด",
  choices: [{ name: "1 ชุด = 2 ชิ้น (ใส่ได้ทั้ง 2 ฝั่ง)", perUnit: PER_UNIT }],
};
const MIX_TAB = {
  title: "รายละเอียดเพิ่มเติม",
  text: [
    "• ขายเป็นชุด 1 ชุดได้ 2 ชิ้น · ตัวถนอมสายชาร์จ ใส่ได้ทั้ง 2 ฝั่ง",
    "• จำนวน 1-10 ชุด คละลายได้อิสระ — สั่ง 1 ชุดคละได้มากสุด 2 ลาย · 2 ชุดคละได้ 4 ลาย (ตามจำนวนชิ้น)",
    "• จำนวน 11 ชุดขึ้นไป คละได้ชุดละ 1 ลาย — คละเกินโควตา บวกเพิ่มลายละ 5 บาท",
  ].join("\n"),
};
const MIX_FAQ = {
  q: "คละลายได้ไหม?",
  a: "จำนวน 1-10 ชุด คละลายได้อิสระตามจำนวนชิ้น (1 ชุดคละได้ 2 ลาย, 2 ชุดคละได้ 4 ลาย) · 11 ชุดขึ้นไปคละได้ชุดละ 1 ลาย เกินโควตาบวกเพิ่มลายละ 5 บาท",
};
const MIX_HIGHLIGHT = "1-10 ชุด คละลายอิสระ (ชุดละ 2 ลาย)";

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
  if (error) throw error;
  const p = row.data as Product;

  const next: Product = {
    ...p,
    // มีกลุ่มนี้อยู่แล้ว = ทับของเดิม (รันซ้ำได้)
    options: [SET_OPTION, ...(p.options ?? []).filter((o) => o.label !== SET_OPTION.label)],
    // แทนที่หัวข้อคละลายเดิม (ถ้าเคยใส่) แล้ววางไว้แท็บแรกเหมือนหน้าที่เปิดขวด
    tabs: [MIX_TAB, ...(p.tabs ?? []).filter((t) => t.title !== MIX_TAB.title)],
    highlights: [
      ...(p.highlights ?? []).filter((h) => !h.includes("คละลาย") && h !== "ราคาปรับตามจำนวน"),
      MIX_HIGHLIGHT,
    ],
    seo: p.seo
      ? { ...p.seo, faqs: [...(p.seo.faqs ?? []).filter((f) => !f.q.includes("คละลาย")), MIX_FAQ] }
      : p.seo,
  };

  const rate = next.priceRates?.[0];
  console.log("— กติกาคละของเรท (ไม่แตะ, ตรงกับที่เปิดขวดอยู่แล้ว):", {
    minPerDesign: rate?.minPerDesign,
    extraDesignFee: rate?.extraDesignFee,
    freeMixBelowQty: rate?.freeMixBelowQty,
  });
  console.log("— ตัวเลือกใหม่:", JSON.stringify(next.options, null, 1));
  if (rate)
    for (const qty of [1, 2, 10, 11, 25, 50])
      console.log(
        `   สั่ง ${qty} ชุด → รวมในราคา ${includedDesigns(rate, qty, PER_UNIT)} ลาย · คละได้สูงสุด ${maxDesignsFor(rate, qty, PER_UNIT)} ลาย`
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
