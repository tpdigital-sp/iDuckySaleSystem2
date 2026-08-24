/**
 * ปรับกติกาคละลาย "Brooch Badge / เข็มกลัดพลาสติก" (broochbadge-th)
 *
 *   node scripts/brooch-mix-rules.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/brooch-mix-rules.mjs --write    # เขียนลง Supabase
 *
 * กติกาจากร้าน (24 ส.ค. 69):
 *   • 1-10 เซต คละลายได้อิสระ เพดาน = จำนวนชิ้นรวม
 *       เช่น 2.5cm (10 ชิ้น/เซต) สั่ง 2 เซต คละได้ไม่เกิน 20 ลาย
 *            5.8cm (5 ชิ้น/เซต)  สั่ง 2 เซต คละได้ไม่เกิน 10 ลาย
 *   • 11 เซตขึ้นไป 1 เซตต่อ 1 ลาย · คละเกินโควตาได้ บวกลายละ 5 บาท
 *
 * วิธี: แพตช์ของจริงจาก DB (ไม่เขียนทับทั้งก้อน)
 *   1) เรทแรก: extraDesignFee = 5   (freeMixBelowQty 11 + minPerDesign 1 มีอยู่แล้ว)
 *   2) กลุ่ม "ขนาด": ตั้ง perUnit ตามชิ้นต่อเซตที่อ่านจากชื่อ "(1 เซตได้ N ชิ้น)"
 *   3) ถอด tierByDesign — ⚠️ ธงนี้ทับกติกา minPerDesign ในหน้าเว็บ (เพดานลาย = จำนวนเซต)
 *      สั่ง 2 เซตเลยคละได้แค่ 2 ลาย ไม่ใช่ 20 · สินค้านี้ใช้กติกาโควตา+ค่าคละเกินแทน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "broochbadge-th";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const supa = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: row, error } = await supa.from("products").select("id,data").eq("id", ID).single();
if (error) throw error;
const data = row.data;

const rate = data.priceRates?.[0];
if (!rate) throw new Error("ไม่พบ priceRates ในสินค้า — โครงสร้างเปลี่ยน ต้องดูก่อน");

console.log(`เดิม: minPerDesign=${rate.minPerDesign} freeMixBelowQty=${rate.freeMixBelowQty} extraDesignFee=${rate.extraDesignFee} tierByDesign=${data.tierByDesign}`);
rate.extraDesignFee = 5;
delete data.tierByDesign;

const sizeGroup = data.options?.find((o) => o.label === "ขนาด");
if (!sizeGroup) throw new Error('ไม่พบกลุ่มตัวเลือก "ขนาด"');
for (const c of sizeGroup.choices) {
  const m = c.name.match(/ได้\s*(\d+)\s*ชิ้น/);
  if (!m) throw new Error(`อ่านชิ้นต่อเซตจากชื่อไม่ได้: "${c.name}"`);
  console.log(`${c.name} → perUnit ${c.perUnit ?? "-"} ⇒ ${m[1]}`);
  c.perUnit = Number(m[1]);
}

if (!WRITE) {
  console.log("\n(ยังไม่เขียน — รันด้วย --write เพื่อบันทึก)");
  process.exit(0);
}

const { error: e2 } = await supa.from("products").update({ data }).eq("id", ID);
if (e2) throw e2;
console.log("\n✅ บันทึกแล้ว: extraDesignFee 5 บาท/ลายเกิน + perUnit ชิ้นต่อเซตครบ 5 ขนาด");
