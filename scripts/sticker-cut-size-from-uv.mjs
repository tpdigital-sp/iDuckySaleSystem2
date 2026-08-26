/**
 * ยกกลุ่ม "ขนาดตัด / ขนาดไดคัท" ของ Sticker-UV ไปให้สติ๊กเกอร์อีก 6 ตัว — ผู้ใช้สั่ง 26 ส.ค. 69
 * (NEON · RainBow · สะท้อนแสง · Gold|Silver|RoseGold · Hologram · Solvent Premium)
 *
 * อ่านโครงจากแถว sticker-uv สด ๆ ทุกครั้ง (ไม่ hardcode) — แก้ที่ UV แล้วรันซ้ำ ตัวอื่นตามทันที
 * กลุ่มที่ยกมา (เฉพาะฝั่งเรทแผ่น A3 · ข้ามคู่ ตร.ม. ที่มีเฉพาะ UV):
 *   ขนาดตัด (A4/A5/A6/A7 + 📐 กำหนดขนาดเอง · piecesPerUnit 2/4/8/16 ต่อแผ่น A3)
 *   ขนาดตัด (กว้าง) / (สูง)   — โผล่เมื่อเลือกกำหนดขนาดเอง · sheetYield แผ่น A3 เต็ม 42×29.7 gap 0
 *   ขนาดไดคัท (กว้าง) / (สูง) — โผล่เมื่อเลือกไดคัท 100% · sheetYield พื้นที่วางจริง 43.76×28.89 gap 0.5
 *
 * ปรับให้เข้ากับสินค้าปลายทาง:
 *   • ตัด showWhenAll/showWhenAlso ที่อ้าง "เรทราคา" ทิ้ง (6 ตัวนี้มีเรทเดียว)
 *   • แปลงชื่อตัวเลือกในกลุ่ม "แบบไดคัท" ให้ตรงของแต่ละตัว (เช่น Gold ใช้ "ไดคัท 50% (ตัดครึ่ง · ลอกทีละดวง)")
 *   • ถอด sheetYield.unitSheets (ของเรทตารางเมตร ซึ่งมีเฉพาะ UV)
 *   • RainBow ไม่มีกลุ่ม "แบบไดคัท" (เว็บมีเรทเฉพาะไดคัท 50%) → ขนาดตัดโชว์ตลอด · ไม่ใส่คู่ขนาดไดคัท
 * แทรกไว้หลังกลุ่ม "แบบไดคัท" และก่อนกลุ่ม "ขอบไดคัท" เหมือนลำดับของ UV
 *
 * read-modify-write บนแถวจริง · รันซ้ำได้ · ไม่ใส่ --write = ดูอย่างเดียว ไม่บันทึก
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SRC = "sticker-uv";
const CUT = "ขนาดตัด";
const MODE = "แบบไดคัท";
const RATE = "เรทราคา";
const EDGE = "ขอบไดคัท";
/** กลุ่มที่ยกไป (ตามลำดับ) — ชื่อกลุ่มของ UV ฝั่งเรทแผ่น A3 */
const TAKE = [CUT, "ขนาดตัด (กว้าง)", "ขนาดตัด (สูง)", "ขนาดไดคัท (กว้าง)", "ขนาดไดคัท (สูง)"];
const DIE_PAIR = ["ขนาดไดคัท (กว้าง)", "ขนาดไดคัท (สูง)"];
const TARGETS = ["neon", "sticker-rainbow-film", "reflective-sticker", "sticker-gold-silver-rosegold", "sticker-hologram", "sticker-solvent"];

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

/* ── ต้นแบบจาก sticker-uv ─────────────────────────────────────────── */
const { data: srcRow, error: srcErr } = await sb.from("products").select("data").eq("id", SRC).maybeSingle();
if (srcErr || !srcRow) throw new Error(srcErr?.message || `ไม่พบต้นแบบ ${SRC}`);
const srcOpts = srcRow.data.options || [];
const template = TAKE.map((label) => {
  const o = srcOpts.find((x) => x.label === label);
  if (!o) throw new Error(`${SRC}: ไม่พบกลุ่ม "${label}" (โครงต้นแบบเปลี่ยนไปแล้ว?)`);
  return o;
});
/** ชื่อตัวเลือกโหมดไดคัทของต้นแบบ ไว้ map ไปชื่อของปลายทาง */
const srcMode = srcOpts.find((o) => o.label === MODE);
const srcName = (pre) => (srcMode?.choices || []).find((c) => c.name.startsWith(pre))?.name;
const SRC_50 = srcName("ไดคัท 50%");
const SRC_100 = srcName("ไดคัท 100%");
if (!SRC_50 || !SRC_100) throw new Error(`${SRC}: อ่านชื่อโหมดไดคัทไม่ได้`);

console.log(`ต้นแบบ ${SRC}:`);
for (const o of template)
  console.log(
    `  [${o.label}]${o.input ? ` min ${o.input.min} · max ${o.input.max}` : ""}` +
      `${o.sheetYield ? ` · sheet ${o.sheetYield.sheetW}×${o.sheetYield.sheetH} gap ${o.sheetYield.gap}` : ""}` +
      `${o.choices?.length ? ` · ${o.choices.map((c) => c.name + (c.piecesPerUnit ? `(${c.piecesPerUnit})` : "")).join(" · ")}` : ""}`
  );

/* ── ยกไปทีละตัว ─────────────────────────────────────────────────── */
for (const id of TARGETS) {
  if (only && only !== id) continue;
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const p = row.data;
  const opts = p.options || [];
  const log = [];

  // ชื่อโหมดไดคัทของปลายทาง (RainBow ไม่มีกลุ่มนี้ = ขายเฉพาะไดคัท 50%)
  const mode = opts.find((o) => o.label === MODE);
  const dst50 = (mode?.choices || []).find((c) => c.name.startsWith("ไดคัท 50%"))?.name;
  const dst100 = (mode?.choices || []).find((c) => c.name.startsWith("ไดคัท 100%"))?.name;
  if (mode && (!dst50 || !dst100)) throw new Error(`${id}: กลุ่ม "${MODE}" ไม่มีทั้ง 50%/100% — ตรวจก่อน`);

  /** แปลงเงื่อนไขแสดงผล 1 ข้อ: ตัดข้อที่อ้างเรทราคา · แปลงชื่อโหมดไดคัท · null = ตัดทิ้ง */
  const mapCond = (c) => {
    if (!c) return null;
    if (c.label === RATE) return null;
    if (c.label !== MODE) return { ...c };
    if (!mode) return null; // ปลายทางไม่มีกลุ่มโหมดไดคัท → เงื่อนไขนี้ไม่มีความหมาย
    const choices = (c.choices || []).map((n) => (n === SRC_50 ? dst50 : n === SRC_100 ? dst100 : n));
    return { ...c, choices, ...(c.choice ? { choice: choices[0] } : {}) };
  };

  const built = [];
  for (const t of template) {
    if (!mode && DIE_PAIR.includes(t.label)) continue; // ไม่มีโหมด 100% ขาย → ไม่ต้องถามขนาดไดคัท
    const o = JSON.parse(JSON.stringify(t));
    // เงื่อนไขแสดงผล
    for (const key of ["showWhen", "showWhenAlso"]) {
      const next = mapCond(o[key]);
      if (next) o[key] = next;
      else delete o[key];
    }
    if (o.showWhenAll) {
      const list = o.showWhenAll.map(mapCond).filter(Boolean);
      if (list.length) o.showWhenAll = list;
      else delete o.showWhenAll;
    }
    // showWhen หายแต่ showWhenAlso ยังอยู่ → เลื่อน showWhenAlso ขึ้นมาเป็น showWhen
    if (!o.showWhen && o.showWhenAlso) {
      o.showWhen = o.showWhenAlso;
      delete o.showWhenAlso;
    }
    // unitSheets เป็นของเรทตารางเมตร (มีเฉพาะ UV)
    if (o.sheetYield?.unitSheets) {
      o.sheetYield = { ...o.sheetYield };
      delete o.sheetYield.unitSheets;
    }
    built.push(o);
  }

  // เขียนทับกลุ่มชื่อเดียวกันที่มีอยู่ (รันซ้ำ) แล้วแทรกหลัง "แบบไดคัท" · ก่อน "ขอบไดคัท"
  const names = new Set(built.map((o) => o.label));
  const rest = opts.filter((o) => !names.has(o.label));
  const modeAt = rest.findIndex((o) => o.label === MODE);
  const edgeAt = rest.findIndex((o) => o.label === EDGE);
  const at = modeAt >= 0 ? modeAt + 1 : edgeAt >= 0 ? edgeAt : rest.length;
  p.options = [...rest.slice(0, at), ...built, ...rest.slice(at)];
  log.push(`+ ${built.map((o) => o.label).join(" · ")}`);
  if (!mode) log.push(`ไม่มีกลุ่ม "${MODE}" — ขนาดตัดโชว์ตลอด · ข้ามคู่ขนาดไดคัท`);
  else if (dst50 !== SRC_50 || dst100 !== SRC_100) log.push(`โหมดไดคัท: "${dst50}" / "${dst100}"`);

  /* ── สรุป + บันทึก ─────────────────────────────────────────────── */
  console.log(`\n=== ${id} — ${p.name || ""} (หน่วยขาย: ${p.pricing?.unit || "-"})`);
  log.forEach((l) => console.log(" •", l));
  console.log("   ลำดับกลุ่ม:", p.options.map((o) => o.label).join(" → "));
  for (const o of built)
    console.log(
      `   [${o.label}]${o.input ? ` min ${o.input.min} · max ${o.input.max}` : ""}` +
        `${o.sheetYield ? ` · sheet ${o.sheetYield.sheetW}×${o.sheetYield.sheetH} gap ${o.sheetYield.gap}` : ""}` +
        `${o.showWhen ? ` · showWhen ${o.showWhen.label}=${o.showWhen.choices?.join("/")}` : ""}` +
        `${o.showWhenAlso ? ` · also ${o.showWhenAlso.label}=${o.showWhenAlso.choices?.join("/")}` : ""}` +
        `${o.showWhenAll ? ` · all ${JSON.stringify(o.showWhenAll)}` : ""}`
    );

  if (!WRITE) {
    console.log("   (ดูอย่างเดียว — ใส่ --write เพื่อบันทึก)");
  } else {
    const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
    console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
  }
}
