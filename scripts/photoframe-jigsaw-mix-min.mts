/**
 * 🧩 กรอบรูปจิ๊กซอร์ อะคริลิค (photoframe-3) — เปิดกติกาคละลายให้ตรงกับที่ร้านประกาศ
 * เจ้าของร้านส่งกติกามา 15 ก.ย. 69: "*สั่ง 11 ชิ้นขึ้นไป ขั้นต่ำ 5 ชิ้นต่อแบบ"
 *
 * ตัวนี้เป็นสินค้าตัวเดียวในตระกูลกรอบรูปที่ยังไม่มีกติกานี้ในฐานข้อมูล (photoframe-2/4/5/8 + uv
 * ตั้ง minPerDesign 5 · freeMixBelowQty 11 · extraDesignFee 5 ไว้หมดแล้ว) → เติมให้เหมือนกัน
 *   • minPerDesign: 5      คละลายขั้นต่ำลายละ 5 อัน
 *   • freeMixBelowQty: 11  ต่ำกว่า 11 อัน (= แถวราคาปลีก 1-10 ในตาราง) คละอิสระเหมือนเดิม
 *   • extraDesignFee: 5    คละ "เกิน" โควตาได้ คิดลายละ ฿5 (กติกากลางของร้าน 15 ก.ย. 69)
 *   ทั้งเรทลูกค้าทั่วไปและเรทตัวแทนจำหน่าย (ไม่งั้นตัวแทนคละลายแล้วราคาตกเรทปลีก)
 *   • ต่อท้าย terms ด้วยบรรทัดของเจ้าของร้านตามที่ส่งมา
 *
 * ⚠️ ทำไมไม่ใช้ scripts/mix-fee-per-design.mts (ตัวมาตรฐาน): ด่านตรวจของมันปัดสินค้าตัวนี้ออก
 *    เพราะเทียบราคา "11 อัน 3 ลาย ฿4,620 → ฿4,625" แล้วเห็นว่าแพงขึ้น — แต่เคสนั้น "ซื้อไม่ได้อยู่แล้ว"
 *    ตอนไม่มีค่าคละ (ช่องจำนวนลายตันที่ ⌊จำนวน ÷ 5⌋ = 2 ลาย) ของแพงขึ้นจริง ๆ จึงไม่มี
 *    เจ้าของร้านเคาะ 15 ก.ย. 69: ให้คละเกินโควตาได้ จ่ายลายละ ฿5 เหมือนกรอบรูปตัวอื่นในตระกูล
 *
 *   npx tsx scripts/photoframe-jigsaw-mix-min.mts           # ดูก่อน (ไม่เขียน) + ตารางราคาก่อน/หลัง
 *   npx tsx scripts/photoframe-jigsaw-mix-min.mts --write   # เขียนจริง + สำรองค่าเดิม + อ่านกลับยืนยัน
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  unitPriceFor, feeBreakdown, tierQtyFor, maxDesignsFor, includedDesigns,
  DESIGN_LABEL, type PriceRate, type Product,
} from "../src/lib/products";

const ID = "photoframe-3";
const EXPECT_NAME = "กรอบรูปจิ๊กซอร์ อะคริลิค";
const MIN_PER_DESIGN = 5;
const FREE_MIX_BELOW = 11;
const EXTRA_DESIGN_FEE = 5;
const TERM_LINE = "*สั่ง 11 ชิ้นขึ้นไป ขั้นต่ำ 5 ชิ้นต่อแบบ";
const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] as [string, string]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (msg: string) => { console.error("✗ " + msg); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,name,price,category,data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message ?? `ไม่พบสินค้า ${ID}`);
const data = row!.data as Record<string, unknown>;
if (data.name !== EXPECT_NAME) die(`${ID} ชื่อ "${data.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

const toProduct = (d: Record<string, unknown>): Product =>
  ({ id: row!.id, name: row!.name, price: row!.price, category: row!.category, ...d } as unknown as Product);

/** ยอดที่ลูกค้าจ่ายจริงของบรรทัดเดี่ยว (ราคา/หน่วย × จำนวน + ค่าคละ) */
const linePrice = (p: Product, qty: number, designs: number) => {
  const sel = { [DESIGN_LABEL]: `${designs} ลาย` };
  return unitPriceFor(p, sel, qty) * qty + feeBreakdown(p, sel, qty, tierQtyFor(p, sel, qty)).reduce((s, l) => s + l.amount, 0);
};
const mixInfo = (p: Product, qty: number, designs: number) => {
  const sel = { [DESIGN_LABEL]: `${designs} ลาย` };
  const r = (p.priceRates ?? []).find((x) => !x.dealerOnly) as PriceRate | undefined;
  if (!r) return "";
  return `คละได้สูงสุด ${maxDesignsFor(r, qty)} ลาย · ฟรี ${includedDesigns(r, qty)} ลาย`;
};

const before = toProduct(data);
const after = toProduct(structuredClone(data));

let touched = 0;
for (const r of (after.priceRates ?? []) as PriceRate[]) {
  if (r.minPerDesign !== MIN_PER_DESIGN) { r.minPerDesign = MIN_PER_DESIGN; touched++; }
  if (r.freeMixBelowQty !== FREE_MIX_BELOW) { r.freeMixBelowQty = FREE_MIX_BELOW; touched++; }
  if (r.extraDesignFee !== EXTRA_DESIGN_FEE) { r.extraDesignFee = EXTRA_DESIGN_FEE; touched++; }
  // สองกติกาใช้พร้อมกันไม่ได้ (mixFeeOfSide เช็ค underMinPieceFee ก่อน) — ตัวนี้ไม่เคยตั้ง แต่กันไว้ให้รันซ้ำได้
  if (r.underMinPieceFee != null) { delete r.underMinPieceFee; touched++; }
}
if (!(after.priceRates ?? []).length) die("สินค้านี้ไม่มี priceRates — ต้องมีตารางเรทก่อน");

const terms = String((after as unknown as { terms?: string }).terms ?? "");
const termNeeded = !terms.split("\n").some((l) => l.trim() === TERM_LINE);
if (termNeeded) (after as unknown as { terms?: string }).terms = terms ? `${terms}\n${TERM_LINE}` : TERM_LINE;

console.log(`สินค้า ${ID} | ${data.name} | ฉบับร่าง(hidden)=${data.hidden ?? false}`);
console.log(`เรทที่แตะ: ${(after.priceRates ?? []).map((r) => r.label).join(" · ")}`);
console.log(`เติมบรรทัดใน terms: ${termNeeded ? TERM_LINE : "(มีอยู่แล้ว)"}\n`);

console.log("ราคาที่ลูกค้าจ่าย (เรทลูกค้าทั่วไป) — ก่อน → หลัง");
for (const [qty, designs] of [[5, 5], [10, 10], [11, 1], [11, 2], [11, 3], [15, 3], [20, 4], [30, 6], [30, 10], [50, 10]] as [number, number][]) {
  const b = linePrice(before, qty, designs), a = linePrice(after, qty, designs);
  const mark = a === b ? "=" : a > b ? "▲ แพงขึ้น" : "▼ ถูกลง";
  console.log(`  ${String(qty).padStart(3)} อัน ${String(designs).padStart(2)} ลาย : ฿${b.toLocaleString("th-TH")} → ฿${a.toLocaleString("th-TH")} ${mark}  (${mixInfo(after, qty, designs)})`);
}

if (!touched && !termNeeded) { console.log("\n✓ ตรงอยู่แล้ว ไม่ต้องเขียน"); process.exit(0); }
if (!WRITE) { console.log("\n(ดูอย่างเดียว) ใส่ --write เพื่อเขียนจริง"); process.exit(0); }

mkdirSync("backups", { recursive: true });
const backup = `backups/photoframe-jigsaw-mix-min-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(backup, JSON.stringify({ id: ID, priceRates: data.priceRates, terms: data.terms }, null, 2));

const savedAt = new Date().toISOString();
const next = { ...structuredClone(data), priceRates: after.priceRates, terms: (after as unknown as { terms?: string }).terms, savedAt };
const up = await sb.from("products").update({ data: next }).eq("id", ID).select("id");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update โดน 0 แถว");

const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = (back?.data ?? {}) as { savedAt?: string; priceRates?: PriceRate[]; terms?: string };
if (q.savedAt !== savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง รันซ้ำอีกรอบ");
for (const r of q.priceRates ?? []) {
  if (r.minPerDesign !== MIN_PER_DESIGN || r.freeMixBelowQty !== FREE_MIX_BELOW || r.extraDesignFee !== EXTRA_DESIGN_FEE) die(`อ่านกลับเรท "${r.label}" ไม่ตรง`);
}
if (!String(q.terms ?? "").includes(TERM_LINE)) die("อ่านกลับ terms ไม่มีบรรทัดกติกา");
console.log(`\n✓ เขียนแล้ว อ่านกลับตรง · savedAt ${savedAt} · สำรอง ${backup}`);
