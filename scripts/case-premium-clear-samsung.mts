/**
 * Case Premium (เคสพรีเมี่ยมใส) — เพิ่มรุ่น Samsung ในกลุ่ม "รุ่นมือถือ" (ทีมขอ 6 ต.ค. 69)
 *
 * ต้นทาง: Google Sheet "รุ่นเคสมือถือที่รับสกรีนทั้งหมด" แท็บ Samsung (gid 1528473482)
 *   คอลัมน์ "เคสพรีเมี่ยม › เคสใส" = TRUE เท่านั้น (ช่อง "หมด" ไม่เอา: S8 plus / Note8)
 *   https://docs.google.com/spreadsheets/d/1nwAkVDSeVMXv0mbR6xCIoA8GAeREO1Fw0_V1sbLpJTw/edit?gid=1528473482
 *
 * รุ่นมือถือของสินค้านี้แยกสต๊อกรายรุ่นแล้ว (ทุกค่ามี stockItemId) → รุ่นใหม่ต้องได้ SKU ด้วย
 *   ใช้ coverChoicesInProduct() ตัวเดียวกับตอนกดบันทึกในหน้าแก้ไขสินค้า (ชื่อ/รหัส SKU ตามพี่ ๆ ในกลุ่ม)
 * ไม่มีเทมเพลตวางลายของ Samsung → เลือกรุ่น Samsung แล้วหน้าร้านเป็นโหมดแนบไฟล์ลายเอง (เหมือน iPhone X/XS)
 *
 *   node --conditions=react-server --import tsx scripts/case-premium-clear-samsung.mts          # ดูก่อน
 *   node --conditions=react-server --import tsx scripts/case-premium-clear-samsung.mts --write  # เขียนจริง (รันซ้ำได้)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Product } from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const WRITE = process.argv.includes("--write");
const ID = "case-premium-clear";
const LABEL = "รุ่นมือถือ";
/** เรียงตามชีต (เก่า → ใหม่) ต่อท้าย iPhone */
const SAMSUNG = [
  "Note 9", "S10", "S10 Plus", "S10e", "Note 10",
  "S20", "S20 Plus", "S20 Ultra", "Note 20",
  "S21", "S21 Plus", "S21 Ultra",
  "S22", "S22 Plus", "S22 Ultra",
  "S23", "S23 Plus", "S23 Ultra", "Z Flip 5", "Z Fold 5",
  "S24", "S24 Plus", "S24 Ultra", "Z Flip 6",
  "S25", "S25 Plus", "S25 Ultra",
].map((m) => `Samsung ${m}`);

const die = (m: string) => { console.error("✗", m); process.exit(1); };
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).maybeSingle();
if (error || !row) die(`อ่านสินค้าไม่ได้: ${error?.message}`);
const prev = row!.data as Product;
const opt = (prev.options ?? []).find((o) => o.label === LABEL);
if (!opt) die(`ไม่พบกลุ่ม ${LABEL}`);

const have = new Set((opt!.choices ?? []).map((c) => c.name.trim()));
const add = SAMSUNG.filter((n) => !have.has(n));
console.log(`${prev.name}: ${LABEL} มีอยู่ ${have.size} รุ่น · จะเพิ่ม Samsung ${add.length} รุ่น`);
for (const n of add) console.log("  ＋", n);

/** ข้อความหน้าร้าน/FAQ (บอทอ่านด้วย) เดิมบอกว่ามีแต่ iPhone */
type Txt = Product & { highlights?: string[]; description?: string; seo?: { faqs?: { q: string; a: string }[] } };
function retext(p: Txt): string[] {
  const changed: string[] = [];
  const models = p.options!.find((o) => o.label === LABEL)!.choices.map((c) => c.name);
  const faq = p.seo?.faqs?.find((f) => /รองรับ iPhone รุ่นไหน|รองรับรุ่นไหน/.test(f.q));
  if (faq) {
    const a = `รองรับ ${models.filter((m) => m.startsWith("iPhone")).join(", ")} และ ${models.filter((m) => m.startsWith("Samsung")).join(", ")}`;
    if (faq.q !== "รองรับมือถือรุ่นไหนบ้าง?" || faq.a !== a) { faq.q = "รองรับมือถือรุ่นไหนบ้าง?"; faq.a = a; changed.push("FAQ รุ่นที่รองรับ"); }
  }
  const hi = p.highlights?.findIndex((h) => /^รองรับ iPhone/.test(h)) ?? -1;
  if (hi >= 0 && p.highlights![hi] !== "รองรับ iPhone X – iPhone 17 Pro Max และ Samsung S10 – S25 Ultra / Z Flip / Z Fold") {
    p.highlights![hi] = "รองรับ iPhone X – iPhone 17 Pro Max และ Samsung S10 – S25 Ultra / Z Flip / Z Fold";
    changed.push("highlight");
  }
  if (p.description?.includes("มีรุ่น iPhone ให้เลือกหลายรุ่น")) {
    p.description = p.description.replace("มีรุ่น iPhone ให้เลือกหลายรุ่น", "มีรุ่น iPhone และ Samsung ให้เลือกหลายรุ่น");
    changed.push("description");
  }
  return changed;
}

const next: Product = structuredClone(prev);
const nOpt = next.options!.find((o) => o.label === LABEL)!;
nOpt.choices = [...(nOpt.choices ?? []), ...add.map((name) => ({ name }))];
const textChanged = retext(next as Txt);
console.log("ข้อความที่จะแก้:", textChanged.join(", ") || "-");
if (!add.length && !textChanged.length) { console.log("ครบแล้ว ไม่ต้องทำอะไร"); process.exit(0); }

const { newChoiceTest } = await import("../src/lib/server/stock-cover-choices");
const { planChoiceCover } = await import("../src/lib/stock-cover-plan");
const { listStockItems, allStockCodes } = await import("../src/lib/server/stock");
const [items, codes] = await Promise.all([listStockItems(), allStockCodes()]);
// ไม่มีรุ่นใหม่ = ห้ามเรียกตัววางแผน (isNew ว่าง = ถือทุกช่องว่างเป็นค่าใหม่)
const isNew = newChoiceTest(next.options ?? [], prev.options ?? []);
const plan = isNew ? planChoiceCover(next as never, items as never, codes, isNew) : [];
console.log(`\nSKU ที่จะสร้าง/ผูก ${plan.length} ตัว:`);
for (const it of plan) console.log(`  ${it.reuseId ? "↩ ผูกตัวเดิม" : "＋ สร้าง"} ${it.code}  ${it.name}`);
if (plan.length !== add.length) die(`จำนวน SKU (${plan.length}) ไม่เท่ารุ่นใหม่ (${add.length}) — หยุดก่อน`);

if (!WRITE) { console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)"); process.exit(0); }

const { coverChoicesInProduct } = await import("../src/lib/server/stock-cover-choices");
const { product, made } = await coverChoicesInProduct(next, prev);
if (made.length !== add.length) die(`สร้าง SKU ได้ ${made.length}/${add.length}`);
const out = { ...product, savedAt: Date.now() } as Product & { savedAt: number };
const { data: upd, error: e2 } = await sb.from("products").update({ data: out }).eq("id", ID).select("data");
if (e2 || upd?.length !== 1) die(`เขียนไม่ลง: ${e2?.message ?? `${upd?.length} แถว`}`);

// อ่านกลับเทียบ — update() ไม่ error ไม่ได้แปลว่าลงจริง
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bOpt = (back!.data as Product).options!.find((o) => o.label === LABEL)!;
const miss = add.filter((n) => !bOpt.choices.some((c) => c.name === n && c.stockItemId));
if (miss.length) die(`อ่านกลับแล้วขาด/ไม่มี SKU: ${miss.join(", ")}`);
console.log(`\n✓ เขียนแล้ว · ${LABEL} รวม ${bOpt.choices.length} รุ่น · SKU ใหม่ ${made.length} ตัว`);
process.exit(0);
