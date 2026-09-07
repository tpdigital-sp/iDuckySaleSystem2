/**
 * เข็มกลัดอะคริลิค · เรทที่ 2 แบบไม่คละดีเทล — ขอบเขตขั้นราคา (upTo) ไม่ตรงกับป้าย
 *
 * ป้ายบอก 50-100 / 101-199 / 200++ แต่ upTo ที่ฝังไว้เป็น 199 / 499 / ∞
 * → สั่ง 120 ชิ้น ตกขั้นแรก (฿35/ชิ้น) ทั้งที่ป้ายบอกว่าต้องเป็นขั้น 101-199 (฿30/ชิ้น)
 *
 * แก้ upTo ให้ตรงกับป้าย: 100 / 199 / null
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WANT = { "50-100 ชิ้น": 100, "101-199 ชิ้น": 199, "200++": null };

const { data: p, error } = await sb.from("products").select("id,name,data").eq("id", "1").single();
if (error) throw error;
const rate = (p.data.priceRates ?? []).find((r) => r.label === "เรทที่ 2 แบบไม่คละดีเทล" && !r.dealerOnly);
if (!rate) throw new Error("ไม่เจอเรทที่ 2 (สาธารณะ)");
let changed = 0;
for (const t of rate.pricing.tiers) {
  if (!(t.label in WANT)) throw new Error(`ป้ายขั้นราคาไม่ตรงที่คาด: "${t.label}"`);
  const want = WANT[t.label];
  if (t.upTo !== want) {
    console.log(`  "${t.label}": upTo ${t.upTo} → ${want}`);
    t.upTo = want;
    changed++;
  }
}
if (!changed) {
  console.log("ตรงอยู่แล้ว ไม่ต้องแก้");
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: p.data }).eq("id", "1");
if (e2) throw e2;
console.log(`✅ ${p.name}: แก้ขอบเขตขั้นราคา ${changed} ขั้น`);
