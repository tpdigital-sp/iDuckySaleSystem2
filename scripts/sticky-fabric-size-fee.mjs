// STICKY FABRIC: ตัวเลือก "นิ้วละ 15 บาท (2.54 cm)" ตั้ง qty ไว้แต่ลืม extra → ลูกค้าเพิ่มขนาดแล้วไม่ถูกคิดเงิน
// เติม extra: 15 ให้ตรงกับชื่อ (นิ้วละ 15 บาท) — รันซ้ำได้ · dry-run ก่อน ใส่ --write ถึงเขียนจริง
// node scripts/sticky-fabric-size-fee.mjs [--write]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const ID = "sticky-fabric";
const GROUP = "เพิ่มขนาด";
const CHOICE = "นิ้วละ 15 บาท (2.54 cm)";
const FEE = 15;

const die = (msg) => {
  console.error("✗", msg);
  process.exit(1);
};

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) die(error.message);

const data = row.data;
const opt = (data.options ?? []).find((o) => o.label === GROUP);
if (!opt) die(`ไม่พบกลุ่ม "${GROUP}"`);
const choice = (opt.choices ?? []).find((c) => c.name === CHOICE);
if (!choice) die(`ไม่พบตัวเลือก "${CHOICE}" ในกลุ่ม "${GROUP}"`);
if (!choice.qty) die("ตัวเลือกไม่ได้เป็นแบบระบุจำนวน (qty) — โครงข้อมูลไม่ตรงที่คาด อย่าเขียนทับ");

if (choice.extra === FEE) {
  console.log("✓ extra =", FEE, "อยู่แล้ว ไม่ต้องแก้");
  process.exit(0);
}
console.log(`จะตั้ง extra: ${choice.extra ?? "(ไม่มี)"} → ${FEE} ให้ "${CHOICE}"`);
if (!WRITE) {
  console.log("(dry-run — ใส่ --write เพื่อเขียนจริง)");
  process.exit(0);
}

choice.extra = FEE;
data.savedAt = new Date().toISOString();

const { data: upd, error: e2 } = await sb
  .from("products")
  .update({ data })
  .eq("id", ID)
  .select("data");
if (e2) die(e2.message);
if (!upd?.length) die("update โดน 0 แถว — ไม่มีอะไรถูกเขียน");

// อ่านกลับมาเทียบค่าจริง (อย่าเชื่อว่าไม่ error = สำเร็จ) — เช็ครูปร่างค่าจริง ไม่เทียบตัวแปรกับตัวแปร
const { data: back, error: e3 } = await sb.from("products").select("data").eq("id", ID).single();
if (e3) die(e3.message);
const bChoice = (back.data.options ?? [])
  .find((o) => o.label === GROUP)
  ?.choices?.find((c) => c.name === CHOICE);
if (typeof bChoice?.extra !== "number" || bChoice.extra !== FEE) die(`อ่านกลับไม่ตรง: extra = ${bChoice?.extra}`);
if (back.data.savedAt !== data.savedAt) die("อ่านกลับไม่ตรง: savedAt ไม่ใช่ค่าที่เพิ่งตั้ง");
console.log("✓ เขียนแล้ว extra =", bChoice.extra, "· savedAt =", back.data.savedAt);
