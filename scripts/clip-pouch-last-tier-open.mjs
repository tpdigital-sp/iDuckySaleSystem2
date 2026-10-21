/**
 * 🩹 clip-pouch — ขั้นสุดท้าย "1000 ใบขึ้นไป" ตั้ง upTo 1000 แทนไม่จำกัด (เจ้าของร้านสั่ง 21 ต.ค. 69)
 * ราคาไม่พลาด (tierIndex ตกขั้นสุดท้ายอยู่ดี) แต่ป้ายตารางตัวแทนออกเป็น "1000-1000" → ตั้ง upTo = null ทั้ง data.pricing และ priceRates (ทุกเรทที่ขั้นสุดท้ายมีป้าย "ขึ้นไป" แต่ upTo ไม่ใช่ null)
 * รัน: node scripts/clip-pouch-last-tier-open.mjs [--write] · รันซ้ำได้ · ต่อด้วย node scripts/dealer-rates-apply.mjs --apply --only=clip-pouch
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const WRITE = process.argv.includes("--write");
const ID = "clip-pouch";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("❌ " + m); process.exit(1); };

const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", ID).single();
if (error) die(error.message);
const d = structuredClone(row.data);
const log = [];
function openLast(m, where) {
  const last = m?.tiers?.at(-1);
  if (!last) return;
  if (last.upTo == null) { log.push(`${where}: "${last.label}" ไม่จำกัดอยู่แล้ว`); return; }
  if (!/ขึ้นไป|\+/.test(last.label ?? "")) die(`${where}: ป้ายขั้นสุดท้าย "${last.label}" ไม่ได้บอกว่าไม่จำกัด — ตรวจก่อน`);
  log.push(`${where}: "${last.label}" upTo ${last.upTo} → null`);
  last.upTo = null;
}
openLast(d.pricing, "data.pricing");
(d.priceRates ?? []).forEach((r, i) => { if (!r.dealerOnly) openLast(r.pricing, `priceRates[${i}] ${r.id}`); });
console.log(`${WRITE ? "✍️ เขียน" : "🔍 dry-run"} ${ID} · ${row.name}\n  ` + log.join("\n  "));
if (JSON.stringify(d) === JSON.stringify(row.data)) { console.log("✓ เป็นค่าใหม่อยู่แล้ว"); process.exit(0); }
if (!WRITE) { console.log("(ใส่ --write เพื่อบันทึก)"); process.exit(0); }
d.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("id");
if (e2 || !upd?.length) die(`เขียนไม่สำเร็จ ${e2?.message ?? "0 แถว"}`);
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const b = back?.data ?? {};
const ok = b.savedAt === d.savedAt && b.pricing?.tiers?.at(-1)?.upTo === null && (b.priceRates ?? []).filter((r) => !r.dealerOnly).every((r) => r.pricing?.tiers?.at(-1)?.upTo === null);
if (!ok) die("อ่านกลับไม่ตรง — รันซ้ำ");
console.log("✅ เขียนแล้ว อ่านกลับตรง · savedAt", d.savedAt, "\n👉 node scripts/dealer-rates-apply.mjs --apply --only=clip-pouch");
