/**
 * โควตาจุดไดคัท (ไดคัท 50%) ชุดใหม่ + เพิ่มตัวเลือกขนาดตัด "A3" — เจ้าของร้านสั่ง 9 ก.ย. 69 (ส่งภาพตารางมา)
 *
 * ตารางใหม่ (คิดจากด้านที่ยาวที่สุดของชิ้นงาน · ฟรี/มากสุด):
 *   5–7 ซม.                 → 5/10
 *   7.1–11 ซม.   (A7 · ครึ่ง A6 แนวตั้ง) → 12/20
 *   11.1–15 ซม.  (A6 · ครึ่ง A5 แนวตั้ง) → 25/50
 *   15.1–21 ซม.  (A5 · ครึ่ง A4 แนวตั้ง) → 50/70
 *   21.1–29.7 ซม. (A4)      → 100/200   ← เดิม "21.1 ขึ้นไป 100/180"
 *   29.8–42 ซม.  (A3 ใหม่)  → 200/500   ← เพิ่มใหม่ (เต็มแผ่น A3)
 * ช่วงระหว่างฟรี–มากสุด คิดจุดละ ฿0.50 (เรทเดิม)
 *
 * ⚠️ ขนาดครึ่งแนวตั้ง: ตามภาพร้านจับคู่ "ครึ่ง A6 → ชั้น A7 · ครึ่ง A5 → ชั้น A6 · ครึ่ง A4 → ชั้น A5"
 *    (วาชิเป็นแบบนี้อยู่แล้ว · อีก 7 ตัวเดิมจับตามด้านยาวสุดของชิ้นครึ่งซึ่งสูงกว่า 1 ชั้น → ปรับให้ตรงภาพทั้งหมด)
 *
 * ทำให้ครบทั้ง 9 ตัว (ทุกกลุ่ม "จำนวนจุดไดคัท…" ที่มี inputFee — UV มี 2 กลุ่ม แผ่น A3 / ตร.ม.):
 *   1. เพิ่ม choice "A3" ในกลุ่มขนาดตัดที่คู่กัน (ลำดับเมนู → sticker-cut-size-order.mjs) — แผ่น A3 = 1 ชิ้น/แผ่น · ตร.ม. = ครึ่งของ A4
 *   2. เขียน inputFee.rates ใหม่ทั้งชุดตามชื่อขนาดในกลุ่ม (A3/A4/A5/A6/A7 · ครึ่ง · 4 × 6 นิ้ว→ชั้น A6 เท่าเดิม)
 *   3. freeBySize (longest) ตามขั้นบันไดใหม่ · free/max กลาง = ขั้นเล็กสุด
 *   4. แก้ข้อความเกณฑ์เดิม (…100/180 · A4 ≤ 100 · รับสูงสุด A4 180) ในเงื่อนไข/แท็บ/FAQ
 *
 * เสร็จแล้วรัน scripts/sticker-cut-size-dot-badge.mjs --write ต่อ เพื่อรีเฟรชป้าย "ไดคัทฟรี N จุด (สูงสุด M)"
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram", "washi-sticker"];
const DOT = "จำนวนจุดไดคัท";
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
/** 📄 ขนาดตามไฟล์ (11 ก.ย. 69 · scripts/cut-size-by-file-choice.mjs) — ไม่มีชั้นของตัวเอง โควตาตั้งแยกไว้ใน rates เดิม ต้องคงข้อนั้นไว้ */
const BY_FILE = "📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)";
const NO_TIER = new Set([CUSTOM, BY_FILE]);
/** ขั้นบันไดตามด้านยาวสุด (ซม.) — ข้อสุดท้ายไม่มี upTo = รับทุกขนาดที่ใหญ่กว่านั้น (จนถึงเพดานช่องกรอก 42) */
const TIERS = [
  { upTo: 7, free: 5, max: 10 },
  { upTo: 11, free: 12, max: 20 },
  { upTo: 15, free: 25, max: 50 },
  { upTo: 21, free: 50, max: 70 },
  { upTo: 29.7, free: 100, max: 200 },
  { free: 200, max: 500 },
];
/** ชั้นของขนาดตายตัว (เรียงตามลำดับที่อยากให้ rates ออกมา) */
const FIXED = {
  A3: { free: 200, max: 500 },
  A4: { free: 100, max: 200 },
  A5: { free: 50, max: 70 },
  A6: { free: 25, max: 50 },
  A7: { free: 12, max: 20 },
};
/** ชื่อขนาดอื่น → ชั้นเดียวกับขนาดไหน */
const ALIAS = {
  "ครึ่ง A4 แนวตั้ง": "A5",
  "ครึ่ง A5 แนวตั้ง": "A6",
  "ครึ่ง A6 แนวตั้ง": "A7",
  "4 × 6 นิ้ว": "A6",
};
const SMALLEST = TIERS[0];
const LINE = "จำนวนจุดไดคัท (ไดคัท 50%) คิดจากด้านที่ยาวที่สุดของชิ้นงาน — รวมในราคาแล้ว/รับมากสุด: ไม่เกิน 7 ซม. 5/10 จุด / 7.1-11 ซม. (A7) 12/20 จุด / 11.1-15 ซม. (A6) 25/50 จุด / 15.1-21 ซม. (A5) 50/70 จุด / 21.1-29.7 ซม. (A4) 100/200 จุด / 29.8-42 ซม. (A3 เต็มแผ่น) 200/500 จุด — จุดส่วนที่เกินโควตาคิดเพิ่มจุดละ 0.50 บาท";
const PAREN = "ตามเกณฑ์ (คิดจากด้านยาวสุด · ฟรี/มากสุด: ≤7 ซม. 5/10 จุด · ≤11 (A7) 12/20 · ≤15 (A6) 25/50 · ≤21 (A5) 50/70 · ≤29.7 (A4) 100/200 · ≤42 (A3) 200/500)";

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** บรรทัดที่พูดถึงเกณฑ์จุดรายขนาด → เขียนใหม่ทั้งบรรทัด (คงหัวบุลเล็ต/ท้าย "ดูวิธีนับจุดจากรูป") */
function fixQuotaText(text) {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!/จุด/.test(line)) return line;
      if (/ตามเกณฑ์\s*\(/.test(line)) return line.replace(/ตามเกณฑ์\s*\(.*$/, PAREN);
      const isQuotaLine =
        /ด้านที่ยาวที่สุด|ด้านยาวสุด/.test(line) ||                       // ชุด 26 ส.ค. (100/180)
        (/ฟรีตามขนาด/.test(line) && /A4/.test(line)) ||                    // วาชิ "ฟรีตามขนาด — A4 100 จุด …"
        (/(75|เล็กกว่า A7)/.test(line) && /(A4|A5|A6|A7)/.test(line));      // ชุดเก่าสุด
      if (!isQuotaLine) return line;
      const bullet = line.match(/^\s*(•|\*|-)\s*/)?.[0] ?? "";
      const tail = /ดูวิธีนับจุดจากรูป/.test(line) ? " (ดูวิธีนับจุดจากรูป)" : "";
      return `${bullet}${LINE}${tail}`;
    })
    // บางแท็บมีบรรทัดเกณฑ์ 2 ชุดซ้อน (ชุดชื่อขนาด + ชุดด้านยาวสุด) → เขียนใหม่แล้วกลายเป็นบรรทัดเดียวกัน 2 ครั้ง เก็บบรรทัดท้าย (มี "ดูวิธีนับจุด")
    .filter((line, i, arr) => !line.includes(LINE) || arr.findLastIndex((l) => l.includes(LINE)) === i)
    .join("\n");
}

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  const opts = p.options || [];
  console.log(`\n=== ${id} (${p.name})`);

  const dots = opts.filter((o) => o.label.startsWith(DOT) && o.inputFee);
  if (!dots.length) throw new Error(`${id}: ไม่พบกลุ่ม "${DOT}"`);
  for (const dot of dots) {
    const cfg = dot.inputFee;
    const sizeLabel = cfg.rates?.[0]?.when?.label;
    const size = opts.find((o) => o.label === sizeLabel && o.choices?.length);
    if (!size) throw new Error(`${id}: ${dot.label} ไม่พบกลุ่มขนาด "${sizeLabel}"`);
    // กันกับดัก rules allow — กลุ่มพวกนี้ไม่มี rules อ้างถึงขนาดตัด ถ้ามีต้องดูก่อน
    const ruleHit = (p.rules || []).filter((r) => JSON.stringify(r).includes(sizeLabel));
    if (ruleHit.length) throw new Error(`${id}: มี rules อ้างกลุ่ม "${sizeLabel}" ${JSON.stringify(ruleHit)} — ต้องดูก่อนเพิ่ม A3`);

    /* 1. เพิ่ม A3 หน้าสุด */
    const a4 = size.choices.find((c) => c.name === "A4");
    if (!a4) throw new Error(`${id}: กลุ่ม "${sizeLabel}" ไม่มี A4 ให้เทียบ`);
    const perSqm = /ตร\.ม\./.test(a4.badge || "");
    const pieces = perSqm ? a4.piecesPerUnit / 2 : 1;
    const unitName = perSqm ? "ตร.ม." : (a4.badge || "").split(" / ")[1]?.split(" · ")[0] || "แผ่น A3";   // ตัดป้ายโควตาที่ badge script ต่อไว้ (รันซ้ำ)
    // A3 ใหม่ = แทรกหน้าสุด (ลำดับเมนูจริงคุมด้วย scripts/sticker-cut-size-order.mjs: A3 · A4 · ครึ่ง A4 · A5 · … ) · มีแล้ว = ไม่ย้าย
    let a3 = size.choices.find((c) => c.name === "A3");
    const a3Log = a3 ? "มีอยู่แล้ว" : "เพิ่มใหม่";
    if (!a3) {
      a3 = { name: "A3" };
      size.choices.unshift(a3);
    }
    a3.piecesPerUnit = pieces;
    a3.badge = `ได้ ${pieces} ชิ้น / ${unitName}`;   // ป้ายโควตาต่อท้ายทีหลังโดย sticker-cut-size-dot-badge.mjs

    /* 2. rates ใหม่ทั้งชุดตามชื่อในกลุ่ม */
    const tierOf = (name) => FIXED[name] ?? FIXED[ALIAS[name]];
    const unknown = size.choices.filter((c) => !NO_TIER.has(c.name) && !tierOf(c.name)).map((c) => c.name);
    if (unknown.length) throw new Error(`${id}: ขนาด ${unknown.join(", ")} ไม่รู้ว่าอยู่ชั้นไหน`);
    const keyOf = (name) => (FIXED[name] ? name : ALIAS[name]);
    const prevRates = cfg.rates ?? [];
    cfg.rates = Object.keys(FIXED)
      .map((key) => ({
        when: { label: sizeLabel, choices: size.choices.filter((c) => !NO_TIER.has(c.name) && keyOf(c.name) === key).map((c) => c.name) },
        free: FIXED[key].free,
        max: FIXED[key].max,
      }))
      .filter((r) => r.when.choices.length)
      // คงโควตาของ "ขนาดตามไฟล์" ที่ตั้งแยกไว้ (cut-size-by-file-choice.mjs) — ไม่งั้นรันสคริปต์นี้ซ้ำแล้วหาย
      .concat(prevRates.filter((r) => r.when?.label === sizeLabel && (r.when.choices ?? []).includes(BY_FILE)));

    /* 3. ขนาดกำหนดเอง */
    if (!cfg.freeBySize) throw new Error(`${id}: ${dot.label} ไม่มี freeBySize`);
    cfg.freeBySize = { ...cfg.freeBySize, by: "longest", tiers: TIERS.map((t) => ({ ...t })) };
    cfg.free = SMALLEST.free;
    cfg.max = SMALLEST.max;
    if (!dot.input || (dot.input.max ?? 0) < 500) dot.input = { ...(dot.input || {}), max: 500 };

    console.log(` • [${dot.label}] A3 ${a3Log} → ${a3.badge}`);
    console.log(`   rates: ${cfg.rates.map((r) => `${r.when.choices.join("/")}=${r.free}/${r.max}`).join(" · ")}`);
    console.log(`   กำหนดเอง(ด้านยาวสุด): ${TIERS.map((t) => `${t.upTo ? `≤${t.upTo}` : ">29.7"}→${t.free}/${t.max}`).join(" · ")}`);
    console.log(`   ลำดับขนาด: ${size.choices.map((c) => c.name).join(" · ")}`);
  }

  /* 4. ข้อความ */
  const before = JSON.stringify([p.terms, p.tabs, p.seo?.faq]);
  p.terms = fixQuotaText(p.terms);
  for (const t of p.tabs || []) t.text = fixQuotaText(t.text);
  for (const f of p.seo?.faq || []) f.a = fixQuotaText(f.a);
  if (JSON.stringify([p.terms, p.tabs, p.seo?.faq]) !== before) console.log(" • ข้อความเกณฑ์จุด: เขียนใหม่");
  for (const [k, t] of [["terms", p.terms], ...(p.tabs || []).map((t) => [t.title, t.text]), ...(p.seo?.faq || []).map((f) => [f.q, f.a])])
    for (const line of (t || "").split("\n")) if (/จุด/.test(line) && /180|A4|A3/.test(line)) console.log(`   ↳ [${k}] ${line.trim()}`);

  if (!WRITE) console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
