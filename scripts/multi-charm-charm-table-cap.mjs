#!/usr/bin/env node
/**
 * พวงกุญแจ หลายชิ้นใน 1 พวง — ราคาติ่งห้อยไม่ตรงใบเสนอราคาเดิม (พนักงานแจ้ง 7 ต.ค. 69 · OD-261006-1474)
 * ลูกค้าเก่าสั่งดีเทลเดิม 200 พวง เรท 2: ตัวหลัก 3cm สีพิเศษ + ติ่ง 3cm กลิตเตอร์รุ้ง + ติ่ง 2cm สีเหลือง
 *   ใบเดิม  25 + (20+5) + (12+5) = ฿67      ระบบคิด  25 + 22 + 12 = ฿59
 * ต้นเหตุ 2 ข้อ (ติ่งห้อยคิด +฿ ตายตัวตั้งแต่ 1 ก.ย. 69 — multi-charm-charm-price.mjs):
 *   1. ติ่ง 3cm ขึ้นไปคิด "2cm + cm ละ 10" (30+ พวง = 22) ทั้งที่ช่องตารางขนาดเดียวกันถูกกว่า (เรท 2 · 200 พวง 3cm = 20)
 *      ร้านใช้ราคาตารางเมื่อถูกกว่า → ตั้ง tableCap ที่ "ขนาดชิ้นที่ 2-10" (เทียบช่อง อะคริลิคใส · สกรีน 1 ด้าน
 *      ความหนาตามที่เลือก ณ ช่วงจำนวนเดียวกับตัวหลัก) — ต้องมีโค้ด tableCap (src/lib/products.ts) ขึ้นเว็บก่อน
 *   2. เนื้อสีพิเศษของติ่งไม่บวกเงินเลย (ตัวหลักบวกผ่านตาราง +5) → "สีพิเศษ" ใน "ประเภทอะคริลิค ชิ้นที่ 2-10" +5
 *
 *   node scripts/multi-charm-charm-table-cap.mjs                    # ดูก่อนว่าจะแก้อะไร
 *   node scripts/multi-charm-charm-table-cap.mjs --out=/tmp/p.json   # เขียนผลลงไฟล์ (ไว้ตรวจกับโค้ดในเครื่อง)
 *   node scripts/multi-charm-charm-table-cap.mjs --write             # ข้อ 1 (เว็บเก่าไม่รู้จัก tableCap = ไม่มีผล)
 *   node scripts/multi-charm-charm-table-cap.mjs --write --fee       # ข้อ 1+2 — ⚠️ รันหลัง deploy โค้ด tableCap แล้วเท่านั้น
 *       (ถ้า +5 ขึ้นก่อน เว็บเก่าจะคิด 22+5 = 27 ให้ติ่ง 3cm ที่ 200 พวง แพงกว่าที่ควร)
 * รันซ้ำได้
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const FEE = process.argv.includes("--fee") || process.argv.some((a) => a.startsWith("--out="));
const OUT = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
const ID = "keyring-multi-charm";
const MAX_PIECES = 10;
const SPECIAL = "สีพิเศษ (โฮโลแกรม/กลิสเตอร์/สี)";
const SPECIAL_FEE = 5;
const CAP = {
  driver: "ขนาดชิ้นที่ 1",
  pin: { "งานสกรีน ชิ้นที่ 1": "สกรีน 1 ด้าน (บน)", "ประเภทอะคริลิค ชิ้นที่ 1": "อะคริลิคใส" },
};
const SIZE_NOTE_ADD = " · ถ้าราคาตารางขนาดเดียวกัน (อะคริลิคใส) ถูกกว่า คิดตามตาราง";
const TYPE_NOTE = `ติ่งห้อยเนื้อสีพิเศษ +${SPECIAL_FEE}.- ต่อติ่ง`;

const die = (m) => {
  console.error("✗ " + m);
  process.exit(1);
};
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
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const p = row.data;
const log = [];

// แกนที่ pin ต้องมีจริงในทุกเรท (ไม่งั้นเทียบไม่เจอช่อง = ไม่มีเพดาน เงียบ ๆ)
for (const r of p.priceRates ?? []) {
  const m = r.pricing;
  if (!m?.driverLabels?.includes(CAP.driver)) die(`เรท ${r.label} ไม่มีแกน ${CAP.driver}`);
  for (const axis of Object.keys(CAP.pin)) if (!m.driverLabels.includes(axis)) die(`เรท ${r.label} ไม่มีแกน ${axis}`);
}

for (let k = 2; k <= MAX_PIECES; k++) {
  const size = p.options.find((o) => o.label === `ขนาดชิ้นที่ ${k}`);
  const type = p.options.find((o) => o.label === `ประเภทอะคริลิค ชิ้นที่ ${k}`);
  if (!size || !type) die(`ไม่เจอกลุ่มของชิ้นที่ ${k}`);
  if (size.priceAsDriver) die(`ขนาดชิ้นที่ ${k} ยังดึงราคาจากตาราง (priceAsDriver) — ตรวจก่อน`);
  if (JSON.stringify(size.tableCap) !== JSON.stringify(CAP)) {
    size.tableCap = structuredClone(CAP);
    log.push(`ขนาดชิ้นที่ ${k}: tableCap → ช่อง ${CAP.driver} · อะคริลิคใส · สกรีน 1 ด้าน`);
  }
  if (size.note && !size.note.includes(SIZE_NOTE_ADD.trim())) {
    size.note += SIZE_NOTE_ADD;
    log.push(`ขนาดชิ้นที่ ${k}: เติมข้อความ note`);
  }
  if (FEE) {
    const sp = type.choices.find((c) => c.name === SPECIAL);
    if (!sp) die(`ประเภทอะคริลิค ชิ้นที่ ${k} ไม่มีตัวเลือก ${SPECIAL}`);
    if (sp.extra !== SPECIAL_FEE) {
      sp.extra = SPECIAL_FEE;
      log.push(`ประเภทอะคริลิค ชิ้นที่ ${k}: ${SPECIAL} +${SPECIAL_FEE}`);
    }
    if (type.extraFromQty) die(`ประเภทอะคริลิค ชิ้นที่ ${k} มี extraFromQty — +5 จะไม่คิดบางช่วง`);
    if (type.note !== TYPE_NOTE) {
      type.note = TYPE_NOTE;
      log.push(`ประเภทอะคริลิค ชิ้นที่ ${k}: note`);
    }
  }
}

console.log(log.length ? log.join("\n") : "ไม่มีอะไรต้องแก้ (ตั้งไว้ครบแล้ว)");
if (OUT) {
  writeFileSync(OUT, JSON.stringify(p));
  console.log("→ เขียนผลลงไฟล์ " + OUT);
}
if (!WRITE) {
  console.log(log.length ? "\n(dry-run — ใส่ --write เพื่อบันทึก)" : "");
  process.exit(0);
}
if (!log.length) process.exit(0);
p.savedAt = new Date().toISOString();
const { data: upd, error: e2 } = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update ไม่โดนแถวไหนเลย");
// อ่านกลับ
const { data: back } = await sb.from("products").select("data").eq("id", ID).single();
const bad = back.data.savedAt === p.savedAt ? [] : ["savedAt"];
for (let k = 2; k <= MAX_PIECES; k++) {
  const s = back.data.options.find((o) => o.label === `ขนาดชิ้นที่ ${k}`);
  if (s?.tableCap?.driver !== CAP.driver) bad.push(`ขนาดชิ้นที่ ${k}`);
  if (FEE) {
    const t = back.data.options.find((o) => o.label === `ประเภทอะคริลิค ชิ้นที่ ${k}`);
    if (t?.choices.find((c) => c.name === SPECIAL)?.extra !== SPECIAL_FEE) bad.push(`ประเภทอะคริลิค ชิ้นที่ ${k}`);
  }
}
if (bad.length) die("อ่านกลับไม่ตรง: " + bad.join(", "));
console.log(`✓ บันทึกแล้ว + อ่านกลับตรง ${FEE ? "(tableCap + สีพิเศษ +5)" : "(tableCap — ยังไม่ใส่ +5)"}`);
