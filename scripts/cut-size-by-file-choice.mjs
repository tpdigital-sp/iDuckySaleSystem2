#!/usr/bin/env node
/**
 * เพิ่มตัวเลือก "📄 ขนาดตามไฟล์ (จำนวนที่ได้ กราฟฟิกแจ้งอีกทีตอนทำแบบ)" ต่อท้าย "📐 กำหนดขนาดเอง"
 * ในกลุ่มขนาดตัด (เมนูเลื่อน) ของสินค้าสติ๊กเกอร์/กระดาษที่ขายเป็นแผ่น — เจ้าของร้านสั่ง 11 ก.ย. 69
 *
 *   node scripts/cut-size-by-file-choice.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/cut-size-by-file-choice.mjs --write
 *
 * ลูกค้าไม่ต้องวัดขนาด: ส่งไฟล์ตามขนาดจริงในไฟล์ กราฟฟิกจัดวางบนแผ่นแล้วแจ้งจำนวนชิ้นที่ได้ตอนส่งแบบ
 * ตัวเลือกนี้ไม่มี piecesPerUnit และไม่เปิดช่องกรอกกว้าง×สูง → unitYieldOf คืน null (ไม่มีบรรทัด "ได้ N ชิ้น")
 * ข้อความ "กราฟฟิกแจ้ง…" อยู่ในชื่อตัวเลือกเอง จึงติดไปทุกจอ (ตะกร้า/ออเดอร์/ใบงาน) โดยไม่ต้องแก้โค้ดจอไหน
 *
 * ทำอะไรต่อกลุ่ม (เฉพาะกลุ่มที่มีตัวเลือก "📐 กำหนดขนาดเอง" และคู่ช่องกรอกที่มี sheetYield — คือขายเป็นแผ่น):
 *   1. เติม choice ต่อท้าย (selectedNote โชว์ใต้เมนูตอนถูกเลือก — ProductDetail รองรับ selectedNote ของ dropdown ตั้งแต่รอบนี้)
 *   2. กลุ่มที่เป็นแกนตารางราคา (กระดาษรองหลัง/เย็บบน: ขนาด = driver) → เพิ่ม cell ราคาเท่ากับ cell ของ "กำหนดขนาดเอง"
 *      ทั้ง pricing และ priceRates[].pricing ไม่งั้นราคาหาย/ปุ่มสั่งตัน
 *   3. ช่อง "จำนวนจุดไดคัท" ที่ผูกโควตากับกลุ่มนี้ (inputFee.rates[].when.label) → เพิ่ม rates ข้อสำหรับตัวเลือกนี้
 *      ให้โควตาเท่าชั้น A3 เต็มแผ่น (ฟรี 200 / มากสุด 500) เพราะระบบไม่รู้ขนาดชิ้น ถ้าไม่ใส่จะตกไปใช้ free กลาง 5/10
 *      → ลูกค้ากรอกจุดเกิน 10 ไม่ได้ทั้งที่ยังไม่รู้ขนาด (⚠️ นี่คือสมมติฐาน — เจ้าของร้านปรับได้ที่หลังบ้าน)
 * ไม่แตะ: กลุ่มขนาดของอะคริลิค/พวงกุญแจ (ราคาขึ้นกับขนาด ตามไฟล์ตีราคาไม่ได้) · กลุ่ม "ขนาดไดคัท" ช่องกรอก (ไดคัท 100%)
 * รันซ้ำได้ · อ่านกลับเทียบ + savedAt (ล้างแคชรูป)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const CUSTOM = "📐 กำหนดขนาดเอง (ระบุ ก.×ส.)";
export const BY_FILE = "📄 ขนาดตามไฟล์ (กราฟฟิกแจ้งจำนวนตอนทำแบบ)";
/** ชื่อเก่าที่เคยเขียนลง DB — เจอแล้วเปลี่ยนเป็นชื่อใหม่ทุกที่ (choice · cell ราคา · rates โควตาจุด) เจ้าของร้านขอกระชับ 11 ก.ย. 69 */
const OLD_NAMES = ["📄 ขนาดตามไฟล์ (จำนวนที่ได้ กราฟฟิกแจ้งอีกทีตอนทำแบบ)"];
const DESC =
  "ไม่ต้องวัดขนาด — ส่งไฟล์ลายตามขนาดจริงในไฟล์มาได้เลย กราฟฟิกจัดวางบนแผ่นแล้วแจ้งจำนวนชิ้นที่ได้ต่อแผ่นตอนส่งแบบให้ตรวจ (ราคาคิดต่อแผ่นตามเรทเดิม)";
/** โควตาจุดไดคัทของตัวเลือกนี้ = ชั้น A3 เต็มแผ่น (ตาราง 9 ก.ย. 69) */
const DOTS_QUOTA = { free: 200, max: 500 };

/** สินค้า → ชื่อที่คาด (กันเขียนผิดตัว) */
const TARGETS = {
  "paper-art-pet": "กระดาษอาร์ตมัน PET",
  "banner-artcard": "แบนเนอร์",
  "washi-sticker": "สติ๊กเกอร์วาชิ",
  "texture-paper": "กระดาษเนื้อพิเศษ",
  "sticker-uv": "สติ๊กเกอร์ UV",
  "sticker-solvent": "SolventPremium",
  "sticker-rainbow-film": "สติ๊กเกอร์ประกายรุ้ง",
  "sticker-pp": "สติ๊กเกอร์ดิจิตอล",
  "sticker-hologram": "สติ๊กเกอร์โฮโลแกรม",
  "sticker-gold-silver-rosegold": "Sticker Gold | Silver | RoseGold",
  "reflective-sticker": "สติ๊กเกอร์สะท้อนแสง",
  "paper-foil": "กระดาษเคลือบฟอยล์",
  "package-staple-top": "กระดาษเย็บบน",
  "package-backing": "กระดาษรองหลัง",
  neon: "สติ๊กเกอร์เรืองแสง",
};

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

/** กลุ่มเป้าหมาย = มี "กำหนดขนาดเอง" + มีช่องกรอกที่ showWhen ชี้มาที่กลุ่มนี้และตั้ง sheetYield (ขายเป็นแผ่น) */
function targetGroups(d) {
  const opts = d.options ?? [];
  // กระดาษเย็บบน: ช่องกรอกตั้ง showWhen.label ผิดชื่อกลุ่ม (บั๊กเก่า ยังไม่แก้) — เทียบแค่ว่ามีคู่ช่องกรอก sheetYield ที่เปิดด้วย CUSTOM
  const hasSheetInput = opts.some((o) => o.sheetYield && (o.showWhen?.choices ?? []).includes(CUSTOM));
  return opts.filter((g) => Array.isArray(g.choices) && g.choices.some((c) => c.name === CUSTOM) && hasSheetInput);
}

/** cell ราคาของกลุ่มที่เป็น driver: คีย์เป็นชื่อ choice ตรง ๆ (driver เดียว) หรือ "a│b" (หลาย driver) */
function addPriceCells(pricing, driverIdx, log) {
  if (!pricing?.cells) return;
  for (const key of Object.keys(pricing.cells)) {
    const parts = key.split("│");
    if (parts[driverIdx] !== CUSTOM) continue;
    const next = [...parts];
    next[driverIdx] = BY_FILE;
    const nk = next.join("│");
    if (nk in pricing.cells) continue;
    pricing.cells[nk] = JSON.parse(JSON.stringify(pricing.cells[key]));
    log.push(`cell "${nk}" = ${JSON.stringify(pricing.cells[nk])}`);
  }
}

/** สิ่งที่อยากให้เป็น — คืนรายการที่แก้ (ว่าง = ตรงแล้ว) */
/** เปลี่ยนชื่อเก่า → BY_FILE ทุกที่ที่ชื่อ choice ถูกใช้เป็นคีย์ */
function renameOld(d, g, log) {
  for (const old of OLD_NAMES) {
    const c = g.choices.find((x) => x.name === old);
    if (c) {
      c.name = BY_FILE;
      log.push(`${g.label}: เปลี่ยนชื่อ "${old}" → "${BY_FILE}"`);
    }
    const renameCells = (pricing) => {
      for (const key of Object.keys(pricing?.cells ?? {})) {
        if (!key.split("│").includes(old)) continue;
        const nk = key.split("│").map((k) => (k === old ? BY_FILE : k)).join("│");
        pricing.cells[nk] = pricing.cells[key];
        delete pricing.cells[key];
        log.push(`cell "${key}" → "${nk}"`);
      }
    };
    renameCells(d.pricing);
    for (const r of d.priceRates ?? []) renameCells(r.pricing);
    for (const o of d.options ?? []) {
      for (const r of o.inputFee?.rates ?? []) {
        if (r.when?.label !== g.label || !(r.when.choices ?? []).includes(old)) continue;
        r.when.choices = r.when.choices.map((x) => (x === old ? BY_FILE : x));
        log.push(`${o.label}: rates เปลี่ยนชื่อเป็นชื่อใหม่`);
      }
    }
    for (const r of d.rules ?? []) {
      if (r.limit?.label === g.label && Array.isArray(r.limit.allow) && r.limit.allow.includes(old)) {
        r.limit.allow = r.limit.allow.map((x) => (x === old ? BY_FILE : x));
        log.push(`rule limit ${g.label}: เปลี่ยนชื่อ`);
      }
    }
  }
}

function apply(d) {
  const log = [];
  const groups = targetGroups(d);
  if (!groups.length) die(`ไม่พบกลุ่มเป้าหมาย`);
  for (const g of groups) {
    renameOld(d, g, log);
    // 1. choice
    let c = g.choices.find((x) => x.name === BY_FILE);
    if (!c) {
      c = { name: BY_FILE, selectedNote: DESC };
      const i = g.choices.findIndex((x) => x.name === CUSTOM);
      g.choices.splice(i + 1, 0, c);
      log.push(`${g.label}: เพิ่ม choice`);
    } else if (c.selectedNote !== DESC) {
      c.selectedNote = DESC;
      log.push(`${g.label}: อัปเดต selectedNote`);
    }
    // 2. driver ตารางราคา
    const dl = d.pricing?.driverLabels ?? [];
    const idx = dl.indexOf(g.label);
    if (idx >= 0) {
      addPriceCells(d.pricing, idx, log);
      for (const r of d.priceRates ?? []) {
        const ri = (r.pricing?.driverLabels ?? dl).indexOf(g.label);
        if (ri >= 0) addPriceCells(r.pricing, ri, log);
      }
    }
    // 3. โควตาจุดไดคัทที่ผูกกับกลุ่มนี้
    for (const o of d.options ?? []) {
      const rates = o.inputFee?.rates;
      if (!Array.isArray(rates) || !rates.some((r) => r.when?.label === g.label)) continue;
      const hit = rates.find((r) => r.when?.label === g.label && (r.when.choices ?? []).includes(BY_FILE));
      if (hit) {
        if (hit.free !== DOTS_QUOTA.free || hit.max !== DOTS_QUOTA.max) {
          hit.free = DOTS_QUOTA.free;
          hit.max = DOTS_QUOTA.max;
          log.push(`${o.label}: แก้โควตา ${BY_FILE}`);
        }
      } else {
        rates.push({ ...DOTS_QUOTA, when: { label: g.label, choices: [BY_FILE] } });
        log.push(`${o.label}: เพิ่มโควตา ${DOTS_QUOTA.free}/${DOTS_QUOTA.max} สำหรับ ${BY_FILE}`);
      }
    }
    // rules ที่ limit กลุ่มนี้ (กันตัวเลือกใหม่หายเงียบ — ดู memory iducky-rule-allow-new-choice)
    for (const r of d.rules ?? []) {
      if (r.limit?.label === g.label && Array.isArray(r.limit.allow) && !r.limit.allow.includes(BY_FILE)) {
        r.limit.allow.push(BY_FILE);
        log.push(`rule limit ${g.label}: เติม allow`);
      }
    }
  }
  return log;
}

function verify(d) {
  return apply(JSON.parse(JSON.stringify(d))).length === 0;
}

const ids = Object.keys(TARGETS);
const { data: rows, error } = await sb.from("products").select("id,name,data").in("id", ids);
if (error) die(error.message);
if (rows.length !== ids.length) die(`เจอ ${rows.length}/${ids.length} ตัว`);

const plan = [];
for (const row of rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))) {
  if (row.name !== TARGETS[row.id]) die(`${row.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);
  const d = row.data;
  const groups = targetGroups(d).map((g) => g.label);
  const log = apply(d);
  console.log(`${log.length ? "→" : "="} ${row.id} | ${row.name} | กลุ่ม: ${groups.join(", ")}${log.length ? "" : " (ตรงแล้ว)"}`);
  for (const l of log) console.log(`     ${l}`);
  if (log.length) plan.push({ id: row.id, d });
}
if (!WRITE) {
  console.log(`\n(dry-run) ต้องแก้ ${plan.length}/${rows.length} ตัว — ใส่ --write เพื่อเขียน`);
  process.exit(0);
}

for (const { id, d } of plan) {
  d.savedAt = new Date().toISOString();
  const { data: upd, error: updErr } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (updErr) die(`${id}: ${updErr.message}`);
  if (!upd?.length) die(`${id}: update โดน 0 แถว`);
  const { data: back, error: backErr } = await sb.from("products").select("data").eq("id", id).single();
  if (backErr) die(`${id}: ${backErr.message}`);
  if (!verify(back.data)) die(`${id}: อ่านกลับไม่ตรง`);
  if (back.data.savedAt !== d.savedAt) die(`${id}: savedAt อ่านกลับไม่ตรง`);
  console.log(`✓ ${id} เขียนแล้ว · savedAt ${d.savedAt}`);
}
console.log(`\n✓ เสร็จ ${plan.length} ตัว อ่านกลับตรงทุกตัว`);
