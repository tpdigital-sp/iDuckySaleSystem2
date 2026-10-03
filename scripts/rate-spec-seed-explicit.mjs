/**
 * 🏷 ตั้ง workSpec ให้เรทที่เจ้าของร้านสั่งเป็นเคส ๆ (3 ต.ค. 69) — หลังเลิกตัดสเปคจาก desc อัตโนมัติ
 * เรทที่ไม่อยู่ในลิสต์ = ไม่มีบรรทัดสเปคเรท
 *   • สแตนดี้ตั้งโทรศัพท์ (1-2) แบบที่ 1–4 — กราฟฟิกไม่รู้ว่าไดคัทตามทรงหรือวางใน Template (OD-261001-6636)
 *   • ผ้าเชียร์ (2-2-2) สกรีน 1 ด้าน = เย็บโพ้ง (OD-261002-7187) · สแตนดาร์ด 2 ด้าน = เย็บประกบ ด้ายขาว
 * ⚠️ deploy โค้ดที่รู้จัก workSpec ก่อนรัน — หน้าแก้สินค้าเวอร์ชันเก่าบันทึกทับแล้วฟิลด์หาย
 * ใช้: node scripts/rate-spec-seed-explicit.mjs [--apply] · รันซ้ำได้
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

const SPECS = {
  "1-2": {
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 1": "ขนาด 16x16cm · ฐาน 7.5cm · อะคริลิคใส (เท่านั้น) ไดคัทตามทรง",
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 2": "ขนาด 15x7.5cm · ฐาน 7.5cm · อะคริลิคใส (เท่านั้น) ไดคัททรงสี่เหลี่ยมตาม Template · ปรับเพิ่ม-ลดขนาดไม่ได้",
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 3": "ตัวหลัง 15cm + ตัวหน้าตัวเล็ก · ฐาน 7cm · อะคริลิคใส ไดคัทตามทรง",
    "สแตนดี้ตั้งโทรศัพท์ แบบที่ 4": "สูง 15cm กว้างไม่เกิน 12cm · ฐานใหญ่ 21x8.5cm · อะคริลิคใส (เท่านั้น) ไดคัทตามทรง",
  },
  "2-2-2": {
    "ผ้าเชียร์ · สกรีน 1 ด้าน": "ผ้า 1 ชิ้น · เย็บโพ้งเก็บขอบรอบผืน",
    "สแตนดาร์ด · สกรีน 2 ด้าน (เย็บประกบ)": "ผ้า 2 ชิ้นเย็บประกบกัน เก็บขอบด้วยด้ายขาว",
  },
};

for (const [id, map] of Object.entries(SPECS)) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw error;
  const d = row.data;
  let n = 0;
  for (const [label, spec] of Object.entries(map)) {
    const r = d.priceRates.find((x) => x.label === label && !x.dealerOnly);
    if (!r) throw new Error(`${id} ไม่เจอเรท ${label}`);
    console.log(`${d.name} [${label}] ${r.workSpec === spec ? "✓ ตั้งแล้ว" : "→ " + spec}`);
    if (r.workSpec !== spec) (r.workSpec = spec), n++;
  }
  if (!apply || !n) continue;
  d.savedAt = new Date().toISOString();
  const { data: out, error: e2 } = await sb.from("products").update({ data: d }).eq("id", id).select("data");
  if (e2) throw e2;
  for (const [label, spec] of Object.entries(map)) {
    if (out?.[0]?.data.priceRates.find((x) => x.label === label && !x.dealerOnly)?.workSpec !== spec) throw new Error(`อ่านกลับไม่ตรง ${id} ${label}`);
  }
  console.log(`  ✓ เขียน ${n} เรท`);
}
