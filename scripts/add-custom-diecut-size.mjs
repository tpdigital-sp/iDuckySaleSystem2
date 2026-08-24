/**
 * เพิ่ม "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)" ให้โหมดไดคัทแบบตัดตามขนาด (ไดคัท 50% / ตัดตามขนาด)
 * ของสติ๊กเกอร์ PP, สติ๊กเกอร์ UV, กระดาษอาร์ต/PET — ลูกค้ากรอกกว้าง×สูงเอง + โชว์จำนวนชิ้นที่ได้
 *
 * ทำงานแบบ read-modify-write บนแถวจริง (ไม่รีเจนสินค้าใหม่) และรันซ้ำได้ (idempotent)
 *  - เติมตัวเลือก "กำหนดขนาดเอง" เข้าไปในกลุ่มขนาดตัดเดิม (ไม่มี piecesPerUnit)
 *  - เพิ่มช่องกรอกกว้าง/สูง (standardInput + sheetYield) ที่โผล่เมื่อเลือก "กำหนดขนาดเอง"
 *  - เงื่อนไขการแสดงผลถอดมาจาก showWhen/showWhenAlso ของกลุ่มขนาดตัดเดิมทั้งหมด
 *    (โหมดตัด + เรทราคา) แล้วบวกเงื่อนไข "กลุ่มนี้ = กำหนดขนาดเอง" — ใช้ showWhenAll เมื่อครบ 3 ข้อ
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const RATE_LABEL = "เรทราคา";
const CUSTOM_NAME = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
const IDS = ["sticker-pp", "sticker-uv", "paper-art-pet"];

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** ชื่อฐานของกลุ่ม เอาไว้ตั้งชื่อช่องกรอก: "ขนาดตัด (ตร.ม.)" → "ขนาดตัด ตร.ม." */
function baseName(label) {
  return label.replace(/\s*\(([^()]*)\)\s*$/, (_m, g) => ` ${g}`).trim();
}

const DRY = process.argv.includes("--dry");

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) {
    console.log(id, "SKIP —", error?.message || "not found");
    continue;
  }
  const p = row.data;
  const opts = p.options || [];
  const rates = p.priceRates || [];

  // ช่องกรอกอ้างอิง (คู่ กว้าง×สูง ของโหมดไดคัท 100%/ไดคัททรง เดิม) — ใช้ก๊อปสเปกแผ่น/ช่องกรอก
  const refHeight = opts.find((o) => o.display === "input" && o.sheetYield);
  if (!refHeight) {
    console.log(id, "SKIP — ไม่พบช่องกรอกอ้างอิง (sheetYield)");
    continue;
  }
  const refWidth = opts.find((o) => o.label === refHeight.sheetYield.pairLabel);
  const sheetName = refHeight.sheetYield.sheetName || "แผ่น";

  // กลุ่มขนาดตัดแบบตายตัว (A4-A7) ที่จะเติม "กำหนดขนาดเอง" — ไม่ใช่ช่องกรอก และขึ้นต้นด้วย "ขนาดตัด"
  const presetGroups = opts.filter(
    (o) => o.display !== "input" && /^ขนาดตัด/.test(o.label) && Array.isArray(o.choices)
  );
  if (!presetGroups.length) {
    console.log(id, "SKIP — ไม่พบกลุ่มขนาดตัดตายตัว");
    continue;
  }

  const nextOpts = [];
  let changed = 0;
  for (const opt of opts) {
    nextOpts.push(opt);
    if (!presetGroups.includes(opt)) continue;

    // 1) เติมตัวเลือก "กำหนดขนาดเอง" (ไม่มี piecesPerUnit → unitYieldOf ข้ามไปใช้ช่องกรอกแทน)
    if (!opt.choices.some((c) => c.name === CUSTOM_NAME)) {
      opt.choices.push({ name: CUSTOM_NAME });
      changed++;
    }

    // 2) สร้างช่องกรอกกว้าง/สูง — ข้ามถ้ามีอยู่แล้ว (รันซ้ำ)
    const base = baseName(opt.label);
    const wLabel = `${base} (กว้าง)`;
    const hLabel = `${base} (สูง)`;
    if (opts.some((o) => o.label === wLabel) || nextOpts.some((o) => o.label === wLabel)) continue;

    // เงื่อนไขแสดงผล: กลุ่มนี้=กำหนดเอง + เงื่อนไขเดิมของกลุ่ม (โหมดตัด + เรทราคา) ครบทุกข้อ
    const branchConds = [opt.showWhen, opt.showWhenAlso].filter(Boolean);
    const showWhen = { label: opt.label, choices: [CUSTOM_NAME] };
    const showWhenAlso = branchConds[0];
    const showWhenAll = branchConds.slice(1);

    // ตัวคูณ "ต่อหน่วยขาย" — เฉพาะกลุ่มที่ผูกเรทซึ่งขายเป็นหน่วยใหญ่กว่าแผ่น (เช่น ตร.ม.)
    const rateCond = branchConds.find((c) => c.label === RATE_LABEL);
    let unitSheets;
    if (rateCond) {
      const rate = rates.find((r) => r.label === rateCond.choices[0]);
      const rUnit = rate?.pricing?.unit;
      if (rUnit && rUnit !== sheetName) {
        unitSheets = refHeight.sheetYield.unitSheets?.[rUnit]
          ? { [rUnit]: refHeight.sheetYield.unitSheets[rUnit] }
          : { [rUnit]: 8 };
      }
    }

    const mkInput = (extra) => ({
      kind: refWidth?.input?.kind || "number",
      unit: refWidth?.input?.unit || "ซม.",
      min: refWidth?.input?.min ?? 1,
      max: refWidth?.input?.max ?? 42,
      placeholder: refWidth?.input?.placeholder || "เช่น 5",
      ...extra,
    });

    const gate = { showWhen, ...(showWhenAlso ? { showWhenAlso } : {}), ...(showWhenAll.length ? { showWhenAll } : {}) };
    nextOpts.push({
      label: wLabel,
      choices: [],
      display: "input",
      standardInput: true,
      ...gate,
      input: mkInput({ hint: "ขนาดชิ้นงานหลังไดคัท วัดด้านที่กว้างที่สุด" }),
    });
    nextOpts.push({
      label: hLabel,
      choices: [],
      display: "input",
      standardInput: true,
      ...gate,
      input: mkInput({}),
      sheetYield: {
        pairLabel: wLabel,
        sheetW: refHeight.sheetYield.sheetW,
        sheetH: refHeight.sheetYield.sheetH,
        gap: refHeight.sheetYield.gap ?? 0.5,
        sheetName,
        ...(unitSheets ? { unitSheets } : {}),
      },
    });
    changed += 2;
  }

  p.options = nextOpts;
  console.log(`\n=== ${id} — changed ${changed} · groups: ${presetGroups.map((g) => g.label).join(", ")}`);
  presetGroups.forEach((g) => {
    const b = baseName(g.label);
    const h = nextOpts.find((o) => o.label === `${b} (สูง)`);
    console.log(`   • ${g.label}: +กำหนดเอง; ช่องกรอก "${b} (กว้าง/สูง)" ` +
      `showWhenAlso=${JSON.stringify(h?.showWhenAlso)} showWhenAll=${JSON.stringify(h?.showWhenAll || [])} ` +
      `unitSheets=${JSON.stringify(h?.sheetYield?.unitSheets || null)}`);
  });

  if (DRY) { console.log("   (dry run — ไม่บันทึก)"); continue; }
  const { error: upErr } = await sb.from("products").update({ data: p }).eq("id", id);
  console.log(upErr ? "   ❌ " + upErr.message : "   ✅ saved");
}
