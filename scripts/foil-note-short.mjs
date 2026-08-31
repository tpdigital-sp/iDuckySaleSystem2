#!/usr/bin/env node
/**
 * ✂️ เกลาประโยคฟอยล์ชุดเดิมให้สั้น — ตัวที่เหลืออีก 4 ตัว
 *
 *   node scripts/foil-note-short.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/foil-note-short.mjs --write
 *
 * ผู้ใช้สั่ง 31 ส.ค. 69 (ต่อจาก photocard-digital-short-notes.mjs ที่เกลา Photo card Digital ไปแล้ว)
 * ประโยคเดียวกันนี้ยังค้างอยู่บน Paper Foil · Card Broad Foam · SHIKISHI · Ultra-Hard CardBoard
 *
 * ⚠️ ห้ามถอดคำเน้น **เคลือบด้าน** ออก — เป็นข้อที่ลูกค้าพลาดบ่อย (ดู restore-foil-terms.mts)
 * เขียนทับเฉพาะตอนข้อความเดิมตรงกับ FROM เป๊ะ ๆ (รันซ้ำได้ · ใครแก้ทีหลังไม่โดนย้อน)
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");

const FROM = "งานเคลือบฟอยล์ทุกงานต้องมีการ**เคลือบด้าน**ร่วมด้วย (รวมอยู่ในขั้นตอนงานฟอยล์แล้ว ไม่คิดเพิ่ม)";
const TO = "งานฟอยล์มา**เคลือบด้าน**ให้ในตัว ไม่คิดเพิ่ม";

const TARGETS = [
  { id: "paper-foil", name: "Paper Foil", label: "เลเยอร์ฟอยล์ (ด้านหน้า)" },
  { id: "card-broad-foam-2-mm", name: "Card Broad Foam หนา 2 mm", label: "เคลือบฟอยล์ (Add On)" },
  { id: "pricelist-shikishi", name: "SHIKISHI (ชิกิชิ)", label: "เคลือบฟอยล์ (Add On)" },
  { id: "ultra-hard-cardboard-2-mm", name: "Ultra-Hard CardBoard หนา 2 mm", label: "เคลือบฟอยล์ (Add On)" },
];

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const pick = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim();
const sb = createClient(pick("NEXT_PUBLIC_SUPABASE_URL"), pick("SUPABASE_SERVICE_ROLE_KEY"));

const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

let changed = 0;
for (const t of TARGETS) {
  const { data: rows, error } = await sb.from("products").select("id,name,data").eq("id", t.id);
  if (error) die(error.message);
  const row = rows?.[0];
  if (!row) die(`ไม่พบสินค้า id=${t.id}`);
  if (row.name !== t.name) die(`${t.id}: ชื่อไม่ตรงที่คาด (${row.name}) — หยุดกันเขียนทับผิดตัว`);

  const d = row.data;
  const opt = (d.options ?? []).find((o) => o.label === t.label);
  if (!opt) die(`${t.id}: ไม่มีกลุ่ม "${t.label}"`);
  const cur = opt.note ?? "";
  if (cur === TO) {
    console.log(`= ${t.id} / ${t.label} — สั้นอยู่แล้ว`);
    continue;
  }
  if (cur !== FROM) {
    console.log(`⚠ ${t.id} / ${t.label} — ข้อความเดิมไม่ตรงที่คาด ข้ามให้\n   ตอนนี้: ${cur}`);
    continue;
  }
  opt.note = TO;
  changed++;
  console.log(`✎ ${t.id} / ${t.label}  ${FROM.length} → ${TO.length} ตัวอักษร`);
  if (WRITE) {
    const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", t.id);
    if (e2) die(`${t.id}: ${e2.message}`);
  }
}

console.log(`\nใหม่: ${TO}`);
console.log(`${changed} กลุ่มที่${WRITE ? "เขียนแล้ว" : "จะเปลี่ยน"}`);
if (!WRITE) console.log("— ยังไม่ได้เขียน (ใส่ --write)");
