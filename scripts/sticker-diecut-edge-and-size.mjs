/**
 * สติ๊กเกอร์ 7 ตัว (UV · Solvent Premium · RainBow · NEON · สะท้อนแสง · Gold/Silver/RoseGold · Hologram)
 * — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * 1) ขนาดตัด → "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" ใหญ่สุดเท่าแผ่น A3 = กว้าง 29.7 · สูง 42 ซม.
 *    พร้อมแก้สเปกแผ่นของคู่ช่องกรอกเป็นแผ่น A3 เต็ม (42 × 29.7 ไม่เว้นช่องไฟ) — เหมือนที่ทำกับ
 *    สติ๊กเกอร์ Digital: "ไดคัท 50%" คือหั่นแผ่นตามขนาด ไม่ใช่ไดคัททีละชิ้น จำนวนที่ได้ต้องตรงกับ
 *    ขนาดตายตัวข้าง ๆ (A4=2 · A5=4 · A6=8 · A7=16 ต่อแผ่น A3) ถ้ายังใช้พื้นที่วางของไดคัท 100%
 *    (43.76 × 28.89 ช่องไฟ 0.5) กรอก 29.7 × 42 จะได้ 0 ชิ้น = "ใหญ่เกินแผ่น"
 * 2) ขนาดไดคัท (โหมดไดคัท 100%) — เล็กสุด 2 ซม. ทั้งด้านกว้างและด้านสูง + แก้ข้อความ 1×1 cm ในแท็บ/เงื่อนไข
 * 3) กลุ่มใหม่ "ขอบไดคัท"
 *      • ไดคัทมีขอบ / ไดคัทเข้าเนื้อ → Sticker-UV, Solvent Premium
 *      • ไดคัทมีขอบ อย่างเดียว      → RainBow, NEON, สะท้อนแสง, Gold|Silver|RoseGold, Hologram
 *    แสดงเป็นการ์ด · แทรกหลังกลุ่มขนาด (ไม่มีกลุ่มขนาด = หลัง "แบบไดคัท")
 *    ตัวที่มีขอบอย่างเดียว: เก็บกวาดบรรทัดที่ยังพูดถึง "ไดคัทเข้าเนื้อ" ในเงื่อนไข/แท็บให้ตรงกัน
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const EDGE = "ขอบไดคัท";
const BORDER = {
  name: "ไดคัทมีขอบ",
  desc: "ตัดเว้นขอบรอบลายไว้เล็กน้อย ลายไม่โดนตัดกิน ขอบชิ้นเรียบสวย — แบบมาตรฐานที่สั่งกันบ่อยสุด",
};
const INTO = {
  name: "ไดคัทเข้าเนื้อ",
  desc: "ตัดชิดขอบลายพอดี ไม่เหลือขอบ ได้รูปทรงตามลายเป๊ะ · ตัดเข้าเนื้อสีจะมีฝุ่นหมึกติดที่ขอบงาน เช็ดออกได้",
};
const BORDER_ONLY_NOTE = "เนื้อนี้ไดคัทมีขอบอย่างเดียว — ไม่รับไดคัทเข้าเนื้อลาย";
/** บรรทัดแทนที่ของสินค้าที่ไดคัทมีขอบอย่างเดียว (บรรทัดเดิมพูดถึงไดคัทเข้าเนื้อซึ่งไม่มีขายแล้ว) */
const BORDER_ONLY_LINE = "ไดคัทมีขอบเท่านั้น — ไม่รับไดคัทเข้าเนื้อลาย";
/** ชื่อเดิมที่เคยใช้เรียกตัวเลือกในกลุ่มนี้ (รันซ้ำ/ของเก่า) */
const RENAME = { "มีขอบ": BORDER.name, "เข้าเนื้อ": INTO.name };

const PRODUCTS = [
  { id: "sticker-uv", edge: "both" },
  { id: "sticker-solvent", edge: "both" },
  { id: "sticker-rainbow-film", edge: "border" },
  { id: "neon", edge: "border" },
  { id: "reflective-sticker", edge: "border" },
  { id: "sticker-gold-silver-rosegold", edge: "border" },
  { id: "sticker-hologram", edge: "border" },
];

const WRITE = process.argv.includes("--write");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** ช่องกรอกขนาดตัด (คู่ กว้าง/สูง) — ชื่อกลุ่มมีทั้ง "ขนาดตัด (กว้าง)" และ "ขนาดตัด ตร.ม. (กว้าง)" */
const isCutW = (l) => /^ขนาดตัด.*\(กว้าง\)$/.test(l);
const isCutH = (l) => /^ขนาดตัด.*\(สูง\)$/.test(l);
const isDieW = (l) => /^ขนาดไดคัท.*\(กว้าง\)$/.test(l);
const isDieH = (l) => /^ขนาดไดคัท.*\(สูง\)$/.test(l);
const isSizeGroup = (l) => isCutW(l) || isCutH(l) || isDieW(l) || isDieH(l) || /^ขนาดตัด/.test(l) || /^ขนาดไดคัท/.test(l);

/** แก้ข้อความชิ้นเล็กสุดของไดคัท 100% : 1×1 cm → 2×2 cm (เขียนได้หลายรูปแบบในแท็บ/เงื่อนไข) */
const fixMinPiece = (text) =>
  (text || "")
    .replace(/เล็กกว่า\s*1\s*[×xX*]\s*1\s*(cm|ซม\.?)/g, "เล็กกว่า 2 × 2 cm")
    .replace(/ที่ชิ้นเล็กกว่า\s*1\s*[×xX*]\s*1\s*(cm|ซม\.?)/g, "ที่ชิ้นเล็กกว่า 2 × 2 cm");

/** สินค้าที่ไดคัทมีขอบอย่างเดียว — บรรทัดที่ยังพูดถึงไดคัทเข้าเนื้อต้องเปลี่ยนให้ตรงกับที่ขายจริง */
function fixBorderOnlyText(text) {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!/ไดคัทเข้าเนื้อ|เข้าเนื้อสี/.test(line)) return line;
      if (/มีขอบเท่านั้น|มีขอบอย่างเดียว/.test(line)) return line; // บอกไว้ถูกแล้ว
      const bullet = line.match(/^\s*(•|\*|-)\s*/)?.[0] ?? "";
      return `${bullet}${BORDER_ONLY_LINE}`;
    })
    .join("\n");
}

/** ลบบรรทัดซ้ำที่เกิดจากการแทนที่ (เช่น เดิมมีทั้ง "มีขอบเท่านั้น" และ "กรณีไดคัทเข้าเนื้อ...") */
const dedupeLines = (text) => {
  const seen = new Set();
  return (text || "")
    .split("\n")
    .filter((line) => {
      const key = line.replace(/^\s*(•|\*|-)\s*/, "").replace(/\*/g, "").trim();
      if (!key.includes("ไดคัทมีขอบ") && !key.includes(BORDER_ONLY_LINE)) return true;
      const norm = key.replace(/\s+/g, "");
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    })
    .join("\n");
};

for (const spec of PRODUCTS) {
  if (only && only !== spec.id) continue;
  const { data: row, error } = await sb.from("products").select("data").eq("id", spec.id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${spec.id}`);
  const p = row.data;
  const opts = p.options || [];
  const log = [];

  /* ── 1. ขนาดตัด (กำหนดเอง) ใหญ่สุด = แผ่น A3 ─────────────────────── */
  for (const o of opts) {
    if (isCutW(o.label)) {
      // min/hint: ตั้งให้เฉพาะตอนยังไม่มี — ค่าที่แอดมินแก้ทีหลัง (เช่น เล็กสุด 5 ซม.) ต้องไม่โดนทับตอนรันซ้ำ
      o.input = {
        min: 1,
        hint: "ขนาดชิ้นงานหลังตัด ใหญ่สุดเท่าแผ่น A3 (29.7 × 42 ซม.) — งานแนวนอนกรอกด้านยาวลงช่อง “สูง” ได้",
        ...o.input,
        max: 29.7,
      };
      log.push(`${o.label}: ≤ 29.7 ซม.`);
    }
    if (isCutH(o.label)) {
      o.input = { min: 1, ...o.input, max: 42 };
      o.sheetYield = { ...o.sheetYield, sheetW: 42, sheetH: 29.7, gap: 0, sheetName: "แผ่น A3" };
      log.push(`${o.label}: ≤ 42 ซม. · แผ่น 42×29.7 ไม่เว้นช่องไฟ`);
    }
  }

  /* ── 2. ไดคัท 100% เล็กสุด 2 ซม. ─────────────────────────────────── */
  for (const o of opts) {
    if (isDieW(o.label)) {
      // hint: ไม่ทับของเดิม (ข้อความอาจถูกเกลาทีหลัง) · min 2 คือกติกาที่ผู้ใช้สั่ง จึงตั้งทับได้
      o.input = {
        hint: "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด — ไดคัท 100% รับเล็กสุด 2 × 2 ซม.",
        ...o.input,
        min: 2,
      };
      log.push(`${o.label}: เล็กสุด 2 ซม.`);
    }
    if (isDieH(o.label)) {
      o.input = { ...o.input, min: 2 };
      log.push(`${o.label}: เล็กสุด 2 ซม.`);
    }
  }
  // ข้อความชิ้นเล็กสุดในเงื่อนไข/แท็บ
  const beforeText = JSON.stringify([p.terms, p.tabs]);
  p.terms = fixMinPiece(p.terms);
  for (const t of p.tabs || []) t.text = fixMinPiece(t.text);
  if (JSON.stringify([p.terms, p.tabs]) !== beforeText) log.push("ข้อความ: ชิ้นเล็กสุดไดคัท 100% → 2 × 2 cm");

  /* ── 3. กลุ่ม "ขอบไดคัท" ─────────────────────────────────────────── */
  const wanted = spec.edge === "both" ? [BORDER, INTO] : [BORDER];
  const edge = opts.find((o) => o.label === EDGE) || { label: EDGE, choices: [] };
  const keep = new Map((edge.choices || []).map((c) => [RENAME[c.name] || c.name, c]));
  edge.choices = wanted.map((w) => ({ ...(keep.get(w.name) || {}), ...w }));
  edge.display = "cards";
  if (spec.edge === "border") edge.note = BORDER_ONLY_NOTE;
  else delete edge.note;

  // กฎเดิมที่อ้างชื่อตัวเลือกแบบเก่า
  for (const r of p.rules || []) {
    if (r?.limit?.label !== EDGE) continue;
    r.limit.allow = (r.limit.allow || []).map((n) => RENAME[n] || n);
  }

  // เรียงใหม่: ...กลุ่มขนาด/แบบไดคัท → ขอบไดคัท → ที่เหลือ
  const rest = opts.filter((o) => o.label !== EDGE);
  const anchors = rest.map((o, i) => (isSizeGroup(o.label) || o.label === "แบบไดคัท" ? i : -1));
  // ไม่มีกลุ่มขนาด/แบบไดคัทเลย (เช่น RainBow ที่ขายเฉพาะไดคัท 50%) — ต่อท้ายกลุ่มสุดท้าย
  const at = Math.max(-1, ...anchors) >= 0 ? Math.max(...anchors) : rest.length - 1;
  p.options = [...rest.slice(0, at + 1), edge, ...rest.slice(at + 1)];
  log.push(`${EDGE}: ${edge.choices.map((c) => c.name).join(" / ")} (การ์ด) · แทรกหลัง "${rest[at]?.label ?? "(กลุ่มแรก)"}"`);

  // ตัวที่มีขอบอย่างเดียว — เก็บกวาดข้อความที่ยังพูดถึงไดคัทเข้าเนื้อ
  if (spec.edge === "border") {
    const before = JSON.stringify([p.terms, p.tabs]);
    p.terms = dedupeLines(fixBorderOnlyText(p.terms));
    for (const t of p.tabs || []) t.text = dedupeLines(fixBorderOnlyText(t.text));
    if (JSON.stringify([p.terms, p.tabs]) !== before) log.push("ข้อความ: บรรทัดที่พูดถึงไดคัทเข้าเนื้อ → มีขอบเท่านั้น");
  }

  /* ── สรุป + บันทึก ─────────────────────────────────────────────── */
  console.log(`\n=== ${spec.id} — ${p.name || ""}`);
  log.forEach((l) => console.log(" •", l));
  console.log("   ลำดับกลุ่ม:", p.options.map((o) => o.label).join(" → "));
  for (const o of p.options) {
    if (isCutW(o.label) || isCutH(o.label) || isDieW(o.label) || isDieH(o.label))
      console.log(`   ${o.label}: min ${o.input?.min} · max ${o.input?.max}${o.sheetYield ? ` · sheet ${o.sheetYield.sheetW}×${o.sheetYield.sheetH} gap ${o.sheetYield.gap}${o.sheetYield.unitSheets ? ` · unitSheets ${JSON.stringify(o.sheetYield.unitSheets)}` : ""}` : ""}`);
  }
  if (p.terms) console.log("   เงื่อนไข:\n" + p.terms.split("\n").map((l) => "     " + l).join("\n"));

  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", spec.id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
