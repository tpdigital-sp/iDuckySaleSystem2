"use client";

import { getSupabase } from "./supabase";

/**
 * อัปโหลด "ภาพลาย" ของลูกค้า — ใช้ร่วมกันทั้งหน้าสินค้า หน้าออเดอร์หลังบ้าน และช่องเพิ่มรายการ
 *
 * 🐞 บั๊กที่แก้: สั่งผ่านมือถือแล้วขึ้น "อัปโหลดไม่สำเร็จ" ลอย ๆ
 *    Netlify Functions รับ body ได้ ~6MB (นับแบบ base64 = ไฟล์จริงราว 4.5MB)
 *    รูปจากกล้องมือถือไฟล์ละ 4-10MB จึงถูกตัดตั้งแต่ยังไม่ถึงโค้ดเรา และ Netlify ตอบเป็นหน้า error
 *    ที่ไม่ใช่ JSON → หน้าเว็บอ่าน error ไม่ได้ เลยขึ้นข้อความ fallback เปล่า ๆ
 *
 * วิธีแก้: ขอ "ตั๋วอัปโหลด" จากเซิร์ฟเวอร์ แล้วให้เบราว์เซอร์ยิงไฟล์เข้า Supabase Storage ตรง ๆ
 *          (ไฟล์ไม่ผ่าน function → ไม่ติดเพดาน · ได้ไฟล์ต้นฉบับเต็มตามนโยบาย)
 *          ถ้าขอตั๋วไม่ได้ค่อยถอยไปใช้เส้นเดิม /api/orders/artwork เหมือนก่อน
 */

/** เพดานไฟล์ของระบบ (ใหญ่กว่านี้ให้ลูกค้าแนบเป็นลิงก์ไฟล์แทน) */
export const ARTWORK_MAX_BYTES = 15 * 1024 * 1024;

/** ขนาดที่ยังส่งผ่าน API route ได้ชัวร์ (เผื่อ base64 บวมของ Netlify) */
const PROXY_SAFE_BYTES = 4 * 1024 * 1024;

const BUCKET = "customer-artwork";

type SignResult = { bucket?: string; path?: string; token?: string; url?: string; error?: string };

/** ชนิดไฟล์ที่รับ — เช็คฝั่งเว็บก่อนเพื่อบอกเหตุผลเป็นภาษาคน (มือถือบางรุ่นส่ง HEIC มา) */
export function checkArtworkFile(f: File): string | null {
  if (/^image\/(heic|heif)$/i.test(f.type) || /\.(heic|heif)$/i.test(f.name))
    return `“${f.name}” เป็นไฟล์ HEIC ของ iPhone — ตั้งค่า iPhone เป็น กล้อง › รูปแบบ › “รองรับมากที่สุด” หรือส่งรูปเข้าแชทตัวเองแล้วเซฟกลับมาเป็น JPG`;
  if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) return `“${f.name}” ไม่ใช่ไฟล์รูป JPG / PNG / WEBP`;
  if (f.size > ARTWORK_MAX_BYTES)
    return `“${f.name}” ใหญ่เกิน ${ARTWORK_MAX_BYTES / 1024 / 1024}MB — แนบเป็นลิงก์ไฟล์แทนได้`;
  return null;
}

/** อัปโหลดไฟล์เดียว คืน public url — โยน Error พร้อมข้อความภาษาไทยถ้าไม่สำเร็จ */
export async function uploadArtworkFile(file: File): Promise<string> {
  const bad = checkArtworkFile(file);
  if (bad) throw new Error(bad);

  // ── ทางหลัก: ยิงตรงเข้า Supabase ด้วยตั๋วอัปโหลด ──────────────────────────
  const sb = getSupabase();
  if (sb) {
    let sign: SignResult | null = null;
    let signStatus = 0;
    try {
      const res = await fetch("/api/orders/artwork/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: file.type, size: file.size }),
      });
      signStatus = res.status;
      sign = (await res.json().catch(() => null)) as SignResult | null;
    } catch {
      /* เน็ตหลุดตอนขอตั๋ว — ลองทางสำรองต่อ */
    }
    // 400/429 = เราปฏิเสธเอง (ชนิดไฟล์/ใหญ่เกิน/ถี่เกิน) บอกเหตุผลตรง ๆ ไม่ต้องถอย
    if ((signStatus === 400 || signStatus === 429) && sign?.error) throw new Error(sign.error);
    if (sign?.token && sign.path && sign.url) {
      const { error } = await sb.storage
        .from(sign.bucket || BUCKET)
        .uploadToSignedUrl(sign.path, sign.token, file, { contentType: file.type });
      if (!error) return sign.url;
      // ยิงตรงไม่ผ่าน (เน็ตมือถือหลุดกลางทาง ฯลฯ) → ลองทางสำรองให้อีกที
    }
  }

  // ── ทางสำรอง: ส่งผ่าน API route เดิม (ไฟล์เล็กเท่านั้น) ───────────────────
  if (file.size > PROXY_SAFE_BYTES)
    throw new Error(
      `อัปโหลดไม่สำเร็จ — ไฟล์ “${file.name}” ใหญ่ ${(file.size / 1024 / 1024).toFixed(1)}MB ` +
        `เกินที่ส่งผ่านเซิร์ฟเวอร์ได้ตอนนี้ · ลองใหม่อีกครั้ง หรือย่อรูปให้เล็กลง แล้วแนบลิงก์ไฟล์ต้นฉบับคู่กัน`,
    );

  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try {
    res = await fetch("/api/orders/artwork", { method: "POST", body: fd });
  } catch {
    throw new Error("อัปโหลดไม่สำเร็จ — สัญญาณเน็ตหลุดระหว่างส่งไฟล์ ลองใหม่อีกครั้ง");
  }
  const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !j?.url) {
    if (j?.error) throw new Error(j.error);
    if (res.status === 413 || res.status === 502)
      throw new Error(`อัปโหลดไม่สำเร็จ — ไฟล์ “${file.name}” ใหญ่เกินที่เซิร์ฟเวอร์รับได้ ลองย่อรูปให้เล็กลง`);
    throw new Error(`อัปโหลดไม่สำเร็จ (รหัส ${res.status}) ลองใหม่อีกครั้ง`);
  }
  return j.url;
}
