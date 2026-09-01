/**
 * ผ้าแขวนผนัง (fabric-poster) — ย่อข้อความกลุ่ม "การตัด" + "การเก็บขอบ" ให้สั้นลง (1 ก.ย. 69)
 * เนื้อหาเท่าเดิม ตัดคำซ้ำ/ประโยคที่ไปพูดซ้ำในการ์ดตัวเลือกอยู่แล้ว + ลดคำ **เน้น** ให้เหลือจุดสำคัญ
 *
 * ดูเฉย ๆ:  node scripts/fabric-poster-copy-trim.mjs
 * เขียนจริง: node scripts/fabric-poster-copy-trim.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "fabric-poster";

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

const { data, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = data.data;

const NOTES = {
  "การตัด":
    "1 หลา = กว้าง 140 × ยาว 90 ซม. · ต่อผืนยาวสุด 360 ซม. (4 หลา) · " +
    "ค่าตัดคิดต่อชิ้นตาม**ด้านที่ยาวที่สุด** — ไม่เกิน 30 ซม. +5 · 60 ซม. +10 · 90 ซม. +15 · 120 ซม. +20 · 150 ซม. +25 บาท/ชิ้น",
  "การเก็บขอบ":
    "ค่าเย็บ/โพ้งขอบ คิดต่อชิ้นตาม**ด้านที่ยาวที่สุด** (เย็บ +15 ถึง +75 · โพ้ง +10 ถึง +70 บาท/ชิ้น ดูตารางในแกลเลอรี) · " +
    "ตัดเต็มหลาคิดที่ขั้น 150 ซม./ผืน + ค่าเจียนขอบ +25 บาท/ผืน · " +
    "เย็บขอบเลือกสีไหมได้ 13 สี (ไม่คิดเพิ่ม) · โพ้งขอบมีไหมขาวอย่างเดียว",
};

const DESCS = {
  "การตัด": {
    "ตัดเต็มหลา":
      "ผ้าเต็มผืน 140 × 90 ซม. ต่อ 1 หลา ไม่ตัดแบ่ง · สั่งเกิน 4 หลา ร้านแบ่งเป็นผืนละไม่เกิน 4 หลา\n" +
      "ไม่เย็บขอบ = ไม่มีค่าใช้จ่ายเพิ่ม · เย็บ/โพ้งขอบ = ค่าเจียนขอบ +25 บาท/ผืน",
    "ตัดแบ่งตามขนาด":
      "ระบุขนาดชิ้นงาน ระบบคำนวณจำนวนชิ้นต่อหลาและค่าตัดต่อชิ้นให้อัตโนมัติ",
    "สั่งทำพิเศษ (คุยกับแอดมิน)":
      "งานนอกตารางนี้ — หน้ากว้างเกิน 140 ซม. · ผืนยาวเกิน 360 ซม. · เย็บ/ตัดแบบพิเศษ · ผ้านอกรายการ\n" +
      "แจ้งรายละเอียดด้านล่าง แล้วทักไลน์ให้ร้านตีราคาก่อนเริ่มงาน",
  },
};

let changed = 0;
for (const o of d.options ?? []) {
  const note = NOTES[o.label];
  if (note && o.note !== note) {
    console.log(`note [${o.label}]  ${o.note?.length ?? 0} → ${note.length} ตัวอักษร`);
    o.note = note;
    changed++;
  }
  const map = DESCS[o.label];
  if (!map) continue;
  for (const c of o.choices ?? []) {
    const desc = map[c.name];
    if (!desc || c.desc === desc) continue;
    console.log(`desc [${o.label} › ${c.name}]  ${c.desc?.length ?? 0} → ${desc.length} ตัวอักษร`);
    c.desc = desc;
    changed++;
  }
}

if (!changed) {
  console.log("ไม่มีอะไรต้องแก้");
  process.exit(0);
}
if (!WRITE) {
  console.log(`\n(ดูเฉย ๆ) แก้ ${changed} จุด — ใส่ --write เพื่อเขียนจริง`);
  process.exit(0);
}
const { error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID);
if (e2) throw e2;
console.log(`✅ เขียนแล้ว (${changed} จุด)`);
