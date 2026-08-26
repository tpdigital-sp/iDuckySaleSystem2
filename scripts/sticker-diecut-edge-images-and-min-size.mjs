/**
 * สติ๊กเกอร์ 8 ตัว (Digital · UV · NEON · RainBow · สะท้อนแสง · Gold|Silver|RoseGold · Hologram · Solvent)
 * — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * 1) กลุ่ม "ขอบไดคัท" มีรูปประจำตัวเลือก — ครอปจากชาร์ต "ตัวอย่างเส้นไดคัท" ของร้าน
 *    (ไดรฟ์ข้อมูลตอบลูกค้า → STK - ไดคัทมี-ไม่มีขอบ.jpg) เก็บต้นฉบับที่ scripts/assets/
 *    อัปเข้า storage ที่ products/shared/ ครั้งเดียว ใช้ร่วมกันทุกตัว (รูปเดียวกันเป๊ะ ไม่ต้องอัปซ้ำ 8 ที่)
 * 2) ขนาดเล็กสุดของ "📐 กำหนดขนาดเอง"
 *      • ไดคัท 50% (ตัดตามขนาด)  → เล็กสุด 5 × 5 ซม.
 *      • ไดคัท 100% (ตัดขาดทีละชิ้น) → เล็กสุด 2 × 2 ซม.
 *    เพดานทั้งสองโหมด = แผ่น A3 → ด้านกว้าง ≤ 29.7 · ด้านสูง ≤ 42 ซม.
 * 3) ตัวที่ขายทั้งสองขอบ — เอาชาร์ตเต็มใส่แท็บ "ข้อควรทราบ" ให้ลูกค้าเทียบก่อนเลือก
 *    (มีบรรทัดสำคัญ: ไดคัทเข้าเนื้อควรเผื่อระยะตัดตก 0.25 mm)
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก/ไม่อัปรูป
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const EDGE = "ขอบไดคัท";
const BORDER = "ไดคัทมีขอบ";
const INTO = "ไดคัทเข้าเนื้อ";
const CUT_MIN = 5; // ไดคัท 50% — ตัดตามขนาด
const DIE_MIN = 2; // ไดคัท 100% — ไดคัททีละชิ้น
const SHEET_MAX = { w: 29.7, h: 42 };

const IDS = [
  "sticker-pp",
  "sticker-uv",
  "neon",
  "sticker-rainbow-film",
  "reflective-sticker",
  "sticker-gold-silver-rosegold",
  "sticker-hologram",
  "sticker-solvent",
];

/** รูปที่อัปเข้า storage — ครอปไว้แล้วใน scripts/assets (ดูหัวไฟล์) */
const ASSETS = [
  { key: "border", file: "diecut-edge-border.jpg", src: "scripts/assets/sticker-diecut-edge-border.jpg" },
  { key: "into", file: "diecut-edge-into.jpg", src: "scripts/assets/sticker-diecut-edge-into.jpg" },
  { key: "chart", file: "diecut-edge-chart.jpg", src: "scripts/assets/sticker-diecut-edge-chart.jpg" },
];

const isCutInput = (l) => /^ขนาดตัด.*\((กว้าง|สูง)\)$/.test(l);
const isDieInput = (l) => /^ขนาดไดคัท.*\((กว้าง|สูง)\)$/.test(l);
const isWidth = (l) => /\(กว้าง\)$/.test(l);
const CUT_HINT =
  `ขนาดชิ้นงานหลังตัด เล็กสุด ${CUT_MIN} × ${CUT_MIN} ซม. ใหญ่สุดเท่าแผ่น A3 (${SHEET_MAX.w} × ${SHEET_MAX.h} ซม.)` +
  " — งานแนวนอนกรอกด้านยาวลงช่อง “สูง” ได้";
const DIE_HINT =
  `ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด — เล็กสุด ${DIE_MIN} × ${DIE_MIN} ซม. ใหญ่สุดเท่าแผ่น A3 (${SHEET_MAX.w} × ${SHEET_MAX.h} ซม.)`;

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ── อัปรูปที่ใช้ร่วมกัน ─────────────────────────────────────────── */
const url = {};
for (const a of ASSETS) {
  url[a.key] = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/shared/${a.file}`;
  if (!WRITE) continue;
  const buf = fs.readFileSync(a.src);
  const up = await sb.storage.from("product-images").upload(`products/shared/${a.file}`, buf, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) throw new Error(`อัป ${a.file}: ${up.error.message}`);
  console.log(`อัป ${a.file} (${(buf.length / 1024).toFixed(0)} KB)`);
}

/* ── ไล่ทีละสินค้า ───────────────────────────────────────────────── */
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) {
    console.log(`\n=== ${id} — ❌ ${error?.message || "ไม่พบสินค้า"}`);
    continue;
  }
  const p = row.data;
  const log = [];

  // 1) รูปประจำตัวเลือกในกลุ่มขอบไดคัท
  const edge = (p.options || []).find((o) => o.label === EDGE);
  let bothEdges = false;
  if (!edge) {
    log.push(`⚠️ ไม่มีกลุ่ม "${EDGE}" — ข้ามเรื่องรูป`);
  } else {
    const names = (edge.choices || []).map((c) => c.name);
    bothEdges = names.includes(BORDER) && names.includes(INTO);
    for (const c of edge.choices || []) {
      if (c.name === BORDER) c.imageSrc = url.border;
      else if (c.name === INTO) c.imageSrc = url.into;
    }
    log.push(`รูปการ์ด: ${names.map((n) => n + (n === BORDER || n === INTO ? " 📷" : " (ไม่รู้จัก)")).join(" · ")}`);
  }

  // 2) ขนาดเล็กสุดของช่องกรอกกำหนดขนาดเอง
  const sized = [];
  for (const o of p.options || []) {
    if (o.display !== "input" || !o.input) continue;
    const max = isWidth(o.label) ? SHEET_MAX.w : SHEET_MAX.h;
    if (isCutInput(o.label)) {
      o.input = { ...o.input, min: CUT_MIN, max, ...(isWidth(o.label) ? { hint: CUT_HINT } : {}) };
      sized.push(`${o.label} ${CUT_MIN}–${max}`);
    } else if (isDieInput(o.label)) {
      o.input = { ...o.input, min: DIE_MIN, max, ...(isWidth(o.label) ? { hint: DIE_HINT } : {}) };
      sized.push(`${o.label} ${DIE_MIN}–${max}`);
    }
  }
  log.push(sized.length ? `เล็กสุด: ${sized.join(" · ")}` : "⚠️ สินค้านี้ไม่มีช่องกรอกกำหนดขนาดเอง — ไม่มีอะไรให้ตั้งเล็กสุด");

  // 3) ชาร์ตเทียบขอบไดคัทในแท็บ (เฉพาะตัวที่ขายทั้งสองแบบ)
  if (bothEdges) {
    const tab = (p.tabs || []).find((t) => t.title === "ข้อควรทราบ") || (p.tabs || [])[0];
    if (tab) {
      tab.images = [...new Set([...(tab.images || []), url.chart])];
      if ((tab.images || []).length === 1) tab.imageSize = tab.imageSize || "lg";
      log.push(`ชาร์ตเทียบขอบไดคัท → แท็บ "${tab.title}" (${tab.images.length} รูป)`);
    }
  }

  console.log(`\n=== ${id} — ${p.name || ""}`);
  log.forEach((l) => console.log("   •", l));

  if (!WRITE) continue;
  const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
  console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
}

if (!WRITE) console.log("\n(ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
