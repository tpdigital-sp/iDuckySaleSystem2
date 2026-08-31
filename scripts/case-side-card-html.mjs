/**
 * เคสมือถือ — ก๊อปการ์ด 📱 "สั่งคละรุ่น / คละลาย ยังไง" แบบอินโฟกราฟิก ไปให้ครบทุกตัว
 * (ผู้ใช้สั่ง 31 ส.ค. 69)
 *
 * ทั้ง 7 ตัวมีท่อนเนื้อหาหัวข้อเดียวกันอยู่แล้ว แต่มีแค่ case-frame-card ที่เป็น HTML จัดรูปแบบ
 * (ขั้นตอน 1-2-3 · กล่องเขียว/ฟ้า · แผนภาพ 3+3+3+2) — ตัวอื่นยังเป็นข้อความเปล่า
 * สคริปต์นี้ยกก้อน html ของ frame-card ไปวางให้อีก 6 ตัว (ข้อความเดิมยังอยู่เป็นตัวสำรอง
 * เพราะหน้าสินค้าจะใช้ html ก่อนเสมอ ไม่มีค่อยตกไปใช้ text)
 *
 * ⚠️ เนื้อการ์ดไม่มีชื่อรุ่นสินค้าอยู่ในนั้น (พูดกลาง ๆ ว่า "รุ่นมือถือ") — ใช้ร่วมกันได้ทั้ง 7 ตัว
 *    หัวข้อ "รายละเอียดสินค้า …" ด้านบนหน้าจอเป็นตัวเติมชื่อสินค้าเองอยู่แล้ว
 *
 *   node scripts/case-side-card-html.mjs            # ดูก่อน (ไม่เขียน)
 *   node scripts/case-side-card-html.mjs --write
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const SRC = "case-frame-card";
const HEADING = "📱 สั่งคละรุ่น / คละลาย ยังไง";
const TARGETS = ["case-premium-clear", "case-premium-edge", "case-magsafe", "case-mirror", "case-glass", "case-card"];

const env = readFileSync(".env.local", "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2].replace(/^["']|["']$/g, "");
  return a;
}, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const secOf = (data) => (data.body ?? []).findIndex((b) => (b?.heading ?? "").trim() === HEADING);

const { data: srcRow, error: srcErr } = await sb.from("products").select("data").eq("id", SRC).maybeSingle();
if (srcErr || !srcRow) throw new Error(srcErr?.message || `ไม่พบสินค้าต้นทาง ${SRC}`);
const srcAt = secOf(srcRow.data);
const srcSec = srcAt >= 0 ? srcRow.data.body[srcAt] : null;
if (!srcSec?.html?.trim()) throw new Error(`${SRC}: ไม่เจอการ์ด "${HEADING}" ที่เป็น HTML`);
// กันยกของผิด: การ์ดต้องพูดถึงปุ่มเดียว ไม่ใช่ปุ่ม ➕ ที่ถอดออกไปแล้ว
if (srcSec.html.includes("➕")) throw new Error(`${SRC}: การ์ดยังอ้างปุ่ม ➕ อยู่ — รัน case-lot-to-cart.mjs --write ก่อน`);
console.log(`ต้นทาง ${SRC}: การ์ด ${srcSec.html.length.toLocaleString()} ตัวอักษร\n`);

for (const id of TARGETS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).maybeSingle();
  if (error || !row) throw new Error(error?.message || `ไม่พบสินค้า ${id}`);
  const data = row.data;
  const at = secOf(data);
  if (at < 0) throw new Error(`${id}: ไม่มีท่อน "${HEADING}" ให้ใส่การ์ด (คาดว่าต้องมีทุกตัว)`);

  const had = (data.body[at].html ?? "").trim();
  if (had === srcSec.html.trim()) {
    console.log(`${id}: การ์ดตรงกับต้นทางอยู่แล้ว — ข้าม`);
    continue;
  }
  // เก็บ text เดิมไว้เป็นตัวสำรอง · เอาแค่ html/align ของต้นทางมา (slot/heading ของเดิมถูกอยู่แล้ว)
  data.body[at] = { ...data.body[at], html: srcSec.html, ...(srcSec.align ? { align: srcSec.align } : {}) };
  data.savedAt = new Date().toISOString();

  console.log(`${id}: ${had ? `เขียนทับการ์ดเดิม (${had.length.toLocaleString()} ตัวอักษร)` : "ใส่การ์ดใหม่"}`);

  if (WRITE) {
    const { error: e } = await sb.from("products").update({ data }).eq("id", id);
    if (e) throw e;
    // อ่านกลับมายืนยัน — เคยเจอ update ผ่านแต่ค่าไม่ลง
    const { data: back } = await sb.from("products").select("data").eq("id", id);
    const b = back?.[0]?.data;
    const bAt = secOf(b ?? { body: [] });
    if (bAt < 0 || (b.body[bAt].html ?? "").trim() !== srcSec.html.trim())
      throw new Error(`${id}: เขียนแล้วแต่ค่าที่อ่านกลับไม่ตรง`);
  }
}
console.log(WRITE ? "\n✅ เขียนเรียบร้อย (อ่านกลับยืนยันแล้วทุกตัว)" : "\n👀 dry-run — เติม --write เพื่อเขียนจริง");
