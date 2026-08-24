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
 *   add option flex                                → เช็คว่า extra ของตัวเลือก FLEX ยังตรงขั้น 1-10 อยู่ไหม
 *
 * ⚠️ ตัวเลือก FLEX ในระบบคิดเป็น extra คงที่ต่อผืน (รองรับแบบเดียว) — ใช้ราคาขั้น 1-10 ของชีท
 *    ชีทมีราคาลดตามจำนวนด้วย (ต่างสุด ฿20 ที่ 500+) แต่ไม่ได้ model ไว้ ถ้าชีทขั้นแรกเปลี่ยน สคริปต์จะเตือน
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

// FLEX: ระบบคิด extra คงที่ = ราคาขั้น 1-10 ของชีท — เช็คว่ายังตรง
const flexSec = sections.find((s) => s.head.trim().toLowerCase() === FLEX_SECTION);
if (flexSec) {
  const flexOpt = data.options.find((o) => o.label.startsWith("FLEX ("));
  const tier1 = flexSec.tiers[0].prices;
  flexSec.sizes.forEach((sz, i) => {
    const want = tier1[i];
    const choice = flexOpt.choices.find((c) => c.name.includes(sz.replace("*", "x")));
    if (!choice) console.log(`⚠️ FLEX ขนาด ${sz} ไม่มีในตัวเลือก`);
    else if (choice.extra !== want) {
      console.log(`FLEX ${choice.name}: ฿${choice.extra} → ฿${want}`);
      choice.extra = want;
    }
  });
  console.log("FLEX extras:", flexOpt.choices.filter((c) => c.extra).map((c) => `${c.name}=฿${c.extra}`).join(" · "));
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
