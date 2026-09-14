#!/usr/bin/env npx tsx
/**
 * 🎯 กลุ่ม "ขนาดตัด → กำหนดขนาดเอง" — ให้จำนวนชิ้น/แผ่นตรงกับโปรแกรม Print-Fit ของร้านเป๊ะ ๆ
 *
 *   npx tsx scripts/cut-size-match-print-fit.mts           # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/cut-size-match-print-fit.mts --write
 *
 * เจ้าของร้านทัก 14 ก.ย. 69 (หน้าสติ๊กเกอร์ UV): กรอก 11 × 9 ซม. เว็บตอบ 9 ชิ้น/แผ่น
 * แต่ Print-Fit ที่ใช้จัดวางจริงตอบ 8 → "อยากให้ระบบตรงกับ Print-Fit"
 *
 * ตรวจแล้วเคส 11 × 9 นั้น Print-Fit ถูกกรอกช่องจำนวนเป็น 8 (ช่องนี้ปล่อยว่าง = Auto หาจำนวนสูงสุด)
 * โหมด Auto จริง ๆ Print-Fit ก็ตอบ 9 เท่าเว็บ — แต่พอไล่เทียบทั้งช่วงขนาดที่ช่องกรอกรับ
 * (5–29.7 × 5–42 ซม. ทีละ 1 มม. = 91,390 ขนาด) เจอว่าเว็บบอกมากกว่า Print-Fit อยู่ 15,400 ขนาด
 * เพราะกลุ่มนี้ตั้งพื้นที่วางเป็น A3 เต็ม 42 × 29.7 เว้น 2 มม. ซึ่ง "ไม่ใช่" สเปกที่ Print-Fit ใช้
 *
 * สคริปต์นี้ย้ายมาใช้สเปกเดียวกับ Print-Fit ทั้งดุ้น:
 *   ชีท Dicut 100% 48.26 × 33.02 → พื้นที่พิมพ์ 44.76 × 29.89 → หักขอบ 0.5 รอบด้าน
 *   = พื้นที่วาง 43.76 × 28.89 · ระยะห่างระหว่างชิ้น 0.5 ซม. (ขอบ/ระยะห่างใน Print-Fit ล็อกไว้ แก้ไม่ได้)
 *   + ธง printFitOnly = ไม่เอาเพดานผังกริดของเราไปช่วย (Print-Fit ไม่มีตัวนี้ · ดู SheetYield.printFitOnly)
 * และแก้ข้อความบอกลูกค้า "วางลายห่างกันอย่างน้อย 2 มม." → 5 มม. ให้ตรงกับที่คิดจริง
 *
 * ⚠️ ก่อนเขียน สคริปต์รัน runPacking จากไฟล์จริง ~/Desktop/Print-Fit/js/print-fit.js เทียบกับ
 *    sheetFitCount() ของเว็บทุกขนาดในช่วง ถ้าไม่ตรงแม้ขนาดเดียวจะไม่ยอมเขียน
 * ⚠️ แตะเฉพาะกลุ่ม "ขนาดตัด" (ไดคัท 50%) — กลุ่ม "ขนาดไดคัท" ใช้ตารางจำนวนของร้าน (perSheetTiers) อยู่แล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetFitCount, type SheetYield } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

/** พื้นที่วาง + ระยะห่างของ Print-Fit ชีท Dicut 100% (ขอบ 0.5 หักออกแล้ว) */
const SPEC = { sheetW: 43.76, sheetH: 28.89, gap: 0.5, printFitOnly: true } as const;

/** id → กลุ่มช่องกรอก "ด้านสูง" ที่ถือ sheetYield ของขนาดตัด */
const TARGETS: Record<string, string[]> = {
  "paper-art-pet": ["ขนาดตัด (สูง)"],
  "paper-foil": ["ขนาดตัด (สูง)"],
  "texture-paper": ["ขนาดตัด (สูง)"],
  "sticker-pp": ["ขนาดตัด (สูง)"],
  "sticker-uv": ["ขนาดตัด (สูง)", "ขนาดตัด ตร.ม. (สูง)"],
  "sticker-solvent": ["ขนาดตัด (สูง)"],
  "sticker-hologram": ["ขนาดตัด (สูง)"],
  "sticker-rainbow-film": ["ขนาดตัด (สูง)"],
  "sticker-gold-silver-rosegold": ["ขนาดตัด (สูง)"],
  "washi-sticker": ["ขนาดตัด (สูง)"],
  "reflective-sticker": ["ขนาดตัด (สูง)"],
  neon: ["ขนาดตัด (สูง)"],
};

const die = (msg: string): never => {
  console.error("✗ " + msg);
  process.exit(1);
};

// ───────── ดึงตัวจัดวางจากไฟล์จริงของ Print-Fit มารัน (ไม่ก๊อปโค้ด จะได้ไม่หลุดกันทีหลัง) ─────────
const PF_PATH = `${process.env.HOME}/Desktop/Print-Fit/js/print-fit.js`;
const pfSrc = (() => {
  try {
    return readFileSync(PF_PATH, "utf8");
  } catch {
    return die(`เปิด ${PF_PATH} ไม่ได้ — ต้องมี Print-Fit อยู่บนเครื่องถึงจะยืนยันตัวเลขได้`);
  }
})();
const grabFn = (name: string) => {
  const i = pfSrc.indexOf(`function ${name}(`);
  if (i < 0) die(`หา function ${name} ใน print-fit.js ไม่เจอ (โปรแกรมเปลี่ยนโครงสร้าง?)`);
  let depth = 0,
    end = pfSrc.indexOf("{", i);
  for (let k = end; k < pfSrc.length; k++) {
    if (pfSrc[k] === "{") depth++;
    else if (pfSrc[k] === "}" && !--depth) {
      end = k + 1;
      break;
    }
  }
  return pfSrc.slice(i, end);
};
const pf: any = await import(
  "data:text/javascript," +
    encodeURIComponent(`${grabFn("runPacking")}\n${grabFn("isRectContained")}\nexport { runPacking };`)
);

/** ค่าคงที่ในหน้าจอ Print-Fit: ชีท Dicut 100% + ขอบ/ระยะห่าง 0.5 ที่ล็อกไว้แก้ไม่ได้ */
const PF_SHEET = { w: 48.26, h: 33.02, safe: { x0: 0.03627, y0: 0.04737, x1: 0.96373, y1: 0.95263 } };
const PF_MARGIN = 0.5;
const PF_GUTTER = 0.5;
const PF_PRINTABLE = {
  x: 0,
  y: 0,
  w: (PF_SHEET.safe.x1 - PF_SHEET.safe.x0) * PF_SHEET.w,
  h: (PF_SHEET.safe.y1 - PF_SHEET.safe.y0) * PF_SHEET.h,
};
/** จำนวนสูงสุดที่ Print-Fit วางได้ (โหมด Auto = ปล่อยช่องจำนวนว่าง · ลองทั้ง BSSF และ BAF เหมือนโปรแกรม) */
const printFitAuto = (w: number, h: number) =>
  Math.max(
    ...["BSSF", "BAF"].map(
      (heuristic) =>
        pf.runPacking(
          [{ w, h, quantity: Infinity, isAuto: true, placedCount: 0 }],
          { w: PF_SHEET.w, h: PF_SHEET.h },
          PF_PRINTABLE,
          PF_MARGIN,
          PF_GUTTER,
          heuristic
        ).placedItems.length
    )
  );

// ───────── ประตูตรวจ: สเปกใหม่ต้องให้เลขเดียวกับ Print-Fit ทุกขนาดที่ช่องกรอกรับ ─────────
console.log(`ตรวจสเปกใหม่กับ Print-Fit (${PF_PATH})`);
console.log(`  พื้นที่วาง ${SPEC.sheetW} × ${SPEC.sheetH} ซม. · เว้น ${SPEC.gap * 10} มม. · printFitOnly`);
const cfg: SheetYield = { pairLabel: "-", ...SPEC };
/** เพดานช่องกรอก กว้าง ≤ 29.7 · สูง ≤ 42 — งานเต็มแผ่นที่วางไม่ลงยังนับ 1 ชิ้นตามเดิม (ดู sheetFitCount) */
const BOUND = { w: 29.7, h: 42 };
const mismatch: string[] = [];
let checked = 0;
for (let wi = 50; wi <= 297; wi++)
  for (let hi = 50; hi <= 420; hi++) {
    const w = wi / 10,
      h = hi / 10;
    const web = sheetFitCount(cfg, w, h, BOUND);
    const want = printFitAuto(w, h);
    checked++;
    // งานเต็มแผ่น: Print-Fit วางไม่ลง (0) แต่ร้านรับงานเต็มแผ่น เว็บนับ 1 — ยกเว้นให้ตามเดิม
    if (web === want || (want === 0 && web === 1)) continue;
    if (mismatch.length < 10) mismatch.push(`${w}×${h} → เว็บ ${web} · Print-Fit ${want}`);
    else mismatch.push("…");
  }
console.log(`  เทียบ ${checked.toLocaleString()} ขนาด → ${mismatch.length ? "ไม่ตรง" : "ตรงกันทุกขนาด ✓"}`);
if (mismatch.length) die("ยังไม่ตรงกับ Print-Fit จึงไม่เขียน:\n  " + [...new Set(mismatch)].join("\n  "));

// ───────── เขียนลง DB ─────────
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k: string) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL")!, pick("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", Object.keys(TARGETS));
if (error) die(error.message);
if (rows!.length !== Object.keys(TARGETS).length)
  die(`ดึงได้ ${rows!.length} ตัว จาก ${Object.keys(TARGETS).length}`);

/** ข้อความกติกาเดิมที่ต้องขยับตามระยะห่างจริง (อยู่ในช่อง note ของกลุ่ม "ขนาดตัด") */
const NOTE_FROM = "วางลายห่างกันอย่างน้อย 2 มม.";
const NOTE_TO = "วางลายห่างกันอย่างน้อย 5 มม.";

let changed = 0;
for (const row of rows!.sort((a, b) => a.id.localeCompare(b.id))) {
  const d: any = row.data;
  let dirty = false;
  for (const label of TARGETS[row.id]) {
    const opt = (d.options ?? []).find((o: any) => o.label === label);
    if (!opt) die(`${row.id}: ไม่มีกลุ่ม "${label}"`);
    const sy = opt.sheetYield;
    if (!sy) die(`${row.id} / ${label}: ไม่ได้ตั้ง sheetYield`);
    const before = `${sy.sheetW}×${sy.sheetH} gap ${sy.gap ?? 0}${sy.printFitOnly ? " printFitOnly" : ""}`;
    const after = `${SPEC.sheetW}×${SPEC.sheetH} gap ${SPEC.gap} printFitOnly`;
    if (before === after) {
      console.log(`= ${row.id} / ${label} — ตั้งไว้แล้ว`);
      continue;
    }
    Object.assign(sy, SPEC);
    dirty = true;
    console.log(`✎ ${row.id} / ${label}  ${before} → ${after}`);
  }
  // ข้อความ "ห่างกัน 2 มม." อยู่ที่กลุ่ม dropdown "ขนาดตัด" ไม่ใช่กลุ่มช่องกรอก
  for (const opt of d.options ?? []) {
    if (typeof opt.note === "string" && opt.note.includes(NOTE_FROM)) {
      opt.note = opt.note.split(NOTE_FROM).join(NOTE_TO);
      dirty = true;
      console.log(`✎ ${row.id} / ${opt.label} — ข้อความ 2 มม. → 5 มม.`);
    }
  }
  if (!dirty) continue;
  changed++;
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id);
    if (e2) die(`${row.id}: ${e2.message}`);
  }
}

console.log("\nตัวอย่างจำนวนชิ้น/แผ่น หลังเปลี่ยน (เทียบ Print-Fit โหมด Auto):");
for (const [w, h, why] of [
  [11, 9, "เคสที่เจ้าของร้านทัก"],
  [5, 5.5, "ชิ้นเล็ก — ต่างจากเดิมมากสุด"],
  [15, 7.3, "เคสเก่า 31 ส.ค."],
  [21, 29.7, "A4"],
  [29.7, 42, "เต็มแผ่น"],
] as [number, number, string][])
  console.log(
    `  ${String(`${w}×${h}`).padEnd(9)} เดิม ${String(
      sheetFitCount({ pairLabel: "-", sheetW: 42, sheetH: 29.7, gap: 0.2 }, w, h, BOUND)
    ).padStart(3)} → ใหม่ ${String(sheetFitCount(cfg, w, h, BOUND)).padStart(3)}  (Print-Fit ${printFitAuto(w, h)}) — ${why}`
  );

console.log(`\n${changed} สินค้าที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");
