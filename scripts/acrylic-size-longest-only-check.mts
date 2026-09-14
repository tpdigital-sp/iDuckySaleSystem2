/**
 * ตรวจ "กำหนดขนาดเอง = กรอกด้านที่ยาวที่สุดช่องเดียว" ของสแตนดี้อะคริลิค (standy)
 * และพวงกุญแจอะคริลิค (keyring-copy-copy) ด้วยฟังก์ชันจริงที่หน้าเว็บใช้ + ข้อมูลสดจาก DB
 * (อ่านอย่างเดียว)  npx tsx scripts/acrylic-size-longest-only-check.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  resolveSelections, allowedChoices, optionVisible, unitPriceFor, needsQuote,
  sizeInputPlan, sizeInputText, inputError, type Product,
} from "../src/lib/products";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const CUSTOM = "📐 กำหนดขนาดเอง (ระบุด้านที่ยาวที่สุด)";
const W = "ขนาดกำหนดเอง (ด้านที่ยาวที่สุด)";
let fail = 0;
const ok = (name: string, pass: boolean, extra = "") => { if (!pass) fail++; console.log(pass ? "  ✅" : "  ❌", name, extra); };

type Case = {
  id: string; title: string; sizeLabel: string; choices: number; askOver: number;
  /** กรอกเลขนี้ → ต้องเกาะแถวนี้ (คู่ล่าง/บนของการผ่อนเศษ 0.5) */
  slack: [string, string, string, string];
  smaller: [string, string];   // เล็กกว่าตารางทุกแถว → คิดเท่าแถวเล็กสุด
  overCm: string;              // เกิน askOver → รอแอดมินตีราคา
  ruled?: { label: string; choice: string; inCm: string; row: string; overCm: string };
};
const CASES: Case[] = [
  {
    id: "standy", title: "สแตนดี้อะคริลิค", sizeLabel: "ขนาดตัวสแตนดี้", choices: 29, askOver: 30,
    slack: ["12.5", "12cm", "12.6", "13cm"], smaller: ["2", "3cm"], overCm: "35",
    // สกรีน 3 เลเยอร์: กฎจำกัดขนาด 3-16cm → 14.4 ยังเกาะ 14cm ได้ · 20 ไม่มีแถวที่กฎยอม = ตีราคา
    ruled: { label: "งานสกรีน", choice: "สกรีน 3 เลเยอร์", inCm: "14.4", row: "14cm", overCm: "20" },
  },
  {
    id: "keyring-copy-copy", title: "พวงกุญแจอะคริลิค", sizeLabel: "ขนาด", choices: 20, askOver: 10,
    slack: ["3.5", "3cm", "3.6", "4cm"], smaller: ["1", "2cm"], overCm: "12",
    // ความหนา 2mm: กฎจำกัดถึง 10cm อยู่แล้ว
    ruled: { label: "ความหนาอะคริลิค", choice: "2mm", inCm: "6.4", row: "6cm", overCm: "12" },
  },
];

for (const c of CASES) {
  console.log(`\n=== ${c.title} (${c.id}) ===`);
  const { data: row, error } = await sb.from("products").select("data").eq("id", c.id).single();
  if (error) throw error;
  const p = row.data as Product;
  const group = (l: string) => p.options.find((o) => o.label === l)!;
  const SIZE = c.sizeLabel;

  ok(`กลุ่ม "${SIZE}" มี ${c.choices} ตัวเลือก และตัวสุดท้ายคือกำหนดขนาดเอง`,
    group(SIZE).choices.length === c.choices && group(SIZE).choices.at(-1)!.name === CUSTOM,
    `(${group(SIZE).choices.length})`);
  ok("ช่องกรอกอยู่ชุดตัวเลือกเดียวกับกลุ่มขนาด", group(W)?.section === group(SIZE).section);
  ok("กรอกด้านเดียว — ไม่มีช่องคู่ ก./ส. แล้ว และ sizeInput ชี้ช่องเดียว",
    group(SIZE).sizeInput?.heightLabel === group(SIZE).sizeInput?.widthLabel &&
    group(SIZE).sizeInput?.widthLabel === W &&
    !p.options.some((o) => /ขนาดกำหนดเอง \((กว้าง|สูง)\)/.test(o.label)));
  ok("ไม่มีชื่อตัวเลือกเก่า (ระบุ ก.×ส.) ค้างที่ไหน", !JSON.stringify(p).includes("ระบุ ก.×ส."));
  ok("ช่องกรอกบังคับกรอก + ไม่บล็อกทศนิยม",
    group(W).input?.required === true && group(W).input?.integer !== true);
  ok(`${c.slack[0]} ผ่านตัวตรวจช่องกรอก`, !inputError(group(W), c.slack[0]), String(inputError(group(W), c.slack[0]) ?? ""));

  const base = resolveSelections(p, {});
  ok("ยังไม่เลือกกำหนดขนาดเอง → ช่องกรอกซ่อน", !optionVisible(group(W), base));
  ok("กำหนดขนาดเองอยู่ใน allowedChoices", allowedChoices(p, base, SIZE).includes(CUSTOM));

  const price = (sel: Record<string, string>, qty = 1) => unitPriceFor(p, sel, qty);
  const std = (cm: string, qty = 1) => price(resolveSelections(p, { [SIZE]: cm }), qty);
  const cus = (cm: string, extra: Record<string, string> = {}) =>
    resolveSelections(p, { [SIZE]: CUSTOM, [W]: cm, ...extra });

  const [inA, rowA, inB, rowB] = c.slack;
  const planA = sizeInputPlan(p, cus(inA), SIZE)!;
  ok("เลือกกำหนดขนาดเอง → ช่องกรอกโผล่", optionVisible(group(W), cus(inA)));
  ok(`${inA} → เกาะแถว ${rowA} (ผ่อนเศษครึ่งเซนติเมตร)`, planA.choice === rowA && planA.filled && !planA.quote, JSON.stringify(planA));
  ok(`ข้อความสรุปเป็น "ยาวสุด ${inA} ซม." ไม่ใช่ ${inA}×0`, sizeInputText(planA) === `ยาวสุด ${inA} ซม.`, sizeInputText(planA));
  ok(`ราคา ${inA} = ราคาแถว ${rowA}`, price(cus(inA)) === std(rowA), `฿${price(cus(inA))} vs ฿${std(rowA)}`);
  ok(`${inB} → ขยับเป็นแถว ${rowB}`, sizeInputPlan(p, cus(inB), SIZE)!.choice === rowB && price(cus(inB)) === std(rowB));

  const [small, smallRow] = c.smaller;
  ok(`${small} (เล็กกว่าตาราง) → คิดเท่าแถว ${smallRow}`,
    sizeInputPlan(p, cus(small), SIZE)!.choice === smallRow && price(cus(small)) === std(smallRow));
  const cap = `${c.askOver}cm`;
  ok(`${c.askOver} → แถว ${cap} พอดี`, sizeInputPlan(p, cus(String(c.askOver)), SIZE)!.choice === cap && price(cus(String(c.askOver))) === std(cap));
  ok(`${c.askOver}.5 ยังอยู่แถว ${cap} (ผ่อนเศษ)`, sizeInputPlan(p, cus(`${c.askOver}.5`), SIZE)!.choice === cap);
  const over = cus(c.overCm);
  ok(`${c.overCm} (เกิน ${c.askOver}) → รอแอดมินตีราคา`,
    needsQuote(p, over) && sizeInputPlan(p, over, SIZE)!.quote && price(over) === 0, `฿${price(over)}`);
  ok("ยังไม่กรอก → เกาะแถวเล็กสุด ไม่หล่นไปราคาตั้งต้น", (() => {
    const s = resolveSelections(p, { [SIZE]: CUSTOM });
    const pl = sizeInputPlan(p, s, SIZE)!;
    return !pl.filled && pl.choice === group(SIZE).choices[0].name && price(s) === std(group(SIZE).choices[0].name);
  })());
  ok(`ราคาขั้นบันไดยังคิดถูก (100 ชิ้น ${inA} = 100 ชิ้นแถว ${rowA})`, price(cus(inA), 100) === std(rowA, 100), `฿${price(cus(inA), 100)}`);

  if (c.ruled) {
    const r = c.ruled;
    const sel = { [r.label]: r.choice };
    ok(`${r.choice} + กำหนดเอง ${r.inCm} → คิดเท่าแถว ${r.row}`,
      price(cus(r.inCm, sel)) === price(resolveSelections(p, { [SIZE]: r.row, ...sel })),
      `฿${price(cus(r.inCm, sel))}`);
    ok(`${r.choice} + กำหนดเอง ${r.overCm} (กฎไม่ยอมแถวนั้น) → รอแอดมินตีราคา`,
      needsQuote(p, cus(r.overCm, sel)) && price(cus(r.overCm, sel)) === 0, `฿${price(cus(r.overCm, sel))}`);
  }
}

console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : "\n✅ ผ่านครบทุกข้อ");
process.exit(fail ? 1 : 0);
