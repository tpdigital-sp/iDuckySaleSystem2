#!/usr/bin/env node
/**
 * เติม "ชุดตัวเลือก" (ProductOption.section) ให้กลุ่มที่ยังโล่งอยู่ ในสินค้าที่แบ่งชุดไว้แล้วบางส่วน
 *   [ร้านสั่ง 4 ก.ย. 69: สินค้าทุกตัวต้องแบ่งกลุ่มเหมือน POSTER]
 *
 *   node scripts/option-sections-fill-gaps.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/option-sections-fill-gaps.mjs --write    # เขียนจริง + อ่านกลับเทียบ
 *
 * 4 ตัวนี้เป็นสินค้า "หลายชิ้นใน 1 หน่วย" ที่รอบก่อนใส่ section ให้เฉพาะกลุ่มของแต่ละชิ้น
 * เหลือกลุ่มหัว (ตั้งค่ารวมทั้งชุด) กับกลุ่มท้าย (ฐาน/ตะขอ) ลอยอยู่นอกกรอบ
 * ⚠️ ไม่แตะชื่อกลุ่ม/ตัวเลือก/ราคา/กฎ/ลำดับ — เติมฟิลด์ section อย่างเดียว
 * รันซ้ำได้ ผลลัพธ์เหมือนเดิม
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

/** ชื่อกลุ่ม → ชื่อชุดที่จะเติมให้ (กลุ่มที่มี section อยู่แล้วไม่แตะ) */
const PLAN = {
  "peek-a-boo-acrylic": { "ขนาด": "1. ขนาด" },
  "standymusic-3": {
    "ขนาด": "1. ขนาด",
    "ขนาดที่ต้องการ · ด้านกว้าง": "1. ขนาด",
    "ขนาดที่ต้องการ · ด้านยาว": "1. ขนาด",
  },
  "keyring-multi-charm": {
    "ความหนาอะคริลิค": "ทั้งพวง",
    "จำนวนชิ้นใน 1 พวง": "ทั้งพวง",
    // ท้ายเรื่อง: วิธีห้อย + ตะขอทุกสี (กลุ่มสีตะขอโผล่ทีละอันตามตะขอที่เลือก)
    "*ท้าย*": "ตะขอ + การห้อย",
  },
  "new-mt1dwpc1-6773": {
    "จำนวนชิ้นใน 1 ฐาน": "ทั้งชุด",
    "*ท้าย*": "ฐาน + ของเสริม",
  },
};
/** ตัวที่ใช้ "*ท้าย*" = กลุ่มที่ยังไม่มี section และอยู่หลังชุดสุดท้าย ยกไปไว้ชุดเดียวกันทั้งพรวด */
const TAIL_FROM = { "keyring-multi-charm": "รูปแบบการห้อย", "new-mt1dwpc1-6773": "ฐานสแตนดี้" };

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const die = (m) => { console.error("✗ " + m); process.exit(1); };

for (const [id, map] of Object.entries(PLAN)) {
  const { data: row, error } = await sb.from("products").select("id,name,data").eq("id", id).single();
  if (error) die(`${id}: อ่านไม่ได้ ${error.message}`);
  const opts = row.data.options ?? [];
  const tailAt = TAIL_FROM[id] ? opts.findIndex((o) => o.label === TAIL_FROM[id]) : -1;
  if (TAIL_FROM[id] && tailAt < 0) die(`${id}: ไม่เจอกลุ่ม "${TAIL_FROM[id]}" (ชื่อกลุ่มเปลี่ยนไปแล้ว?)`);
  const next = opts.map((o, i) => {
    if (o.section) return o;
    const sec = map[o.label] ?? (tailAt >= 0 && i >= tailAt ? map["*ท้าย*"] : undefined);
    if (!sec) return o;
    return { ...o, section: sec };
  });
  const left = next.filter((o) => !o.section);
  console.log(`\n### ${id} — ${row.name}`);
  let last = "";
  for (const o of next) {
    if (o.section !== last) { console.log(`  ┌ ${o.section ?? "— (ยังไม่มีชุด)"}`); last = o.section; }
    console.log(`  │ ${o.label}`);
  }
  if (left.length) die(`${id}: ยังเหลือกลุ่มไม่มีชุด ${left.length} กลุ่ม`);
  // ชุดชื่อเดียวกันต้องอยู่ติดกัน ไม่งั้นได้กรอบชื่อซ้ำ 2 กรอบ
  const seen = [];
  let prev = null;
  for (const o of next) if (o.section !== prev) { if (seen.includes(o.section)) die(`${id}: ชุด "${o.section}" ไม่ติดกัน`); seen.push(o.section); prev = o.section; }
  if (!WRITE) continue;

  const d = { ...row.data, options: next, savedAt: new Date().toISOString() };
  const { data: upd, error: e1 } = await sb.from("products").update({ data: d }).eq("id", id).select("id");
  if (e1 || !upd?.length) die(`${id}: update พัง/0 แถว ${e1?.message ?? ""}`);
  const { data: back, error: e2 } = await sb.from("products").select("data").eq("id", id).single();
  if (e2) die(`${id}: อ่านกลับไม่ได้ ${e2.message}`);
  const key = (list) => list.map((o) => `${o.section ?? "-"}|${o.label}`).join("→");
  if (key(back.data.options) !== key(next)) die(`${id}: อ่านกลับไม่ตรง`);
  const bag = (list) => JSON.stringify(list.map((o) => JSON.stringify({ ...o, section: undefined })).sort());
  if (bag(row.data.options) !== bag(back.data.options)) die(`${id}: เนื้อในกลุ่มไม่ตรงของเดิม`);
  const cells = (x) => Object.keys(x?.pricing?.cells ?? {}).length;
  if (cells(back.data) !== cells(row.data)) die(`${id}: คีย์ตารางราคาเปลี่ยน!`);
  if (JSON.stringify(back.data.priceRates ?? []) !== JSON.stringify(row.data.priceRates ?? [])) die(`${id}: เรทราคาเปลี่ยน!`);
  if ((back.data.rules ?? []).length !== (row.data.rules ?? []).length) die(`${id}: จำนวนกฎเปลี่ยน!`);
  console.log(`✓ ${id} — เติมชุดครบ`);
}
console.log(WRITE ? "\nเขียนแล้ว ✅" : "\n(ดูอย่างเดียว — ใส่ --write เพื่อเขียนจริง)");
