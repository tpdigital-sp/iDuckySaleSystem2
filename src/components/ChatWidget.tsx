"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * ปุ่มแชทบอทลอยมุมจอ + หน้าต่างแชทที่เด้งขึ้นมาเมื่อกด (ทุกหน้าร้าน)
 *
 * คู่กับปุ่ม LINE (คุยกับแอดมินตัวจริง) — อันนี้คือผู้ช่วย AI ตอบทันที 24 ชม.
 * ใช้สมองตัวเดียวกับกล่องแชทหน้าแรก (lib/shop-chat) และ sessionId เดียวกัน
 * ลูกค้าเริ่มถามหน้าแรกแล้วเดินไปหน้าอื่นแล้วกดปุ่มนี้ บทสนทนาต่อเนื่องไม่หลุด
 *
 * ตำแหน่ง: ปุ่มลอยมุมขวาล่างซ้อนกันเป็นชั้น — bottom-5 แอดมิน · bottom-20 LINE · bottom-36 ตัวนี้
 */

import { useEffect, useRef, useState } from "react";
import {
  askShopBot,
  clock,
  GREETING,
  LINE_URL,
  QUICK,
  renderChatText,
  useChatSession,
  type ChatTextClasses,
} from "@/lib/shop-chat";

type Msg = { id: number; side: "in" | "out"; text: string; time: string };

/** คลาสในบับเบิล — หน้าต่างนี้อยู่นอก .dl เลยใช้ Tailwind แทนคลาสของ landing.css */
const TEXT_CLASSES: ChatTextClasses = {
  row: "block",
  li: "block pl-3.5 -indent-3 before:mr-1.5 before:content-['•'] before:text-[#57B6E8]",
  gap: "block h-2",
  link: "font-semibold text-[#2C81C4] underline underline-offset-2",
};

function ChatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.52 1.46 4.76 3.75 6.23-.14.94-.63 2.23-1.24 3.15-.22.33.06.76.44.66 2-.52 3.44-1.2 4.35-1.74.86.18 1.76.28 2.7.28 5.52 0 10-3.58 10-8S17.52 3 12 3Z" />
    </svg>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  /** จุดแดงชวนกด — ขึ้นครั้งเดียวจนกว่าลูกค้าจะเปิดแชท */
  const [nudge, setNudge] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const sessionId = useChatSession();

  // ทักทายครั้งแรกที่เปิด (ไม่ทักตั้งแต่โหลดหน้า จะได้ไม่ยิง state ทิ้งเปล่า ๆ)
  useEffect(() => {
    if (open && msgs.length === 0)
      setMsgs([{ id: nextId.current++, side: "in", text: GREETING, time: clock() }]);
  }, [open, msgs.length]);

  // เปิดแล้วโฟกัสช่องพิมพ์ให้เลย — ลูกค้ากดปุ่มเพราะอยากถาม ไม่ต้องกดซ้ำอีกที
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, open]);

  // Esc = ปิดหน้าต่าง (มาตรฐานเดียวกับ dialog อื่นในเว็บ)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // ชวนคุยหลังลูกค้าอยู่บนหน้าสักพัก — ครั้งเดียวต่อแท็บ ไม่กวนซ้ำ
  useEffect(() => {
    try {
      if (sessionStorage.getItem("iducky_chat_nudged")) return;
    } catch {
      return;
    }
    const t = setTimeout(() => {
      setNudge(true);
      try {
        sessionStorage.setItem("iducky_chat_nudged", "1");
      } catch {
        /* โหมดส่วนตัวเขียนไม่ได้ ก็แค่ไม่จำ */
      }
    }, 20_000);
    return () => clearTimeout(t);
  }, []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    setMsgs((prev) => [...prev, { id: nextId.current++, side: "out", text: message, time: clock() }]);
    const reply = await askShopBot(message, sessionId.current);
    setMsgs((prev) => [...prev, { id: nextId.current++, side: "in", text: reply, time: clock() }]);
    setBusy(false);
    inputRef.current?.focus();
  }

  return (
    <>
      {/* ── ปุ่มลอย ── */}
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setNudge(false);
        }}
        aria-label={open ? "ปิดหน้าต่างแชท" : "คุยกับผู้ช่วย AI ของร้าน"}
        aria-expanded={open}
        /*
          วงแหวนขาว ไม่ใช่กรมท่าโปร่ง — เลื่อนถึง footer (พื้นกรมท่า) ปุ่มกรมท่าบนวงแหวนกรมท่าจะจมหายทั้งใบ
          ขาวตัดได้ทั้งพื้นฟ้าอ่อนด้านบนและพื้นกรมท่าด้านล่าง
        */
        className="fixed bottom-36 right-5 z-40 flex items-center gap-2 rounded-full bg-[#173A6B] px-4 py-3 text-sm font-bold text-white shadow-lg ring-[3px] ring-white/85 transition hover:scale-105 hover:bg-[#1E4A85]"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-5 w-5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <ChatIcon />
        )}
        <span className="hidden sm:inline">{open ? "ปิดแชท" : "คุยกับบอท (ตอบทันที)"}</span>
        {/* จุดชวนกด — เห็นได้แม้บนมือถือที่ซ่อนข้อความ */}
        {nudge && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FFD447] opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#FFD447] ring-2 ring-white" />
          </span>
        )}
      </button>

      {/* ── หน้าต่างแชท ── */}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="แชทกับผู้ช่วยของร้าน"
          /*
            มือถือ = แผ่นเต็มความกว้างจากขอบล่าง (ทับปุ่มลอยได้ ปิดด้วยปุ่ม × ที่หัวหน้าต่าง)
            จอใหญ่ = กล่องลอย "เหนือ" ปุ่มตัวเอง — bottom-52 (13rem) = ปุ่มที่ 9rem + สูงปุ่ม + ระยะห่าง
            ถ้าใช้ bottom-36 เท่าปุ่ม หน้าต่างจะบังปุ่มปิดของตัวเอง
          */
          /*
            ความสูงหักระยะที่ลอยจากขอบล่างออกก่อนเสมอ (มือถือ 0.75rem · จอใหญ่ 13rem)
            ถ้าใช้ 70vh เฉย ๆ พอเปิดบนจอเตี้ย (โน้ตบุ๊กเล็ก/แนวนอนบนมือถือ) หัวหน้าต่างจะโดนดันพ้นขอบบน
            dvh = ความสูงจริงหลังหักแถบเบราว์เซอร์บนมือถือ
          */
          /* z-[90] — ต้องสูงกว่าแถบไอคอนโซเชียลของหน้าแรก (.social-dock z-index:75) ไม่งั้นบนมือถือไอคอนจะทับหน้าต่าง */
          className="fixed inset-x-3 bottom-3 z-[90] flex max-h-[min(34rem,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_rgba(23,58,107,0.28)] ring-1 ring-[#C6E8FB] sm:inset-x-auto sm:bottom-52 sm:right-5 sm:max-h-[min(34rem,calc(100dvh-14rem))] sm:w-[23rem]"
        >
          {/* หัวหน้าต่าง */}
          <div className="flex items-center gap-2.5 bg-gradient-to-br from-[#173A6B] to-[#2C81C4] px-4 py-3 text-white">
            <img src="/landing/logo-duck.webp" alt="" aria-hidden="true" className="h-9 w-9 rounded-full bg-white/90 object-contain p-0.5" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-bold">ผู้ช่วย iDucky</p>
              <p className="flex items-center gap-1.5 text-[11px] text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-[#4ED88B]" />
                ตอบทันที 24 ชม.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิดหน้าต่างแชท"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ข้อความ */}
          <div ref={bodyRef} aria-live="polite" className="flex-1 space-y-2.5 overflow-y-auto bg-[#F5FBFF] px-3 py-3">
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.side === "out" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.side === "out"
                      ? "rounded-br-md bg-[#173A6B] text-white"
                      : "rounded-bl-md border border-[#E2F3FE] bg-white text-[#173A6B] shadow-sm"
                  }`}
                >
                  {renderChatText(m.text, TEXT_CLASSES)}
                </div>
                <time className="mt-0.5 px-1 text-[10px] text-slate-400">{m.time}</time>
              </div>
            ))}
            {busy && (
              <div className="flex items-start">
                <div className="flex gap-1 rounded-2xl rounded-bl-md border border-[#E2F3FE] bg-white px-3.5 py-3 shadow-sm">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9CD8F6]"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ปุ่มถามด่วน — โชว์เฉพาะตอนยังไม่ได้เริ่มถาม จะได้ไม่เบียดพื้นที่อ่าน */}
          {msgs.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 border-t border-[#E2F3FE] bg-white px-3 py-2">
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => send(q.ask)}
                  disabled={busy}
                  title={`ถาม: ${q.ask}`}
                  className="rounded-full border border-[#C6E8FB] bg-[#F2FAFF] px-2.5 py-1 text-[11px] font-semibold text-[#2C81C4] transition hover:bg-[#E2F3FE] disabled:opacity-50"
                >
                  {q.icon} {q.label}
                </button>
              ))}
            </div>
          )}

          {/* ช่องพิมพ์ */}
          <form
            className="flex items-center gap-2 border-t border-[#E2F3FE] bg-white px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={busy ? "กำลังพิมพ์ตอบ…" : "พิมพ์คำถามที่นี่…"}
              maxLength={1000}
              disabled={busy}
              aria-label="พิมพ์คำถามถึงร้าน"
              className="min-w-0 flex-1 rounded-full border border-[#C6E8FB] bg-[#F5FBFF] px-3.5 py-2 text-[13px] text-[#173A6B] outline-none transition placeholder:text-slate-400 focus:border-[#57B6E8] focus:bg-white disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="ส่งข้อความ"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#FFD447] text-[#173A6B] transition hover:bg-[#FFDE6B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
              </svg>
            </button>
          </form>

          <p className="border-t border-[#E2F3FE] bg-white px-3 pb-2.5 pt-2 text-center text-[10.5px] leading-snug text-slate-500">
            ตอบอัตโนมัติด้วยผู้ช่วย AI ของร้าน · อยากคุยกับแอดมินตัวจริง{" "}
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#06C755] underline underline-offset-2">
              ทักไลน์ได้เลย
            </a>
          </p>
        </div>
      )}
    </>
  );
}
