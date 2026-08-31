"use client";

/**
 * สมองแชทลูกค้า — ใช้ร่วมกันระหว่างกล่องแชทหน้าแรก (HomeChat) กับปุ่มแชทลอยทุกหน้า (ChatWidget)
 *
 * รวมไว้ที่เดียวเพราะสองที่นี้ต้องคุยกับผู้ช่วยตัวเดียวกันจริง ๆ:
 *  - ใช้ sessionId เดียวกัน → ลูกค้าเริ่มถามที่หน้าแรกแล้วไปกดปุ่มลอยหน้าอื่น บทสนทนาต่อเนื่อง
 *  - แก้ข้อความ error / คำทักทาย / ปุ่มถามด่วน ที่เดียวแล้วเปลี่ยนทั้งสองที่
 */

import { useEffect, useRef } from "react";

/** ลิงก์ LINE ร้าน — /line เลือกปลายทางตามอุปกรณ์ให้ (ดู src/app/line/route.ts) */
export const LINE_URL = "/line";

export const GREETING =
  "สวัสดีครับ 👋 ผมผู้ช่วยของ iDucky Prints ถามราคา วัสดุ ขนาด หรือขั้นตอนสั่งทำได้เลยครับ พิมพ์มาได้เลย เดี๋ยวตอบให้ทันที";

/** ปุ่มตอบเร็ว — เขียนเป็น "คำถาม" ให้รู้ว่ากดแล้วถามจริง ไม่ใช่ป้ายโฆษณา */
export const QUICK: { icon: string; label: string; ask: string }[] = [
  { icon: "🐣", label: "สั่งขั้นต่ำกี่ชิ้น?", ask: "สั่งขั้นต่ำกี่ชิ้นคะ" },
  { icon: "✏️", label: "ไม่มีลาย ออกแบบให้ไหม?", ask: "ถ้ายังไม่มีไฟล์ลาย ช่วยออกแบบให้ได้ไหมคะ" },
  { icon: "📦", label: "ค่าส่งเท่าไหร่?", ask: "ค่าส่งเท่าไหร่ กี่วันถึงคะ" },
  { icon: "🛡️", label: "จ่ายเงินยังไง?", ask: "ชำระเงินยังไงบ้างคะ" },
];

export const clock = () =>
  new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * id ห้องแชท — เก็บใน sessionStorage ให้ n8n จำบริบทได้ตลอดแท็บ
 * กล่องหน้าแรกกับปุ่มลอยอ่านคีย์เดียวกัน จึงเป็นห้องเดียวกันโดยอัตโนมัติ
 */
export function useChatSession() {
  const sessionId = useRef("");
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
  return sessionId;
}

/** 1 ตาของบทสนทนาที่ส่งกลับไปให้ผู้ช่วยอ่าน — side เดียวกับบับเบิลในหน้าจอ */
export type ChatTurn = { side: "in" | "out"; text: string };

/**
 * ส่งย้อนหลังกี่ตา — agent ฝั่ง n8n จำเองได้ 5 ตา (Window Buffer) แต่จำจาก sessionId เท่านั้น
 * ชั้นวิเคราะห์คำถาม/จับคู่สินค้า/ตอบสำรองของเว็บไม่เห็นด้วย จึงต้องส่งไปเอง
 */
const HISTORY_TURNS = 8;

/** ถามผู้ช่วยร้าน — คืนข้อความตอบเสมอ (ล้มเหลวก็คืนข้อความบอกทางออกให้ลูกค้า ไม่ throw) */
export async function askShopBot(message: string, sessionId: string, history: ChatTurn[] = []): Promise<string> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId,
        // ตัดคำทักทายอัตโนมัติออก (ไม่ใช่บทสนทนาจริง) แล้วเอาเฉพาะท้าย ๆ ที่ยังเกี่ยวกับเรื่องที่คุยอยู่
        history: history
          .filter((t) => t.text && t.text !== GREETING)
          .slice(-HISTORY_TURNS)
          .map((t) => ({ role: t.side === "out" ? "customer" : "shop", text: t.text.slice(0, 500) })),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
    if (res.ok && data.reply) return data.reply;
    return data.error || "ตอนนี้ผู้ช่วยตอบไม่ได้ครับ ทักไลน์ร้านได้เลย เดี๋ยวแอดมินดูแลต่อให้";
  } catch {
    return "เชื่อมต่อไม่ได้ครับ ลองใหม่อีกครั้ง หรือทักไลน์ร้านได้เลย";
  }
}

/** ชื่อคลาสของแต่ละชิ้นในบับเบิล — หน้าแรกใช้คลาสจาก landing.css · ปุ่มลอยอยู่นอก .dl เลยส่ง Tailwind มาแทน */
export type ChatTextClasses = { row: string; li: string; gap: string; link: string };

const LANDING_CLASSES: ChatTextClasses = { row: "mrow", li: "mli", gap: "mgap", link: "mlink" };

/** ตัวหนา **x** + ลิงก์ markdown [ชื่อ](url) + ลิงก์เปล่า ในบรรทัดเดียว (ไม่ใช้ dangerouslySetInnerHTML) */
function inline(line: string, key: string, cls: ChatTextClasses) {
  const out: React.ReactNode[] = [];
  line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g).forEach((part, i) => {
    if (!part) return;
    const k = `${key}-${i}`;
    const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (/^\*\*[^*]+\*\*$/.test(part)) out.push(<b key={k}>{part.slice(2, -2)}</b>);
    else if (md)
      out.push(
        <a key={k} href={md[2]} target="_blank" rel="noopener noreferrer" className={cls.link}>
          {md[1]}
        </a>,
      );
    else if (/^https?:\/\//.test(part))
      out.push(
        <a key={k} href={part} target="_blank" rel="noopener noreferrer" className={cls.link}>
          {decodeLinkLabel(part)}
        </a>,
      );
    else out.push(<span key={k}>{part}</span>);
  });
  return out;
}

/** ป้ายลิงก์อ่านง่าย — ถอด percent-encoding ภาษาไทยให้เห็นชื่อจริง (ลิงก์สินค้า slug ไทยจะไม่เป็น %E0%B8...) */
function decodeLinkLabel(url: string): string {
  let s = url.replace(/^https?:\/\//, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* encode แปลก ๆ ก็โชว์ดิบไป */
  }
  return s.length > 42 ? `${s.slice(0, 42)}…` : s;
}

/** คำตอบจาก n8n มาเป็น markdown อ่อน ๆ — แปลงหัวข้อ/บุลเล็ต/ตัวหนา ให้อ่านง่ายในบับเบิล */
export function renderChatText(text: string, cls: ChatTextClasses = LANDING_CLASSES) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((raw, li) => {
      const line = raw.trimEnd();
      const bullet = /^\s*[*\-•]\s+/.test(line);
      const body = bullet ? line.replace(/^\s*[*\-•]\s+/, "") : line.replace(/^#{1,6}\s+/, "");
      if (!body.trim()) return <span key={li} className={cls.gap} />;
      return (
        <span key={li} className={bullet ? cls.li : cls.row}>
          {inline(body, String(li), cls)}
        </span>
      );
    });
}
