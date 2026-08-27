/**
 * ป้ายโควตาจุดไดคัทบนตัวเลือก "ขนาดตัด" ของสติ๊กเกอร์ 8 ตัว — ผู้ใช้สั่ง 26 ส.ค. 69
 *
 * อ่านโควตาจริงจาก inputFee.rates ของกลุ่ม "จำนวนจุดไดคัท" ที่คู่กัน (ไม่ hardcode)
 * แล้วต่อท้าย badge ของแต่ละขนาด: "ได้ 16 ชิ้น / แผ่น A3 · ไดคัทได้ 12 จุด"
 * + เขียน note ใต้ชื่อกลุ่มขนาดตัดว่าเกินโควตาคิดจุดละเท่าไหร่ (อ่าน perUnit จาก inputFee)
 *   note ประกอบใหม่จากชิ้นส่วน โดยคงของเดิมที่ยังต้องใช้ไว้: กติกาเว้นระยะ 2 มม. และ
 *   ประโยคนำปุ่มดูรูป (กลุ่มที่ตั้ง noteImageSrc) — ส่วนรายการโควตารายขนาดถอดออก เพราะย้ายไปอยู่บนป้ายแล้ว
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ (ล้างส่วนท้ายเดิมก่อนต่อใหม่) · ไม่ใส่ --write = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const IDS = ["sticker-pp", "sticker-uv", "sticker-solvent", "sticker-rainbow-film", "neon", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram"];
const DOT = "จำนวนจุดไดคัท";
const baht = (n) => (n % 1 ? `฿${n.toFixed(2)}` : `฿${n}`);

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
  const opts = p.options || [];
  console.log(`\n=== ${id}`);

  // กลุ่มช่องกรอกจุดไดคัททุกตัว (UV มีทั้งฝั่งแผ่น A3 และฝั่ง ตร.ม.)
  const dots = opts.filter((o) => o.label.startsWith(DOT) && o.inputFee?.rates?.length);
  if (!dots.length) throw new Error(`${id}: ไม่พบกลุ่ม "${DOT}" ที่มีโควตา`);

  for (const dot of dots) {
    const cfg = dot.inputFee;
    const unit = dot.input?.unit || "จุด";
    // กลุ่มขนาดตัดที่โควตาอ้างถึง (rates[].when.label ชี้กลุ่มไหน ก็ติดป้ายกลุ่มนั้น)
    const sizeLabel = cfg.rates[0].when.label;
    const size = opts.find((o) => o.label === sizeLabel);
    if (!size) throw new Error(`${id}: ไม่พบกลุ่ม "${sizeLabel}" ที่ ${dot.label} อ้างถึง`);
    /** โควตาของชื่อขนาดนั้น จาก rates (ข้อแรกที่ครอบชื่อนี้) */
    const quotaOf = (name) => cfg.rates.find((r) => r.free != null && r.when.choices.includes(name))?.free;

    for (const c of size.choices || []) {
      const q = quotaOf(c.name);
      // ล้างส่วนท้ายเดิมก่อน (รันซ้ำ) แล้วต่อใหม่ — ป้ายชิ้น/แผ่นเดิมอยู่ท่อนแรกเสมอ
      const head = (c.badge || "").split(" · ")[0];
      c.badge = q ? `${head} · ไดคัทได้ ${q} ${unit}` : head || undefined;
      if (!c.badge) delete c.badge;
    }
    const parts = [];
    if (/2 มม\./.test(size.note || "")) parts.push("วางลายห่างกันอย่างน้อย 2 มม.");
    parts.push(
      `โควตา${unit}ไดคัทของแต่ละขนาดรวมในราคาแล้ว — เกินจากนั้นคิดเพิ่ม${unit}ละ ${baht(cfg.perUnit)} ต่อ${p.pricing?.unit || "ชิ้น"} (กรอกจำนวน${unit}ในช่องด้านล่าง)`
    );
    if (size.noteImageSrc) parts.push(`วิธีนับ${unit}ดูจากรูปตัวอย่าง —`);
    size.note = parts.join(" · ");
    console.log(` • [${size.label}] ${(size.choices || []).map((c) => `${c.name}${c.badge ? ` [${c.badge}]` : ""}`).join(" · ")}`);
    console.log(`   note: ${size.note}`);
  }

  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
