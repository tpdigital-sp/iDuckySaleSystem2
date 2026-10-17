"use client";

/**
 * 📱 QR พร้อมเพย์ใส่ยอด — กล่องโอนเงินหน้าเช็คออเดอร์ / หน้าสั่งซื้อสำเร็จ (12 ต.ค. 69)
 *
 * วาดลง canvas (ซ่อน) แล้วโชว์เป็น <img> — ลูกค้ามือถือกดค้างที่รูป "บันทึกรูป" ได้ (แอป LINE/Safari ใช้ได้ทั้งคู่)
 * แล้วเปิดแอปธนาคาร → สแกนจากรูปในเครื่อง · ยอดใส่ให้แล้ว ไม่ต้องพิมพ์เอง
 * หมายเลขพร้อมเพย์รูปแบบไม่รองรับ (promptPayPayload คืน null) = ไม่โชว์อะไร (เหลือเลข + ปุ่มคัดลอกเหมือนเดิม)
 */

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { formatPrice } from "@/lib/products";
import { promptPayPayload } from "@/lib/promptpay";

export default function PromptPayQR({
  promptpay,
  name,
  amount,
  fileName,
}: {
  promptpay: string;
  name?: string;
  /** ยอดที่ต้องโอนตอนนี้ — ≤ 0 = QR ไม่มียอด */
  amount: number;
  /** ชื่อไฟล์ตอนกดบันทึก เช่น เลขออเดอร์ */
  fileName?: string;
}) {
  const payload = promptPayPayload(promptpay, amount);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState("");

  useEffect(() => {
    const c = canvasRef.current;
    if (c) setSrc(c.toDataURL("image/png"));
  }, [payload]);

  if (!payload) return null;
  return (
    <div className="rounded-2xl bg-white p-3 text-center text-stone-700 ring-1 ring-sky-200">
      <div hidden aria-hidden>
        <QRCodeCanvas ref={canvasRef} value={payload} size={480} marginSize={2} level="M" />
      </div>
      <p className="text-[13px] font-extrabold text-[#173A6B]">📱 สแกนจ่ายด้วยพร้อมเพย์</p>
      {src ? (
        <img src={src} alt={`QR พร้อมเพย์ ยอด ${formatPrice(amount)}`} className="mx-auto mt-2 h-52 w-52 rounded-lg" />
      ) : (
        <div className="mx-auto mt-2 h-52 w-52 animate-pulse rounded-lg bg-stone-100" />
      )}
      <p className="mt-1.5 text-sm font-bold">
        {amount > 0 ? <>ยอด <span className="text-[#2C81C4]">{formatPrice(amount)}</span> ใส่ไว้ให้แล้ว</> : "กรอกยอดในแอปธนาคาร"}
      </p>
      {name && <p className="text-[11px] text-stone-500">ผู้รับ: {name}</p>}
      <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
        มือถือ: <b>กดค้างที่รูป → บันทึกรูป</b> แล้วเปิดแอปธนาคาร เลือกสแกนจากรูปในเครื่อง
      </p>
      {src && (
        <a
          href={src}
          download={`${fileName || "iDucky"}-promptpay.png`}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full bg-sky-50 px-4 py-2 text-[13px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-[12px]"
        >
          💾 บันทึกรูป QR
        </a>
      )}
    </div>
  );
}
