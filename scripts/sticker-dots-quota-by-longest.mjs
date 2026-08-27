/**
 * โควตาจุดไดคัท (ไดคัท 50%) ชุดใหม่ตามตารางร้าน — ผู้ใช้สั่ง 26 ส.ค. 69 (ส่งภาพตารางมา)
 *
 * เกณฑ์ใหม่คิดจาก "ด้านที่ยาวที่สุด" ของชิ้นงาน ไม่ใช่พื้นที่แบบเดิม:
 *   ด้านยาวสุด 5–7 ซม.      → 5 จุด
 *   7.1–11 ซม.  (คลุม A7)   → 20 จุด
 *   11.1–15 ซม. (คลุม A6)   → 50 จุด
 *   15.1–21 ซม. (คลุม A5)   → 70 จุด
 *   21.1 ซม. ขึ้นไป (A4/เต็มแผ่น) → 180 จุด
 * เกินโควตาคิดจุดละ ฿0.50 ต่อหน่วยที่สั่ง (เรทเดิม ไม่เปลี่ยน)
 *
 * ทำ 3 อย่างให้ครบทั้ง 8 ตัว:
 *   1. rates[].free ของขนาดตายตัว — A7 20 · A6 50 · A5 70 · A4 180 (เทียบจากด้านยาวสุดของแต่ละขนาด)
 *   2. freeBySize เปลี่ยนเป็นโหมด "longest" ตามขั้นบันไดข้างบน (ของเดิมเทียบพื้นที่) · free กลาง = 5
 *   3. แก้ข้อความเกณฑ์เดิม (A4 ≤ 75 / A5 ≤ 50 / A6 ≤ 25 / A7 ≤ 12 / เล็กกว่า A7 = 1) ในเงื่อนไข/แท็บ/FAQ
 *
 * เสร็จแล้วรัน sticker-cut-size-dot-badge.mjs ต่อ เพื่อรีเฟรชป้ายบนตัวเลือกขนาดตัด
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram"];
const DOT = "จำนวนจุดไดคัท";
/** ขั้นบันไดตามด้านยาวสุด (ซม.) — ข้อสุดท้ายไม่มี upTo = รับทุกขนาดที่ใหญ่กว่านั้น */
const TIERS = [
  { upTo: 7, free: 5 },
  { upTo: 11, free: 20 },
  { upTo: 15, free: 50 },
  { upTo: 21, free: 70 },
  { free: 180 },
];
/** โควตาของขนาดตายตัว — เทียบด้านยาวสุดของขนาดนั้นกับ TIERS (A7 10.5 · A6 14.8 · A5 21 · A4 29.7) */
const FIXED = { A7: 20, A6: 50, A5: 70, A4: 180 };
const SMALLEST = 5; // free กลาง = ขั้นเล็กสุด (ขนาดตัดเล็กสุดที่รับคือ 5 ซม. อยู่แล้ว)
/** ข้อความเกณฑ์ชุดใหม่ — ใช้แทนบรรทัดเดิมทุกที่ที่พูดถึงโควตารายขนาด */
const LINE = "จำนวนจุดไดคัท (ไดคัท 50%) คิดจากด้านที่ยาวที่สุดของชิ้นงาน: ไม่เกิน 7 ซม. 5 จุด / 7.1-11 ซม. (A7) 20 จุด / 11.1-15 ซม. (A6) 50 จุด / 15.1-21 ซม. (A5) 70 จุด / 21.1 ซม. ขึ้นไป (A4) 180 จุด — เกินกำหนดคิดเพิ่มจุดละ 0.50 บาท";

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** บรรทัดไหนพูดถึงเกณฑ์จุดรายขนาด = เขียนใหม่ทั้งบรรทัด (คงหัวบุลเล็ต/ข้อความนำหน้าไว้) */
function fixQuotaText(text) {
  if (!text) return text;
  return text
    .split("\n")
    .map((line) => {
      // บรรทัดเกณฑ์เดิม: มีทั้งคำว่าจุด และตัวเลขชุดเก่าอย่างน้อยสองตัว (75/25/12/เล็กกว่า A7)
      if (!/จุด/.test(line)) return line;
      const oldSet = /(75|เล็กกว่า A7)/.test(line) && /(A4|A5|A6|A7)/.test(line);
      if (!oldSet) return line;
      const bullet = line.match(/^\s*(•|\*|-)\s*/)?.[0] ?? "";
      // ประโยคที่เป็นคำสั่ง "คุมจำนวนจุดตามเกณฑ์ (...)" — แทนเฉพาะในวงเล็บ ไม่ทับทั้งบรรทัด
      if (/ตามเกณฑ์\s*\(/.test(line)) {
        return line.replace(
          /\(([^()]*(?:75|เล็กกว่า A7)[^()]*)\)/,
          "(คิดจากด้านยาวสุด: ≤7 ซม. 5 จุด / ≤11 (A7) 20 / ≤15 (A6) 50 / ≤21 (A5) 70 / เกิน 21 (A4) 180)"
        );
      }
      const tail = /ดูวิธีนับจุดจากรูป/.test(line) ? " (ดูวิธีนับจุดจากรูป)" : "";
      return `${bullet}${LINE}${tail}`;
    })
    .join("\n");
}

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  const log = [];
  console.log(`\n=== ${id}`);

  /* ── 1-2. โควตาในกลุ่มช่องกรอกจุดไดคัท ─────────────────────────── */
  const dots = (p.options || []).filter((o) => o.label.startsWith(DOT) && o.inputFee);
  if (!dots.length) throw new Error(`${id}: ไม่พบกลุ่ม "${DOT}"`);
  for (const dot of dots) {
    const cfg = dot.inputFee;
    for (const r of cfg.rates || []) {
      // rates ผูกกับชื่อขนาด (A4-A7) — เขียนโควตาใหม่ตามชื่อ
      const name = r.when.choices.find((n) => FIXED[n] != null);
      if (name) r.free = FIXED[name];
    }
    if (cfg.freeBySize) {
      cfg.freeBySize = { ...cfg.freeBySize, by: "longest", tiers: TIERS.map((t) => ({ ...t })) };
    }
    cfg.free = SMALLEST;
    log.push(
      `[${dot.label}] ขนาดตายตัว ${(cfg.rates || [])
        .map((r) => `${r.when.choices.join("/")}=${r.free}`)
        .join(" · ")} · กำหนดเอง(ด้านยาวสุด) ${TIERS.map((t) => `${t.upTo ? `≤${t.upTo}` : ">21"}→${t.free}`).join(" · ")}`
    );
  }

  /* ── 3. ข้อความเกณฑ์เดิมในเงื่อนไข/แท็บ/FAQ ────────────────────── */
  const before = JSON.stringify([p.terms, p.tabs, p.seo?.faq]);
  p.terms = fixQuotaText(p.terms);
  for (const t of p.tabs || []) t.text = fixQuotaText(t.text);
  for (const f of p.seo?.faq || []) f.a = fixQuotaText(f.a);
  if (JSON.stringify([p.terms, p.tabs, p.seo?.faq]) !== before) log.push("ข้อความเกณฑ์จุด: เขียนใหม่ตามตารางด้านยาวสุด");

  log.forEach((l) => console.log(" •", l));
  for (const t of [p.terms, ...(p.tabs || []).map((t) => t.text)])
    for (const line of (t || "").split("\n")) if (/ด้านที่ยาวที่สุด|ด้านยาวสุด/.test(line)) console.log("   ↳", line.trim());

  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
