#!/usr/bin/env node
/**
 * "ผ้าเชียร์" (id: 2-2-2) — ดึงราคาใหม่จาก Google Sheet ของร้าน แล้วเขียนทับ 3 เรทราคา
 *
 *   node scripts/cheer-fabric-prices.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/cheer-fabric-prices.mjs --write
 *
 * ที่มาของราคา (ชีท "ผ้าเชียร์"):
 *   https://docs.google.com/spreadsheets/d/1d6mGiL8ElJR4l4RVBMZcGVkhYVagSsI47A7Qk69NwJQ/edit?gid=1438873729
 *   สคริปต์อ่าน CSV export สดทุกครั้ง — ราคาบนชีทเปลี่ยนเมื่อไหร่รันซ้ำได้เลย
 *
 * ชีทมี 4 ตาราง ยึด "หัวข้อ" ไม่ใช่ลำดับ:
 *   สกรีน 1 ด้าน / ผ้า 1 ชิ้น / โพ้งขอบ            → เรท r1
 *   สกรีน 2 ด้าน / ผ้า 2 ชิ้น / เย็บเชื่อม          → เรท r3-standard
 *   ผ้าเชียร์ พรีเมี่ยม + อัดกาว / สกรีน 2 ด้าน ...  → เรท r2-premium
 *   add option flex                                → ตาราง +฿ ของกลุ่ม FLEX (ทั้งด้านหน้าและด้านที่ 2)
 *
 * 💰 FLEX คิดตาม "ขนาด × จำนวนที่สั่ง" — เขียนลง ProductOptionChoice.extraTiers ทั้งคอลัมน์
 *    (1-10 ผืน ฿250 · 11-29 ฿245 · 30-99 ฿240 · 100-499 ฿235 · 500+ ฿230 สำหรับ 15x55)
 *    extra ยังใส่ไว้เป็นราคาขั้นแรก เพราะที่ที่ยังไม่รู้จำนวน (ช่วงราคาสินค้า/หน้ารายการ) อ่านค่านั้น
 *    ทั้ง 2 กลุ่ม FLEX (ด้านหน้า / ด้านที่ 2 ของงานสกรีน 2 ด้าน) ใช้ตารางเดียวกัน
 *
 * 🎨 คละลาย: 1-10 ผืน คละอิสระ · 11 ผืนขึ้นไป ลายละ 5 ผืน เกินโควตาคิดลายละ ฿5
 *    (freeMixBelowQty / minPerDesign / extraDesignFee — ตั้งเท่ากันทั้ง 3 เรท)
 *
 * ⚠️ ขนาดคอลัมน์ชีทเป็น "กว้าง*ยาว" (เช่น 20*60) → key ในระบบคือ "20x60cm"
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "2-2-2";
const EXPECT_NAMES = ["ผ้าเชียร์"];
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1d6mGiL8ElJR4l4RVBMZcGVkhYVagSsI47A7Qk69NwJQ/export?format=csv&gid=1438873729";

/** หัวตารางบนชีท → id เรทในระบบ (จับแบบ includes กันชีทเติมคำท้ายหัวข้อ) */
const SECTION_TO_RATE = [
  { match: "สกรีน 1 ด้าน", rateId: "r1" },
  { match: "เย็บเชื่อม", rateId: "r3-standard" },
  { match: "พรีเมี่ยม", rateId: "r2-premium" },
];
const FLEX_SECTION = "add option flex";
/** กติกาคละลายของทุกเรท — ผู้ใช้สั่ง 27 ส.ค. 69 (ไม่ได้อยู่บนชีท ตั้งไว้ในสคริปต์) */
const MIX = { freeMixBelowQty: 11, minPerDesign: 5, extraDesignFee: 5 };

/** ลำดับขนาดที่ต้องมีครบทุกตาราง (ตามคอลัมน์ชีท) */
const SIZES = ["20*60", "20*80", "15*100", "25*100", "25*150"];
const sizeKey = (s) => s.replace("*", "x") + "cm";

// ---------- อ่านชีท ----------
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** ตัวเลขในชีทอาจมี comma ("10,000") — แต่ช่องราคาไม่มี จึง parse ตรง ๆ แล้วเช็ค NaN */
const toNum = (s) => {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

async function fetchSheet() {
  const res = await fetch(SHEET_CSV, { redirect: "follow" });
  if (!res.ok) throw new Error(`โหลดชีทไม่ได้: HTTP ${res.status}`);
  const rows = (await res.text()).split(/\r?\n/).map(parseCsvLine);

  // แบ่งเป็น section: แถวหัวข้อ = คอลัมน์แรกมีข้อความ + แถวถัดไปขึ้นต้น "จำนวน"
  const sections = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const head = (rows[i][0] || "").trim();
    if (!head || head === "จำนวน" || /^[\d,]/.test(head)) continue;
    if ((rows[i + 1][0] || "").trim() !== "จำนวน") continue;
    // รับเฉพาะหัวคอลัมน์รูปแบบ "กว้าง*ยาว" — ข้างตารางมีคอลัมน์โน้ต (เช่น "flex มี 4 ตัว") ปนอยู่
    const sizes = rows[i + 1].slice(1).map((s) => s.trim()).filter((s) => /^\d+\*\d+$/.test(s));
    const tiers = [];
    for (let r = i + 2; r < rows.length; r++) {
      const label = (rows[r][0] || "").trim();
      if (!label) break;
      const prices = rows[r].slice(1, 1 + sizes.length).map(toNum);
      tiers.push({ label, prices });
    }
    sections.push({ head, sizes, tiers });
  }
  return sections;
}

/** "1-10 ผืน" → upTo 10 · "10,000 ผืนขึ้นไป" / "500 ผืน" (ช่องท้าย) → upTo null */
function tierUpTo(label, isLast) {
  if (isLast || /ขึ้นไป/.test(label)) return null;
  const m = label.replace(/,/g, "").match(/-\s*(\d+)/);
  if (!m) throw new Error(`อ่านช่วงจำนวนไม่ออก: "${label}"`);
  return Number(m[1]);
}

/** ตารางชีท → pricing object แบบเดียวกับที่หน้าเว็บใช้ (cells ต่อขนาด · tiers ร่วมกัน) */
function toPricing(sec) {
  const gotSizes = sec.sizes;
  if (JSON.stringify(gotSizes) !== JSON.stringify(SIZES))
    throw new Error(`คอลัมน์ขนาดของ "${sec.head}" ไม่ตรงที่คาด: ${gotSizes.join(", ")}`);
  const cells = {};
  for (const s of SIZES) cells[sizeKey(s)] = [];
  const tiers = sec.tiers.map((t, i) => {
    t.prices.forEach((p, col) => {
      if (p == null) throw new Error(`ราคาว่าง/ไม่ใช่ตัวเลขที่ "${sec.head}" แถว "${t.label}" คอลัมน์ ${SIZES[col]}`);
      cells[sizeKey(SIZES[col])].push(p);
    });
    return { upTo: tierUpTo(t.label, i === sec.tiers.length - 1), label: t.label };
  });
  return { unit: "ผืน", cells, tiers, driverLabels: ["ขนาด"] };
}

// ---------- main ----------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const sections = await fetchSheet();
console.log("ตารางบนชีท:", sections.map((s) => `"${s.head}" (${s.tiers.length} ขั้น)`).join(" · "));

const { data: row, error } = await sb.from("products").select("*").eq("id", ID).single();
if (error) throw error;
if (!EXPECT_NAMES.includes(row.name)) throw new Error(`แถว ${ID} ชื่อ "${row.name}" ไม่ใช่ผ้าเชียร์ — หยุดกันเขียนทับผิดตัว`);
const data = row.data;

// เรทราคา 3 ตาราง
for (const { match, rateId } of SECTION_TO_RATE) {
  const sec = sections.find((s) => s.head.includes(match) && !s.head.includes("flex"));
  if (!sec) throw new Error(`หาตาราง "${match}" บนชีทไม่เจอ`);
  const rate = data.priceRates.find((r) => r.id === rateId);
  if (!rate) throw new Error(`ไม่พบเรท ${rateId} ในสินค้า`);
  const pricing = toPricing(sec);
  const changed = JSON.stringify(rate.pricing) !== JSON.stringify(pricing);
  console.log(`\n${rateId} (${rate.label}) ← "${sec.head}" ${changed ? "— ราคาเปลี่ยน" : "— เท่าเดิม"}`);
  for (const s of SIZES) console.log(`  ${sizeKey(s)}: ${pricing.cells[sizeKey(s)].join(", ")}`);
  rate.pricing = pricing;
}

// pricing หลักของสินค้า = กระจกของเรทแรก (r1) แบบเดียวกับของเดิม
data.pricing = data.priceRates.find((r) => r.id === "r1").pricing;

// ตัวเลือก "ขนาด" ต้องมีครบทุกคอลัมน์ชีท (เพิ่ม 15x100cm ถ้ายังไม่มี) — เรียงตามชีท
const sizeOpt = data.options.find((o) => o.label === "ขนาด");
sizeOpt.choices = SIZES.map((s) => sizeOpt.choices.find((c) => c.name === sizeKey(s)) || { name: sizeKey(s) });
console.log("\nตัวเลือกขนาด:", sizeOpt.choices.map((c) => c.name).join(" / "));

/*
  🧹 ค่าเงื่อนไข "แสดงเมื่อ" ที่มีช่องว่างหลงท้าย — เทียบชื่อตัวเลือกไม่ติด กลุ่มนั้นเลยไม่เคยโผล่
  (กลุ่ม "FLEX ... ด้านที่ 2" ตั้งไว้ว่าโชว์เมื่อ FLEX ลงด้านไหน = "ทั้ง 2 ด้าน " ซึ่งไม่มีตัวเลือกนี้จริง
   → งานสกรีน 2 ด้านไม่เคยเห็นช่องเลือก FLEX ด้านที่ 2) — ตัดช่องว่างหัวท้ายให้ทุกเงื่อนไข
*/
const trimmed = [];
for (const o of data.options ?? []) {
  for (const cond of [o.showWhen, o.showWhenAlso, ...(o.showWhenAll ?? [])]) {
    if (!cond?.choices) continue;
    const fixed = cond.choices.map((c) => String(c).trim());
    if (JSON.stringify(fixed) !== JSON.stringify(cond.choices)) {
      trimmed.push(`${o.label} ← ${cond.label}: ${JSON.stringify(cond.choices)} → ${JSON.stringify(fixed)}`);
      cond.choices = fixed;
    }
  }
}
console.log(trimmed.length ? `\n🧹 เงื่อนไขที่มีช่องว่างหลงท้าย (แก้ให้แล้ว):\n  ${trimmed.join("\n  ")}` : "\n🧹 เงื่อนไข \"แสดงเมื่อ\" สะอาดดี");

// FLEX: +฿ ต่อผืนคิดตามขนาด × จำนวนที่สั่ง — เขียน extraTiers ทั้งคอลัมน์ให้ทุกกลุ่ม FLEX
const flexSec = sections.find((s) => s.head.trim().toLowerCase() === FLEX_SECTION);
if (flexSec) {
  // ขั้นจำนวนของ FLEX เป็นคนละชุดกับตารางราคาผ้า (ชีทแยกตาราง) — อ่านจากแถวของตาราง flex เอง
  const steps = flexSec.tiers.map((t, i) => ({ upTo: tierUpTo(t.label, i === flexSec.tiers.length - 1), label: t.label }));
  // กลุ่ม FLEX มี 2 กลุ่ม: ด้านหน้า และ "ด้านที่ 2" ของงานสกรีน 2 ด้าน — ราคาเท่ากันทั้งคู่
  const flexOpts = data.options.filter((o) => o.label.startsWith("FLEX (") && !o.label.includes("เกินขนาด"));
  if (!flexOpts.length) throw new Error("ไม่พบกลุ่ม FLEX ในสินค้า — โครงสินค้าเปลี่ยน ตรวจก่อน");
  console.log(`\nFLEX (${flexOpts.length} กลุ่ม: ${flexOpts.map((o) => o.label).join(" · ")})`);
  console.log("  ช่วงจำนวน:", steps.map((s) => s.label).join(" | "));
  for (const flexOpt of flexOpts) {
    flexSec.sizes.forEach((sz, col) => {
      const choice = flexOpt.choices.find((c) => c.name.includes(sz.replace("*", "x")));
      if (!choice) {
        console.log(`⚠️ FLEX ขนาด ${sz} ไม่มีในกลุ่ม "${flexOpt.label}"`);
        return;
      }
      const extraTiers = steps.map((s, r) => {
        const price = flexSec.tiers[r].prices[col];
        if (price == null) throw new Error(`ราคา FLEX ว่างที่ ${sz} แถว "${s.label}"`);
        return s.upTo == null ? { extra: price } : { upTo: s.upTo, extra: price };
      });
      const before = JSON.stringify({ e: choice.extra, t: choice.extraTiers });
      choice.extra = extraTiers[0].extra; // ราคาขั้นแรก — ที่ที่ยังไม่รู้จำนวนอ่านค่านี้
      choice.extraTiers = extraTiers;
      const same = before === JSON.stringify({ e: choice.extra, t: choice.extraTiers });
      console.log(
        `  ${same ? "=" : "↻"} ${flexOpt.label} · ${choice.name}: ` +
          extraTiers.map((t) => `${t.upTo ?? "∞"}→฿${t.extra}`).join(" ")
      );
    });
  }
}

// 🎨 คละลาย — 1-10 ผืนอิสระ · 11+ ลายละ 5 ผืน เกินโควตาลายละ ฿5 (ทุกเรท)
console.log("\nคละลาย:");
for (const rate of data.priceRates) {
  const before = { min: rate.minPerDesign, free: rate.freeMixBelowQty, fee: rate.extraDesignFee };
  rate.freeMixBelowQty = MIX.freeMixBelowQty;
  rate.minPerDesign = MIX.minPerDesign;
  rate.extraDesignFee = MIX.extraDesignFee;
  const same = before.min === MIX.minPerDesign && before.free === MIX.freeMixBelowQty && before.fee === MIX.extraDesignFee;
  console.log(
    `  ${same ? "=" : "↻"} ${rate.id}: ต่ำกว่า ${MIX.freeMixBelowQty} ผืนคละอิสระ · ตั้งแต่นั้นลายละ ${MIX.minPerDesign} ผืน · เกินโควตาลายละ ฿${MIX.extraDesignFee}`
  );
}

// ราคากระจก: price = ราคาขั้นแรกถูกสุดของ r1 · priceMin/priceMax = ต่ำสุด/สูงสุดทุกเรท
const allPrices = data.priceRates.flatMap((r) => Object.values(r.pricing.cells).flat());
const tier1Min = Math.min(...Object.values(data.pricing.cells).map((c) => c[0]));
data.price = tier1Min;
data.priceMin = Math.min(...allPrices);
data.priceMax = Math.max(...allPrices);
console.log(`\nราคากระจก: price ${row.price} → ${data.price} · priceMin → ${data.priceMin} · priceMax → ${data.priceMax}`);

// highlight ที่พูดถึงจำนวนขนาด — อัปให้ตรง 5 ขนาด
data.highlights = (data.highlights || []).map((h) =>
  /ขนาด: .*ซม\./.test(h)
    ? `${SIZES.length} ขนาด: ${SIZES.map((s) => s.replace("*", "x")).join(" / ")} ซม. · ราคาถูกลงตามจำนวน`
    : h,
);
console.log("highlights:", JSON.stringify(data.highlights, null, 1));

if (!WRITE) {
  console.log("\n(dry-run — ยังไม่เขียน · เติม --write เพื่อบันทึกจริง)");
  process.exit(0);
}

data.savedAt = new Date().toISOString();
const { error: e2 } = await sb.from("products")
  .update({ data, price: data.price, name: row.name, category: row.category })
  .eq("id", ID);
if (e2) throw e2;
console.log("\n✅ เขียนแล้ว — ราคาใหม่ขึ้นแถว", ID);
