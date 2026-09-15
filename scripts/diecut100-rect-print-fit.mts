#!/usr/bin/env npx tsx
/**
 * 📐 ทุกกลุ่มที่ใช้ "ชีทไดคัท A3 ของ Print-Fit" — ให้จำนวนชิ้น/แผ่นตรงกับโปรแกรมที่ร้านใช้จัดวางจริง
 *
 *   npx tsx scripts/diecut100-rect-print-fit.mts           # ดูก่อน (ไม่เขียน)
 *   npx tsx scripts/diecut100-rect-print-fit.mts --write
 *
 * เจ้าของร้านทัก 15 ก.ย. 69 (QT-260915-8810 รายการ 4 กระดาษอาร์ตมัน PET): กรอกขนาดไดคัท 13.97 × 7 ซม.
 * ใบเสนอราคาบอก "ได้ประมาณ 6 ชิ้น" ต่อแผ่น A3 แต่วางจริง (Print-Fit โหมด Auto) ได้ 10 — ต่ำกว่าจริงเกือบครึ่ง
 *
 * ต้นเหตุ: ตารางของร้าน (perSheetTiers) เทียบ "ด้านยาวสุด" ด้านเดียว = คิดเหมือนชิ้นจัตุรัส 13.97 × 13.97
 * ซึ่งถูกสำหรับเคสที่ลูกค้าบอกมาด้านเดียว (ดู [[iducky-diecut100-longest-only]]) แต่พอกรอกครบสองด้าน
 * ชิ้นแบน ๆ จะโดนนับต่ำกว่าจริงมาก · แก้ที่ sheetFitCount แล้ว: กรอกครบ (กว้าง ≠ สูง) = ข้ามตาราง ไปจัดวางจริง
 *
 * สคริปต์นี้เติมธง `printFitOnly` ให้ **ทุกกลุ่มที่ตั้งพื้นที่วางเป็นชีทเดียวกับ Print-Fit**
 * (43.76 × 28.89 เว้น 0.5) เพื่อให้เลขที่บอกลูกค้าไม่เกินที่โปรแกรมของร้านวางได้จริง
 * — กติกาเดียวกับกลุ่ม "ขนาดตัด" ไดคัท 50% ที่ทำไว้ 14 ก.ย. 69 (scripts/cut-size-match-print-fit.mts)
 * ค้นเป้าหมายจากฐานเอง ไม่ล็อกรายชื่อสินค้า — สินค้าใหม่ที่ตั้งชีทเดียวกันก็โดนเติมให้ด้วย
 * (รอบแรก 15 ก.ย. 69 = 10 ตัวไดคัท 100% + แม่เหล็ก acrylicmagnet-3/4 ที่เคยบอกเกินจริง 148 ขนาด)
 *
 * ⚠️ ก่อนเขียน สคริปต์รัน runPacking จากไฟล์จริง ~/Desktop/Print-Fit/js/print-fit.js เทียบกับ sheetFitCount()
 *    ทุกขนาดที่ช่องกรอกรับ ถ้าไม่ตรงแม้ขนาดเดียวจะไม่ยอมเขียน · ชิ้นจัตุรัส (กรอกด้านเดียว) ยังได้เลขตารางร้าน
 *    แต่ต้องไม่เกินผังจริง (ขอบขั้นตาราง 4 × 4 ซม. เคยบอก 60 ทั้งที่วางได้ 54 — sheetFitCount ครอบเพดานให้แล้ว)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetFitCount, type SheetYield } from "../src/lib/products";

const WRITE = process.argv.includes("--write");

/** พื้นที่วางของ Print-Fit (ชีท Dicut 100% 48.26 × 33.02 หักขอบ 0.5) — กลุ่มไหนตั้งตรงนี้ = ร้านจัดวางด้วย Print-Fit */
const PF_SPEC = { sheetW: 43.76, sheetH: 28.89, gap: 0.5 };
const isPfSheet = (sy: any) =>
  !!sy &&
  Math.abs(sy.sheetW - PF_SPEC.sheetW) < 0.01 &&
  Math.abs(sy.sheetH - PF_SPEC.sheetH) < 0.01 &&
  (sy.gap ?? 0) === PF_SPEC.gap &&
  !sy.addH;

/** ข้อความใต้ช่องกรอกที่ต้องบอกให้ตรงกับกติกาใหม่ [กลุ่ม, ข้อความเดิม, ข้อความใหม่] */
const HINTS: [string, string, string][] = [
  [
    "ขนาดไดคัท (กว้าง)",
    "จำนวนชิ้นต่อแผ่น A3 ตามตารางของร้าน",
    "กรอกด้านเดียว จำนวนชิ้นต่อแผ่น A3 คิดตามตารางของร้าน",
  ],
  [
    "ขนาดไดคัท (สูง)",
    "(จำนวนชิ้นคิดจากด้านยาวสุด)",
    "(กรอกครบสองด้าน = นับจำนวนชิ้นตามรูปจริง แม่นกว่ากรอกด้านเดียว)",
  ],
];

const die = (msg: string): never => {
  console.error("✗ " + msg);
  process.exit(1);
};

// ───────── ดึงตัวจัดวางจากไฟล์จริงของ Print-Fit มารัน (วิธีเดียวกับ cut-size-match-print-fit.mts) ─────────
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
const PF_SHEET = { w: 48.26, h: 33.02, safe: { x0: 0.03627, y0: 0.04737, x1: 0.96373, y1: 0.95263 } };
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
          0.5,
          0.5,
          heuristic
        ).placedItems.length
    )
  );

// ───────── ประตูตรวจ ─────────
const TIERS = [
  { per: 180, upTo: 2 },
  { per: 96, upTo: 3 },
  { per: 60, upTo: 4 },
  { per: 40, upTo: 5 },
  { per: 24, upTo: 6 },
  { per: 15, upTo: 8 },
  { per: 12, upTo: 9 },
  { per: 8, upTo: 10 },
  { per: 6, upTo: 14 },
  { per: 4, upTo: 15 },
  { per: 2, upTo: 21 },
  { per: 1 },
];
const cfgAfter: SheetYield = {
  pairLabel: "-",
  sheetW: 43.76,
  sheetH: 28.89,
  gap: 0.5,
  longestOnly: true,
  printFitOnly: true,
  perSheetTiers: TIERS,
};
/** เพดานช่องกรอก กว้าง(ด้านยาวสุด) ≤ 30 · สูง ≤ 42 */
const BOUND = { w: 30, h: 42 };
const tierPer = (longest: number) => TIERS.find((t) => t.upTo == null || longest <= t.upTo)!.per;

console.log(`ตรวจกับ Print-Fit (${PF_PATH})`);
/*
 * เลขที่ถูกต้องของแต่ละขนาด = ผังจริงของ Print-Fit · ถ้ากลุ่มนั้นมีตารางของร้าน (perSheetTiers)
 * และเป็นเคส "กรอกด้านเดียว" (จัตุรัส) ให้ใช้เลขตาราง แต่ **ห้ามเกินผังจริง** (ดู sheetFitCount)
 */
const bad: string[] = [];
let checked = 0;
for (let wi = 30; wi <= 300; wi++)
  for (let hi = 30; hi <= 420; hi++) {
    const w = wi / 10,
      h = hi / 10;
    const web = sheetFitCount(cfgAfter, w, h, BOUND);
    const real = printFitAuto(w, h);
    const want = wi === hi && real > 0 ? Math.min(tierPer(w), real) : real;
    checked++;
    // งานเต็มแผ่น: Print-Fit วางไม่ลง (0) แต่ร้านรับงานเต็มแผ่น เว็บนับ 1 — ยกเว้นให้ตามเดิม
    if (web === want || (real === 0 && web === 1)) continue;
    bad.push(bad.length < 10 ? `${w}×${h} → เว็บ ${web} · ควรได้ ${want} (Print-Fit ${real})` : "…");
  }
console.log(`  ${checked.toLocaleString()} ขนาด → ${bad.length ? "ไม่ตรง" : "ตรงทุกขนาด ✓ (ผืนผ้า = Print-Fit · จัตุรัส = ตารางร้านที่ไม่เกินผังจริง)"}`);
if (bad.length) die("ยังไม่ผ่านประตูตรวจ จึงไม่เขียน:\n  " + [...new Set(bad)].slice(0, 12).join("\n  "));

// ───────── เขียนลง DB ─────────
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k: string) => (envText.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL")!, pick("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const { data: rows, error } = await sb.from("products").select("id,name,data");
if (error) die(error.message);
/** เป้าหมาย = ทุกสินค้าที่มีกลุ่มตั้งชีทเดียวกับ Print-Fit (ข้ามแถวคลังตัวเลือกกลางที่ขึ้นต้น __ และชุด preset) */
const targets = (rows ?? []).filter(
  (r: any) => !String(r.id).startsWith("__") && !r.data?.choices && (r.data?.options ?? []).some((o: any) => isPfSheet(o.sheetYield))
);
console.log(`\nสินค้าที่ใช้ชีทเดียวกับ Print-Fit: ${targets.length} ตัว`);

let changed = 0;
for (const row of targets.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))) {
  const d: any = (row as any).data;
  let dirty = false;
  for (const opt of d.options ?? []) {
    if (!isPfSheet(opt.sheetYield)) continue;
    if (opt.sheetYield.printFitOnly) {
      console.log(`= ${row.id} / ${opt.label} — printFitOnly ตั้งไว้แล้ว`);
      continue;
    }
    opt.sheetYield.printFitOnly = true;
    dirty = true;
    console.log(`✎ ${row.id} / ${opt.label} — เติม printFitOnly`);
  }
  /*
   * ข้อความใต้ช่องกรอกเดิมบอกว่า "จำนวนชิ้นคิดจากด้านยาวสุด / ตามตารางของร้าน" ซึ่งจริงเฉพาะตอน
   * กรอกด้านเดียว — กรอกครบสองด้านนับตามรูปจริงแล้ว ต้องบอกให้ตรง ไม่งั้นแอดมินเห็นเลขไม่ตรงตาราง
   */
  for (const [label, from, to] of HINTS) {
    const o = (d.options ?? []).find((x: any) => x.label === label);
    if (!o?.input?.hint || !o.input.hint.includes(from)) continue;
    o.input.hint = o.input.hint.split(from).join(to);
    dirty = true;
    console.log(`✎ ${row.id} / ${label} — แก้ข้อความใต้ช่องกรอก`);
  }
  if (!dirty) continue;
  d.savedAt = new Date().toISOString();
  changed++;
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", row.id);
    if (e2) die(`${row.id}: ${e2.message}`);
  }
}

console.log("\nตัวอย่างจำนวนชิ้น/แผ่น A3 หลังแก้ (เทียบ Print-Fit โหมด Auto):");
const cfgBefore: SheetYield = { ...cfgAfter, printFitOnly: false };
for (const [w, h, why] of [
  [13.97, 7, "เคสที่เจ้าของร้านทัก"],
  [13.97, 13.97, "กรอกด้านเดียว = จัตุรัส (ตารางร้าน)"],
  [10, 5, "ชิ้นแบน"],
  [20, 5, "ชิ้นยาว"],
  [21, 29.7, "A4"],
] as [number, number, string][])
  console.log(
    `  ${String(`${w}×${h}`).padEnd(13)} เดิม(ตารางร้าน) ${String(tierPer(Math.max(w, h))).padStart(3)} → ใหม่ ${String(
      sheetFitCount(cfgAfter, w, h, BOUND)
    ).padStart(3)}  (Print-Fit ${printFitAuto(w, h)} · ถ้าไม่เติมธง ${sheetFitCount(
      cfgBefore,
      w,
      h,
      BOUND
    )}) — ${why}`
  );

console.log(`\n${changed} สินค้าที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");
