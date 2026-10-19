"use client";

import { useEffect, useState } from "react";
import { botApi } from "../bot-ui";

/**
 * 🤖 ให้บอทร่างตอนนี้ (เจ้าของร้าน 19 ต.ค. 69 "เปิด 📝 ร่างก่อนส่ง หลังจากที่ลูกค้าพิมพ์แชทมาแล้ว อยากให้ chatbot แสดงได้ไหม")
 * ส่งข้อความลูกค้าที่ยังไม่มีใครตอบเข้าบอท (POST chats/draft {action:"redraft"} → lib/server/bot-drafts requestRedraft → n8n)
 * ร่างกลับมาเป็นการ์ดเหลืองในห้องเองผ่านการโพล 3 วิ (ราว 15–30 วิ)
 * แถบเหนือช่องพิมพ์ — ขึ้นเมื่อห้องเปิดร่าง (รายคน/ทั้งร้าน) และข้อความท้ายสุดเป็นของลูกค้า (ยังไม่มีร่าง/คำตอบตามหลัง)
 */
export default function RedraftButton({ id, toast, startedAt }: { id: string; toast: (t: string, bad?: boolean) => void; startedAt?: number }) {
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  // เปิดสวิตช์ 📝 แล้วเซิร์ฟเวอร์สั่งร่างให้เอง (startedAt) → ขึ้น "บอทกำลังร่าง" 45 วิ ไม่ต้องกดซ้ำ
  useEffect(() => {
    if (!startedAt) return;
    const until = startedAt + 45_000;
    if (until <= Date.now()) return;
    setWaitUntil(until);
    const t = setTimeout(() => setWaitUntil(0), until - Date.now());
    return () => clearTimeout(t);
  }, [startedAt]);
  const waiting = waitUntil > Date.now();
  const run = async () => {
    if (busy || waiting) return;
    setBusy(true);
    try {
      const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/chatbot/chats/draft", { action: "redraft", id });
      toast(d.saved || "ส่งให้บอทร่างแล้ว");
      setWaitUntil(Date.now() + 45_000);
      setTimeout(() => setWaitUntil(0), 45_000);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };
  const label = busy ? "กำลังส่งให้บอท…" : waiting ? "⏳ บอทกำลังร่าง…" : "🤖 ให้บอทร่างตอนนี้";
  return (
    <div className="flex items-center gap-2 border-t px-3 py-2 md:px-4" style={{ borderColor: "var(--ln-line)", background: "var(--dk-yolk-wash)" }}>
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: "var(--dk-yolk-ink)" }}>
        <b>📝 ลูกค้ารอคำตอบ</b>
        <span className="hidden sm:inline">{waiting ? " · บอทกำลังร่างคำตอบ ร่างจะขึ้นในห้องราว 15–30 วินาที" : " · บอทยังไม่ได้ร่าง (ลูกค้าพิมพ์มาก่อนเปิดร่าง)"}</span>
      </p>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || waiting}
        className="min-h-[40px] shrink-0 rounded-xl px-3.5 text-[13px] font-extrabold text-white transition active:scale-95 disabled:opacity-60"
        style={{ background: "var(--dk-yolk-ink)" }}
      >
        {label}
      </button>
    </div>
  );
}
