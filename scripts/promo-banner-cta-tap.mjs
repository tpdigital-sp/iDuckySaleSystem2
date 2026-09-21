/**
 * 👆 วงแหวน "เรียกให้กด" ครอบปุ่มที่อยู่ในรูปป้ายประชาสัมพันธ์ — เจ้าของร้านสั่ง 21 ก.ย. 69
 *    "ขยับตรงจุดสั่งของ ดูสิทธิ์ สมัครตัวแทน"
 *
 * ปุ่มพวกนี้ถูกวาดมาในไฟล์ภาพ (กราฟฟิกทำมาทั้งใบ) จะสั่งให้มันเด้งเองไม่ได้
 * จึงวางชิ้นลูกเล่น anim "tap" (วงแหวนทรงแคปซูล วาดด้วย CSS ไม่ต้องมีรูป) ทับตำแหน่งปุ่มแล้วให้วงแหวนกระเพื่อมแทน
 *
 * ตำแหน่งวัดจากไฟล์ภาพจริงด้วยการไล่สีพื้นปุ่ม (flood fill) แล้วเผื่อขอบรอบปุ่มนิดหน่อย — หน่วยเป็น % ของป้าย
 * ⚠️ ตำแหน่งผูกกับ "รูปใบนั้น" — กราฟฟิกเปลี่ยนรูปเมื่อไหร่ต้องวัดใหม่ (หลังบ้านถอด layers ให้เองตอนเปลี่ยนรูป)
 * ⚠️ anim "tap" ต้องมีโค้ดรุ่น 21 ก.ย. 69 ขึ้นไป — เว็บจริงที่ยังไม่ deploy จะกรองชิ้นนี้ทิ้ง (ป้ายไม่พัง แค่ไม่มีวงแหวน)
 *
 * รัน: node --env-file=.env.local scripts/promo-banner-cta-tap.mjs [--dry] [--off] [id ...]
 *   --dry เห็นผลก่อนไม่บันทึก · --off ถอดวงแหวนออก
 */
import { createClient } from "@supabase/supabase-js";

const ROW_ID = "__promo_banners__";
const DRY = process.argv.includes("--dry");
const OFF = process.argv.includes("--off");
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("--"));

/** x,y = มุมซ้ายบนของวงแหวน · w,h = ขนาดวงแหวน (ทั้งหมดเป็น % ของป้าย) · สีวงเลือกให้ตัดกับพื้นตรงนั้น */
const CTA = {
  "web-order-24h": { d: [34.1, 69.3, 20.3, 15.9], m: [40.9, 68.6, 27.8, 10.8], color: "#FFB627" }, // ปุ่ม "เริ่มสั่งเลย" กรมท่า
  "early-pay": { d: [8.4, 68.4, 16.5, 15.4], m: [16.7, 71.9, 21.6, 12.7], color: "#FFFFFF" }, // ปุ่ม "สั่งเลย" ส้ม
  "member-tier": { d: [30.6, 58.5, 16.8, 14.5], m: [34.1, 41.6, 27.0, 11.8], color: "#FFFFFF" }, // ปุ่ม "ดูสิทธิ์ของฉัน" เหลือง
  dealer: { d: [42.1, 64.8, 19.0, 14.8], m: [42.1, 57.2, 18.9, 8.9], color: "#FFB627" }, // ปุ่ม "สมัครตัวแทน" เขียว
};

const ring = ([x, y, w, h], color) => [{ x, y, w, h, anim: "tap", color }];

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data, error } = await sb.from("products").select("data").eq("id", ROW_ID).maybeSingle();
if (error || !data) throw new Error(`อ่านแถวป้ายไม่ได้: ${error?.message ?? "ไม่มีแถว"}`);

const set = data.data.banners;
let touched = 0;
for (const b of set.items) {
  const cta = CTA[b.id];
  if (!cta || (ONLY.length && !ONLY.includes(b.id))) continue;
  if (OFF) {
    delete b.layers;
    delete b.layersMobile;
  } else {
    b.layers = ring(cta.d, cta.color);
    if (b.imageMobile) b.layersMobile = ring(cta.m, cta.color);
  }
  touched++;
  console.log(`${OFF ? "ถอดวงแหวน" : "ใส่วงแหวน"} ${b.id}${OFF ? "" : ` → จอคอม [${cta.d}] มือถือ ${b.imageMobile ? `[${cta.m}]` : "(ไม่มีไฟล์มือถือ)"}`}`);
}
if (!touched) throw new Error("ไม่มีป้ายที่ตรงกับรายการ — เช็ค id");

if (DRY) {
  console.log("(dry) ไม่ได้บันทึก");
} else {
  const { error: e2 } = await sb.from("products").update({ data: { ...data.data, banners: set } }).eq("id", ROW_ID);
  if (e2) throw new Error(`บันทึกไม่สำเร็จ: ${e2.message}`);
  console.log(`บันทึกแล้ว ${touched} ใบ — หน้าแรกจะเห็นภายใน ~1 นาที (แคช API)`);
}
