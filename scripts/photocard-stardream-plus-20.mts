/**
 * ✨📄 โฟโต้การ์ด + ปฏิทินโฟโต้การ์ด: กระดาษ Stardream (มุกขาว / Crystal) 285 แกรม แพงกว่ากลุ่ม 100 Pound +฿20 ทุกขั้น — พนักงานแจ้ง 23 ต.ค. 69
 *   "ปกติกระดาษ stardream จะแพงกว่าพวกร้อยปอนด์ 20 บาทต่อ 1 A3" · "น่าจะเริ่มที่ 180 บาทต่อ 1 เซต"
 *   ปลีก 160/125/120/115 → 180/145/140/135 · ตัวแทน +20 เท่ากัน · ปฏิทินบวกทุกเคลือบ
 *
 *   npx tsx scripts/photocard-stardream-plus-20.mts            # ดูผล (ไม่เขียน)
 *   npx tsx scripts/photocard-stardream-plus-20.mts --write    # บันทึกจริง + ล้างแคชหน้าสินค้าบนเว็บจริง
 *
 * ยึดราคา 100 Pound ในตารางเดียวกันเป็นฐาน (= ฐาน + 20) → รันซ้ำได้ไม่บวกซ้อน · สำรองไว้ backups/
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { priceRange, type Product } from "../src/lib/products";
import { revalidateLive } from "./lib/revalidate-live.mts";

const WRITE = process.argv.includes("--write");
const IDS = ["photocard-digital", "calendar-photocard"];
const BASE = "100 Pound Paper (หนา 300gsm)";
const STAR = ["Stardream Paper 285 แกรม", "Stardream Crystal Paper 285 แกรม"];
const EXTRA = 20;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
) as Record<string, string>;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: rows, error } = await sb.from("products").select("id,data").in("id", IDS);
if (error) throw error;

for (const id of IDS) {
  const pc = rows!.find((r) => r.id === id)!.data as Product;
  const next = structuredClone(pc);
  let changed = 0;
  for (const rate of next.priceRates ?? []) {
    const cells = rate.pricing.cells;
    for (const key of Object.keys(cells)) {
      const parts = key.split("│");
      if (!STAR.includes(parts[0])) continue;
      const baseKey = [BASE, ...parts.slice(1)].join("│");
      const base = cells[baseKey];
      if (!base) throw new Error(`${id} ${rate.id}: ไม่มีช่องฐาน ${baseKey}`);
      const want = base.map((v) => v + EXTRA);
      if (JSON.stringify(cells[key]) === JSON.stringify(want)) continue;
      console.log(`  ${id} ${rate.id} ${key}: ${cells[key].join("/")} → ${want.join("/")}`);
      cells[key] = want;
      changed++;
    }
  }
  // ราคาแสดงหลัก (pricing) = เรทปลีกตัวแรก
  const main = next.priceRates?.find((r) => !r.dealerOnly);
  if (main) next.pricing = main.pricing;
  const range = priceRange(next);
  next.price = range.min;
  next.priceMin = range.min;
  next.priceMax = range.max;
  console.log(`${id}: แก้ ${changed} ช่อง · ราคา ${pc.priceMin}-${pc.priceMax} → ${range.min}-${range.max}`);
  if (!changed || !WRITE) continue;
  mkdirSync(new URL("../backups", import.meta.url), { recursive: true });
  writeFileSync(new URL(`../backups/photocard-stardream-plus-20-${id}-${Date.now()}.json`, import.meta.url), JSON.stringify(pc));
  const { error: e } = await sb.from("products").update({ data: next }).eq("id", id);
  if (e) throw e;
  await revalidateLive(env, { productIds: [id] });
  console.log(`✅ ${id} บันทึกแล้ว`);
}
