/**
 * Shake Shake Acrylic (พวงกุญแจเขย่า) — เพิ่มกลุ่ม "วิธีปิดกรอบ" (ผู้ใช้สั่ง 26 ส.ค. 69):
 *
 *   ติดกาวปิดถาวร (แบบมาตรฐาน)  |  ติดแม่เหล็ก (เปิด-ปิดได้)
 *   ทั้งสองแบบ **ไม่คิดเพิ่ม** (0 บาท) — ผู้ใช้ยืนยัน 26 ส.ค. 69
 *
 * วางไว้ต่อจากกลุ่ม "ขนาดกรอบเขย่า" (เรื่องตัวกรอบอยู่ด้วยกัน) ก่อนกลุ่มตะขอ
 * เป็นกลุ่มเลือกอย่างเดียว (pill) — คำอธิบายทั้งสองแบบใส่ใน note ของกลุ่ม
 * เพราะแถบ pill ไม่เรนเดอร์ desc รายตัวเลือก (ดู ProductDetail.tsx ~2429)
 *
 *   node scripts/shake-shake-closure.mjs            # ดูสิ่งที่จะแก้ (ไม่เขียนจริง)
 *   node scripts/shake-shake-closure.mjs --write    # เขียนลง Supabase
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "new-mt2rp5i3-9488";
const LABEL = "วิธีปิดกรอบ";
const AFTER = "ขนาดกรอบเขย่า"; // แทรกต่อจากกลุ่มนี้
const GROUP = {
  label: LABEL,
  note:
    "เลือกได้ว่าจะให้กรอบปิดตายหรือเปิดได้ — **ติดกาวปิดถาวร** ประกบแน่น ตัวน้อยไม่หลุด (แบบมาตรฐานของร้าน) · " +
    "**ติดแม่เหล็ก** ฝังแม่เหล็กที่มุมกรอบ แกะเปิดเองได้ เปลี่ยน/เพิ่มตัวน้อยข้างในทีหลังได้ " +
    "(ปิดสนิทน้อยกว่าแบบกาว ไม่แนะนำถ้าพกห้อยกระเป๋าตลอด) · **ทั้งสองแบบราคาเท่ากัน ไม่คิดเพิ่ม**",
  choices: [
    { name: "ติดกาวปิดถาวร", popular: true },
    { name: "ติดแม่เหล็ก (เปิด-ปิดได้)" },
  ],
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
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const data = row.data;
const opts = (data.options ??= []);

// ⚠️ ห้ามชนแกนตารางราคา — กลุ่มใหม่ต้องไม่ใช่ชื่อใน driverLabels ของเรทไหน (ดู [[iducky-price-driver-trap]])
const drivers = new Set(
  [data.pricing, ...(data.priceRates ?? []).map((r) => r.pricing)].flatMap((p) => p?.driverLabels ?? [])
);
if (drivers.has(LABEL)) throw new Error(`❌ "${LABEL}" ชนกับแกนตารางราคา — เปลี่ยนชื่อกลุ่ม`);

const at = opts.findIndex((o) => o.label === LABEL);
if (at >= 0) {
  opts[at] = { ...opts[at], ...GROUP };
  console.log(`อัปทับกลุ่ม "${LABEL}" (ตำแหน่งเดิม #${at + 1})`);
} else {
  const after = opts.findIndex((o) => o.label === AFTER);
  const pos = after >= 0 ? after + 1 : opts.length;
  opts.splice(pos, 0, GROUP);
  console.log(`เพิ่มกลุ่ม "${LABEL}" ที่ตำแหน่ง #${pos + 1}${after < 0 ? " (ไม่เจอกลุ่ม " + AFTER + " → ต่อท้าย)" : ""}`);
}

console.log(`  ตัวเลือก: ${GROUP.choices.map((c) => `${c.name} (+0)`).join(" | ")}`);
console.log(`  ลำดับกลุ่มทั้งหมด: ${opts.map((o) => o.label).join(" › ")}`);

if (WRITE) {
  const { error: e } = await sb.from("products").update({ data }).eq("id", ID);
  if (e) throw e;
}
console.log(WRITE ? "✅ เขียนเรียบร้อย" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
