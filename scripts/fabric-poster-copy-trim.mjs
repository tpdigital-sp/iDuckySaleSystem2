/**
 * ผ้าแขวนผนัง (fabric-poster) — ย่อข้อความหน้าสินค้า (ชนิดผ้า · การตัด · การเก็บขอบ · เจาะรู) 1 ก.ย. 69
 * เนื้อหาเท่าเดิม ตัดคำซ้ำ/ที่ไปพูดซ้ำในการ์ดตัวเลือกอยู่แล้ว + ถอด **ดอกจัน** ออกจาก desc/hint
 * (สองที่นี้โชว์ข้อความดิบ ไม่แปลงตัวเน้น — มีแต่ note ของกลุ่มที่แปลงให้)
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
  "ชนิดผ้า":
    "1 หลา = กว้าง 140 × ยาว 90 ซม. · **ผ้าสะท้อนน้ำ** (Pongee / Binnan / Taffeta / ผ้าร่มหนา) " +
    "น้ำไม่ซึม — เหมาะกับงานภายนอกอาคารและผ้าม่านห้องน้ำ",
  // ขั้นค่าตัด (30/60/90/120/150 ซม.) ถอดออกตามที่ผู้ใช้สั่ง — ระบบคิดให้อัตโนมัติอยู่แล้ว
  "การตัด":
    "1 หลา = กว้าง 140 × ยาว 90 ซม. · ผืนยาวสุด 360 ซม. (4 หลา) · ค่าตัดต่อชิ้นคิดตาม**ด้านที่ยาวที่สุด**",
  // ช่วงราคาเย็บ/โพ้ง + ค่าเจียนขอบ ถอดออกตามที่ผู้ใช้สั่ง
  // (ค่าเจียนขอบ +25/ผืน ยังบอกอยู่ในการ์ด "ตัดเต็มหลา" · ตารางเต็มอยู่ในแกลเลอรี)
  "การเก็บขอบ": "คิดต่อชิ้นตาม**ด้านที่ยาวที่สุด**",
  "เจาะรูแขวนผนัง":
    "ตาไก่ **คู่ละ 10 บาท** ร้อยเชือก/เกี่ยวตะขอแขวนผนัง — อยากได้ตำแหน่งหรือจำนวนคู่แบบอื่น แจ้งในช่องหมายเหตุถึงร้าน",
};

/* คำอธิบายการ์ด (desc) โชว์ดิบ ๆ ไม่แปลง **เน้น** — ห้ามใส่ดอกจัน */
const DESCS = {
  "การตัด": {
    "ตัดเต็มหลา":
      "ผ้าเต็มผืน 140 × 90 ซม. ต่อ 1 หลา ไม่ตัดแบ่ง · สั่งเกิน 4 หลา ร้านแบ่งเป็นผืนละไม่เกิน 4 หลา\n" +
      "เย็บ/โพ้งขอบ = ค่าเจียนขอบ +25 บาท/ผืน",
    "ตัดแบ่งตามขนาด": "ระบุขนาดชิ้น ระบบคำนวณจำนวนชิ้นต่อหลาและค่าตัดให้อัตโนมัติ",
    "สั่งทำพิเศษ (คุยกับแอดมิน)":
      "งานนอกตาราง — กว้างเกิน 140 ซม. · ยาวเกิน 360 ซม. · เย็บ/ตัดพิเศษ · ผ้านอกรายการ\n" +
      "แจ้งรายละเอียดด้านล่างแล้วทักไลน์ ร้านตีราคาก่อนเริ่มงาน",
  },
  "การเก็บขอบ": {
    "ไม่เย็บขอบ": "ขอบตัดเรียบ ไม่เย็บเก็บริม",
    "เย็บขอบ": "พับเก็บขอบด้านละ 1 ซม. ขอบเรียบหนา · เลือกสีไหมได้ 13 สี",
    "โพ้งขอบ": "โพ้งริมผ้า 4 ด้าน กันลุ่ย ขอบบางกว่าเย็บขอบ · ไหมขาวอย่างเดียว",
  },
  "เจาะรูแขวนผนัง": {
    "ไม่เจาะรู": "ผ้าเรียบไม่เจาะรู — แขวนด้วยคลิปหนีบ/รางแขวนเองได้",
    "เจาะ 2 รู ด้านบน": "ตาไก่ 2 ตัว (1 คู่) มุมบนซ้าย-ขวา ร้อยเชือก/เกี่ยวตะขอ",
    "เจาะทั้ง 4 รู": "ตาไก่ 4 ตัว (2 คู่) บน-ล่าง แขวนได้ตึงทั้งผืน",
  },
};

/* hint ใต้ช่องกรอกก็โชว์ดิบ ๆ เหมือน desc — ที่เขียน **ด้านที่ยาวที่สุด** ไว้เลยขึ้นดอกจันติดหน้าจอ */
const HINTS = {
  "ขนาดชิ้นงาน (กว้าง)":
    "ขนาดต่อชิ้น ใหญ่สุด 140 × 90 ซม. (1 หลา) · ค่าตัด/เย็บขอบคิดจากด้านที่ยาวที่สุด × จำนวนชิ้นที่ตัดได้ต่อหลา",
};

let changed = 0;
for (const o of d.options ?? []) {
  const note = NOTES[o.label];
  if (note && o.note !== note) {
    console.log(`note [${o.label}]  ${o.note?.length ?? 0} → ${note.length} ตัวอักษร`);
    o.note = note;
    changed++;
  }
  const hint = HINTS[o.label];
  if (hint && o.input && o.input.hint !== hint) {
    console.log(`hint [${o.label}]  ${o.input.hint?.length ?? 0} → ${hint.length} ตัวอักษร`);
    o.input.hint = hint;
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
