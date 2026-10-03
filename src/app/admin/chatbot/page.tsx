"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { PageHead, PageShell, Tag } from "@/components/admin/ui";
import { useActor } from "@/lib/perm-context";
import { renderChatText } from "@/lib/shop-chat";
import { ChatbotTabs } from "./bot-ui";

/**
 * 🤖 ผู้ช่วยตอบแชท (AI) — ย้ายมาจาก AdminBuddy chat.html (localhost:8765) 3 ต.ค. 69
 *
 * แอดมินพิมพ์คำถามลูกค้าแทน → ได้คำตอบ (ราคาเครื่องคิดเงินเดียวกับตะกร้า + คลังความรู้ n8n) → กด 📋 คัดลอกไปตอบใน LINE OA
 * สมองอยู่ที่ /api/admin/chatbot → lib/server/chat-answer.ts (ตัวเดียวกับแชทลูกค้าหน้าเว็บ โหมด staff)
 * ไม่ต้องตั้งชื่อแอดมินแบบหน้าเดิม — ประวัติบันทึกด้วยชื่อบัญชีที่ล็อกอิน (Firestore chat-history)
 *
 * ดีไซน์ (รื้อใหม่ 3 ต.ค. 69): จุดเด่นจุดเดียว = ปุ่มเหลือง "คัดลอกไปตอบ LINE" (งานจริงของหน้านี้)
 * ประวัติอยู่ซ้ายแบบ LINE OA ที่แอดมินคุ้น · แบ่งตามวัน + ค้น + ของฉัน/ทุกคน · มือถือพับเป็นปุ่ม
 */

type Product = { name: string; url: string; image?: string };
type Msg = { role: "user" | "bot"; text: string; at: string; err?: boolean; products?: Product[]; fromSite?: boolean };
type Session = { id: string; adminName: string; summary: string; lastActivity: string; messageCount: number };

const CLS = {
  row: "block",
  li: "block pl-4 -indent-3 before:content-['•_'] before:text-[var(--dk-faint)]",
  gap: "block h-2",
  link: "font-semibold text-[var(--dk-blue-deep)] underline underline-offset-2 break-all",
};

const QUICK = [
  "พวงกุญแจอะคริลิค 100 ชิ้น ราคาเท่าไหร่",
  "สติ๊กเกอร์ไดคัท ขั้นต่ำกี่แผ่น",
  "ผลิตกี่วัน ส่งยังไง",
  "เสื้อ DTF มีสีอะไรบ้าง",
  "ส่งไฟล์งานยังไง",
];

const newSessionId = () => `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
};

/** หัวกลุ่มวันของประวัติ — วันนี้ / เมื่อวาน / 1 ต.ค. 69 (พ.ศ. แบบที่ทีมคุยกัน) */
function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ไม่ทราบวัน";
  const key = (x: Date) => x.toDateString();
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (key(d) === key(today)) return "วันนี้";
  if (key(d) === key(yest)) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

/** ข้อความล้วนสำหรับวางใน LINE — ถอด markdown ออก ลิงก์เหลือ url เปล่า */
function plainForLine(text: string) {
  return text
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1 $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export default function ChatbotPage() {
  return (
    <RequirePerm perm="orders.edit">
      <Chatbot />
    </RequirePerm>
  );
}

function Chatbot() {
  const me = useActor();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(newSessionId);
  const [docId, setDocId] = useState<string | null>(null);
  /** กำลังเปิดดูประวัติของรอบเก่า (พิมพ์ต่อ = เริ่มรอบใหม่ที่มีบริบทเดิม ไม่เขียนทับของคนอื่น) */
  const [viewing, setViewing] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [histErr, setHistErr] = useState("");
  const [histQ, setHistQ] = useState("");
  const [mine, setMine] = useState(true);
  /** มือถือ: แผงประวัติเปิดทับห้องแชท */
  const [histOpen, setHistOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const t0 = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chatbot", { cache: "no-store" });
      const d = (await res.json()) as { sessions?: Session[]; error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setSessions(d.sessions ?? []);
      setHistErr("");
    } catch (e) {
      setHistErr(`โหลดประวัติไม่ได้ — ${(e as Error).message} · กด ↻ ลองใหม่`);
      setSessions((s) => s ?? []);
    }
  }, []);
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // นับเวลาตอนรอ — ใช้บอก "กำลังทำขั้นไหน" (เว็บตอบ 2-5 วิ · คลังความรู้ n8n 15-20 วิ)
  useEffect(() => {
    if (!busy) return;
    t0.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // ช่องพิมพ์ขยายตามข้อความ (วางข้อความลูกค้าหลายบรรทัด) สูงสุด ~6 บรรทัด
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    // ส่งข้อความเต็ม + สินค้าของแต่ละคำตอบ — เซิร์ฟเวอร์ใช้ทั้งก้อนนี้เขียนประวัติ (ตัดสั้นให้ชั้นวิเคราะห์เองฝั่งนั้น)
    const history = msgs.filter((m) => !m.err).slice(-14).map((m) => ({ role: m.role, text: m.text, products: m.products, fromSite: m.fromSite }));
    let sid = sessionId;
    let did = docId;
    if (viewing) {
      sid = newSessionId();
      did = null;
      setSessionId(sid);
      setDocId(null);
      setViewing(null);
    }
    setMsgs((m) => [...m, { role: "user", text: q, at: new Date().toISOString() }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, sessionId: sid, docId: did, history }),
      });
      const d = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; docId?: string | null; products?: Product[]; fromSite?: boolean };
      if (res.ok && d.reply) {
        setMsgs((m) => [...m, { role: "bot", text: d.reply!, at: new Date().toISOString(), products: d.products, fromSite: d.fromSite }]);
        if (d.docId) setDocId(d.docId);
        loadSessions();
      } else {
        setMsgs((m) => [...m, { role: "bot", err: true, at: new Date().toISOString(), text: d.error || `ผู้ช่วยตอบไม่ได้ (HTTP ${res.status}) — กด ↻ ถามซ้ำ` }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "bot", err: true, at: new Date().toISOString(), text: "ต่อเซิร์ฟเวอร์ไม่ได้ — เช็คเน็ตแล้วกด ↻ ถามซ้ำ" }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function clearChat() {
    setMsgs([]);
    setSessionId(newSessionId());
    setDocId(null);
    setViewing(null);
    inputRef.current?.focus();
  }

  async function openSession(id: string) {
    if (busy) return;
    setHistOpen(false);
    try {
      const res = await fetch(`/api/admin/chatbot?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = (await res.json()) as { messages?: { role: string; text: string; timestamp: string; products?: Product[]; fromSite?: boolean }[]; error?: string };
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsgs((d.messages ?? []).map((m) => ({ role: m.role === "user" ? "user" : "bot", text: m.text, at: m.timestamp, products: m.products, fromSite: m.fromSite })));
      setViewing(id);
    } catch (e) {
      setHistErr(`เปิดประวัตินี้ไม่ได้ — ${(e as Error).message}`);
    }
  }

  async function copy(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(plainForLine(text));
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1800);
    } catch {
      /* เบราว์เซอร์ไม่ให้คัดลอก — ลากคลุมข้อความเองได้ */
    }
  }

  /** คำถามของลูกค้าที่อยู่ก่อนคำตอบนี้ — ใช้กับปุ่ม ↻ ถามซ้ำ */
  const questionBefore = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (msgs[k].role === "user") return msgs[k].text;
    return "";
  };

  /** ประวัติที่กรองแล้ว แบ่งกลุ่มตามวัน */
  const groups = useMemo(() => {
    const q = histQ.trim().toLowerCase();
    const list = (sessions ?? []).filter(
      (s) => (!mine || s.adminName === me) && (!q || s.summary.toLowerCase().includes(q) || s.adminName.toLowerCase().includes(q)),
    );
    const out: { day: string; items: Session[] }[] = [];
    for (const s of list) {
      const day = dayLabel(s.lastActivity);
      const g = out[out.length - 1];
      if (g?.day === day) g.items.push(s);
      else out.push({ day, items: [s] });
    }
    return out;
  }, [sessions, histQ, mine, me]);

  const activeId = viewing ?? docId;
  const title = msgs.find((m) => m.role === "user")?.text ?? "แชทใหม่";
  const step = elapsed < 4 ? "เช็คราคา/ตัวเลือกบนเว็บ…" : elapsed < 12 ? "ค้นคลังความรู้ร้าน…" : "เรียบเรียงคำตอบ… (คำถามที่ต้องค้นคลังความรู้ใช้ 15-20 วิ)";

  const history = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>
          ประวัติแชท
        </p>
        <button type="button" onClick={loadSessions} className="min-h-[36px] rounded-lg px-2 text-[12px] font-semibold hover:bg-[var(--dk-sky)]" style={{ color: "var(--dk-blue-deep)" }}>
          ↻ โหลดใหม่
        </button>
      </div>
      <input value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="ค้นคำถาม / ชื่อแอดมิน" className="dkb-inp mt-2 !py-2 !text-[13px]" />
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--dk-sky)" }}>
        {[
          { on: mine, label: "ของฉัน", pick: () => setMine(true) },
          { on: !mine, label: "ทุกคน", pick: () => setMine(false) },
        ].map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={t.pick}
            className="min-h-[36px] rounded-lg text-[13px] font-bold transition"
            style={t.on ? { background: "white", color: "var(--dk-navy)", boxShadow: "0 1px 3px var(--dk-hair)" } : { color: "var(--dk-navy-soft)" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {histErr && (
        <p className="mt-2 rounded-lg px-2 py-1.5 text-[12px]" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
          {histErr}
        </p>
      )}
      <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto px-1">
        {sessions === null && (
          <div className="space-y-2 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl" style={{ background: "var(--dk-sky)" }} />
            ))}
          </div>
        )}
        {sessions !== null && groups.length === 0 && !histErr && (
          <p className="px-1 py-4 text-[13px] leading-relaxed" style={{ color: "var(--dk-faint)" }}>
            {histQ ? "ไม่เจอคำถามที่ตรง — ลองคำอื่น หรือสลับไป “ทุกคน”" : mine ? "ยังไม่มีแชทของคุณ — ถามคำถามแรกแล้วจะบันทึกให้เอง" : "ยังไม่มีประวัติ"}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.day} className="mb-2">
            <p className="sticky top-0 z-[1] bg-white px-1 py-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--dk-faint)" }}>
              {g.day}
            </p>
            {g.items.map((s) => {
              const on = s.id === activeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s.id)}
                  className="block w-full rounded-xl border-l-[3px] px-2.5 py-2 text-left transition hover:bg-[var(--dk-sky)]"
                  style={{ borderColor: on ? "var(--dk-blue-deep)" : "transparent", background: on ? "var(--dk-sky)" : undefined }}
                >
                  <p className="line-clamp-2 text-[13px] font-semibold leading-snug" style={{ color: "var(--dk-navy)" }}>
                    {s.summary || "(ไม่มีข้อความ)"}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                    {hhmm(s.lastActivity)} · {mine ? `${s.messageCount} ข้อความ` : s.adminName || "ไม่ระบุชื่อ"}
                  </p>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <PageShell>
      <PageHead group="🤖 Chatbot" title="ผู้ช่วยตอบแชท" sub="วางคำถามลูกค้า → ได้คำตอบจากราคาจริงบนเว็บ + คลังความรู้ร้าน → คัดลอกไปตอบใน LINE" />
      <ChatbotTabs />

      <div className="relative mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── ประวัติ (เดสก์ท็อป) ── */}
        <aside className="hidden rounded-2xl border bg-white p-3 lg:block" style={{ borderColor: "var(--dk-hair)", height: "calc(100dvh - 240px)", minHeight: 480 }}>
          {history}
        </aside>

        {/* ── ประวัติ (มือถือ = แผ่นทับ) ── */}
        {histOpen && (
          <div className="fixed inset-0 z-[95] flex lg:hidden" role="dialog" aria-label="ประวัติแชท">
            <div className="h-full w-[86%] max-w-[340px] bg-white p-3 shadow-2xl">{history}</div>
            <button type="button" aria-label="ปิดประวัติ" className="flex-1" style={{ background: "rgba(23,58,107,.35)" }} onClick={() => setHistOpen(false)} />
          </div>
        )}

        {/* ── ห้องแชท ── */}
        <section
          className="flex flex-col overflow-hidden rounded-2xl border bg-white"
          style={{ borderColor: "var(--dk-hair)", height: "calc(100dvh - 240px)", minHeight: 480 }}
        >
          {/* หัวห้อง: เรื่องที่คุยอยู่ + ปุ่มรอง */}
          <div className="flex items-center gap-2 border-b px-3 py-2 sm:px-4" style={{ borderColor: "var(--dk-hair)" }}>
            <button
              type="button"
              onClick={() => setHistOpen(true)}
              className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-[18px] lg:hidden"
              style={{ background: "var(--dk-sky)" }}
              aria-label="เปิดประวัติแชท"
            >
              📜
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold" style={{ color: "var(--dk-navy)" }}>
                {title}
              </p>
              <p className="text-[11px]" style={{ color: "var(--dk-faint)" }}>
                {viewing ? "ประวัติเก่า · พิมพ์ต่อ = เปิดรอบใหม่โดยใช้บทสนทนานี้เป็นบริบท" : msgs.length ? `${msgs.length} ข้อความ · บันทึกอัตโนมัติ` : "ยังไม่ได้เริ่ม"}
              </p>
            </div>
            {msgs.length > 0 && (
              <button type="button" onClick={clearChat} disabled={busy} className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]">
                ＋ แชทใหม่
              </button>
            )}
          </div>

          {/* ข้อความ */}
          <div ref={boxRef} className="flex-1 overflow-y-auto px-3 py-5 sm:px-6" style={{ background: "linear-gradient(180deg, var(--dk-sky), white 140px)" }}>
            <div className="mx-auto max-w-[780px] space-y-5">
              {msgs.length === 0 && !busy && (
                <div className="py-10 text-center">
                  <p className="dkb-display text-[1.35rem]" style={{ color: "var(--dk-navy)" }}>
                    ลูกค้าถามอะไรมา?
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[13.5px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
                    วางข้อความจาก LINE ได้ทั้งก้อน · ถามต่อเนื่องได้ ผู้ช่วยจำบทสนทนาในรอบนี้ · หรือเริ่มจากตัวอย่างด้านล่าง
                  </p>
                </div>
              )}

              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex flex-col items-end">
                    <span className="mb-1 pr-1 text-[11px] font-semibold" style={{ color: "var(--dk-faint)" }}>
                      คำถามลูกค้า · <span className="tabular-nums">{hhmm(m.at)}</span>
                    </span>
                    <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-[15px] leading-relaxed text-white" style={{ background: "var(--dk-navy)" }}>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  </div>
                ) : (
                  <article
                    key={i}
                    className="rounded-2xl border bg-white"
                    style={{
                      borderColor: m.err ? "var(--dk-coral)" : "var(--dk-hair)",
                      boxShadow: m.err ? undefined : "0 6px 20px rgba(23,58,107,.06)",
                    }}
                  >
                    <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
                      <span className="text-[12px] font-bold" style={{ color: m.err ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}>
                        {m.err ? "⚠️ ตอบไม่ได้" : "🤖 คำตอบที่แนะนำ"}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                        {hhmm(m.at)}
                      </span>
                      {!m.err && (m.fromSite ? <Tag tone="mint">ราคาจริงจากเว็บ</Tag> : <Tag tone="lilac">คลังความรู้ร้าน</Tag>)}
                    </header>

                    <div className="break-words px-4 pb-3 pt-2 text-[15px] leading-[1.7]" style={{ color: m.err ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}>
                      {renderChatText(m.text, CLS)}
                    </div>

                    <ProductPics products={m.products} />

                    <footer className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5" style={{ borderColor: "var(--dk-hair)", background: "var(--dk-sky)" }}>
                      {!m.err && (
                        <button
                          type="button"
                          onClick={() => copy(i, m.text)}
                          className={`dkb-btn ${copied === i ? "" : "dkb-btn-yolk"} min-h-[44px] flex-1 sm:flex-none`}
                          style={copied === i ? { background: "var(--dk-mint)", color: "white" } : undefined}
                        >
                          {copied === i ? "✓ คัดลอกแล้ว — วางใน LINE ได้เลย" : "📋 คัดลอกไปตอบ LINE"}
                        </button>
                      )}
                      {questionBefore(i) && (
                        <button type="button" onClick={() => send(questionBefore(i))} disabled={busy} className="dkb-btn dkb-btn-ghost min-h-[44px]" title="ถามคำถามเดิมอีกครั้ง">
                          ↻ ถามซ้ำ
                        </button>
                      )}
                      {m.fromSite && (
                        <span className="ml-auto hidden text-[11px] sm:inline" style={{ color: "var(--dk-faint)" }}>
                          เครื่องคิดเงินเดียวกับตะกร้า
                        </span>
                      )}
                    </footer>
                  </article>
                ),
              )}

              {busy && (
                <div className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: "var(--dk-hair)" }} aria-live="polite">
                  <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                    <span className="h-2 w-2 animate-ping rounded-full" style={{ background: "var(--dk-blue-deep)" }} />
                    {step}
                    <span className="ml-auto tabular-nums" style={{ color: "var(--dk-faint)" }}>
                      {elapsed} วิ
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {[92, 76, 58].map((w) => (
                      <div key={w} className="h-3 animate-pulse rounded-full" style={{ width: `${w}%`, background: "var(--dk-sky)" }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ช่องพิมพ์ + คำถามด่วน */}
          <div className="border-t px-3 pb-3 pt-2 sm:px-4" style={{ borderColor: "var(--dk-hair)" }}>
            <div className="mx-auto max-w-[780px]">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
                {QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={busy}
                    onClick={() => send(q)}
                    className="min-h-[34px] shrink-0 rounded-full border px-3 text-[12.5px] font-semibold transition hover:bg-[var(--dk-sky)] disabled:opacity-40"
                    style={{ borderColor: "var(--dk-quiet)", color: "var(--dk-navy-soft)" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-end gap-2 rounded-2xl border bg-white p-1.5 focus-within:ring-2"
                style={{ borderColor: "var(--dk-quiet)", ["--tw-ring-color" as string]: "var(--dk-sky-300)" }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter = ส่ง · Shift+Enter = ขึ้นบรรทัดใหม่ · ระหว่างพิมพ์ไทยแบบ IME ไม่ส่ง
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  autoFocus
                  placeholder="วางหรือพิมพ์คำถามลูกค้า…"
                  className="min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none"
                  style={{ color: "var(--dk-navy)" }}
                />
                <button type="submit" disabled={busy || !input.trim()} className="dkb-btn dkb-btn-navy min-h-[44px] shrink-0 px-5 disabled:opacity-40">
                  {busy ? "กำลังตอบ…" : "ส่ง ↵"}
                </button>
              </form>
              <p className="mt-1 hidden px-1 text-[11px] sm:block" style={{ color: "var(--dk-faint)" }}>
                Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

/** 🖼 การ์ดภาพสินค้าใต้คำตอบ (สูงสุด 4 แบบ chat.html เดิม) — กดภาพ = เปิดหน้าสินค้า */
function ProductPics({ products }: { products?: Product[] }) {
  const pics = (products ?? []).filter((p) => p.image).slice(0, 4);
  if (!pics.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-4">
      {pics.map((p) => (
        <a
          key={p.url}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`เปิดหน้าสินค้า: ${p.name}`}
          className="group block overflow-hidden rounded-xl border bg-white transition hover:-translate-y-0.5"
          style={{ borderColor: "var(--dk-hair)" }}
        >
          <span className="block aspect-[4/3] overflow-hidden" style={{ background: "var(--dk-sky)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ภาพจาก CDN ของร้าน ขนาดต่างกัน ไม่ผ่าน next/image */}
            <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.04]" />
          </span>
          <span className="block truncate px-2 py-1.5 text-[12px] font-semibold" style={{ color: "var(--dk-navy)" }}>
            {p.name}
          </span>
        </a>
      ))}
    </div>
  );
}
