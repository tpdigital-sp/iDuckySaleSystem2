#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — เจ้าของร้านทัก 17 ก.ย. 69 (ภาพตะกร้า: ตัวหลัก 5cm 2 ด้าน + ติ่ง 4.5 ซม. 2 ด้าน
 * + ตะขอ K ขึ้น ฿150 · ที่ถูกคือ 100 + 10 (2 ด้านตัวหลัก) + 40 (ติ่งห้อย) + 10 (2 ด้านของติ่งห้อย) = ฿160)
 *
 *   node scripts/multi-charm-hook-free-screen-fee.mjs           # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-hook-free-screen-fee.mjs --write   # เขียนลงฐานข้อมูล
 *   แล้วตามด้วย  node scripts/dealer-rates-apply.mjs --apply --only=keyring-multi-charm   (เรทตัวแทนคิดจากเรท 1 ใหม่)
 *
 * ใบราคาจริง (iduckyofficial-pricelists.com/keyring): พวงกุญแจหลายชิ้นเริ่ม 120.- = ตัวหลักไม่เกิน 5cm **100.-**
 * + ติ่งห้อย 2cm 20.- — ราคาตัวหลักช่วงปลีก "รวมตะขอแล้ว เลือกแบบไหนก็ได้" (พวงกุญแจเดี่ยว 90.- + เลือกตะขอ +10)
 * ของเดิมก๊อปตารางพวงกุญแจเดี่ยวมา (90.-) แล้วเก็บค่าตะขอเหมา ฿10 (smallQtyFee) ทีหลัง → ลูกค้าเห็นบรรทัด
 * "ตะขอ ฿10" ทั้งที่ร้านบอกว่าฟรี และคนที่ไม่รับตะขอ/รับห่วง Z1 ได้ราคา 110 ต่ำกว่าใบราคา
 *
 * ทำ 4 อย่าง (ข้อมูลล้วน):
 *  1. เรทที่ 1 หนา 3mm ช่วง 1-10 พวง = ราคาพวงกุญแจเดี่ยว (อ่านสดจาก keyring-copy-copy) **+10** ทุกช่อง
 *     เขียนทั้ง data.pricing (ตัวจริง) และ priceRates[0].pricing (เงา) — ดูโน้ต iducky-script-write-product ข้อ 7
 *     (2mm ไม่แตะ — ของเดิมก็ไม่มีค่าตะขอเหมาที่ 2mm)
 *  2. กลุ่ม "ตะขอ": ถอด smallQtyFee (฿10 ช่วง 1-10 พวง) + ตั้ง extraFromQty 11 → 1-10 พวงเลือกตะขอแบบไหนก็ฟรี
 *     · 11 พวงขึ้นไปบวกตามราคาอะไหล่เหมือนเดิม (กลุ่มสีตะขอตั้ง extraFromQty 11 อยู่แล้ว)
 *  3. "งานสกรีน ชิ้นที่ 2-10" (ติ่งห้อย): สกรีน 2 ด้าน / 3 เลเยอร์ บวกตามขนาดของติ่งชิ้นนั้น ด้วย choice.sizeFee
 *     ตารางกลางร้าน "Add on งานสกรีน 2 ด้าน หรือ หลายเลเยอร์" (โน้ต iducky-screen-2layer) เท่ากันทุกช่วงจำนวน:
 *       2 ด้าน   2-5cm +10 · 6-7cm +15 · 8-10cm +25      3 เลเยอร์   +20 · +30 · +50
 *     sizeFee ชี้กลุ่ม "ขนาดชิ้นที่ k" (เมนูเลื่อน) — ติ่งที่กำหนดขนาดเอง unitPriceFor สลับเป็นแถวที่เกาะให้ก่อนแล้ว
 *  4. ข้อความ (แท็บ Add-on · note ของกลุ่ม) + priceMin/priceMax
 * รันซ้ำได้ — ข้อ 1 เทียบกับราคาต้นทาง + 10 ทุกครั้ง ไม่ได้บวกซ้ำ
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "keyring-multi-charm";
const SRC_ID = "keyring-copy-copy";
const MAX_PIECES = 10;
const HOOK_INCLUDED = 10; // ค่าตะขอที่รวมเข้าราคาตัวหลักช่วงปลีก
const THICK = "3mm";

const SIDE2 = ["สกรีน 2 ด้าน (ใต้-บน)", "สกรีน 2 ด้าน (บน-บน)"];
const LAYER3 = "สกรีน 3 เลเยอร์";
const TIERS_2SIDE = [{ upTo: 5, fee: 10 }, { upTo: 7, fee: 15 }, { upTo: 10, fee: 25 }];
const TIERS_3LAYER = [{ upTo: 5, fee: 20 }, { upTo: 7, fee: 30 }, { upTo: 10, fee: 50 }];
const SCREEN_NOTE =
  "ติ่งห้อยสกรีน 2 ด้าน บวกตามขนาดติ่ง: 2-5cm +10.- · 6-7cm +15.- · 8-10cm +25.- (3 เลเยอร์ +20 / +30 / +50)";

const TAB_HOOK_OLD = "• ตะขอ/อะไหล่: สั่ง 1-10 พวง เลือกตะขอ +10 บาท/พวง · ราคาส่งบวกตามราคาอะไหล่ตะขอ (แจ้งแบบกับแอดมิน)";
const TAB_HOOK_NEW =
  "• ตะขอ/อะไหล่: สั่ง 1-10 พวง เลือกตะขอแบบไหนก็ได้ฟรี (รวมในราคาตัวหลักแล้ว) · 11 พวงขึ้นไปบวกตามราคาอะไหล่ตะขอ";
const TAB_SCREEN_LINE = "• " + SCREEN_NOTE;
const HOOK_NOTE_OLD = "ตะขอ 1 ชุดต่อพวง — คิดครั้งเดียว ไม่คูณจำนวนชิ้นในพวง";
const HOOK_NOTE_NEW = "ตะขอ 1 ชุดต่อพวง — สั่ง 1-10 พวง เลือกแบบไหนก็ได้ฟรี · 11 พวงขึ้นไปบวกตามราคาอะไหล่ (คิดครั้งเดียว ไม่คูณจำนวนชิ้นในพวง)";

const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};
/** เทียบเป็น "ค่า" — jsonb เรียงคีย์ใหม่ JSON.stringify ตรง ๆ จะฟ้องว่าต่างทั้งที่เท่ากัน */
const canon = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x
  );

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const load = async (id) => {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw error;
  return row.data;
};

const p = await load(ID);
const src = await load(SRC_ID);
const before = JSON.stringify(p);
const log = [];

// ── 1) เรทที่ 1 · 3mm · ช่วง 1-10 พวง = ราคาพวงกุญแจเดี่ยว + ค่าตะขอที่รวมให้ ──
const r1 = p.priceRates?.[0];
const srcR1 = src.priceRates?.[0];
if (r1?.id !== "r1" || r1.dealerOnly) die("เรทแรกของสินค้าไม่ใช่ r1");
if (!srcR1 || srcR1.dealerOnly) die("ไม่เจอเรทที่ 1 ของต้นทาง keyring-copy-copy");
if (r1.pricing.tiers[0]?.upTo !== 10 || srcR1.pricing.tiers[0]?.upTo !== 10) die("ช่วงราคาแรกไม่ใช่ 1-10 — ตรวจตารางก่อน");
if (canon(p.pricing) !== canon(r1.pricing)) die("data.pricing กับ priceRates[0].pricing ไม่ตรงกันตั้งแต่ก่อนแก้ — ตรวจก่อน");
const wantCell0 = (k) => {
  const s = srcR1.pricing.cells[k]?.[0];
  if (!Number.isFinite(s) || s <= 0) die(`ต้นทางไม่มีราคาช่อง ${k}`);
  return s + HOOK_INCLUDED;
};
let bumped = 0;
const keys3 = Object.keys(r1.pricing.cells).filter((k) => k.startsWith(THICK + "│"));
if (keys3.length !== 135) die(`ช่อง ${THICK} ควรมี 135 ช่อง (9 ขนาด × 5 งานสกรีน × 3 เนื้อ) เจอ ${keys3.length}`);
for (const k of keys3) {
  const want = wantCell0(k);
  for (const m of [r1.pricing, p.pricing]) {
    if (m.cells[k][0] !== want) {
      if (m === r1.pricing) bumped++;
      m.cells[k][0] = want;
    }
  }
}
if (bumped) log.push(`เรทที่ 1 · ${THICK} · 1-10 พวง: +${HOOK_INCLUDED} (รวมตะขอ) ${bumped} ช่อง เช่น 5cm 1 ด้าน ใส = ${r1.pricing.cells["3mm│5cm│สกรีน 1 ด้าน (ใต้)│อะคริลิคใส"][0]}`);

// ── 2) ตะขอ: 1-10 พวงฟรีทุกแบบ ──
const hook = p.options.find((o) => o.label === "ตะขอ");
if (!hook) die('ไม่เจอกลุ่ม "ตะขอ"');
if (hook.smallQtyFee) {
  log.push(`กลุ่ม "ตะขอ": ถอดค่าเหมาช่วงปลีก ${JSON.stringify(hook.smallQtyFee.fee)} บาท (smallQtyFee)`);
  delete hook.smallQtyFee;
}
if (hook.extraFromQty !== 11) {
  log.push(`กลุ่ม "ตะขอ": extraFromQty ${hook.extraFromQty ?? "-"} → 11 (1-10 พวงไม่คิด +฿)`);
  hook.extraFromQty = 11;
}
if (hook.choices.some((c) => c.extraBelow || c.extraSmall)) die('ตัวเลือกในกลุ่ม "ตะขอ" มี extraBelow/extraSmall — ช่วง 1-10 จะยังคิดเงิน');
const colorGroups = p.options.filter((o) => o.label.startsWith("สีตะขอ"));
for (const g of colorGroups) {
  if (g.extraFromQty !== 11 || g.smallQtyFee || g.choices.some((c) => c.extraBelow || c.extraSmall))
    die(`กลุ่ม "${g.label}" ยังคิดเงินช่วง 1-10 พวง — ตรวจก่อน`);
}
if (hook.note === HOOK_NOTE_OLD) {
  hook.note = HOOK_NOTE_NEW;
  log.push('note กลุ่ม "ตะขอ": บอกว่า 1-10 พวงฟรีทุกแบบ');
}

// ── 3) ค่าสกรีน 2 ด้าน / 3 เลเยอร์ ของติ่งห้อย ตามขนาดติ่ง ──
let feeSet = 0;
for (let k = 2; k <= MAX_PIECES; k++) {
  const sizeLabel = `ขนาดชิ้นที่ ${k}`;
  const g = p.options.find((o) => o.label === `งานสกรีน ชิ้นที่ ${k}`);
  if (!g) die(`ไม่เจอกลุ่ม งานสกรีน ชิ้นที่ ${k}`);
  if (!p.options.some((o) => o.label === sizeLabel)) die(`ไม่เจอกลุ่ม ${sizeLabel}`);
  for (const name of [...SIDE2, LAYER3]) {
    const c = g.choices.find((x) => x.name === name);
    if (!c) die(`งานสกรีน ชิ้นที่ ${k}: ไม่เจอตัวเลือก "${name}"`);
    if (c.extra || c.extraBelow || c.extraSmall || c.extraTiers) die(`งานสกรีน ชิ้นที่ ${k} · ${name}: มี +฿ แบบอื่นอยู่แล้ว จะคิดซ้อน`);
    const want = { widthLabel: sizeLabel, heightLabel: sizeLabel, tiers: name === LAYER3 ? TIERS_3LAYER : TIERS_2SIDE };
    if (canon(c.sizeFee) !== canon(want)) {
      c.sizeFee = want;
      feeSet++;
    }
  }
  if (k === 2 && g.note !== SCREEN_NOTE) {
    g.note = SCREEN_NOTE;
    log.push('note กลุ่ม "งานสกรีน ชิ้นที่ 2": บอกเรทค่าสกรีนติ่งห้อย');
  }
}
if (feeSet) log.push(`งานสกรีน ชิ้นที่ 2-${MAX_PIECES}: ตั้งค่าสกรีนตามขนาดติ่ง (sizeFee) ${feeSet} ตัวเลือก — 2 ด้าน 10/15/25 · 3 เลเยอร์ 20/30/50`);

// ── 4) ข้อความ + ช่วงราคา ──
const tabAdd = (p.tabs ?? []).find((t) => (t.text ?? "").includes("ตะขอ/อะไหล่:"));
if (!tabAdd) die("ไม่เจอแท็บ Add-on (บรรทัด ตะขอ/อะไหล่)");
if (tabAdd.text.includes(TAB_HOOK_OLD)) {
  tabAdd.text = tabAdd.text.replace(TAB_HOOK_OLD, TAB_HOOK_NEW);
  log.push("แท็บ Add-on: ตะขอ 1-10 พวงฟรีทุกแบบ");
} else if (!tabAdd.text.includes(TAB_HOOK_NEW)) die("แท็บ Add-on ไม่มีบรรทัดตะขอเดิมให้แทน");
if (!tabAdd.text.includes(TAB_SCREEN_LINE)) {
  tabAdd.text = tabAdd.text.replace(TAB_HOOK_NEW, TAB_SCREEN_LINE + "\n" + TAB_HOOK_NEW);
  log.push("แท็บ Add-on: เพิ่มบรรทัดค่าสกรีนของติ่งห้อย");
}
const pub = p.priceRates.filter((r) => !r.dealerOnly);
const all = pub.flatMap((r) => Object.values(r.pricing.cells).flat()).filter((n) => n > 0);
const min = Math.min(...all);
const max = Math.max(...all);
if (p.priceMin !== min || p.priceMax !== max) {
  log.push(`ช่วงราคา priceMin/priceMax: ${p.priceMin}/${p.priceMax} → ${min}/${max}`);
  p.priceMin = min;
  p.priceMax = max;
}

console.log(log.length ? log.map((l) => "• " + l).join("\n") : "(ไม่มีอะไรต้องแก้)");
if (canon(JSON.parse(before)) === canon(p)) {
  console.log("\nไม่มีอะไรต้องแก้ (ทำไปแล้ว)");
  process.exit(0);
}
if (!WRITE) {
  console.log("\n(ยังไม่เขียน — ใส่ --write ถ้าจะบันทึกจริง)");
  process.exit(0);
}

p.savedAt = new Date().toISOString();
const { data: upd, error: uerr } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (uerr) throw uerr;
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");

// อ่านกลับมาเทียบของจริง (ไม่เชื่อว่าไม่ error = สำเร็จ)
const back = await load(ID);
const bHook = back.options.find((o) => o.label === "ตะขอ");
const K5 = "3mm│5cm│สกรีน 1 ด้าน (ใต้)│อะคริลิคใส";
const bFee = (k, name) => back.options.find((o) => o.label === `งานสกรีน ชิ้นที่ ${k}`)?.choices.find((c) => c.name === name)?.sizeFee;
const tiersEq = (a, b) => Array.isArray(a) && a.length === b.length && a.every((t, i) => t.upTo === b[i].upTo && t.fee === b[i].fee);
const checks = [
  ["savedAt ตรง", back.savedAt === p.savedAt],
  [`เรท 1 (เงา) ${K5} ขั้นแรก = 100`, back.priceRates[0].pricing.cells[K5]?.[0] === 100],
  [`data.pricing (ตัวจริง) ${K5} ขั้นแรก = 100`, back.pricing.cells[K5]?.[0] === 100],
  ["data.pricing = priceRates[0].pricing ทุกช่อง", canon(back.pricing) === canon(back.priceRates[0].pricing)],
  ["3mm ทุกช่อง ขั้นแรก = ต้นทาง + 10", keys3.every((k) => back.pricing.cells[k][0] === srcR1.pricing.cells[k][0] + HOOK_INCLUDED)],
  ["ขั้น 11 พวงขึ้นไป + 2mm ไม่ถูกแตะ", Object.keys(back.pricing.cells).every((k) => {
    const was = JSON.parse(before).pricing.cells[k];
    return back.pricing.cells[k].every((v, i) => (i === 0 && k.startsWith(THICK + "│")) || v === was[i]);
  })],
  ["ตะขอ: ไม่มี smallQtyFee · extraFromQty 11", !!bHook && !bHook.smallQtyFee && bHook.extraFromQty === 11],
  ...Array.from({ length: MAX_PIECES - 1 }, (_, i) => i + 2).map((k) => [
    `งานสกรีน ชิ้นที่ ${k}: sizeFee ชี้ "ขนาดชิ้นที่ ${k}" ครบ 3 ตัวเลือก`,
    [...SIDE2, LAYER3].every((n) => {
      const f = bFee(k, n);
      return f?.widthLabel === `ขนาดชิ้นที่ ${k}` && f?.heightLabel === `ขนาดชิ้นที่ ${k}` && tiersEq(f.tiers, n === LAYER3 ? TIERS_3LAYER : TIERS_2SIDE);
    }),
  ]),
  ["งานสกรีน ชิ้นที่ 1 (แกนตาราง) ไม่มี sizeFee", !back.options.find((o) => o.label === "งานสกรีน ชิ้นที่ 1").choices.some((c) => c.sizeFee)],
  ["แท็บ Add-on: ตะขอฟรี + ค่าสกรีนติ่งห้อย", (back.tabs ?? []).some((t) => t.text.includes(TAB_HOOK_NEW) && t.text.includes(TAB_SCREEN_LINE))],
  [`priceMin/priceMax = ${min}/${max}`, back.priceMin === min && back.priceMax === max],
  ["terms ยังอยู่ครบ", typeof back.terms === "string" && back.terms.length > 50],
];
let bad = 0;
for (const [name, pass] of checks) {
  console.log(pass ? "✅" : "❌", name);
  if (!pass) bad++;
}
if (bad) die(`อ่านกลับไม่ตรง ${bad} ข้อ — รันซ้ำอีกรอบ (Supabase เคยรับค่าไม่ครบ)`);
console.log("\n✓ เขียนแล้ว อ่านกลับตรงทุกข้อ — อย่าลืมรัน dealer-rates-apply.mjs --apply --only=" + ID);
