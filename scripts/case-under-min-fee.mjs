/**
 * เคสมือถือ 7 ตัว — กติกาคละลายใหม่ (ผู้ใช้สั่ง 26 ส.ค. 69):
 *
 *   • ขั้นต่ำลายละ 3 ชิ้น (เฉพาะช่วง 11 ชิ้นขึ้นไป) · 1-10 ชิ้น คละได้อิสระ (เท่าเดิม)
 *   • 11 ชิ้นขึ้นไป ลายไหนไม่ถึง 3 ชิ้น = ไม่บล็อกแล้ว แต่คิด "ส่วนต่าง" จากชิ้นในลายที่ไม่ถึง ชิ้นละ 10 บาท
 *       เช่น 11 ชิ้น 4 ลาย (3+3+3+2) → 2 ชิ้นไม่ถึง → +20 บาท · ราคา/ชิ้นยังคิดเรทส่งตามยอดรวม
 *   • ตะกร้ารวมคนละรุ่นคิดเรทตามยอดรวมได้ (repriceCartGroups รองรับอยู่แล้ว)
 *
 * ทำอะไร: 1) priceRates[0].underMinPieceFee = 10
 *         2) ถอด hardMaxDesigns (เลิกล็อกช่องจำนวนลาย)
 *         3) แก้ข้อความกติกาเก่า "ไม่ถึงตามจำนวน คิดตามราคาปลีก" ทุกที่ (rate.desc / description / FAQ / tabs)
 *
 *   node scripts/case-under-min-fee.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/case-under-min-fee.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const FEE = 10;
const IDS = [
  "case-frame-card",
  "case-premium-clear",
  "case-premium-edge",
  "case-magsafe",
  "case-mirror",
  "case-glass",
  "case-card",
];

// ข้อความกติกาเก่า → ใหม่ (ครอบทุกสำนวนที่พบใน rate.desc / description / seo.faqs)
const TEXT_SWAPS = [
  ["ขั้นต่ำลายละ 3 ชิ้น · ไม่ถึงตามจำนวน คิดตามราคาปลีก", "ขั้นต่ำลายละ 3 ชิ้น · ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท"],
  ["ขั้นต่ำลายละ 3 ชิ้น — ไม่ถึงตามจำนวน คิดตามราคาปลีก", "ขั้นต่ำลายละ 3 ชิ้น — ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท"],
  [
    "ขั้นต่ำลายละ 3 ชิ้น ถ้าไม่ถึงตามจำนวนจะคิดตามราคาปลีก",
    "ขั้นต่ำลายละ 3 ชิ้น ลายไหนไม่ถึง 3 ชิ้น คิดส่วนต่างชิ้นละ 10 บาท (เช่น มีลายหนึ่ง 2 ชิ้น = +20 บาท) และสั่งเคสคนละรุ่นก็รวมจำนวนคิดเรทส่งได้",
  ],
];

/** เดินทุก string ในก้อน data แล้วแทนข้อความกติกาเก่า — คืนจำนวนจุดที่แก้ */
function swapDeep(node) {
  let hits = 0;
  if (typeof node === "string") {
    let s = node;
    for (const [from, to] of TEXT_SWAPS) if (s.includes(from)) { s = s.split(from).join(to); hits++; }
    return [s, hits];
  }
  if (Array.isArray(node)) {
    const out = node.map((v) => { const [nv, h] = swapDeep(v); hits += h; return nv; });
    return [out, hits];
  }
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) { const [nv, h] = swapDeep(v); hits += h; out[k] = nv; }
    return [out, hits];
  }
  return [node, hits];
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: rows, error } = await sb.from("products").select("id,data").in("id", IDS);
if (error) throw error;
if (rows.length !== IDS.length)
  console.warn(`⚠️ เจอ ${rows.length}/${IDS.length} ตัว — ขาด: ${IDS.filter((id) => !rows.some((r) => r.id === id)).join(", ")}`);

for (const row of rows) {
  const [data, textHits] = swapDeep(row.data);
  const r1 = data.priceRates?.[0];
  if (!r1) { console.error(`❌ ${row.id}: ไม่มี priceRates — ข้าม`); continue; }
  const before = { fee: r1.underMinPieceFee, hard: data.hardMaxDesigns };
  r1.underMinPieceFee = FEE;
  delete data.hardMaxDesigns; // เลิกล็อกช่องลาย — คละไม่ถึงขั้นต่ำได้ จ่ายส่วนต่างแทน

  console.log(
    `${row.id}: underMinPieceFee ${before.fee ?? "—"} → ${FEE} · hardMaxDesigns ${before.hard ?? "—"} → ถอด · แก้ข้อความ ${textHits} จุด`
  );
  if (textHits < 3) console.warn(`   ⚠️ ข้อความกติกาเก่าเจอแค่ ${textHits} จุด (คาด ≥3: rate.desc + description + FAQ) — เช็คด้วยตา`);

  if (WRITE) {
    const { error: e } = await sb.from("products").update({ data }).eq("id", row.id);
    if (e) throw e;
  }
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
