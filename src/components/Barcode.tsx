"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * บาร์โค้ด CODE128 สำหรับเครื่องยิงบนใบปะหน้าพัสดุ
 * ใช้บาร์โค้ดแทน QR ตรงนี้เพื่อไม่ให้พนักงานสับสนกับ QR ที่ไว้สแกนด้วยมือถือ
 */
export default function Barcode({
  value,
  height = 46,
  width = 1.7,
  fontSize = 13,
  displayValue = true,
}: {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  /** แสดงเลขใต้บาร์โค้ด — ปิดได้เมื่อมีเลขตัวใหญ่อยู่แล้ว */
  displayValue?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      height,
      width,
      fontSize,
      displayValue,
      font: "ui-monospace, monospace",
      fontOptions: "bold",
      textMargin: 2,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  }, [value, height, width, fontSize, displayValue]);

  return <svg ref={ref} />;
}
