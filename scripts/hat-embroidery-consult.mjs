/**
 * 💬 หมวก (Bucket / แก๊ป): บังคับคุยลายกับแอดมิน "เฉพาะเมื่อเลือกเรทงานปัก"
 *
 * ใช้สวิตช์ระดับสินค้า (Product.artworkConsult) + เงื่อนไข when — ตั้งที่เดียวจบในกล่อง 💬
 * ของหลังบ้าน ไม่ต้องไล่ติ๊กตามเรท/ตามตัวเลือก · เรทพิมพ์ DTF | FLEX สั่งได้เลยตามปกติ
 * (รอบก่อนเคยเก็บไว้ที่ PriceRate.consult — สคริปต์นี้ย้ายมาให้ + ล้างของเก่าทิ้ง)
 *
 * รันดูก่อน:  node scripts/hat-embroidery-consult.mjs
 * เขียนจริง:  node scripts/hat-embroidery-consult.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WRITE = process.argv.includes("--write");
const IDS = ["new-mt2omund-2845", "new-mt2omp9n-3490"]; // หมวก Bucket / หมวกแก๊ป
const RATE_LABEL = "เรทราคา";
const NOTE =
  "งานปักต้องคุยลายกับแอดมินก่อนนะครับ — ส่งไฟล์/แบบที่อยากได้มาทางไลน์ ทางร้านจะแปลงไฟล์ปักแล้วตีลายให้ดูก่อน (ลายเส้นเล็ก/ตัวหนังสือเล็กบางแบบปักไม่ขึ้น ต้องปรับให้เหมาะกับงานปัก) ตกลงแบบกันเรียบร้อยแล้วค่อยกดสั่ง";

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data,name").eq("id", id).single();
  if (error) {
    console.log(`❌ ${id}: ${error.message}`);
    continue;
  }
  const d = row.data;
  // ชื่อเรทที่มีคำว่า "ปัก" = เรทที่ต้องคุยลายก่อน
  const embRates = (d.priceRates ?? []).filter((r) => /ปัก/.test(r.label ?? "")).map((r) => r.label);
  if (!embRates.length) {
    console.log(`❌ ${id} (${row.name}): ไม่เจอเรทงานปัก — ข้าม`);
    continue;
  }
  const artworkConsult = { enabled: true, note: NOTE, when: { label: RATE_LABEL, choices: embRates } };
  // ล้าง consult รายเรทของรอบก่อนทิ้ง (ย้ายมาไว้ระดับสินค้าแล้ว)
  let staleRates = 0;
  const priceRates = (d.priceRates ?? []).map((r) => {
    if (!r.consult) return r;
    staleRates++;
    const { consult: _drop, ...rest } = r;
    return rest;
  });

  // ⚠️ jsonb ของ Postgres เรียงคีย์ใหม่ตอนอ่านกลับ — เทียบด้วย JSON.stringify ตรง ๆ ไม่ตรงตลอด
  const norm = (v) => JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)))
      : x
  );
  const same = norm(d.artworkConsult) === norm(artworkConsult) && !staleRates;
  console.log(`\n=== ${id} · ${row.name}`);
  console.log(`   💬 บังคับคุยลายเมื่อ: ${RATE_LABEL} = ${embRates.join(" / ")}`);
  for (const r of priceRates)
    console.log(`   เรท "${r.label}" → ${embRates.includes(r.label) ? "ต้องคุยลายก่อน (บล็อกจนกว่าจะติ๊กยืนยัน)" : "สั่งได้เลย"}`);
  if (staleRates) console.log(`   🧹 ล้าง consult รายเรทของเดิม ${staleRates} จุด`);

  if (same) {
    console.log("   (ตั้งไว้ตรงแล้ว ไม่ต้องแก้)");
    continue;
  }
  if (!WRITE) {
    console.log("   [dry-run] ใส่ --write เพื่อเขียนจริง");
    continue;
  }
  const { error: upErr } = await sb
    .from("products")
    .update({ data: { ...d, artworkConsult, priceRates } })
    .eq("id", id);
  console.log(upErr ? `   ❌ เขียนไม่สำเร็จ: ${upErr.message}` : "   ✅ เขียนลง DB แล้ว");
}
