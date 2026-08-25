#!/usr/bin/env node
/**
 * MOBILE PHONE HANGING (mobile-phone-hanging-2) — โชว์จำนวนชิ้นที่จะได้รับ (ผู้ใช้สั่ง 25 ส.ค. 69:
 * "1 เซ็ต เท่ากับ 2 ชิ้น ต้องการให้เขียนจำนวนที่ได้ด้วย เช่นถ้าสั่ง 10 เซ็ต จะได้รับ 20 ชิ้น")
 *
 *   node scripts/mobile-phone-hanging-pieces.mjs           # ดูก่อน (ไม่เขียนจริง)
 *   node scripts/mobile-phone-hanging-pieces.mjs --write   # เขียนลง Supabase
 *
 * ใช้ piecesPerUnit บนตัวเลือกขนาด → หน้าสินค้าขึ้นกล่อง 📐 "ได้ 2 ชิ้น ต่อ 1 เซ็ต · สั่ง N เซ็ต = ได้ N×2 ชิ้น"
 * (ตัวเลขบอกทางเฉย ๆ ไม่แตะราคา/โควตาคละ — คนละตัวกับ perUnit ที่ตั้งไว้อยู่แล้ว)
 * + เติมตัวอย่างจำนวนในแท็บ "รายละเอียดเพิ่มเติม" · ตัวไดคัท (เซ็ตละ 5) ทำไว้ในสคริปต์ add-mobile-hanging-diecut.mts แล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "mobile-phone-hanging-2";
const PER_SET = 2;

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
if (error) throw new Error(`อ่านสินค้า ${ID} ไม่ได้ — ${error.message}`);
const d = structuredClone(row.data);
if (d.name !== "MOBILE PHONE HANGING") throw new Error(`${ID} ชื่อ "${d.name}" ไม่ใช่แถวที่ตั้งใจแก้ — ตรวจก่อน`);

const sizeOpt = (d.options ?? []).find((o) => o.label === "ขนาด");
if (!sizeOpt) throw new Error('ไม่เจอกลุ่มตัวเลือก "ขนาด" — โครงไม่ตรงกับที่สคริปต์คาด');
for (const c of sizeOpt.choices) c.piecesPerUnit = PER_SET;

// เติมตัวอย่างจำนวนในบูลเล็ตแรกของแท็บ "รายละเอียดเพิ่มเติม" (รันซ้ำได้ — เช็คก่อนว่ายังไม่มี)
const tab = (d.tabs ?? []).find((t) => t.title === "รายละเอียดเพิ่มเติม");
if (tab && !tab.text.includes("จะได้รับ"))
  tab.text = tab.text.replace(
    "• ขายเป็นเซ็ต 1 เซ็ตได้ 2 ชิ้น",
    `• ขายเป็นเซ็ต 1 เซ็ตได้ ${PER_SET} ชิ้น (เช่น สั่ง 10 เซ็ต จะได้รับ ${10 * PER_SET} ชิ้น)`
  );

d.savedAt = new Date().toISOString();

console.log(`📦 ${d.name} (${ID})`);
console.log(`   ตัวเลือกขนาด: ${sizeOpt.choices.map((c) => `${c.name} (perUnit ${c.perUnit} · piecesPerUnit ${c.piecesPerUnit})`).join(" · ")}`);
console.log(`   แท็บแรก: ${tab ? tab.text.split("\n")[0] : "(ไม่เจอแท็บ)"}`);

if (!WRITE) {
  console.log("\n(ยังไม่เขียนจริง — ใส่ --write เพื่อบันทึก)");
  process.exit(0);
}

const save = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (save.error) throw new Error(`บันทึกไม่สำเร็จ — ${save.error.message}`);
if (!save.data?.length) throw new Error("update โดน 0 แถว — ไม่มีอะไรถูกเขียน");

// อ่านกลับมาเทียบ — update คืน "ไม่ error" ได้ทั้งที่ค่าไม่ลงจริง
const { data: check, error: readErr } = await sb.from("products").select("data").eq("id", ID).single();
if (readErr) throw new Error(`อ่านกลับไม่ได้ — ${readErr.message}`);
if (check.data.savedAt !== d.savedAt) throw new Error("อ่านกลับมาไม่ตรงกับที่เขียน — รันซ้ำอีกรอบ");
console.log("\n✅ บันทึกแล้ว — หน้าสินค้าจะขึ้นกล่อง 📐 สรุปจำนวนชิ้นใต้ตัวเลือกขนาด");
