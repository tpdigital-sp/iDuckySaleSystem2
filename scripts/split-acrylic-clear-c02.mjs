#!/usr/bin/env node
/**
 * แยกตัวเลือกชนิดอะคริลิคมาตรฐานให้เป็น 2 ตัว — "อะคริลิคใส" กับ "อะคริลิคขาวขุ่น C-02"
 *
 *   node scripts/split-acrylic-clear-c02.mjs                 # ดูผลก่อน (ไม่เขียนฐานข้อมูล)
 *   node scripts/split-acrylic-clear-c02.mjs --write         # บันทึกจริง
 *   node scripts/split-acrylic-clear-c02.mjs --write --only=standy
 *
 * ตารางราคาของร้านเขียนสองชนิดนี้รวมกันเพราะราคาเท่ากัน (ชาร์ตสีของร้านกำกับ C-02 ว่า "ไม่บวกเพิ่ม")
 * แต่เนื้อวัสดุคนละแบบ — ใสมองทะลุ / ขาวขุ่นทึบ ลายเด่นกว่า — ลูกค้าต้องเลือกเองได้
 *
 * ทำไมเป็นสคริปต์แก้เฉพาะจุด ไม่ใช่แก้ที่ scripts/add-*.ts แล้วรันทับ:
 *   สินค้าพวกนี้ข้อมูลจริงในฐานข้อมูล "เดินหน้าไปแล้ว" ไม่ตรงกับสคริปต์ที่สร้างมันขึ้นมา
 *   (สแตนดี้โยกเยกแยกฐานซ้าย/ขวาเพิ่ม · สแตนดี้หมุนได้โดนตัดแกลเลอรีเหลือ 5 รูป · standy ไม่มีสคริปต์เลย)
 *   สคริปต์ add-* ทุกตัว upsert ทับทั้งแถว — รันทับ = ของที่ทีมงานแก้ไว้หายหมด
 *
 * ⚠️ ถ้ากลุ่มนั้นเป็น "แกนตารางราคา" (pricing.driverLabels) ด้วย ต้องกางช่องราคาตามคู่ผสมใหม่
 *    ไม่งั้นลูกค้าเลือกแล้วหาราคาไม่เจอ — สคริปต์กางให้เอง แล้วตรวจว่าครบทุกคู่ก่อนบันทึก
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { acrylicColorImage } from "./acrylic-colors.mjs";

const WRITE = process.argv.includes("--write");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];

const CLEAR = "อะคริลิคใส";
const C02 = "อะคริลิคขาวขุ่น C-02";

/**
 * สินค้าที่ต้องแยก — `merged` คือชื่อตัวเลือกเดิมที่รวมสองชนิดไว้ด้วยกัน (แต่ละสินค้าเขียนไม่เหมือนกัน)
 * `clearImage` ใส่เมื่ออยากเปลี่ยนภาพของตัวเลือก "ใส" ด้วย · ไม่ใส่ = ใช้ภาพเดิมของตัวเลือกนั้น
 */
const TARGETS = [
  {
    id: "new-mszsx3ql-5569", // สแตนดี้โยกเยก — เลือกชนิดอะคริลิคแยกทีละชิ้น (แยกไปแล้วรอบก่อน)
    groups: ["ตัวกลาง", "ฐานโยกเยก (ซ้าย)", "ฐานโยกเยก (ขวา)"],
    merged: "อะคริลิคใส / ขาวขุ่น C-02",
  },
  {
    id: "standy", // สแตนดี้อะคริลิค (Acrylic Standee) — ไม่มีสคริปต์ add- เป็นของที่นำเข้ามา
    groups: ["สีอะคริลิค"],
    merged: "ใส / ขาวขุ่น C-02",
  },
  {
    id: "standee-rotating", // สแตนดี้อะคริลิค หมุนได้ — เดิมมีแต่ "ใส" ยังไม่มี C-02 ให้เลือก
    groups: ["ชนิดอะคริลิคตัวสแตนดี้"],
    merged: "อะคริลิคใส (มาตรฐาน)",
    // ⚠️ ฐานของสินค้านี้เป็นอะคริลิคใสอย่างเดียว — C-02 ใช้ได้เฉพาะ "ตัวสแตนดี้" (ตรงกับชื่อกลุ่มอยู่แล้ว)
    tab: {
      title: "ชนิดอะคริลิค",
      from: "อะคริลิคใส (มาตรฐาน)::\n• ราคาตามตารางคืออะคริลิคใส · ฐานเป็นอะคริลิคใสเท่านั้น\n",
      to:
        "อะคริลิคใส / ขาวขุ่น C-02 (มาตรฐาน)::\n" +
        "• ราคาตามตารางคืออะคริลิคใส หรือขาวขุ่น C-02 ราคาเท่ากัน เลือกได้ในหน้าสั่งซื้อ\n" +
        "• อะคริลิคใส = เนื้อใสมองทะลุ · ขาวขุ่น C-02 = เนื้อขาวขุ่นทึบ ลายเด่นกว่าเพราะไม่มีพื้นหลังทะลุมา\n" +
        "• เลือกได้เฉพาะ 'ตัวสแตนดี้' — ฐานเป็นอะคริลิคใสเท่านั้น\n",
    },
  },
];

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * แยกตัวเลือกในกลุ่มหนึ่ง — "ใส" สืบทอดค่าของเดิมทั้งหมด (ภาพ · +฿ · ให้ร้านตีราคา)
 * ส่วน C-02 ก๊อปเฉพาะเรื่องราคามา (เพราะราคาเท่ากัน) แล้วใช้สวอตช์จริงจากชาร์ตสีกลาง
 * ⚠️ ไม่ก๊อป stockItemId — คนละวัสดุ ถ้าผูกไว้จะไปตัดสต๊อกผิดตัว
 */
function splitChoices(choices, merged, clearImage) {
  const i = choices.findIndex((c) => c.name === merged);
  if (i < 0) return null;
  const orig = choices[i];
  if (orig.stockItemId) throw new Error(`"${merged}" ผูกคลังไว้ (${orig.stockItemId}) — ต้องผูก SKU ของ C-02 เองก่อน`);
  const clear = { ...orig, name: CLEAR, ...(clearImage ? { imageSrc: clearImage } : {}) };
  const c02 = { name: C02, imageSrc: acrylicColorImage(C02) };
  if (orig.extra != null) c02.extra = orig.extra;
  if (orig.askPrice) c02.askPrice = orig.askPrice;
  return [...choices.slice(0, i), clear, c02, ...choices.slice(i + 1)];
}

/** กางช่องราคา — คีย์คือค่าของแต่ละแกนต่อกันด้วย "│" แกนไหนเป็นกลุ่มที่แยก ให้แตกเป็น [ใส, C-02] */
function expandCells(matrix, groups, merged) {
  if (!matrix?.cells || !matrix.driverLabels?.some((l) => groups.includes(l))) return 0;
  const isSplit = matrix.driverLabels.map((l) => groups.includes(l));
  const out = {};
  for (const [key, value] of Object.entries(matrix.cells)) {
    let combos = [[]];
    key.split("│").forEach((p, i) => {
      const vals = isSplit[i] && p === merged ? [CLEAR, C02] : [p];
      combos = combos.flatMap((c) => vals.map((v) => [...c, v]));
    });
    for (const combo of combos) out[combo.join("│")] = value;
  }
  const before = Object.keys(matrix.cells).length;
  matrix.cells = out;
  return Object.keys(out).length - before;
}

/**
 * ตรวจว่าการกางช่องราคา "ไม่เปลี่ยนราคาของใคร" — ย้อนคีย์ใหม่กลับเป็นชื่อรวมเดิม
 * แล้วเทียบกับตารางก่อนแก้ทีละช่อง · ต้องตรงกันหมด และช่องเดิมต้องไม่หายไปไหน
 *
 * ไม่เช็คแบบ "กางทุกคู่ผสมต้องมีราคา" เพราะบางสินค้าตารางมีรูอยู่ก่อนแล้ว
 * (เช่น standy ไม่มีราคาของ 17cm สกรีน 3 เลเยอร์ มาตั้งแต่ต้น) — คนละเรื่องกับการแยกตัวเลือก
 */
function priceDiff(before, after, groups, merged) {
  if (!before?.cells || !after?.cells) return [];
  const isSplit = (after.driverLabels ?? []).map((l) => groups.includes(l));
  const bad = [];
  for (const [key, value] of Object.entries(after.cells)) {
    const oldKey = key
      .split("│")
      .map((p, i) => (isSplit[i] && (p === CLEAR || p === C02) ? merged : p))
      .join("│");
    if (JSON.stringify(before.cells[oldKey]) !== JSON.stringify(value)) bad.push(`${key} (เทียบ "${oldKey}")`);
  }
  const lost = Object.keys(before.cells).filter((k) => {
    const parts = k.split("│");
    return !after.cells[k] && !after.cells[parts.map((p, i) => (isSplit[i] && p === merged ? CLEAR : p)).join("│")];
  });
  return [...bad, ...lost.map((k) => `หายไป: ${k}`)];
}

let changed = 0;
for (const t of TARGETS) {
  if (ONLY && t.id !== ONLY) continue;
  const { data: row, error } = await sb.from("products").select("data").eq("id", t.id).single();
  if (error) throw new Error(`${t.id}: อ่านไม่สำเร็จ — ${error.message}`);
  const d = structuredClone(row.data);
  console.log(`\n📦 ${d.name} (${t.id})`);

  const done = [];
  for (const label of t.groups) {
    const opt = d.options?.find((o) => o.label === label);
    if (!opt) throw new Error(`${t.id}: ไม่เจอกลุ่ม "${label}"`);
    const next = splitChoices(opt.choices, t.merged, t.clearImage);
    if (!next) {
      const ok = opt.choices.some((c) => c.name === CLEAR) && opt.choices.some((c) => c.name === C02);
      console.log(`   [${label}] ${ok ? "แยกไว้แล้ว ข้าม" : `⚠️ ไม่เจอ "${t.merged}" และยังไม่ได้แยก`}`);
      continue;
    }
    opt.choices = next;
    done.push(label);
    console.log(`   [${label}] → ${next.map((c) => c.name).join(" | ")}`);
  }
  if (!done.length) {
    console.log("   (ไม่มีอะไรต้องแก้)");
    continue;
  }

  // ตารางราคา — ทั้งตารางหลักและทุกเรท
  for (const [name, m] of [["ตารางหลัก", d.pricing], ...(d.priceRates ?? []).map((r) => [`เรท ${r.id}`, r.pricing])]) {
    const added = expandCells(m, t.groups, t.merged);
    if (added) console.log(`   ${name}: +${added} ช่อง → ${Object.keys(m.cells).length} ช่อง`);
  }
  for (const [name, m] of [["ตารางหลัก", d.pricing], ...(d.priceRates ?? []).map((r) => [`เรท ${r.id}`, r.pricing])]) {
    const miss = missingCells(d, m);
    if (miss.length) throw new Error(`${t.id} ${name}: ยังขาด ${miss.length} ช่อง เช่น "${miss[0]}" — ไม่บันทึก`);
  }

  // ข้อความที่เขียนชื่อตัวเลือกเดิมไว้ (คำถามที่พบบ่อยของ SEO · แท็บชนิดอะคริลิค)
  for (const f of d.seo?.faqs ?? []) {
    if (f.a?.includes(t.merged)) f.a = f.a.replaceAll(t.merged, `${CLEAR}, ${C02}`);
  }
  if (t.tab) {
    const tab = d.tabs?.find((x) => x.title === t.tab.title);
    if (!tab?.text.includes(t.tab.from)) throw new Error(`${t.id}: ข้อความแท็บ "${t.tab.title}" ไม่ตรงกับที่คาดไว้`);
    tab.text = tab.text.replace(t.tab.from, t.tab.to);
    console.log(`   แท็บ "${t.tab.title}": อัปเดตข้อความแล้ว`);
  }

  changed++;
  if (!WRITE) continue;
  const { error: saveErr } = await sb.from("products").update({ data: d }).eq("id", t.id);
  if (saveErr) throw new Error(`${t.id}: บันทึกไม่สำเร็จ — ${saveErr.message}`);
  console.log("   ✅ บันทึกแล้ว");
}

console.log(WRITE ? `\n✅ แก้ไป ${changed} สินค้า` : `\n(ยังไม่เขียนลงฐานข้อมูล — ใส่ --write ถ้าต้องการบันทึกจริง · จะแก้ ${changed} สินค้า)`);
