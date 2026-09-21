/**
 * 🔗 ด่านตรวจ "เงื่อนไขตัวเลือกที่ชี้ชื่อที่ไม่มีอยู่จริง" ทั้งร้าน
 *
 *   npx tsx scripts/option-ref-scan.mts            สรุปผล (ปิดท้าย ❌/✓)
 *   npx tsx scripts/option-ref-scan.mts --full     กางทุกเคส (ไม่ตัดเหลือตัวอย่าง)
 *
 * ทำไมต้องมี: กลุ่ม/ตัวเลือกที่ถูก "เปลี่ยนชื่อ" ทีหลัง ทำให้เงื่อนไขที่อ้างชื่อเดิมกลายเป็นชื่อลอย
 * optionVisible() หาค่ากลุ่มชื่อนั้นใน selections ไม่เจอ = กลุ่มนั้น **ซ่อนตลอดกาลอย่างเงียบ ๆ**
 * ไม่มีใครรู้จนลูกค้าทัก (21 ก.ย. 69 "กระดาษเย็บบน" เลือกกำหนดขนาดเองแล้วไม่มีช่องให้กรอกขนาด
 * เพราะกลุ่ม "ขนาดใบ" ถูกเปลี่ยนชื่อเป็น "ขนาดแบบที่ยังไม่พับ")
 *
 * หน้าแก้ไขหลังบ้านลากชื่อพวกนี้ตามให้แล้ว (retargetGroupLabel/retargetChoiceName ใน ProductEditor)
 * ตัวนี้ไว้จับของเก่าที่พังไปก่อนหน้า + ของที่สคริปต์เขียนเข้าฐานตรง ๆ
 *
 * อ่านตัวเลือกแบบ "คลี่คลังตัวเลือกกลางแล้ว" (resolveOptions) เหมือนหน้าร้าน
 * "เรทราคา" (RATE_LABEL) เป็นกลุ่มเสมือน — เทียบกับรายชื่อเรทของสินค้านั้นแทน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { RATE_LABEL, type Product, type ProductOption } from "../src/lib/products";
import { resolveOptions } from "../src/lib/option-presets";

const FULL = process.argv.includes("--full");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: rows, error } = await sb.from("products").select("id,data");
if (error) throw error;
const presets = (rows ?? []).map((r: any) => r.data).filter((p: any) => p?.id && p?.choices);
const products: Product[] = [];
for (const r of rows ?? []) {
  const p: any = (r as any).data;
  if (!p?.id || String((r as any).id).startsWith("__") || p.choices) continue;
  products.push(p.options?.some((o: any) => o.presetId) ? { ...p, options: resolveOptions(p.options, presets) } : p);
}

const deadGroup: string[] = []; // ❌ ชี้ "กลุ่ม" ที่ไม่มีอยู่จริง → กลุ่มที่ตั้งเงื่อนไขซ่อนตลอด
const deadChoice: string[] = []; // ❌ ชี้ "ตัวเลือก" ที่ไม่มีในกลุ่มนั้น → เงื่อนไขนั้นไม่มีทางตรง
const push = (arr: string[], line: string) => {
  if (FULL || arr.length < 15) arr.push(line);
  else if (arr[arr.length - 1] !== "…") arr.push("…");
};

for (const p of products) {
  const opts = (p.options ?? []) as ProductOption[];
  const groups = new Map(opts.map((o) => [o.label.trim(), o]));
  const rateNames = new Set((p.priceRates ?? []).map((r: any) => String(r.label).trim()));
  const where = `${p.id} · ${p.name}`;

  /** เงื่อนไข 1 ข้อ: กลุ่มที่อ้างถึงต้องมีจริง และตัวเลือกที่ติ๊กไว้ต้องอยู่ในกลุ่มนั้นจริง */
  const check = (cond: { label?: string; choices?: string[] } | undefined, owner: string, kind: string) => {
    if (!cond?.label || !cond.choices?.length) return;
    const label = cond.label.trim();
    const names =
      label === RATE_LABEL ? rateNames : groups.has(label) ? new Set(groups.get(label)!.choices.map((c) => c.name.trim())) : null;
    if (!names) {
      push(deadGroup, `${where} | "${owner}" → ${kind} ชี้กลุ่ม "${label}" (ไม่มีกลุ่มนี้ในสินค้า)`);
      return;
    }
    // ตัวเลือกที่ติ๊กไว้ "ทุกตัว" ไม่มีในกลุ่มแล้ว = เงื่อนไขนั้นไม่มีทางตรง (บางตัวหาย = แค่ตัวเลือกนั้นเลิกขาย ไม่นับ)
    const missing = cond.choices.map((c) => c.trim()).filter((c) => !names.has(c));
    if (missing.length === cond.choices.length)
      push(deadChoice, `${where} | "${owner}" → ${kind} "${label}" = ${missing.map((m) => `“${m}”`).join(" / ")} (ไม่มีตัวเลือกนี้แล้ว)`);
  };

  for (const o of opts) {
    check(o.showWhen, o.label, "แสดงเมื่อ");
    check(o.showWhenAlso, o.label, "แสดงเมื่อ (และ)");
    for (const c of o.showWhenAll ?? []) check(c, o.label, "แสดงเมื่อ (และ)");
    for (const c of o.showWhenAny ?? []) check(c, o.label, "แสดงเมื่อ (หรือ)");
    for (const ch of o.choices ?? []) {
      for (const w of (ch as any).imageWhen ?? []) for (const c of w.when ?? []) check(c, `${o.label}/${ch.name}`, "ภาพสลับตาม");
      for (const l of (ch as any).stockLinks ?? []) for (const c of l.when ?? []) check(c, `${o.label}/${ch.name}`, "ผูกสต๊อกเมื่อ");
    }
    // ชื่อกลุ่มที่ฟิลด์อื่นอ้างถึง (ไม่มีรายชื่อตัวเลือกให้เทียบ — เช็คแค่ว่ากลุ่มมีจริง)
    const pointsAt: [string | undefined, string][] = [
      [o.smallWhenLabel, "ค่าธรรมเนียมช่วงสั่งน้อยเมื่อ"],
      [o.freeWhenLabel, "ฟรีเมื่อ"],
      [o.qtyFrom, "คูณจำนวนตามกลุ่ม"],
      [o.priceAsDriver, "ราคาดึงจากกลุ่ม"],
      [o.defaultBy?.label, "ค่าเริ่มต้นตามกลุ่ม"],
      [o.sheetYield?.pairLabel, "คู่ช่องกรอกอีกด้าน"],
      [o.sheetFee?.by, "ค่าต่อแผ่นตามกลุ่ม"],
      [o.sizeInput?.widthLabel, "ช่องกรอกด้านกว้าง"],
      [o.sizeInput?.heightLabel, "ช่องกรอกด้านสูง"],
    ];
    for (const [label, kind] of pointsAt) {
      if (label && label.trim() !== RATE_LABEL && !groups.has(label.trim()))
        push(deadGroup, `${where} | "${o.label}" → ${kind} "${label.trim()}" (ไม่มีกลุ่มนี้ในสินค้า)`);
    }
    // ตัวเลือก "กำหนดขนาดเอง" ต้องเป็นชื่อที่มีอยู่จริงในกลุ่มตัวเอง
    if (o.sizeInput?.choice && !o.choices?.some((c) => c.name.trim() === o.sizeInput!.choice.trim()))
      push(deadChoice, `${where} | "${o.label}" → กำหนดขนาดเอง “${o.sizeInput.choice}” (ไม่มีตัวเลือกนี้ในกลุ่ม)`);
  }
}

console.log(`สินค้าในฐาน ${products.length} ตัว`);
const section = (title: string, arr: string[], hint: string) => {
  if (!arr.length) return;
  console.log(`\n${title} (${arr.length})\n  ${hint}`);
  for (const l of arr) console.log("  " + l);
};
section("❌ ชี้กลุ่มที่ไม่มีอยู่จริง", deadGroup, "กลุ่มที่ตั้งเงื่อนไขนี้จะไม่โผล่ให้ลูกค้าเลือกเลย");
section("❌ ชี้ตัวเลือกที่ไม่มีแล้ว", deadChoice, "เงื่อนไขไม่มีทางตรง = กลุ่มลูกไม่โผล่ (มักเกิดหลังเปลี่ยนชื่อตัวเลือก)");
const bad = deadGroup.length + deadChoice.length;
console.log(bad ? `\n❌ พบ ${bad} จุดที่ต้องซ่อม` : "\n✓ ไม่เจอเงื่อนไขที่ชี้ชื่อลอย");
process.exit(bad ? 1 : 0);
