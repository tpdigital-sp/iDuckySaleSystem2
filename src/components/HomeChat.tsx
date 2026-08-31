"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { askShopBot, clock, GREETING, LINE_URL, QUICK, renderChatText, useChatSession } from "@/lib/shop-chat";

/**
 * หน้าจอแชทหน้าแรก — คุยได้จริง
 *
 * เริ่มต้นโชว์บทสนทนาตัวอย่าง 3 ขั้น (เนื้อหาขายของเดิม) พอลูกค้าพิมพ์ข้อความแรก
 * จะล้างตัวอย่างแล้วเข้าโหมดคุยจริง ยิงไป /api/chat → n8n webhook ตัวเดียวกับที่
 * หน้าแชทของ AdminBuddy (chat.html) ใช้ ลูกค้าจึงได้คำตอบจากสมองชุดเดียวกับแอดมิน
 *
 * ตรรกะคุยจริง (session · ยิง API · แปลงข้อความ) อยู่ใน lib/shop-chat
 * ใช้ร่วมกับปุ่มแชทลอยทุกหน้า (ChatWidget) — ห้องแชทเดียวกัน คุยต่อเนื่องข้ามหน้าได้
 */

type Msg = { id: number; side: "in" | "out"; text: string; step?: string; time: string };

const demoMessages = (catCount: number): Msg[] => [
  { id: 1, side: "out", text: "มีลายอยากทำพวงกุญแจอะค่ะ ต้องทำยังไงบ้าง", time: "10:24" },
  {
    id: 2,
    side: "in",
    step: "ขั้นที่ 1",
    text: "ส่งรูป โลโก้ หรือไฟล์งานเข้ามาได้เลยครับ ยังไม่มีลายก็ได้ ทีมออกแบบช่วยจัดให้ฟรี 🎨",
    time: "10:25",
  },
  { id: 3, side: "out", text: "อยากได้ 20 ชิ้น ทำได้ไหมคะ", time: "10:26" },
  {
    id: 4,
    side: "in",
    step: "ขั้นที่ 2",
    text: `ได้เลยครับ เลือกจากกว่า ${catCount} หมวด เริ่มชิ้นเดียวก็ทำได้ เดี๋ยวส่งแบบให้ยืนยันก่อนผลิตนะครับ 🛍️`,
    time: "10:27",
  },
  { id: 5, side: "out", text: "ส่งถึงเมื่อไหร่คะ", time: "10:28" },
  {
    id: 6,
    side: "in",
    step: "ขั้นที่ 3",
    text: "แพ็คกันกระแทกอย่างดี ส่งไวทั่วไทย พร้อมเลขพัสดุติดตามได้ครับ 🚚",
    time: "10:29",
  },
];

export default function HomeChat({ catCount }: { catCount: number }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => demoMessages(catCount));
  const [live, setLive] = useState(false); // เข้าโหมดคุยจริงแล้วหรือยัง
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(100);
  const sessionId = useChatSession();

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ (เฉพาะตอนคุยจริง จะได้ไม่กระตุกตอนเข้าหน้าแรก)
  useEffect(() => {
    if (!live) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, live]);

  const push = (m: Omit<Msg, "id" | "time"> & { time?: string }) => {
    const msg: Msg = { id: nextId.current++, time: m.time ?? clock(), side: m.side, text: m.text, step: m.step };
    setMsgs((prev) => [...prev, msg]);
  };

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    // ข้อความแรก = ล้างบทสนทนาตัวอย่าง แล้วขึ้นคำทักทายจริง
    const starting = !live;
    setDraft("");
    setBusy(true);
    if (starting) {
      setLive(true);
      setMsgs([
        { id: nextId.current++, side: "in", text: GREETING, time: clock() },
        { id: nextId.current++, side: "out", text: message, time: clock() },
      ]);
    } else {
      push({ side: "out", text: message });
    }

    // ประวัติก่อนข้อความนี้ — เริ่มคุยใหม่ (starting) ถือว่ายังไม่มีบทสนทนาจริง
    const reply = await askShopBot(
      message,
      sessionId.current,
      starting ? [] : msgs.map((m) => ({ side: m.side, text: m.text })),
    );
    push({ side: "in", text: reply });
    setBusy(false);
  }

  const reset = () => {
    setLive(false);
    setBusy(false);
    setDraft("");
    setMsgs(demoMessages(catCount));
  };

  return (
    <div className="chat">
      <div className="chat-top">
        <img className="chat-av" src="/landing/logo-duck.webp" alt="" aria-hidden="true" />
        <div className="chat-who">
          <b>iDucky Prints</b>
          <small>
            <span className="dot-live" />
            {live ? "กำลังคุยอยู่ · ตอบทันที" : "ออนไลน์ตอนนี้ · พิมพ์ถามได้ 24 ชม."}
          </small>
        </div>
        {live ? (
          <button type="button" className="chat-tag chat-reset" onClick={reset} title="ล้างบทสนทนา เริ่มถามใหม่">
            ↺ เริ่มใหม่
          </button>
        ) : (
          <span className="chat-tag">คุยได้จริง</span>
        )}
      </div>

      <div className={`chat-body${live ? " is-live" : ""}`} ref={bodyRef} aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.side}`}>
            <span className="mbub">
              {m.step && <b className="stepno">{m.step}</b>}
              {renderChatText(m.text)}
            </span>
            <time>{m.time}</time>
          </div>
        ))}
        {busy && (
          <div className="msg in typing">
            <span className="mbub mbub-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        {/* บอกให้ชัดว่าที่เห็นข้างบนคือตัวอย่าง ส่วนช่องข้างล่างคุยได้จริง */}
        {!live && (
          <p className="chat-cue">
            ⬆️ ข้างบนคือตัวอย่างบทสนทนา — <b>ช่องพิมพ์ข้างล่างคุยได้จริง</b> ลองถามราคาดูได้เลย ตอบให้ทันที
          </p>
        )}
      </div>

      <div className="chat-quick">
        <span className="qk-lead">{live ? "ถามต่อได้เลย:" : "กดถามได้เลย:"}</span>
        {QUICK.map((q) => (
          <button key={q.label} type="button" className="qk" onClick={() => send(q.ask)} disabled={busy} title={`ถาม: ${q.ask}`}>
            <i>{q.icon}</i>
            {q.label}
          </button>
        ))}
      </div>

      <form
        className="chat-foot"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          className="chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={busy ? "กำลังพิมพ์ตอบ…" : "พิมพ์คำถามที่นี่ เช่น พวงกุญแจ 20 ชิ้น ราคาเท่าไหร่"}
          maxLength={1000}
          disabled={busy}
          aria-label="พิมพ์คำถามถึงร้าน"
        />
        <button type="submit" className="chat-send" disabled={busy || !draft.trim()} aria-label="ส่งข้อความ">
          {busy ? "…" : "➤"}
        </button>
      </form>

      <p className="chat-note">
        แชทนี้ตอบอัตโนมัติด้วยผู้ช่วย AI ของร้าน ถามได้ทุกเวลา · อยากคุยกับแอดมินตัวจริง{" "}
        <a href={LINE_URL} target="_blank" rel="noreferrer">
          ทักไลน์ได้เลย
        </a>
      </p>
    </div>
  );
}
