/**
 * 🩹 ปิดช่องว่างขั้นราคา 4 สินค้า (เจ้าของร้านสั่ง 21 ต.ค. 69 หลังสแกนด้วย tier-gap-audit.mjs)
 *   canvas-frame 16-19 · clip-pouch 300-499 · lighter 2000-2999 · otherbag-7 30-49
 * กติกา: จำนวนในช่องว่างใช้ราคาของ "ขั้นก่อนหน้า" → ขยาย upTo ของขั้นก่อนให้ชนขั้นถัดไป (เริ่มของป้ายถัดไป − 1)
 *        + แก้ป้ายขั้นก่อนให้จบที่ค่าใหม่ (เช่น "11-15 อัน" → "11-19 อัน") · ราคาในช่องไม่แตะ
 * เขียนทุกเรท public ที่มีช่องว่าง + data.pricing (ตัวจริงของเรทแรก) ให้เหมือนกัน
 * รัน:  node scripts/tier-gap-close-4.mjs           → dry-run
 *       node scripts/tier-gap-close-4.mjs --write   → เขียนจริง + อ่านกลับเทียบ
 * รันซ้ำได้ · หลังเขียน: node scripts/dealer-rates-apply.mjs --apply --only=canvas-frame,clip-pouch,lighter,otherbag-7
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const IDS = ["canvas-frame", "clip-pouch", "lighter", "otherbag-7"];
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("❌ " + m); process.exit(1); };

const startOf = (s) => { const t = String(s).replace(/,/g, "").replace(/\bA\d\b/gi, " "); const m = t.match(/(\d+)/); return m ? Number(m[1]) : null; };
const fmt = (n, sample) => (/\d,\d/.test(sample) ? n.toLocaleString("en-US") : String(n));

/** ปิดช่องว่างใน tiers (in place) — คืนรายการที่แก้ */
function closeGaps(tiers) {
  const out = [];
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1], cur = tiers[i];
    const start = startOf(cur.label ?? "");
    if (start == null || prev.upTo == null || start <= prev.upTo + 1) continue;
    const newUp = start - 1;
    const oldLabel = prev.label ?? "";
    // ป้าย "a-b หน่วย" → "a-newUp หน่วย" (คงรูปแบบลูกน้ำ/หน่วยเดิม)
    const newLabel = oldLabel.replace(/(\d[\d,]*)(\s*[-–]\s*)(\d[\d,]*)/, (_, a, dash, b) => `${a}${dash}${fmt(newUp, b)}`);
    if (newLabel === oldLabel) die(`แก้ป้ายไม่ได้: "${oldLabel}"`);
    out.push(`#${i - 1} "${oldLabel}" upTo ${prev.upTo} → "${newLabel}" upTo ${newUp} (ช่องว่าง ${prev.upTo + 1}-${newUp} ใช้ราคาขั้นนี้)`);
    prev.upTo = newUp; prev.label = newLabel;
  }
  return out;
}

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", IDS);
if (error) die(error.message);
if (rows.length !== IDS.length) die(`หาสินค้าไม่ครบ (เจอ ${rows.map((r) => r.id).join(",")})`);

const todo = [];
for (const row of rows.sort((a, b) => IDS.indexOf(a.id) - IDS.indexOf(b.id))) {
  const d = structuredClone(row.data);
  const log = [];
  const pub = (d.priceRates ?? []).filter((r) => !r.dealerOnly);
  pub.forEach((r, i) => { for (const l of closeGaps(r.pricing?.tiers ?? [])) log.push(`  เรท ${r.id} ${r.label}: ${l}`); });
  if (d.pricing) for (const l of closeGaps(d.pricing.tiers ?? [])) log.push(`  data.pricing: ${l}`);
  // ตัวจริง/เงาของเรทแรกต้องเหมือนกันหลังแก้
  if (d.pricing && pub[0] && JSON.stringify(d.pricing.tiers) !== JSON.stringify(pub[0].pricing.tiers)) die(`${row.id}: data.pricing กับ priceRates[0] tiers ไม่ตรงกันหลังแก้`);
  console.log(`\n${row.id} · ${row.name}`);
  if (!log.length) { console.log("  ✓ ไม่มีช่องว่างแล้ว"); continue; }
  console.log(log.join("\n"));
  todo.push({ row, d });
}

if (!todo.length) { console.log("\n✓ ทุกตัวเป็นค่าใหม่อยู่แล้ว"); process.exit(0); }
if (!WRITE) { console.log(`\n(dry-run — ใส่ --write เพื่อบันทึก ${todo.length} สินค้า)`); process.exit(0); }

for (const { row, d } of todo) {
  d.savedAt = new Date().toISOString();
  const { data: upd, error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id).select("id");
  if (e2 || !upd?.length) die(`${row.id}: เขียนไม่สำเร็จ ${e2?.message ?? "0 แถว"}`);
  const { data: back } = await sb.from("products").select("data").eq("id", row.id).single();
  const b = back?.data ?? {};
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const ok = b.savedAt === d.savedAt && same(b.pricing?.tiers, d.pricing?.tiers) && same((b.priceRates ?? []).map((r) => r.pricing?.tiers), (d.priceRates ?? []).map((r) => r.pricing?.tiers)) && closeGaps(structuredClone(b.pricing?.tiers ?? [])).length === 0;
  if (!ok) die(`${row.id}: อ่านกลับไม่ตรง — รันซ้ำ`);
  console.log(`✅ ${row.id} เขียนแล้ว อ่านกลับตรง · savedAt ${d.savedAt}`);
}
console.log("\n👉 ต่อด้วย: node scripts/dealer-rates-apply.mjs --apply --only=" + todo.map((t) => t.row.id).join(","));
