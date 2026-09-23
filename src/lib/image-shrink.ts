/**
 * ย่อรูปฝั่งเบราว์เซอร์ก่อนส่งผ่าน API route
 *
 * ⚠️ เส้น /api/… วิ่งผ่าน Netlify Function ซึ่งรับ body ได้ ~6MB แบบ base64 (= ไฟล์จริงราว 4.5MB)
 * รูปจากกล้องมือถือ 12-48MP ทะลุเพดานนี้ได้ง่าย แล้ว Netlify ตอบเป็นหน้า error ที่ไม่ใช่ JSON
 * → หน้าเว็บขึ้นแค่ "ไม่สำเร็จ" ไล่เหตุไม่ได้ · ย่อก่อนส่งจึงเป็นทางที่ถูก
 *
 * ย่อไม่ได้ (เบราว์เซอร์เก่า/ไฟล์เสีย) = คืนต้นฉบับไปตามเดิม ไม่ทำให้งานค้าง
 */
export async function shrinkImageForUpload(
  file: File,
  { overBytes = 2.5 * 1024 * 1024, maxSide = 2000, quality = 0.9 }: { overBytes?: number; maxSide?: number; quality?: number } = {}
): Promise<File> {
  if (file.size <= overBytes || !file.type.startsWith("image/")) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("อ่านรูปไม่ได้"));
      im.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // ย่อไม่ได้ก็ส่งต้นฉบับไปตามเดิม
  }
}
