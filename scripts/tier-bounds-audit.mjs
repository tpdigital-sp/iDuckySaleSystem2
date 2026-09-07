import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
// ดึงทีละหน้า — select ทั้งตารางรวดเดียวชน statement timeout
const data = [];
for (let from = 0; ; from += 60) {
  const { data: page, error } = await sb.from("products").select("id,name,data").order("id").range(from, from + 59);
  if (error) throw error;
  data.push(...(page ?? []));
  if ((page ?? []).length < 60) break;
}
const num = (s) => {
  // ดึงช่วงตัวเลขจากป้าย เช่น "101-199 ชิ้น" → [101,199] · "200++"/"500 ขึ้นไป" → [200,null]
  const t = String(s).replace(/,/g, "");
  const m = t.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return [Number(m[1]), Number(m[2])];
  const m2 = t.match(/(\d+)\s*(\+\+|\+|ขึ้นไป|up)/i);
  if (m2) return [Number(m2[1]), null];
  const m3 = t.match(/(\d+)/);
  return m3 ? [Number(m3[1]), Number(m3[1])] : null;
};
let bad = 0;
for (const p of data) {
  const rates = [...(p.data?.priceRates ?? []), ...(p.data?.pricing ? [{ label: "(pricing เดี่ยว)", pricing: p.data.pricing }] : [])];
  for (const r of rates) {
    const tiers = r.pricing?.tiers ?? [];
    const issues = [];
    tiers.forEach((t, i) => {
      const rng = num(t.label ?? "");
      if (!rng) return;
      const [lo, hi] = rng;
      if (hi !== null && t.upTo != null && hi !== t.upTo) issues.push(`  #${i} "${t.label}" upTo=${t.upTo} (ป้ายว่าจบที่ ${hi})`);
      if (hi === null && t.upTo != null) issues.push(`  #${i} "${t.label}" upTo=${t.upTo} (ป้ายว่าไม่จำกัด)`);
      if (hi !== null && t.upTo == null && i < tiers.length - 1) issues.push(`  #${i} "${t.label}" upTo=null (ป้ายว่าจบที่ ${hi})`);
    });
    if (issues.length) { bad++; console.log(`\n${p.id} · ${p.name} · ${r.label}`); console.log(issues.join("\n")); }
  }
}
console.log(`\nรวม ${bad} ตารางที่ป้ายกับ upTo ไม่ตรง (จาก ${data.length} สินค้า)`);
