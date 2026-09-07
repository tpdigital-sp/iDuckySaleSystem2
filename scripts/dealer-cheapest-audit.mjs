/**
 * 🤝 ตรวจว่า "ราคาตัวแทนถูกที่สุดเสมอ" — ทุกสินค้า ทุกคอลัมน์ ทุกช่วงจำนวน
 *
 * กติกาเจ้าของร้าน (7 ก.ย. 69): ตัวแทนต้องไม่มีทางจ่ายแพงกว่าลูกค้าทั่วไปในสเปคเดียวกัน
 * เทียบ "ราคาดีที่สุดที่ตัวแทนหยิบได้" กับ "ราคาดีที่สุดของลูกค้าทั่วไป" ที่จำนวนเดียวกัน
 * (เรทที่ขั้นต่ำเกินจำนวนนั้นไม่ถูกนับ — ยกเว้นไม่มีเรทไหนเข้าเลย ใช้เรทแรกตาม pickRateForQty)
 *
 * รัน: node scripts/dealer-cheapest-audit.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const QTYS = [1, 2, 5, 10, 11, 12, 25, 30, 49, 50, 51, 100, 101, 120, 199, 200, 300, 499, 500, 1000, 5000, 9999, 10000, 20000, 50000];
const tierIndex = (m, qty) => {
  for (let i = 0; i < m.tiers.length; i++) if (m.tiers[i].upTo == null || qty <= m.tiers[i].upTo) return i;
  return Math.max(0, m.tiers.length - 1);
};
/** ราคาถูกสุดของคอลัมน์ key ที่จำนวน qty จากชุดเรทที่ให้มา (undefined = คอลัมน์นี้ไม่มีราคา) */
function bestOf(rates, key, qty) {
  const usable = rates.filter((r) => (r.minQty ?? 1) <= qty);
  const pool = usable.length ? usable : rates.slice(0, 1); // ไม่เข้าเรทไหนเลย = เรทแรก (pickRateForQty)
  let best;
  for (const r of pool) {
    const v = r.pricing?.cells?.[key]?.[tierIndex(r.pricing, qty)];
    if (v > 0 && (best === undefined || v < best)) best = v;
  }
  return best;
}

const rows = [];
for (let from = 0; ; from += 60) {
  const { data: page, error } = await sb.from("products").select("id,name,category,data").order("id").range(from, from + 59);
  if (error) throw error;
  rows.push(...(page ?? []));
  if ((page ?? []).length < 60) break;
}

let checked = 0, badProducts = 0, noDealer = [];
for (const row of rows) {
  if (String(row.category ?? "").startsWith("__")) continue;
  const rates = row.data?.priceRates ?? [];
  const pub = rates.filter((r) => !r.dealerOnly);
  const dea = rates.filter((r) => r.dealerOnly);
  if (!pub.length && row.data?.pricing) pub.push({ id: "r1", label: "เรทราคาปกติ", pricing: row.data.pricing });
  if (!pub.length) continue;
  if (!dea.length) { noDealer.push(`${row.id} (${row.name})`); continue; }
  checked++;
  const keys = new Set(pub.flatMap((r) => Object.keys(r.pricing?.cells ?? {})));
  const bad = [];
  for (const key of keys) {
    for (const qty of QTYS) {
      const p = bestOf(pub, key, qty), d = bestOf(dea, key, qty);
      if (p === undefined) continue;
      if (d === undefined) { bad.push(`${qty} หน่วย · ${key || "(คอลัมน์เดียว)"}: ตัวแทนไม่มีราคาคอลัมน์นี้ (ปกติ ฿${p})`); continue; }
      if (d > p) bad.push(`${qty} หน่วย · ${key || "(คอลัมน์เดียว)"}: ตัวแทน ฿${d} > ปกติ ฿${p}`);
    }
  }
  if (bad.length) {
    badProducts++;
    console.log(`\n❌ ${row.id} · ${row.name} — ${bad.length} จุด`);
    console.log("   " + bad.slice(0, 6).join("\n   ") + (bad.length > 6 ? `\n   … อีก ${bad.length - 6} จุด` : ""));
  }
}
console.log(`\nตรวจ ${checked} สินค้าที่มีเรทตัวแทน · ผิดกติกา ${badProducts} ตัว`);
if (noDealer.length) console.log(`ยังไม่มีเรทตัวแทน ${noDealer.length} ตัว: ${noDealer.slice(0, 10).join(" · ")}${noDealer.length > 10 ? " …" : ""}`);
