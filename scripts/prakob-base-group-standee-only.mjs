/**
 * 🙈 อะคริลิคประกบ — ซ่อนกลุ่ม "ฐาน" ในเรทที่เลือกไม่ได้อยู่แล้ว
 * เจ้าของร้านสั่ง 21 ก.ย. 69: "ถ้าพวงกุญแจอะคริลิคประกบ ไม่ต้องแสดงกลุ่มฐาน"
 * (เรทพวงกุญแจมีช่องราคาเฉพาะ "ไม่มีฐาน (พวงกุญแจ)" → หน้าร้านโชว์เป็นชิป 🔒 ล็อกใบเดียว รกเปล่า ๆ)
 *
 * ตั้ง showWhen ของกลุ่ม "ฐาน" = เรทที่ **มีฐานให้เลือกมากกว่า 1 แบบจริง ๆ** (อ่านจากคีย์ในตารางแต่ละเรท)
 * → ตอนนี้เหลือโชว์เฉพาะเรทสแตนดี้ · เพิ่มเรทใหม่ทีหลังแล้วรันซ้ำ ระบบจะจัดให้เอง
 *
 * ⚠️ "ฐาน" เป็นแกนตารางราคา — ซ่อนได้ แต่ค่าต้องยังติดไปกับตะกร้า/ออเดอร์เสมอ
 *    (ProductDetail ยกเว้น priceDriverLabels ไว้ให้แล้ว · resolveSelections เติมค่าที่มีราคาในเรทนั้นให้เอง)
 *
 * ข้อมูลล้วน ไม่ต้อง deploy · รันซ้ำได้ · --dry = ดูอย่างเดียว
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const ID = "acrylic-prakob";
const BASE = "ฐาน";
const RATE_LABEL = "เรทราคา";
const DRY = process.argv.includes("--dry");
const die = (m) => { console.error("✗ " + m); process.exit(1); };

const env = fs.readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: row, error } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
if (error || !row) die(error?.message || "ไม่พบสินค้า " + ID);
const p = row.data;
const base = (p.options || []).find((o) => o.label.trim() === BASE);
if (!base) die(`ไม่พบกลุ่ม "${BASE}"`);

/** ฐานกี่แบบที่ "มีช่องราคาจริง" ในเรทนี้ */
const basesOf = (m) => {
  const di = (m?.driverLabels || []).indexOf(BASE);
  if (di < 0) return [];
  return [...new Set(Object.keys(m.cells || {}).map((k) => k.split("│")[di]))];
};
const rates = p.priceRates || [];
if (!rates.length) die("สินค้านี้ไม่มีเรทราคา — สคริปต์นี้ใช้กับสินค้าหลายเรทเท่านั้น");
const report = rates.map((r) => ({ label: r.label, bases: basesOf(r.pricing) }));
const showIn = report.filter((r) => r.bases.length > 1).map((r) => r.label);
if (!showIn.length) die("ไม่มีเรทไหนเลือกฐานได้เกิน 1 แบบ — ถ้าจะซ่อนทั้งหมดต้องสั่งเอง (กันพลาด)");

base.showWhen = { label: RATE_LABEL, choices: showIn };
p.savedAt = new Date().toISOString();

for (const r of report) console.log(`${r.bases.length > 1 ? "โชว์" : "ซ่อน"} · ${r.label} · ฐานที่มีราคา: ${r.bases.join(" / ") || "-"}`);
if (DRY) {
  console.log(JSON.stringify(base.showWhen, null, 1));
  console.log("— dry-run · ตัด --dry ออกเพื่อเขียนจริง");
  process.exit(0);
}
const up = await sb.from("products").update({ data: p }).eq("id", ID).select("data");
if (up.error) die(up.error.message);
if (!up.data?.length) die("update ไม่โดนแถวไหนเลย (0 แถว)");

const { data: back } = await sb.from("products").select("data").eq("id", ID).maybeSingle();
const q = back?.data;
if (q?.savedAt !== p.savedAt) die("อ่านกลับ savedAt ไม่ตรง — ค่าไม่ลงจริง");
const qb = (q.options || []).find((o) => o.label.trim() === BASE);
if (qb?.showWhen?.label !== RATE_LABEL || qb.showWhen.choices.join("|") !== showIn.join("|"))
  die("อ่านกลับ showWhen ของกลุ่มฐานไม่ตรง");
console.log("✅ บันทึกแล้ว + อ่านกลับตรวจครบ · กลุ่มฐานโชว์เฉพาะ: " + showIn.join(" · "));
