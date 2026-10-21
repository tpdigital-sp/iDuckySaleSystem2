// 🔍 หาช่องว่าง/ทับซ้อนระหว่างขั้นราคา — อ่านอย่างเดียว · คู่กับ tier-bounds-audit.mjs
//   ช่องว่าง: ป้ายขั้นถัดไปเริ่ม "เกิน" upTo+1 ของขั้นก่อน (3-9 แล้ว 12-49 → 10-11 ตกไปขั้นหลังเงียบ ๆ ได้ราคาส่งทั้งที่ควรปลีก)
//   ทับซ้อน: ป้ายขั้นถัดไปเริ่ม "ไม่เกิน" upTo ของขั้นก่อน (31-50 แล้ว 50 ขึ้นไป → จำนวน 50 ใช้ขั้นก่อน ป้ายกำกวมแต่ราคาไม่พลาด)
//   รัน: node scripts/tier-gap-audit.mjs            → เฉพาะช่องว่าง
//        node scripts/tier-gap-audit.mjs --overlap  → รวมทับซ้อนด้วย
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const SHOW_OVERLAP = process.argv.includes("--overlap");
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const data = [];
for (let from = 0; ; from += 60) {
  const { data: page, error } = await sb.from("products").select("id,name,data").order("id").range(from, from + 59);
  if (error) throw error;
  data.push(...(page ?? []));
  if ((page ?? []).length < 60) break;
}
/** เลขเริ่มของป้าย — ตัด "A3/A4/A5" ทิ้งก่อน ไม่งั้นอ่าน "5000 แผ่น A3ขึ้นไป" เป็น 3 */
const startOf = (s) => {
  const t = String(s).replace(/,/g, "").replace(/\bA\d\b/gi, " ");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
let gaps = 0, overlaps = 0;
for (const p of data) {
  const rates = [...(p.data?.priceRates ?? []), ...(p.data?.pricing ? [{ id: "(pricing)", label: "(pricing เดี่ยว)", pricing: p.data.pricing }] : [])];
  for (const r of rates) {
    const tiers = r.pricing?.tiers ?? [];
    const issues = [];
    for (let i = 1; i < tiers.length; i++) {
      const prev = tiers[i - 1], cur = tiers[i];
      const start = startOf(cur.label ?? "");
      if (start == null || prev.upTo == null) continue;
      if (start > prev.upTo + 1) { gaps++; issues.push(`  ❌ ช่องว่าง ${prev.upTo + 1}-${start - 1}: #${i - 1} "${prev.label}" (upTo ${prev.upTo}) → #${i} "${cur.label}" — จำนวนในช่องว่างตกไปขั้น #${i}`); }
      else if (start <= prev.upTo && SHOW_OVERLAP) { overlaps++; issues.push(`  ⚠️ ทับซ้อน ${start}-${prev.upTo}: #${i - 1} "${prev.label}" (upTo ${prev.upTo}) → #${i} "${cur.label}" — ใช้ขั้น #${i - 1}`); }
    }
    if (issues.length) { console.log(`\n${p.id} · ${p.name} · ${r.id} ${r.label}${p.data?.hidden ? " (ร่าง)" : ""}`); console.log(issues.join("\n")); }
  }
}
console.log(`\nรวม ช่องว่าง ${gaps} จุด${SHOW_OVERLAP ? ` · ทับซ้อน ${overlaps} จุด` : ""} (จาก ${data.length} สินค้า)`);
