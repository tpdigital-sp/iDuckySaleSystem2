"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * ย้าย overlay (ไลท์บ็อกซ์/โมดัล) ไปแขวนที่ <body>
 *
 * Why: หน้าร้านห่อเนื้อหาไว้ใน `.shopp-in { position:relative; z-index:1 }` ซึ่งเป็น "กรอบซ้อน"
 * (stacking context) — z-index ของอะไรที่อยู่ข้างในจึงแข่งกันได้เฉพาะในกรอบนั้น
 * ต่อให้ตั้ง z-[100] ก็ยังโดนแถบเมนู (z-index 60) และปุ่มแชทที่อยู่นอกกรอบทับอยู่ดี
 * แขวนที่ body แล้ว z-index จึงเทียบกับทั้งหน้าได้ตรงตามที่ตั้งไว้
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
