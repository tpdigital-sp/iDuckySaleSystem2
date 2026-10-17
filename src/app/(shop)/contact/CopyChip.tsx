"use client";

import { useState } from "react";

/** ปุ่ม "คัดลอก" เล็ก ๆ ในหน้าติดต่อเรา — คัดลอกแล้วขึ้น ✓ ชั่วครู่ */
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
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-bold transition ${
        copied ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
      }`}
    >
      {copied ? "✓ คัดลอกแล้ว" : `📋 ${label}`}
    </button>
  );
}
