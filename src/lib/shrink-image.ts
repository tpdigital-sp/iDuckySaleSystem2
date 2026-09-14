"use client";

/**
 * 🗜️ ย่อรูป "ไว้ดู" ก่อนอัปโหลด — ทำในเบราว์เซอร์ ไม่ต้องพึ่ง sharp บนเซิร์ฟเวอร์
 *
 * ทำไม: 14 ก.ย. 69 Supabase ระงับโปรเจกต์เพราะเกินโควตา (storage + egress) ต้นเหตุส่วนหนึ่งคือ
 * รูปแบบงาน (order-proofs) ที่กราฟฟิกลากจากเครื่องมาทั้งไฟล์ 4-5 MB ต่อรูป และรูปแพ็คจากกล้องมือถือ
 * รูปพวกนี้ลูกค้า/พนักงานแค่เปิดดูบนจอ ไม่ได้เอาไปพิมพ์ → ย่อให้ด้านยาวสุด ~2000px ก็ยังคมพอ
 * และเบาลง 5-10 เท่า ทั้งตอนเก็บและทุกครั้งที่มีคนเปิดดู
 *
 * ⚠️ ห้ามใช้กับไฟล์ลายของลูกค้า (customer-artwork) — นั่นคือไฟล์พิมพ์จริง ต้องเก็บต้นฉบับ
 *
 * กติกา:
 * - ไฟล์เล็กกว่า minBytes และด้านยาวไม่เกิน maxEdge → คืนไฟล์เดิม (ไม่แตะ)
 * - PNG คงเป็น PNG (กันพื้นโปร่งกลายเป็นดำ) · JPG/WEBP → JPG คุณภาพ 0.85
 * - GIF (อาจเป็นภาพเคลื่อนไหว) หรือ decode ไม่ได้ → คืนไฟล์เดิม
 * - ผลลัพธ์ใหญ่กว่าต้นฉบับ (เช่น PNG กราฟิกแบน) → คืนไฟล์เดิม
 */
export async function shrinkImageFile(
  file: File,
  opts: { maxEdge?: number; minBytes?: number; quality?: number } = {}
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 2000;
  const minBytes = opts.minBytes ?? 600 * 1024;
  const quality = opts.quality ?? 0.85;
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await loadBitmap(file);
  } catch {
    return file;
  }
  const w = bmp.width;
  const h = bmp.height;
  const edge = Math.max(w, h);
  if (!edge) return file;
  if (edge <= maxEdge && file.size < minBytes) return file;

  const scale = Math.min(1, maxEdge / edge);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, cw, ch);
  if ("close" in bmp) bmp.close();

  const keepPng = file.type === "image/png";
  const outType = keepPng ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, keepPng ? undefined : quality));
  if (!blob || blob.size >= file.size) return file;
  const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "image";
  return new File([blob], `${base}.${keepPng ? "png" : "jpg"}`, { type: outType, lastModified: file.lastModified });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation: from-image = หมุนตาม EXIF ให้ (รูปจากกล้องมือถือมักนอนตะแคง)
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* ตกไปใช้ <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
