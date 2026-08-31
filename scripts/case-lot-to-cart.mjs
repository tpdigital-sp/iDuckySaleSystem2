/**
 * เคสมือถือ 7 ตัว — กด ➕ แล้ว "หย่อนลงตะกร้าทันที" ไปนับจำนวนกันต่อในตะกร้า (ผู้ใช้สั่ง 31 ส.ค. 69)
 *
 * ของเดิม (โหมดพักไว้ในหน้า แบบ Sticker-uv): ตั้งรุ่นที่ 1 → ➕ ระบบเก็บไว้ในหน้า → ตั้งรุ่นที่ 2 …
 * → กดสั่งทีเดียว ทุกรุ่นถึงจะลงตะกร้าพร้อมกัน · ปิดหน้าไป = ของที่พักไว้หายหมด
 *
 * ของใหม่: กด ➕ แล้วรุ่นนั้นลงตะกร้าเลยเป็นบรรทัดของตัวเอง แล้วฟอร์มเปิดรับรุ่นถัดไปต่อ
 * จำนวน/การลบไปจัดการกันที่ตะกร้า (ตะกร้ารวมยอดทั้งล็อตคิดราคาขั้นบันไดให้อยู่แล้ว — repriceCartGroups)
 *
 * ทำอะไร (ต่อสินค้า 1 ตัว):
 *   1. lotToCart = true                     สวิตช์โหมดที่หน้าสินค้าอ่าน (ดู Product.lotToCart)
 *   2. แก้ข้อความวิธีสั่งให้ตรงโฟลว์ใหม่     — การ์ด 📱 ข้างแผงสั่งซื้อ (ขั้นที่ 2/3) + แท็บ/FAQ
 *
 * ⚠️ ไม่แตะกติกาขั้นต่ำ/ค่าคละ (minPerDesign 3 · underMinPieceFee 5 · freeMixBelowQty 11) —
 *    ราคายังคิดจากยอดรวมทุกรุ่นเหมือนเดิม เปลี่ยนแค่ "ของเข้าตะกร้าตอนไหน"
 *
 *   node scripts/case-lot-to-cart.mjs                      # ดูก่อน (ไม่เขียน)
 *   node scripts/case-lot-to-cart.mjs --write --flag-only  # เปิดสวิตช์อย่างเดียว ยังไม่แตะข้อความ
 *   node scripts/case-lot-to-cart.mjs --write              # เปิดสวิตช์ + แก้ข้อความวิธีสั่ง
 *
 * ⚠️ ลำดับที่ปลอดภัย: หน้าเว็บที่ deploy อยู่ยังเป็นโค้ดเก่า (กด ➕ = พักไว้ในหน้า) —
 *    เขียนข้อความใหม่ก่อน deploy = ลูกค้าอ่านว่า "ลงตะกร้าแล้ว" ทั้งที่ยังไม่ลง
 *    จึงเปิดสวิตช์ด้วย --flag-only ไปก่อน (โค้ดเก่าไม่รู้จักฟิลด์นี้ ไม่มีอะไรเปลี่ยน)
 *    แล้วค่อยรันเต็ม ๆ ตอน deploy โค้ดใหม่ขึ้นไปแล้ว
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
/** เปิดสวิตช์อย่างเดียว ยังไม่แก้ข้อความวิธีสั่ง (ใช้ตอนโค้ดใหม่ยังไม่ deploy — ดูหัวไฟล์) */
const FLAG_ONLY = process.argv.includes("--flag-only");

const IDS = [
  "case-frame-card",
  "case-premium-clear",
  "case-premium-edge",
  "case-magsafe",
  "case-mirror",
  "case-glass",
  "case-card",
];

/**
 * ข้อความเดิม → ใหม่ (ไล่ตามลำดับ) · รันซ้ำได้: รอบสองหาไม่เจอก็ข้ามไป ไม่พัง
 * ⚠️ ลำดับสำคัญ — คู่แรกกินคำว่า "กดสั่งทีเดียว" ในประโยคแท็บไปแล้ว คู่ของการ์ด (ที่มีแท็ก HTML คร่อม)
 *    จึงต้องอยู่หลัง ไม่งั้นแทนที่ผิดจุด
 */
const TEXT_SWAPS = [
  // ① แท็บ "วิธีสั่งงาน" + FAQ (มีทุกตัว)
  [
    "แล้วกดปุ่ม “➕ เพิ่มอีกรุ่น (คนละแบบ)” เพื่อตั้งค่ารุ่นถัดไป แล้วค่อยกดสั่งทีเดียว",
    "แล้วกดปุ่ม “➕ ใส่ตะกร้า แล้วตั้งรุ่นถัดไป” — รุ่นนั้นลงตะกร้าทันที แล้วตั้งรุ่นถัดไปต่อได้เลย (จำนวนแก้ทีหลังที่ตะกร้าได้)",
  ],
  // ② การ์ด 📱 ข้างแผงสั่งซื้อ — ขั้นที่ 2
  ["กด “➕ เพิ่มอีกรุ่น (คนละแบบ)”", "กด “➕ ใส่ตะกร้า แล้วตั้งรุ่นถัดไป”"],
  [
    "ระบบเก็บรุ่นที่ 1 ไว้ให้ แล้วเปิดฟอร์มรุ่นถัดไป — ทำซ้ำจนครบ (แต่ละรุ่นแนบลายของตัวเองได้)",
    "รุ่นที่ 1 ลงตะกร้าทันที แล้วเปิดฟอร์มรุ่นถัดไปให้ — ทำซ้ำจนครบ (แต่ละรุ่นแนบลายของตัวเองได้)",
  ],
  // ③ การ์ด 📱 — ขั้นที่ 3 (คร่อมแท็กไว้ กันไปชนคำเดียวกันในประโยคอื่น)
  [">กดสั่งทีเดียว</b>", ">นับจำนวนกันที่ตะกร้า</b>"],
  [
    "ทุกรุ่นลงตะกร้าพร้อมกัน แยกเป็นคนละรายการตามรุ่น",
    "ทุกรุ่นอยู่ในตะกร้าเป็นคนละรายการ — แก้จำนวน/ลบได้ที่ตะกร้า ราคานับยอดรวมทุกรุ่นให้เอง",
  ],
];

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);

  // แก้ข้อความทั้งก้อนทีเดียว (ข้อความกระจายอยู่ใน body/tabs/seo) แล้วค่อยแปลงกลับเป็นออบเจกต์
  let json = JSON.stringify(row.data);
  let hits = 0;
  for (const [from, to] of FLAG_ONLY ? [] : TEXT_SWAPS) {
    const needle = JSON.stringify(from).slice(1, -1);
    const parts = json.split(needle);
    if (parts.length > 1) {
      hits += parts.length - 1;
      json = parts.join(JSON.stringify(to).slice(1, -1));
    }
  }
  const data = JSON.parse(json);

  const before = data.lotToCart === true;
  data.lotToCart = true;
  data.savedAt = new Date().toISOString();

  console.log(
    `${id}: lotToCart ${before ? "true (มีอยู่แล้ว)" : "— → true"} · ` +
      (FLAG_ONLY ? "ยังไม่แตะข้อความ (--flag-only)" : `แก้ข้อความ ${hits} จุด`)
  );
  if (!FLAG_ONLY && hits === 0)
    console.warn(`   ⚠️ ไม่เจอข้อความเดิมสักจุด — เช็คด้วยตาว่าคำอธิบายวิธีสั่งยังพูดถูกไหม`);

  if (WRITE) {
    const { error: e } = await sb.from("products").update({ data }).eq("id", id);
    if (e) throw e;
    // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
    const { data: back } = await sb.from("products").select("data").eq("id", id);
    if (back?.[0]?.data?.lotToCart !== true) throw new Error(`${id}: เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง`);
  }
}
console.log(WRITE ? "✅ เขียนเรียบร้อย (อ่านกลับยืนยันแล้วทุกตัว)" : "👀 dry-run — เติม --write เพื่อเขียนจริง");
