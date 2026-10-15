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

/**
 * 🚀 อัปหลายไฟล์ทีเดียว (จอสร้างปฏิทิน 16–52 ไฟล์ต่อครั้ง · 15 ต.ค. 69 ผู้ใช้แจ้ง "อัปโหลดค่อนข้างนาน")
 * เดิมทีละไฟล์ = ขอตั๋ว (~0.6 วิ) + ยิงเข้า Supabase ทีละ 3 ไฟล์ → 16 หน้า ~10 วิ+
 * ตอนนี้ขอตั๋วทั้งชุดในคำขอเดียว แล้วยิงพร้อมกันทีละ `parallel` ไฟล์ · ไฟล์ไหนไม่ผ่าน → ถอยไปทางเดิมทีละไฟล์ (uploadArtworkFile)
 * คืน url ตามลำดับเดียวกับ files · ไฟล์ที่พังจริง = โยน Error (เหมือน uploadArtworkFile)
 */
export async function uploadArtworkFiles(files: File[], parallel = 6): Promise<string[]> {
  for (const f of files) {
    const bad = checkArtworkFile(f);
    if (bad) throw new Error(bad);
  }
  const r = await uploadArtworkFilesSettled(files, parallel);
  const bad = r.find((x): x is Error => x instanceof Error);
  if (bad) throw bad;
  return r as string[];
}

/** แบบเดียวกับ uploadArtworkFiles แต่ไฟล์ที่พังไม่ล้มทั้งชุด — ช่องนั้นเป็น Error (รูปต้นฉบับ: อัปไม่ขึ้นก็ยังสั่งได้) */
export async function uploadArtworkFilesSettled(files: File[], parallel = 6): Promise<(string | Error)[]> {
  if (!files.length) return [];
  let tickets: (SignResult & { ok?: boolean })[] = [];
  const sb = getSupabase();
  if (sb && files.length > 1) {
    try {
      const res = await fetch("/api/orders/artwork/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: files.map((f) => ({ type: f.type, size: f.size })) }),
      });
      const j = (await res.json().catch(() => null)) as { items?: (SignResult & { ok?: boolean })[]; error?: string } | null;
      if (res.status === 429 && j?.error) throw new Error(j.error);
      if (res.ok && Array.isArray(j?.items) && j.items.length === files.length) tickets = j.items;
    } catch (e) {
      if (e instanceof Error && /ถี่เกินไป/.test(e.message)) throw e;
      /* ขอตั๋วทั้งชุดไม่ได้ (เซิร์ฟเวอร์รุ่นเก่า/เน็ตหลุด) → ทีละไฟล์ด้านล่าง */
    }
  }
  const out: (string | Error)[] = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next++;
      const f = files[i];
      const t = tickets[i];
      if (sb && t?.token && t.path && t.url) {
        const { error } = await sb.storage.from(t.bucket || BUCKET).uploadToSignedUrl(t.path, t.token, f, { contentType: f.type });
        if (!error) {
          out[i] = t.url;
          continue;
        }
      }
      try {
        out[i] = await uploadArtworkFile(f);
      } catch (e) {
        out[i] = e instanceof Error ? e : new Error("อัปโหลดไม่สำเร็จ");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, files.length) }, worker));
  return out;
}
