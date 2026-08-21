/**
 * CABLE CARE — ใส่หน่วย "ซม." ให้ช่องจำนวนของตัวเลือก "เซนละ" (ตามที่ผู้ใช้สั่ง 21 ส.ค. 69)
 *
 *   npx tsx scripts/cable-care-cm-unit.ts            # ดูสิ่งที่จะเปลี่ยน (ไม่เขียนจริง)
 *   npx tsx scripts/cable-care-cm-unit.ts --write    # เขียนลง Supabase
 *
 * กลุ่ม "เพิ่มขนาดต่อชิ้น" ยังเป็นแบบเดิมทุกอย่าง (ติ๊ก "เซนละ +฿8" แล้วระบุจำนวน)
 * เพิ่มแค่ qtyUnit — หน้าสินค้าจะขึ้นหน่วย ซม. ข้างช่องจำนวน ลูกค้าเห็นชัดว่ากรอกกี่เซนติเมตร
 * (ราคาคิดเหมือนเดิม: +฿8 × จำนวน ซม.)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

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
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ID = "cable-care";
const GROUP = "เพิ่มขนาดต่อชิ้น";
const CHOICE = "เซนละ";
const UNIT = "ซม.";

async function main() {
  const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
  if (error) throw error;
  const p = row.data as Product;

  const opt = (p.options ?? []).find((o) => o.label === GROUP);
  if (!opt) throw new Error(`ไม่เจอกลุ่ม "${GROUP}" ในสินค้า ${ID}`);
  if (!opt.choices.some((c) => c.name === CHOICE)) throw new Error(`ไม่เจอตัวเลือก "${CHOICE}"`);

  const next: Product = {
    ...p,
    options: (p.options ?? []).map((o) =>
      o.label !== GROUP
        ? o
        : { ...o, choices: o.choices.map((c) => (c.name === CHOICE ? { ...c, qtyUnit: UNIT } : c)) }
    ),
  };

  console.log(`— ${GROUP}:`, JSON.stringify(next.options.find((o) => o.label === GROUP)));
  console.log(`   หน้าสินค้าจะขึ้น: [− 2 ${UNIT} +]  ·  2 ${UNIT} = +฿16`);

  if (!WRITE) return console.log("\n(ยังไม่เขียนจริง — ใส่ --write เพื่อบันทึก)");
  const { error: upErr } = await sb
    .from("products")
    .update({ data: { ...next, savedAt: new Date().toISOString() } })
    .eq("id", ID);
  if (upErr) throw upErr;
  console.log("\n✅ บันทึกลง Supabase แล้ว");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
