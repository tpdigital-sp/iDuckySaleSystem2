/**
 * 💬 หมวก (Bucket / แก๊ป): เลือกเรท "งานปัก" แล้วต้องคุยลายกับแอดมินก่อนสั่ง
 *
 * งานปักต้องแปลงไฟล์/ตีลายให้ลูกค้าดูก่อนถึงจะเริ่มผลิตได้ ส่วนเรทพิมพ์ DTF | FLEX สั่งได้เลยตามปกติ
 * ตั้งที่ PriceRate.consult (กลไกใหม่ 26 ส.ค. 69) — หน้าสินค้าจะโชว์กล่องเขียว "ทักไลน์ส่งลายให้แอดมินดู"
 * เฉพาะตอนลูกค้าเลือกเรทงานปัก และไม่บังคับแนบลาย (ไฟล์จริงตกลงกันในแชท)
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
/** เรทที่ต้องคุยลายก่อน — เทียบจากชื่อเรท */
const NEEDS_CONSULT = (label) => /ปัก/.test(label ?? "");

const NOTE =
  "งานปักต้องคุยลายกับแอดมินก่อนนะครับ — ส่งไฟล์/แบบที่อยากได้มาทางไลน์ ทางร้านจะแปลงไฟล์ปักแล้วตีลายให้ดูก่อน (ลายเส้นเล็ก/ตัวหนังสือเล็กบางแบบปักไม่ขึ้น ต้องปรับให้เหมาะกับงานปัก) ตกลงแบบกันเรียบร้อยแล้วค่อยกดสั่ง";

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data,name").eq("id", id).single();
  if (error) {
    console.log(`❌ ${id}: ${error.message}`);
    continue;
  }
  const d = row.data;
  const rates = d.priceRates ?? [];
  if (!rates.length) {
    console.log(`❌ ${id} (${row.name}): ไม่มี priceRates — ข้าม`);
    continue;
  }
  let touched = 0;
  const next = rates.map((r) => {
    if (!NEEDS_CONSULT(r.label)) {
      // เรทงานพิมพ์: ต้องไม่มี consult ค้าง (เผื่อเคยตั้งผิด)
      if (r.consult) {
        touched++;
        const { consult: _drop, ...rest } = r;
        return rest;
      }
      return r;
    }
    if (r.consult?.enabled && r.consult.note === NOTE) return r;
    touched++;
    return { ...r, consult: { enabled: true, note: NOTE } };
  });

  console.log(`\n=== ${id} · ${row.name}`);
  for (const r of next) console.log(`   เรท "${r.label}" → ${r.consult?.enabled ? "💬 ต้องคุยลายก่อนสั่ง (บล็อกจนกว่าจะติ๊กยืนยัน)" : "สั่งได้เลย"}`);
  console.log(`   artworkRequired: ${d.artworkRequired === false ? "ไม่บังคับ" : "บังคับ"} → ตอนเลือกเรทงานปัก ระบบจะไม่บังคับแนบลายให้เอง`);

  if (!touched) {
    console.log("   (ไม่มีอะไรต้องแก้)");
    continue;
  }
  if (!WRITE) {
    console.log(`   [dry-run] จะแก้ ${touched} เรท — ใส่ --write เพื่อเขียนจริง`);
    continue;
  }
  const { error: upErr } = await sb.from("products").update({ data: { ...d, priceRates: next } }).eq("id", id);
  console.log(upErr ? `   ❌ เขียนไม่สำเร็จ: ${upErr.message}` : `   ✅ เขียนลง DB แล้ว (${touched} เรท)`);
}
