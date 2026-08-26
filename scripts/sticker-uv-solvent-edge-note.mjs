/**
 * Sticker-UV + Solvent Premium — เก็บงานกลุ่ม "ขอบไดคัท" ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * 1) ข้อความกำกับฝุ่นหมึก (ทั้ง 2 ตัว) — ย้ายจาก note ใต้ชื่อกลุ่ม (รอบแรก) มาเป็น
 *    selectedNote ของการ์ด "ไดคัทเข้าเนื้อ": โชว์ในการ์ดเฉพาะตอนลูกค้าเลือกไดคัทเข้าเนื้ออยู่
 * 2) เฉพาะ Sticker-UV: เนื้อสติ๊กเกอร์ "เนื้อใส-แผ่นรองกระดาษขาว" → เลือกได้เฉพาะ "ไดคัทมีขอบ"
 *    (กฎ limit แบบเดียวกับ PP ใส ของสติ๊กเกอร์ Digital — เนื้ออื่นยังเลือกได้ทั้งสองแบบ)
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const EDGE = "ขอบไดคัท";
const MAT = "เนื้อสติ๊กเกอร์";
const CLEAR = "เนื้อใส-แผ่นรองกระดาษขาว";
const BORDER = "ไดคัทมีขอบ";
const INTO = "ไดคัทเข้าเนื้อ";
const NOTE = "**กรณีไดคัทเข้าเนื้อ** จะมีฝุ่นของสีหมึกติดที่งาน สามารถเช็ดออกได้";
const IDS = ["sticker-uv", "sticker-solvent"];

const WRITE = process.argv.includes("--write");
const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  const log = [];

  /* ── 1. selectedNote ที่การ์ดไดคัทเข้าเนื้อ (โชว์เฉพาะตอนถูกเลือก) ── */
  const edge = (p.options || []).find((o) => o.label === EDGE);
  if (!edge) throw new Error(`${id}: ไม่พบกลุ่ม "${EDGE}"`);
  const into = edge.choices.find((c) => c.name === INTO);
  if (!into) throw new Error(`${id}: กลุ่ม ${EDGE} ไม่มี "${INTO}"`);
  into.selectedNote = NOTE;
  delete edge.note; // รอบแรกเคยใส่เป็น note ใต้ชื่อกลุ่ม (โชว์ตลอด) — ถอดออก ย้ายมาอยู่ในการ์ดแทน
  log.push(`selectedNote การ์ด "${INTO}": ${NOTE} (ถอด note กลุ่มเดิม)`);

  /* ── 2. UV: เนื้อใส-แผ่นรองกระดาษขาว → มีขอบเท่านั้น ─────────────── */
  if (id === "sticker-uv") {
    const mat = (p.options || []).find((o) => o.label === MAT);
    if (!mat || !mat.choices.some((c) => c.name === CLEAR))
      throw new Error(`${id}: ไม่พบตัวเลือก "${CLEAR}" ในกลุ่ม "${MAT}"`);
    if (!edge.choices.some((c) => c.name === BORDER)) throw new Error(`${id}: กลุ่ม ${EDGE} ไม่มี "${BORDER}"`);
    p.rules = p.rules || [];
    // รันซ้ำ: ถอดกฎเดิมที่ล็อกขอบไดคัทจากเนื้อสติ๊กเกอร์ออกก่อน แล้วใส่ใหม่
    p.rules = p.rules.filter((r) => !(r?.when?.label === MAT && r?.limit?.label === EDGE));
    p.rules.push({
      when: { label: MAT, choice: CLEAR, choices: [CLEAR] },
      limit: { label: EDGE, allow: [BORDER] },
    });
    log.push(`กฎ: ${MAT}="${CLEAR}" → ${EDGE} เหลือ "${BORDER}" อย่างเดียว`);
  }

  /* ── สรุป + บันทึก ─────────────────────────────────────────────── */
  console.log(`\n=== ${id} — ${p.name || ""}`);
  log.forEach((l) => console.log(" •", l));
  for (const r of p.rules || [])
    if (r?.limit?.label === EDGE)
      console.log(`   กฎ: ${r.when.label}=${r.when.choices?.join("/")} → เลือกได้ ${r.limit.allow.join(", ")}`);

  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
