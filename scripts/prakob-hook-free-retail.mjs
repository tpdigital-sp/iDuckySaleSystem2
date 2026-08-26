#!/usr/bin/env node
/**
 * "อะคริลิคประกบ" — ค่าตะขอคิดแบบเดียวกับสินค้าพวงกุญแจ: ช่วงปลีก 1-10 ชิ้น ฟรีทุกแบบ
 * (รวมในราคาแล้ว) · 11 ชิ้นขึ้นไปคิดเพิ่มตามราคาอะไหล่จริง
 *
 *   node scripts/prakob-hook-free-retail.mjs           # ดูก่อน (ไม่เขียน)
 *   node scripts/prakob-hook-free-retail.mjs --write   # บันทึกจริง
 *
 * ที่มา: ผู้ใช้สั่ง 26 ส.ค. 69 "พวงกุญแจ ตะขอเรท1-10ชิ้น ฟรี เรท 11 ชิ้นขึ้นไป ส่งเพิ่มตามราคา
 * คิดเหมือนกับสินค้าพวงกุญแจเลยใช้ตรรกะเดียวกัน"
 *
 * วิธีเดียวกับ "สแตนดี้ + พวงกุญแจ" (standee-keyring · ดู add-standee-keyring.ts):
 *   • ตัด smallQtyFee (เหมา 10 บาท/ชิ้น ช่วง 1-10 — ของเดิมที่ติดมาจากชุด Shake Shake) ทิ้ง
 *   • ตั้ง extraFromQty: 11 ที่กลุ่ม "ตะขอ" → ช่วง 1-10 ไม่คิด +฿ ของตะขอเลย · 11+ คิดตามราคา
 *     ต่อชิ้นของอะไหล่ (choices มาจากคลังกลาง preset-3 ชุดเดียวกับสินค้าพวงกุญแจอะคริลิค)
 *   • freeWhen Z1/Z2 คงไว้ → ห่วงเงิน Z1/Z2 ฟรีทุกช่วงจำนวนเหมือนพวงกุญแจ 3mm
 *   • กลุ่ม "สีตะขอ …" ตั้ง extraFromQty: 11 อยู่แล้วทุกกลุ่ม — ไม่ต้องแตะ
 * แล้วแก้ข้อความ note ของ "รับตะขอไหม" + แท็บ "ตะขอ / ห่วง" ให้เล่าราคาแบบใหม่
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "acrylic-prakob";

const NOTE =
  'ตะขอ/ห่วงมีให้เลือกกว่า 30 แบบตามแผ่นอะไหล่ของร้าน — **ช่วง 1-10 ชิ้น ฟรีทุกแบบ (รวมในราคาแล้ว)** สั่ง 11 ชิ้นขึ้นไปคิดเพิ่มตามชนิด · ห่วง Z1 / โซ่ Z2 (สีเงิน) ฟรีทุกช่วงจำนวน (ดูรูปอะไหล่ทั้งหมดในแท็บ "ตะขอ / ห่วง" ท้ายหน้า)';

const TAB_TEXT = `เลือกตะขอได้จากแผ่นอะไหล่ของร้าน::
• ช่วง 1-10 ชิ้น เลือกตะขอ/ห่วงแบบไหนก็ได้ ฟรีทุกแบบ (รวมในราคาแล้ว)
• สั่ง 11 ชิ้นขึ้นไปคิดตามราคาอะไหล่จริง (ประมาณ 2-15 บาท/ชิ้น) — ระบบบวกให้อัตโนมัติเมื่อเลือก
• ห่วง Z1 (ห่วงกลมเงิน) และ Z2 (โซ่ไข่ปลาเงิน) ฟรีทุกช่วงจำนวน
• ตะขอบางแบบเลือกสีได้ (ดูชาร์ตสีด้านล่าง) — เลือกได้ในหน้าสินค้าเมื่อเลือกตะขอแบบนั้น
• ตะขอ BB/BC เป็นสีสุ่ม เลือกสีไม่ได้

ดูรูปอะไหล่ทั้งหมด::
• ภาพแรกคือแผ่นอะไหล่รวมของร้าน มีรหัสกำกับทุกตัว (Z1, Z2, A-V, AA-BC)
• ภาพถัดไปคือชาร์ตสีของตะขอที่มีหลายสี (G · H · I · S · T · U)`;

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

const { data: row, error } = await sb.from("products").select("id,data").eq("id", ID).single();
if (error) throw new Error(`อ่านสินค้าไม่ได้ — ${error.message}`);

const d = structuredClone(row.data);
const hook = (d.options ?? []).find((o) => o.label === "ตะขอ");
const ask = (d.options ?? []).find((o) => o.label === "รับตะขอไหม");
const tab = (d.tabs ?? []).find((t) => t.title === "ตะขอ / ห่วง");
if (!hook || !ask || !tab)
  throw new Error("โครงชุดตะขอไม่ครบ (ตะขอ/รับตะขอไหม/แท็บ) — รัน scripts/prakob-add-hooks.mjs ก่อน");

console.log(`📦 ${d.name} (${ID})`);
console.log("   ตะขอ เดิม:", JSON.stringify({ smallQtyFee: hook.smallQtyFee ?? null, extraFromQty: hook.extraFromQty ?? null, freeWhen: !!hook.freeWhen }));
delete hook.smallQtyFee;
hook.extraFromQty = 11;
console.log("   ตะขอ ใหม่:", JSON.stringify({ smallQtyFee: hook.smallQtyFee ?? null, extraFromQty: hook.extraFromQty, freeWhen: !!hook.freeWhen }));
ask.note = NOTE;
tab.text = TAB_TEXT;
console.log("   แก้ note รับตะขอไหม + ข้อความแท็บ ตะขอ / ห่วง แล้ว");
d.savedAt = new Date().toISOString();

if (!WRITE) {
  console.log("\n(ยังไม่บันทึก — ใส่ --write)");
  process.exit(0);
}

const up = await sb.from("products").update({ data: d }).eq("id", ID);
if (up.error) throw new Error(`บันทึกไม่สำเร็จ — ${up.error.message}`);
console.log("\n✅ บันทึกแล้ว");
