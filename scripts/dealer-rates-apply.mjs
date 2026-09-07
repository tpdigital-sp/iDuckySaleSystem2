/**
 * 🤝 สร้าง "เรทตัวแทนจำหน่าย" (dealerOnly) ให้สินค้าทั้งร้าน — ตามสูตรเจ้าของร้าน 7 ก.ย. 69
 *
 *   ทั่วไป:   ช่วงจำนวน 1-10 ชิ้น = ราคาปกติของช่วงนั้น ลด 10% · 11 ชิ้นขึ้นไป = ลด 5%
 *             (ช่วงราคาเดิมที่คร่อมเส้น 10/11 ถูกผ่าเป็น 2 ช่วงในตารางตัวแทน คิดคนละ %)
 *   เคสมือถือ: ช่วง 1-10 ชิ้น = ราคาปกติ − ส่วนต่างคงที่ (CASE_DIFF) · 11 ชิ้นขึ้นไป = ลด 5% เหมือนทั้งร้าน
 *             (เจ้าของเคาะ 7 ก.ย. 69 — ส่วนต่างเต็มใช้กับช่วงปลีก ช่วงส่งราคาปกติถูกอยู่แล้ว ลบเต็มจะติดลบ)
 *   ทุกสินค้า: ราคาตัวแทนต้อง "ไม่แพงขึ้นตอนสั่งเยอะ" — ช่วงถัดไปแพงกว่าช่วงก่อน = ใช้ราคาช่วงก่อนแทน
 *
 * วิธีทำ: สินค้าแต่ละตัว สร้าง "เรทคู่แฝดตัวแทน" ของทุกเรท public ที่มีอยู่ (คงเงื่อนไข
 * ขั้นต่ำ/กติกาคละเดิม เพื่อไม่พังกติกาการผลิต) — ตัวแทนเห็นเฉพาะเรทแฝดพวกนี้
 * สินค้าที่มีแต่ pricing เดี่ยว: สร้าง priceRates = [เรทปกติ(กระจกของ pricing), เรทตัวแทน]
 *
 * รัน:  node scripts/dealer-rates-apply.mjs           → dry-run (พิมพ์สรุป ไม่เขียนอะไร)
 *       node scripts/dealer-rates-apply.mjs --apply   → เขียนจริง + อ่านกลับเทียบ
 *       … --only=id1,id2                              → เฉพาะสินค้าที่ระบุ (แก้ราคาปกติตัวเดียวก็รันเฉพาะตัวนั้น)
 * รันซ้ำได้: ลบเรท dealerOnly เดิมทิ้งแล้วสร้างใหม่จากราคาปกติปัจจุบันทุกครั้ง
 * (กติกาสคริปต์เขียน DB: อ่านกลับเทียบค่า + savedAt เป็น ISO string — ดูโน้ต iducky-script-write-product)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
/** เจาะจงบางสินค้า: --only=id1,id2 (เช่น แก้ราคาปกติไปตัวเดียว ไม่ต้องเขียนทับทั้งร้าน) */
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE);

/** เคสมือถือ: ราคาตัวแทน = ราคาปกติ − ส่วนต่างคงที่ (บาท/ชิ้น) ทุกช่วงจำนวน ทุกคอลัมน์ */
const CASE_DIFF = {
  "case-premium-clear": 100, // พรีเมี่ยมใส
  "case-premium-edge": 100, // ขอบขาว-ขอบดำ
  "case-magsafe": 100,
  "case-frame-card": 100, // Frame Phone Case (รวมคอลัมน์ Magsafe)
  "case-glass": 150, // กระจก
  "case-mirror": 90, // กระจกเงา
  "case-card": 50, // เคสการ์ด
};

const RETAIL_PCT = 0.9; // 1-10 ชิ้น ลด 10%
const WHOLE_PCT = 0.95; // 11 ชิ้นขึ้นไป ลด 5%
const BOUNDARY = 10;

/** ปัดราคา: ต้นทางจำนวนเต็ม → ปัดเป็นบาทเต็ม · มีสตางค์ → เก็บ 2 ตำแหน่ง */
const money = (v, src) => (Number.isInteger(src) ? Math.round(v) : Math.round(v * 100) / 100);

/**
 * ผ่าช่วงจำนวนที่เส้น 10/11 — คืน [{upTo, srcIdx, pct, label}]
 * srcIdx = index ช่วงเดิมที่เอาราคามาใช้ (ช่วงที่ครอบจุดเริ่มของช่วงใหม่)
 */
function splitTiers(tiers) {
  const out = [];
  let start = 1;
  tiers.forEach((t, i) => {
    const end = t.upTo ?? null;
    const seg = (s, e) => {
      const pct = s <= BOUNDARY ? RETAIL_PCT : WHOLE_PCT;
      out.push({ upTo: e, srcIdx: i, pct, label: e == null ? `${s} ขึ้นไป` : `${s}-${e}` });
    };
    if (start <= BOUNDARY && (end == null || end > BOUNDARY)) {
      seg(start, BOUNDARY);
      seg(BOUNDARY + 1, end);
    } else {
      seg(start, end);
    }
    start = (end ?? Infinity) + 1;
  });
  return out;
}

/** สร้างเรทแฝดตัวแทนจากเรท public 1 เรท */
function dealerTwin(rate, { fixedDiff, single }) {
  const m = rate.pricing;
  const warn = [];
  const plan = splitTiers(m.tiers);
  const tiers = plan.map((p) => ({ upTo: p.upTo, label: p.label }));
  const cells = Object.fromEntries(
    Object.entries(m.cells).map(([k, arr]) => [
      k,
      plan.map((p) => {
        const v = arr[p.srcIdx];
        if (!(v > 0)) return v;
        // ช่วงปลีก (≤10) ของเคสมือถือ = ลบส่วนต่างคงที่ · นอกนั้นคิด % ตามโซนของช่วง
        if (fixedDiff != null && p.pct === RETAIL_PCT) {
          const d = v - fixedDiff;
          if (d <= 0) warn.push(`${k || "(คอลัมน์เดียว)"}: ${v} − ${fixedDiff} = ${d}`);
          return money(Math.max(d, 5), v);
        }
        return money(v * p.pct, v);
      }),
    ])
  );
  // ราคาตัวแทนห้ามแพงขึ้นตอนสั่งเยอะ — ช่วงถัดไปแพงกว่าช่วงก่อน = ใช้ราคาช่วงก่อนแทน (ต่อคอลัมน์)
  for (const arr of Object.values(cells)) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] > 0 && arr[i - 1] > 0 && arr[i] > arr[i - 1]) arr[i] = arr[i - 1];
    }
  }
  return {
    twin: {
      id: `${rate.id}-dealer`,
      label: single ? "เรทตัวแทนจำหน่าย" : `${rate.label} (ตัวแทน)`,
      desc: "ราคาตัวแทนจำหน่าย",
      // คงเงื่อนไขการผลิตเดิมทั้งชุด — ขั้นต่ำ/กติกาคละของเรทต้นทางยังใช้กับตัวแทน
      ...(rate.minQty != null ? { minQty: rate.minQty } : {}),
      ...(rate.minQtyScope ? { minQtyScope: rate.minQtyScope } : {}),
      ...(rate.minPerDesign != null ? { minPerDesign: rate.minPerDesign } : {}),
      ...(rate.extraDesignFee != null ? { extraDesignFee: rate.extraDesignFee } : {}),
      ...(rate.underMinPieceFee != null ? { underMinPieceFee: rate.underMinPieceFee } : {}),
      ...(rate.freeMixBelowQty != null ? { freeMixBelowQty: rate.freeMixBelowQty } : {}),
      ...(rate.mixRule ? { mixRule: rate.mixRule } : {}),
      ...(rate.imageSrc ? { imageSrc: rate.imageSrc } : {}),
      dealerOnly: true,
      pricing: { ...m, tiers, cells },
    },
    warn,
  };
}

const { data } = await sb.from("products").select("id, category, data");
const rows = (data ?? [])
  .filter((r) => !String(r.category ?? "").startsWith("__"))
  .filter((r) => !ONLY.length || ONLY.includes(r.id));
if (ONLY.length && rows.length !== ONLY.length) throw new Error(`--only: หาสินค้าไม่ครบ (เจอ ${rows.map((r) => r.id).join(",")})`);

let done = 0;
const skipped = [];
const warnings = [];
const samples = [];

for (const row of rows) {
  const p = row.data ?? {};
  const fixedDiff = CASE_DIFF[row.id];

  // เรท public ปัจจุบัน (ตัดเรทตัวแทนเก่าทิ้ง — รันซ้ำ = สร้างใหม่จากราคาปกติล่าสุด)
  let publicRates = (p.priceRates ?? []).filter((r) => !r?.dealerOnly);
  if (!publicRates.length && p.pricing) {
    // สินค้าที่มีแต่ pricing เดี่ยว — สร้างเรทปกติเป็นกระจกของ pricing (ProductEditor เซฟทับด้วยค่าเดียวกันอยู่แล้ว)
    publicRates = [{ id: "r1", label: "เรทราคาปกติ", pricing: p.pricing }];
  }
  if (!publicRates.length) {
    skipped.push(`${row.id} (${p.name ?? ""}) — ไม่มีตารางราคา`);
    continue;
  }

  const twins = [];
  for (const r of publicRates) {
    const { twin, warn } = dealerTwin(r, { fixedDiff, single: publicRates.length === 1 });
    twins.push(twin);
    warn.forEach((w) => warnings.push(`${row.id} · ${r.label}: ${w}`));
  }

  const nextRates = [...publicRates, ...twins];
  if (samples.length < 6 && (fixedDiff != null || samples.length < 3)) {
    const src = publicRates[0].pricing;
    const tw = twins[0].pricing;
    const key = Object.keys(src.cells)[0];
    samples.push(
      `${row.id} (${p.name ?? ""})${fixedDiff != null ? ` [−฿${fixedDiff}]` : " [%]"}\n` +
        `   ปกติ:   ${src.tiers.map((t, i) => `${t.label || t.upTo || "∞"}=${src.cells[key][i]}`).join(" · ")}\n` +
        `   ตัวแทน: ${tw.tiers.map((t, i) => `${t.label || t.upTo || "∞"}=${tw.cells[key][i]}`).join(" · ")}`
    );
  }

  if (APPLY) {
    const nextData = { ...p, priceRates: nextRates, savedAt: new Date().toISOString() };
    const { data: upd, error } = await sb.from("products").update({ data: nextData }).eq("id", row.id).select("id");
    if (error || !upd?.length) {
      warnings.push(`❌ เขียนไม่สำเร็จ: ${row.id} — ${error?.message ?? "0 แถว"}`);
      continue;
    }
    // อ่านกลับเทียบรูปร่างค่าจริง (ไม่ใช่แค่เท่ากับตัวแปรฝั่งเรา)
    const { data: back } = await sb.from("products").select("data").eq("id", row.id).maybeSingle();
    const gotTwins = (back?.data?.priceRates ?? []).filter((r) => r?.dealerOnly === true);
    const wantKey = Object.keys(twins[0].pricing.cells)[0];
    const okShape =
      gotTwins.length === twins.length &&
      typeof gotTwins[0]?.pricing?.cells?.[wantKey]?.[0] === "number" &&
      gotTwins[0].pricing.cells[wantKey][0] === twins[0].pricing.cells[wantKey][0];
    if (!okShape) {
      warnings.push(`❌ อ่านกลับไม่ตรง: ${row.id} — ต้องรันซ้ำ`);
      continue;
    }
  }
  done++;
}

console.log(`\n${APPLY ? "✅ เขียนแล้ว" : "🔍 dry-run"} ${done}/${rows.length} สินค้า`);
if (skipped.length) console.log(`\nข้าม ${skipped.length} ตัว:\n  ${skipped.join("\n  ")}`);
if (warnings.length) console.log(`\n⚠️ เตือน ${warnings.length} จุด:\n  ${warnings.join("\n  ")}`);
console.log(`\nตัวอย่าง:\n${samples.join("\n")}`);
process.exit(warnings.some((w) => w.startsWith("❌")) ? 1 : 0);
