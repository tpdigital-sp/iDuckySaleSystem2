"use client";

import { useState } from "react";

/** ปุ่ม "คัดลอก" เล็ก ๆ ในหน้าติดต่อเรา — คัดลอกแล้วขึ้น ✓ ชั่วครู่ (สไตล์ .ctc-act ใน landing.css) */
export default function CopyChip({ text, label = "คัดลอก" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* เบราว์เซอร์ไม่ให้คัดลอก — ปล่อยผ่าน */
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button type="button" onClick={copy} className={`ctc-act ghost${copied ? " done" : ""}`}>
      {copied ? "✓ คัดลอกแล้ว" : `📋 ${label}`}
    </button>
  );
}
