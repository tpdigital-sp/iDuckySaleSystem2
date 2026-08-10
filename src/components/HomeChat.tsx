"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

/**
 * หน้าจอแชทหน้าแรก — คุยได้จริง
 *
 * เริ่มต้นโชว์บทสนทนาตัวอย่าง 3 ขั้น (เนื้อหาขายของเดิม) พอลูกค้าพิมพ์ข้อความแรก
 * จะล้างตัวอย่างแล้วเข้าโหมดคุยจริง ยิงไป /api/chat → n8n webhook ตัวเดียวกับที่
 * หน้าแชทของ AdminBuddy (chat.html) ใช้ ลูกค้าจึงได้คำตอบจากสมองชุดเดียวกับแอดมิน
 */

type Msg = { id: number; side: "in" | "out"; text: string; step?: string; time: string };

const LINE_URL = "https://lin.ee/x8GkqGZ";

/** ปุ่มตอบเร็ว — กดแล้วส่งคำถามนี้เข้าแชทจริง */
const QUICK: { icon: string; label: string; ask: string }[] = [
  { icon: "🐣", label: "ไม่มีขั้นต่ำ", ask: "สั่งขั้นต่ำกี่ชิ้นคะ" },
  { icon: "✏️", label: "ออกแบบฟรี", ask: "ถ้ายังไม่มีไฟล์ลาย ช่วยออกแบบให้ได้ไหมคะ" },
  { icon: "📦", label: "ส่งทั่วประเทศ", ask: "ค่าส่งเท่าไหร่ กี่วันถึงคะ" },
  { icon: "🛡️", label: "ตรวจสลิปอัตโนมัติ", ask: "ชำระเงินยังไงบ้างคะ" },
];

const clock = () =>
  new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });

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

const GREETING =
  "สวัสดีครับ 👋 ผมผู้ช่วยของ iDucky Prints ถามราคา วัสดุ ขนาด หรือขั้นตอนสั่งทำได้เลยครับ";

/** ตัวหนา **x** + ลิงก์ในบรรทัดเดียว (ไม่ใช้ dangerouslySetInnerHTML) */
function inline(line: string, key: string) {
  const out: React.ReactNode[] = [];
  line.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).forEach((part, i) => {
    if (!part) return;
    const k = `${key}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push(<b key={k}>{part.slice(2, -2)}</b>);
    else if (/^https?:\/\//.test(part))
      out.push(
        <a key={k} href={part} target="_blank" rel="noopener noreferrer" className="mlink">
          {part.replace(/^https?:\/\//, "").slice(0, 40)}
        </a>,
      );
    else out.push(<span key={k}>{part}</span>);
  });
  return out;
}

/** คำตอบจาก n8n มาเป็น markdown อ่อน ๆ — แปลงหัวข้อ/บุลเล็ต/ตัวหนา ให้อ่านง่ายในบับเบิล */
function renderText(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((raw, li) => {
      const line = raw.trimEnd();
      const bullet = /^\s*[*\-•]\s+/.test(line);
      const body = bullet ? line.replace(/^\s*[*\-•]\s+/, "") : line.replace(/^#{1,6}\s+/, "");
      if (!body.trim()) return <span key={li} className="mgap" />;
      return (
        <span key={li} className={bullet ? "mli" : "mrow"}>
          {inline(body, String(li))}
        </span>
      );
    });
}

export default function HomeChat({ catCount }: { catCount: number }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => demoMessages(catCount));
  const [live, setLive] = useState(false); // เข้าโหมดคุยจริงแล้วหรือยัง
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(100);
  const sessionId = useRef("");

  // id ห้องแชท — อยู่ทั้งแท็บ เพื่อให้ n8n จำบริบทการคุยต่อเนื่องได้
  useEffect(() => {
    const KEY = "iducky_chat_session";
    let s = "";
    try {
      s = sessionStorage.getItem(KEY) ?? "";
      if (!s) {
        s = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(KEY, s);
      }
    } catch {
      s = `web-${Date.now().toString(36)}`;
    }
    sessionId.current = s;
  }, []);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: sessionId.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (res.ok && data.reply) push({ side: "in", text: data.reply });
      else push({ side: "in", text: data.error || "ตอนนี้ผู้ช่วยตอบไม่ได้ครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินดูแลต่อให้" });
    } catch {
      push({ side: "in", text: "เชื่อมต่อไม่ได้ครับ ลองใหม่อีกครั้ง หรือทักไลน์ร้านได้เลย" });
    } finally {
      setBusy(false);
    }
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
            {live ? "ผู้ช่วยออนไลน์ ตอบทันที" : "ตอบไวทุกวัน 09:00–18:00 น."}
          </small>
        </div>
        {live ? (
          <button type="button" className="chat-tag chat-reset" onClick={reset} title="เริ่มบทสนทนาใหม่">
            ↺ เริ่มใหม่
          </button>
        ) : (
          <span className="chat-tag">แชทตัวอย่าง</span>
        )}
      </div>

      <div className={`chat-body${live ? " is-live" : ""}`} ref={bodyRef} aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.side}`}>
            <span className="mbub">
              {m.step && <b className="stepno">{m.step}</b>}
              {renderText(m.text)}
            </span>
            <time>{m.time}</time>
          </div>
        ))}
        {(busy || !live) && (
          <div className="msg in typing">
            <span className="mbub mbub-typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q.label} type="button" className="qk" onClick={() => send(q.ask)} disabled={busy} title={q.ask}>
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
          placeholder={busy ? "กำลังตอบ…" : "พิมพ์ข้อความถึงร้าน…"}
          maxLength={1000}
          disabled={busy}
          aria-label="พิมพ์ข้อความถึงร้าน"
        />
        <button type="submit" className="chat-send" disabled={busy || !draft.trim()} aria-label="ส่งข้อความ">
          {busy ? "…" : "➤"}
        </button>
      </form>

      <p className="chat-note">
        ตอบอัตโนมัติด้วยผู้ช่วย AI ของร้าน · ต้องการคุยกับแอดมินตัวจริง{" "}
        <a href={LINE_URL} target="_blank" rel="noreferrer">
          ทักไลน์ได้เลย
        </a>
      </p>
    </div>
  );
}
