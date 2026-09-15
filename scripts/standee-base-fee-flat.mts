/**
 * 🦶 ค่าฐานสแตนดี้ = ราคาเดียวทั้งปลีกและส่ง (เจ้าของร้านสั่ง 15 ก.ย. 69)
 *
 * "งานสแตนดี้ ปลีกหรือส่งก็บวกค่าฐานเหมือนกันตามตารางค่าฐานสแตนดี้เลย"
 * ของเดิมกลุ่ม "ขนาดฐาน" ตั้ง 2 ขั้น — extraFromQty 11 (ตารางร้าน) + extraBelow (ช่วงปลีกลดให้/ฟรี)
 * ทำให้ใบปลีกไม่โดนค่าฐานเลยเมื่อฐาน ≤ 6 ซม. (เช่น ฐาน 4 ซม. ควร +฿10 แต่คิด ฿0)
 * สคริปต์นี้ถอด 2 ขั้นออก เหลือ extra ตัวเดียวที่คิดทุกจำนวน + แก้คำอธิบาย/โน้ต/แท็บให้ตรง
 *
 *   npx tsx scripts/standee-base-fee-flat.mts                    # ดูก่อน (photo-fram-acrylic)
 *   npx tsx scripts/standee-base-fee-flat.mts --write
 *   npx tsx scripts/standee-base-fee-flat.mts --all              # ทุกตัวที่ยังตั้ง 2 ขั้น
 *   npx tsx scripts/standee-base-fee-flat.mts standy --write
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { unitPriceFor, type Product } from "../src/lib/products";

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");
const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const isBaseSizeGroup = (g: any) =>
  /ขนาดฐาน/.test(String(g?.label ?? "")) && (g?.extraFromQty || (g?.choices ?? []).some((c: any) => c.extraBelow));

let rows: any[];
if (ALL) {
  const { data, error } = await sb.from("products").select("id,name,data");
  if (error) throw error;
  rows = (data as any[]).filter((r) => (r.data?.options ?? []).some(isBaseSizeGroup));
} else {
  const targets = ids.length ? ids : ["photo-fram-acrylic"];
  const { data, error } = await sb.from("products").select("id,name,data").in("id", targets);
  if (error) throw error;
  for (const id of targets) if (!(data as any[]).some((r) => r.id === id)) throw new Error(`ไม่เจอสินค้า ${id}`);
  rows = data as any[];
}

/* ── ข้อความ ───────────────────────────────────────────────────────────── */
const num = (n: number) => String(n);
/** สรุปตารางค่าฐานเป็นข้อความ "3-5 ซม. ฿10 · 6-7 ซม. ฿15 · 8 ซม. ฿20" */
function feeTableText(choices: any[]) {
  // ชื่อตัวเลือกเป็นได้ทั้งเลขเดี่ยว ("8cm") และช่วง ("ฐาน 3-5 ซม.") — ต้องเก็บหัว/ท้ายของช่วงไว้
  const spanOf = (name: string) => {
    const m = String(name).match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m) return { lo: m[1], hi: m[2] };
    const one = String(name).match(/(\d+)/);
    return one ? { lo: one[1], hi: one[1] } : { lo: String(name), hi: String(name) };
  };
  const parts: string[] = [];
  let run: { from: string; to: string; fee: number } | null = null;
  const flush = () => {
    if (run) parts.push(`${run.from === run.to ? run.from : `${run.from}-${run.to}`} ซม. ฿${num(run.fee)}`);
  };
  for (const c of choices) {
    const fee = c.extra ?? 0;
    const span = spanOf(c.name);
    if (run && run.fee === fee) run.to = span.hi;
    else {
      flush();
      run = { from: span.lo, to: span.hi, fee };
    }
  }
  flush();
  return parts.join(" · ");
}
/** ตัดท่อน "1-10 อัน …" / "11 อันขึ้นไป …" ออกจากคำอธิบาย แล้วต่อท้ายด้วยราคาเดียว
 *  ตัวเลือกที่ไม่เคยมีคำอธิบาย ปล่อยว่างไว้เหมือนเดิม — ไม่ต้องยัดคำอธิบายใหม่ให้ทั้งดรอปดาวน์ */
function rewriteDesc(desc: string | undefined, fee: number) {
  if (!String(desc ?? "").trim()) return desc;
  const tail = fee > 0 ? `ปลีกหรือส่ง +฿${num(fee)} เท่ากัน` : "ไม่บวกเพิ่ม";
  const keep = String(desc)
    .split(" · ")
    .filter((s) => s.trim() && !/^(?:1[-–]10|ตั้งแต่ 11|11 ?(?:อัน|ชิ้น)?ขึ้นไป)/.test(s.trim()));
  return [...keep, tail].join(" · ");
}

/* ── ข้อความในแท็บที่ยังเล่ากติกาเก่า — เขียนตรง ๆ ทีละบรรทัด ─────────────
 * ไม่ใช้ regex กวาด เพราะแต่ละสินค้าเล่าคนละสำนวน (บางตัว "ราคารวมฐานให้แล้ว" · บางตัวยกตัวอย่างคิดเงิน)
 * บรรทัดไหนหาไม่เจอ = ข้อความถูกแก้ไปแล้ว → เตือนไว้ ไม่ throw */
const TEXT_FIXES: Record<string, [string, string][]> = {
  standy: [
    [
      "• ราคาในตารางรวมแล้ว: ตัวสแตนดี้ + ฐาน (สกรีน/ไม่สกรีน) + Add-on สกรีน 2 ด้าน / 3 เลเยอร์ + อะคริลิคสีพิเศษ",
      "• ราคาในตารางรวมแล้ว: ตัวสแตนดี้ + Add-on สกรีน 2 ด้าน / 3 เลเยอร์ + อะคริลิคสีพิเศษ — ค่าฐานบวกเพิ่มตามขนาดฐานที่เลือก",
    ],
    [
      "• ช่วงปลีก 1-10 ชิ้น: ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว · ตั้งแต่ 7 ซม. ขึ้นไป คิดเพิ่ม ซม. ละ 5 บาท (ระบบคิดให้แล้ว)",
      "• ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 … 20 ซม. 80 บาท/ชิ้น · ระบบคิดให้แล้ว)",
    ],
  ],
  "new-mt1k6h3q-6601": [
    [
      "• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐาน 1-10 ชิ้น ฐานไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไปเพิ่ม ซม.ละ 5 บาท · ตั้งแต่ 11 ชิ้น คิดตามตาราง (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น)",
      "• ราคาต่อชิ้นรวมค่าจุกใสแล้ว (ปกติชุดละ 10 บาท) · ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน (3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น)",
    ],
    [
      "• ขนาดฐาน 2-20 ซม. — ช่วงปลีก 1-10 ชิ้น ฐานไม่เกิน 6 ซม. ฟรี · 7 ซม.ขึ้นไปเพิ่ม ซม.ละ 5 บาท (7 ซม. +5 · 8 ซม. +10 · ไปจนถึง 20 ซม. +70)",
      "• ขนาดฐาน 2-20 ซม. — ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ไม่มีช่วงไหนฟรี",
    ],
    [
      "• ตั้งแต่ 11 ชิ้นขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น",
      "• คิดตามตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 20 ซม. 80 บาท/ชิ้น",
    ],
  ],
  "standee-clip": [
    [
      "• ราคาต่อชิ้นรวมครบแล้ว: ตัวสแตนดี้ + ฐาน + คลิปหนีบ (ค่าคลิปปกติ 10 บาท/ชิ้น)",
      "• ราคาต่อชิ้นในตารางรวม: ตัวสแตนดี้ + คลิปหนีบ (ค่าคลิปปกติ 10 บาท/ชิ้น) — ค่าฐานบวกเพิ่มตามขนาดฐานที่เลือก",
    ],
    [
      "• ช่วง 1-10 ชิ้น ราคาในตารางรวมฐานถึง 6 ซม. มาแล้ว — ฐาน 7 ซม. ขึ้นไป เพิ่ม ซม. ละ 5 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน) · สกรีนลายฐานเพิ่ม 10 บาท/ชิ้น (ระบบคิดให้ในตารางแล้ว)",
      "• ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง (ระบบบวกให้เมื่อเลือกขนาดฐาน) · สกรีนลายฐานเพิ่มอีก 10 บาท/ชิ้น",
    ],
    [
      "• ตั้งแต่ 11 ชิ้นขึ้นไป คิดค่าฐานตามขนาด — ไม่สกรีนฐาน 10-40 บาท · สกรีนลายฐาน 20-50 บาท (ระบบบวกให้เมื่อเลือกขนาดฐาน)",
      "• ตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. 10 · 6-7 ซม. 15 · 8 ซม. 20 · 9 ซม. 25 · 10 ซม. 30 · 11 ซม. 35 · 12 ซม. 40 บาท/ชิ้น (สกรีนลายฐานบวกอีก 10)",
    ],
  ],
  "standee-frame-card": [
    [
      "• ค่าฐาน: ปลีก 1-10 ชิ้น คิด ซม.ละ 5 บาท (7 ซม. +5 ถึง 20 ซม. +70) · 11 ชิ้นขึ้นไป คิดตามตารางร้าน 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น",
      "• ค่าฐาน: คิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น",
    ],
    [
      "• ช่วง 1-10 ชิ้น ราคาในตารางรวมค่าฐานมาแล้ว (เลือกขนาดฐาน/สกรีนฐานได้โดยไม่บวกเพิ่ม)",
      "• ค่าฐานบวกเพิ่มจากราคาในตาราง — คิดเท่ากันทั้งราคาปลีกและราคาส่ง",
    ],
    [
      "• ตั้งแต่ 11 ชิ้นขึ้นไป คิดค่าฐานตามขนาด — ไม่สกรีนฐาน 15-40 บาท · สกรีนลายฐาน 25-50 บาท (ระบบรวมให้ในตารางแล้ว)",
      "• ตารางค่าฐานสแตนดี้ของร้าน: 7 ซม. 15 บาท ถึง 20 ซม. 80 บาท/ชิ้น · สกรีนลายฐานบวกอีก 10 บาท/ชิ้น (ระบบบวกให้เมื่อเลือกขนาดฐาน)",
    ],
  ],
  "acrylic-prakob": [
    [
      "• สแตนดี้เลือกฐานได้ 2 แบบ (ฐานไม่สกรีน / ฐานสกรีนลาย) — ราคารวมฐานให้แล้ว",
      "• สแตนดี้เลือกฐานได้ 2 แบบ (ฐานไม่สกรีน / ฐานสกรีนลาย) — ค่าฐานบวกเพิ่มตามขนาดฐาน คิดเท่ากันทั้งปลีกและส่ง",
    ],
  ],
  "new-mt1dwpc1-6773": [
    [
      "• ค่าฐานคิดครั้งเดียวต่อชุด — ช่วงปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว",
      "• ค่าฐานคิดครั้งเดียวต่อชุด — คิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน",
    ],
    [
      "• 1 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 140 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 5 = 245 บาท/ชุด",
      "• 1 ชุด (2 ชิ้นใน 1 ฐาน) — ชิ้นหน้า 6 ซม. 140 + ชิ้นหลัง 10 ซม. 100 + ฐาน 7 ซม. 15 = 255 บาท/ชุด",
    ],
    ["ฐานรวมอยู่ในราคาแล้ว — คิดครั้งเดียวต่อชุด::", "ค่าฐานคิดครั้งเดียวต่อชุด — บวกเพิ่มจากราคาในตาราง::"],
    [
      "• ขนาดฐาน 2-20 ซม. — ช่วงราคาปลีก 1-10 ชุด ฐานไม่เกิน 6 ซม. รวมในราคาแล้ว",
      "• ขนาดฐาน 2-20 ซม. — ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ไม่มีช่วงไหนฟรี",
    ],
    [
      "• ตั้งแต่ 11 ชุดขึ้นไป ค่าฐานคิดตามตารางของร้าน: 3-5 ซม. +10 · 8 ซม. +20 · 20 ซม. +80 บาท/ชุด",
      "• ตารางค่าฐานสแตนดี้ของร้าน: 3-5 ซม. +10 · 8 ซม. +20 · 20 ซม. +80 บาท/ชุด",
    ],
  ],
};
/** ร่องรอยกติกาเก่าที่อาจหลงเหลือ — ไว้เตือนหลังแก้ */
const STALE = /(1-10|1–10)\s*(ชิ้น|อัน|ชุด)|ตั้งแต่ 11|11 (ชิ้น|อัน|ชุด)ขึ้นไป.{0,20}ค่าฐาน|รวมฐาน|รวมค่าฐาน/;

/* ── วางแผน ────────────────────────────────────────────────────────────── */
const plan: { row: any; data: any; groups: string[] }[] = [];
for (const row of rows) {
  const data = JSON.parse(JSON.stringify(row.data));
  const touched: string[] = [];
  for (const g of data.options ?? []) {
    if (!isBaseSizeGroup(g)) continue;
    const table = feeTableText(g.choices ?? []);
    console.log(`\n📦 ${row.id} | ${row.name} → กลุ่ม "${g.label}"`);
    console.log(`   ตารางค่าฐาน: ${table}`);
    console.log(`   ถอด extraFromQty=${g.extraFromQty ?? "-"} · extraBelow ${(g.choices ?? []).filter((c: any) => c.extraBelow).map((c: any) => `${c.name}:${c.extraBelow}`).join(", ") || "-"}`);
    delete g.extraFromQty;
    for (const c of g.choices ?? []) {
      delete c.extraBelow;
      const before = c.desc;
      c.desc = rewriteDesc(c.desc, c.extra ?? 0);
      if (before !== c.desc) console.log(`   • ${c.name}: ${c.desc}`);
    }
    g.note = `ค่าฐานคิดเท่ากันทั้งราคาปลีกและราคาส่ง ตามตารางค่าฐานสแตนดี้ของร้าน (${table})`;
    touched.push(g.label);

  }
  if (touched.length) {
    // ข้อความในแท็บ — แก้ทีละบรรทัดตามที่เขียนไว้ใน TEXT_FIXES
    for (const [oldLine, newLine] of TEXT_FIXES[row.id] ?? []) {
      let hit = 0;
      for (const t of data.tabs ?? []) {
        if (typeof t.text !== "string" || !t.text.includes(oldLine)) continue;
        t.text = t.text.split(oldLine).join(newLine);
        hit++;
        console.log(`   📄 แท็บ "${t.title}" → ${newLine}`);
      }
      if (!hit) console.log(`   ⚠️  หาบรรทัดเดิมไม่เจอ (อาจแก้ไปแล้ว): ${oldLine.slice(0, 60)}…`);
    }
    // ร่องรอยกติกาเก่าที่ยังเหลือ — ไว้ตามเก็บเอง
    for (const t of data.tabs ?? [])
      for (const l of String(t.text ?? "").split("\n"))
        if (/ฐาน/.test(l) && STALE.test(l)) console.log(`   🔎 ยังมีข้อความเก่าค้าง แท็บ "${t.title}": ${l.trim()}`);
  }
  if (touched.length) plan.push({ row, data, groups: touched });
  else console.log(`⏭️  ${row.id} | ${row.name} — ค่าฐานเป็นราคาเดียวอยู่แล้ว`);
}
if (!plan.length) { console.log("\n✅ ไม่มีอะไรต้องแก้"); process.exit(0); }

/* ── ตรวจราคาก่อน/หลัง ─────────────────────────────────────────────────── */
console.log("\n🧮 ราคาต่อชิ้น ก่อน → หลัง (แบบสแตนดี้ · ฐานแบบใส)");
for (const { row, data } of plan) {
  const before = { id: row.id, name: row.name, price: row.data.price ?? 0, ...row.data } as unknown as Product;
  const after = { id: row.id, name: row.name, price: row.data.price ?? 0, ...data } as unknown as Product;
  const grp = (data.options ?? []).find(isBaseSizeGroupAfter);
  const baseGrp = (row.data.options ?? []).find(isBaseSizeGroup);
  if (!baseGrp) continue;
  // เลือกค่าเริ่มต้นของทุกกลุ่มที่บังคับเลือก แล้วสลับเฉพาะ "แบบ = สแตนดี้" กับขนาดฐาน
  const base: Record<string, string> = {};
  for (const g of row.data.options ?? []) {
    const first = (g.choices ?? [])[0];
    if (first) base[g.label] = first.name;
  }
  const formGroup = (row.data.options ?? []).find((g: any) => (g.choices ?? []).some((c: any) => /สแตนดี้/.test(c.name)));
  if (formGroup) base[formGroup.label] = (formGroup.choices ?? []).find((c: any) => /สแตนดี้/.test(c.name)).name;
  for (const c of baseGrp.choices ?? []) {
    const sel = { ...base, [baseGrp.label]: c.name };
    const line = [1, 2, 10, 11, 30].map((q) => {
      const b = unitPriceFor(before, sel, q);
      const a = unitPriceFor(after, sel, q);
      return `${q}:${b === a ? `฿${a}` : `฿${b}→฿${a}`}`;
    });
    console.log(`   ${row.id} ${String(c.name).padEnd(8)} ${line.join("  ")}`);
  }
}
function isBaseSizeGroupAfter(g: any) { return /ขนาดฐาน/.test(String(g?.label ?? "")); }

if (!WRITE) { console.log("\n👀 dry-run — เติม --write เพื่อเขียนจริง"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync("backups", { recursive: true });
const backupPath = `backups/standee-base-fee-flat-before-${stamp}.json`;
writeFileSync(backupPath, JSON.stringify(plan.map(({ row }) => ({ id: row.id, name: row.name, options: row.data.options, tabs: row.data.tabs })), null, 1));
console.log(`\n💾 สำรองค่าเดิมไว้ที่ ${backupPath}`);

for (const { row, data, groups } of plan) {
  data.savedAt = new Date().toISOString();
  const { error } = await sb.from("products").update({ data }).eq("id", row.id);
  if (error) throw new Error(`${row.id}: เขียนไม่ผ่าน — ${error.message}`);
  const { data: back } = await sb.from("products").select("data").eq("id", row.id);
  const still = (back?.[0]?.data?.options ?? []).filter(isBaseSizeGroup);
  if (still.length) throw new Error(`${row.id}: เขียนแล้วแต่อ่านกลับยังเป็น 2 ขั้น`);
  console.log(`✅ ${row.id} — เขียนแล้ว (${groups.join(", ")}) · อ่านกลับยืนยันแล้ว`);
}
