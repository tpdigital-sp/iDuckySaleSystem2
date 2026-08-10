"use client";

/**
 * 🖼 ทำรูปตัวอย่างจากไฟล์เทมเพลต (.ai / .pdf) — ทำในเบราว์เซอร์ตอนอัปโหลด
 *
 * ไฟล์ .ai ที่เซฟจาก Illustrator แบบ "Create PDF Compatible File" (ค่าเริ่มต้น)
 * มีโครงสร้างเป็น PDF อยู่ข้างใน → เรนเดอร์หน้าแรกด้วย pdf.js แล้วแปลงเป็น PNG ได้เลย
 * ไม่ต้องพึ่งเซิร์ฟเวอร์/ตัวแปลงไฟล์ (Lambda ลง native canvas ไม่ได้)
 *
 * ⚠️ ไฟล์ .ai ที่ปิด PDF compatibility ไว้จะเรนเดอร์ไม่ได้ → คืน null
 *    ให้ผู้เรียกเงียบ ๆ แล้วปล่อยให้แอดมินอัปรูปเองแทน
 */

/** ด้านที่ยาวที่สุดของรูปตัวอย่าง (px) — พอสำหรับ thumbnail ในหน้าคลัง/หน้าสินค้า */
const MAX_EDGE = 600;
/** เรนเดอร์นานเกินนี้ถือว่าไม่สำเร็จ — กันหมุนค้างไม่จบ ให้ตกไปใช้วิธีอัปรูปเองแทน */
const RENDER_TIMEOUT_MS = 20_000;

export function canThumbnail(fileName: string): boolean {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  return ext === "ai" || ext === "pdf";
}

/** จุด (PDF point) → มิลลิเมตร */
const MM_PER_PT = 25.4 / 72;

/**
 * 📏 ขนาดอาร์ตบอร์ดจริงของไฟล์ (มม.) — .ai/.pdf เก็บขนาดเป็น point อยู่แล้ว
 * ใช้เป็นขนาดผืนผ้าใบตอนลูกค้าวางลายบนเว็บ แอดมินไม่ต้องพิมพ์เอง
 * คืน null เมื่อเปิดไฟล์ไม่ได้ (เช่น .ai ที่ปิด PDF compatibility)
 */
export async function readDesignSizeMm(file: File): Promise<{ widthMm: number; heightMm: number } | null> {
  if (!canThumbnail(file.name)) return null;
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
    const page = await doc.getPage(1);
    // getViewport เผื่อไฟล์ที่หมุนหน้า (rotate 90) มาแล้ว — ได้ด้านที่ตาเห็นจริง
    const vp = page.getViewport({ scale: 1 });
    void doc.destroy();
    const widthMm = Math.round(vp.width * MM_PER_PT * 10) / 10;
    const heightMm = Math.round(vp.height * MM_PER_PT * 10) / 10;
    return widthMm > 0 && heightMm > 0 ? { widthMm, heightMm } : null;
  } catch {
    return null;
  }
}

/**
 * เรนเดอร์หน้าแรกของไฟล์เป็น PNG (พื้นขาว — งาน .ai ส่วนใหญ่พื้นโปร่ง เห็นเป็นดำถ้าไม่รอง)
 * คืน null เมื่อเปิดไฟล์ไม่ได้/ไม่ใช่ PDF ข้างใน
 */
export async function thumbnailFromDesignFile(file: File): Promise<File | null> {
  if (!canThumbnail(file.name)) return null;
  try {
    const pdfjs = await import("pdfjs-dist");
    // เสิร์ฟ worker เป็นไฟล์สแตติกจาก /public (scripts/copy-pdf-worker.mjs ก๊อปให้ตอน build)
    // — Turbopack resolve new URL("pdfjs-dist/…", import.meta.url) จาก bare specifier ไม่ได้
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      // วาดตัวอักษรจาก glyph ของ pdf.js เอง ไม่ต้องติดตั้ง @font-face แล้วรอ document.fonts
      // (ตัวโหลดฟอนต์ค้างได้เมื่อแท็บอยู่เบื้องหลัง) · รูปย่อไม่ต้องการความเป๊ะระดับนั้น
      disableFontFace: true,
      isEvalSupported: false,
    }).promise;
    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_EDGE / Math.max(base.width, base.height), 2);
    const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });

    const w = Math.max(1, Math.round(viewport.width));
    const h = Math.max(1, Math.round(viewport.height));
    /**
     * ใช้ OffscreenCanvas เป็นหลัก — pdf.js จะเรนเดอร์รวดเดียวไม่ผ่าน requestAnimationFrame
     * (canvas ปกติจะรอ rAF ซึ่ง "ไม่ทำงานเลยถ้าแท็บอยู่เบื้องหลัง" → งานค้างจนกว่าจะสลับกลับมา)
     */
    const off = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : null;
    const canvas = off ?? document.createElement("canvas");
    if (!off) {
      (canvas as HTMLCanvasElement).width = w;
      (canvas as HTMLCanvasElement).height = h;
    }
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    // รองพื้นขาวก่อน — ไม่งั้นลายที่พื้นโปร่งจะกลายเป็นดำทึบตอนแปลงเป็น PNG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const task = page.render({ canvasContext: ctx, viewport });
    // pdf.js เดินงานเรนเดอร์ต่อผ่าน requestAnimationFrame ซึ่งไม่ยิงเมื่อแท็บอยู่เบื้องหลัง
    // → ใส่ onContinue ให้เดินต่อเองทันที ไม่ต้องรอเฟรม
    task.onContinue = (cont: () => void) => cont();
    // กันค้าง: บางสภาพแวดล้อม (แท็บถูกพักงาน) เรนเดอร์ไม่จบสักที — เกินเวลาถือว่าไม่สำเร็จ
    const ok = await Promise.race([
      task.promise.then(() => true),
      new Promise<false>((r) => setTimeout(() => r(false), RENDER_TIMEOUT_MS)),
    ]);
    if (!ok) {
      task.cancel();
      void doc.destroy();
      return null;
    }
    void doc.destroy();

    const blob = off
      ? await off.convertToBlob({ type: "image/png" })
      : await new Promise<Blob | null>((res) => (canvas as HTMLCanvasElement).toBlob(res, "image/png"));
    if (!blob) return null;
    const stem = file.name.replace(/\.[^.]+$/, "") || "template";
    return new File([blob], `${stem}-preview.png`, { type: "image/png" });
  } catch {
    // ไฟล์ .ai ที่ไม่ได้เซฟแบบ PDF compatible / ไฟล์เสีย → ไม่ต้องรบกวนแอดมิน
    return null;
  }
}
