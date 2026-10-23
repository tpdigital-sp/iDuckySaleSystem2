/**
 * 🗓💲 ปฏิทินโฟโต้การ์ด ราคาเท่าโฟโต้การ์ด (photocard-digital) — เจ้าของร้านสั่ง 23 ต.ค. 69
 *   "ราคาของตัวนี้ ให้เท่ากันสินค้าตัวนี้ https://iduckystore.com/products/Photo-card-Digital"
 *
 *   npx tsx scripts/calendar-photocard-price-match.mts            # ดูตารางใหม่ (ไม่เขียน)
 *   npx tsx scripts/calendar-photocard-price-match.mts --write    # บันทึกจริง + ล้างแคชหน้าสินค้าบนเว็บจริง
 *
 * โฟโต้การ์ดคิดเป็นเรทตามเนื้อกระดาษ 4 ขั้น (เคลือบเงา/ด้าน/ไม่เคลือบ ราคาเดียวกัน · เคลือบพิเศษ +30 จาก extra)
 * ปฏิทินเก็บเป็นตารางกระดาษ×เคลือบ (driverLabels) 7 ขั้น → เขียนตารางใหม่ 4 ขั้นจากเรทของโฟโต้การ์ด (ปลีก+ตัวแทน):
 *   อาร์ตมัน 300 = เรท r1 · เนื้อพิเศษทุกตัว = paper-special · PET = pet-250 (PET ทุกเคลือบราคาเดียว เหมือนตารางเดิม)
 *   อาร์ตมัน 350/400 (โฟโต้การ์ดไม่มี) = อาร์ต 300 +5/+10 ต่อชุด (เจ้าของร้านเลือก) · เคลือบพิเศษ = +30 ในตาราง
 * รันซ้ำได้ · สำรองไว้ backups/
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const CAL = "calendar-photocard";
const REF = "photocard-digital";
const SPECIAL_COAT = 30;
const ART_STEP: Record<string, number> = { "กระดาษอาร์ตมัน 300 แกรม": 0, "กระดาษอาร์ตมัน 350 แกรม": 5, "กระดาษอาร์ตมัน 400 แกรม": 10 };
const PET = "พลาสติก PET 250 แกรม";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,data").in("id", [CAL, REF]);
if (error) throw error;
const cal = rows!.find((r) => r.id === CAL)!.data as Product;
const ref = rows!.find((r) => r.id === REF)!.data as Product;
const refRate = (id: string) => {
  const r = ref.priceRates!.find((x) => x.id === id);
  if (!r) throw new Error(`โฟโต้การ์ดไม่มีเรท ${id}`);
  return r.pricing;
};
const paper = cal.options.find((g) => g.label === "ชนิดกระดาษ")!.choices.map((c) => c.name);
const coats = cal.options.find((g) => g.label === "เคลือบ (เฉพาะด้านหน้า)")!.choices.map((c) => c.name);

function table(dealer: boolean) {
  const sfx = dealer ? "-dealer" : "";
  const art = refRate("r1" + sfx).cells[""];
  const special = refRate("paper-special" + sfx).cells[""];
  const pet = refRate("pet-250" + sfx).cells[""];
  const cells: Record<string, number[]> = {};
  for (const p of paper) {
    const base = p === PET ? pet : p in ART_STEP ? art.map((v) => v + ART_STEP[p]) : special;
    for (const c of coats) cells[`${p}│${c}`] = c === "เคลือบพิเศษ" && p !== PET ? base.map((v) => v + SPECIAL_COAT) : [...base];
  }
  const src = refRate("r1" + sfx);
  return { ...src, tiers: src.tiers.map((t) => ({ ...t, label: t.label.replace("เซ็ต", "ชุด") })), unit: cal.pricing!.unit, cells, driverLabels: ["ชนิดกระดาษ", "เคลือบ (เฉพาะด้านหน้า)"] };
}

const retail = table(false);
const dealer = table(true);
const next: Product = {
  ...cal,
  pricing: retail,
  priceRates: cal.priceRates!.map((r) => (r.id === "r1" ? { ...r, pricing: retail } : r.id === "r1-dealer" ? { ...r, pricing: dealer } : r)),
};
const range = priceRange(next);
next.price = range.min;
next.priceMin = range.min;
next.priceMax = range.max;

console.log("ขั้น:", retail.tiers.map((t) => t.label).join(" | "));
for (const p of paper) console.log(p.padEnd(34), coats.map((c) => `${c}:${retail.cells[`${p}│${c}`].join("/")}`).join("  "));
console.log("ตัวแทน อาร์ต300 เคลือบเงา:", dealer.cells["กระดาษอาร์ตมัน 300 แกรม│เคลือบเงา"].join("/"));
console.log(`ราคาเริ่ม ${cal.priceMin}→${range.min} · สูงสุด ${cal.priceMax}→${range.max}`);

if (WRITE) {
  mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../backups/calendar-photocard-price-match-${Date.now()}.json`, import.meta.url), JSON.stringify(cal));
  const { error: e } = await sb.from("products").update({ data: next }).eq("id", CAL);
  if (e) throw e;
  await revalidateLive(env, { productIds: [CAL] });
  console.log("✅ บันทึกแล้ว");
}
