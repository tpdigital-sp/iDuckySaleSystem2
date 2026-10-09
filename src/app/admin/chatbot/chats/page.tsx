"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Empty, PageHead, PageShell, SearchBox, Tag } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { ago, botApi, ChatbotTabs, uploadBotImage, useToast } from "../bot-ui";

/**
 * 💬 แชท LINE ที่บอทเห็น — ห้องแชทรายคน + ข้อความครบ (ลูกค้าพิมพ์ / บอทตอบ / แอดมินตอบจากเว็บ) + สถานะลูกค้าใหม่/เก่า
 *
 * เจ้าของร้าน 8 ต.ค. 69 18:45: "อยากให้บอทเริ่มตอบจากลูกค้าใหม่ก่อน และบันทึกแชทด้วย"
 *   · ใหม่ = ทักครั้งแรกหลังเปิดโหมด (settings/bot-whitelist.newSince) และไม่มีออเดอร์ · เก่า = ที่เหลือ
 *   · ⚠️ ข้อความที่แอดมินพิมพ์เองใน LINE OA Manager ระบบไม่เห็น (LINE ไม่ส่งมาที่ webhook) — เห็นเฉพาะลูกค้า + บอท + ที่ตอบจากหน้านี้
 *
 * 9 ต.ค. 69 15:20 เจ้าของร้าน: "สร้างช่องพิมพ์แชทในหน้านี้" (แบบผสม — ใช้กับเคสบอทส่งต่อ/ลูกค้าที่เปิดบอท แชททั่วไปยังตอบใน OA Manager)
 *   · ช่องพิมพ์ + แนบรูป + การ์ดสินค้า → POST /api/admin/chatbot/chats/reply (สิทธิ์ chat.reply) = push นับโควตา LINE → มิเตอร์โควตาบนหัว
 *   · ส่งแล้วบอทพัก 30 นาที (botPausedUntil ฟิลด์เดียวกับปุ่ม ⏸ หน้า line-customers) · สวิตช์ 🤖 เปิด/ปิดบอทรายคน = /api/admin/line-customers/manage
 *   · ห้องที่เปิดอยู่โพลทุก 10 วิ · แท็บ "รอแอดมิน" = บอทส่งต่อ + ทักใน 48 ชม.
 */
type Row = {
  id: string;
  displayName: string;
  pictureUrl: string;
  lastSeen: string;
  createdAt: string;
  messageCount: number;
  lastUserText: string;
  scope: "new" | "old";
  botScope: string;
  needsHumanFollowup: boolean;
  botAllowed: boolean;
  pausedUntil: string;
  lastAdminAt: string;
};
type LogEntry = { role: string; text: string; at: string; type?: string; mode?: string; by?: string; imageUrl?: string; card?: { name: string; url: string } };
type Settings = { mode: string; newSince: string; enabled: boolean };
type ListRes = { rows: Row[]; settings: Settings; count: number; waitingCount: number };
type DetailRes = Row & { log: LogEntry[]; messages: LogEntry[]; settings: Settings };
type Quota = { limit: number | null; used: number; left: number | null; at: string };
type CatalogItem = { id?: string; name: string; url: string; image?: string; priceMin?: number; priceMax?: number };
type ReplyRes = { ok: boolean; sent: boolean; logged: boolean; entry?: LogEntry; pausedUntil?: string | null; warn?: string };

const SCOPES: { key: "waiting" | "all" | "new" | "old"; label: string }[] = [
  { key: "waiting", label: "🙋 รอแอดมิน" },
  { key: "all", label: "ทั้งหมด" },
  { key: "new", label: "🆕 ลูกค้าใหม่" },
  { key: "old", label: "👤 ลูกค้าเก่า" },
];

function timeTh(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ChatsPage() {
  // เข้าได้ด้วยสิทธิ์ใดสิทธิ์หนึ่ง: ตอบลูกค้า (chat.reply · เมนูหลักใช้ตัวนี้) หรือดูรายงาน (reports.view · ดูอย่างเดียว)
  const can = useCan();
  if (can("chat.reply")) return <Chats />;
  return (
    <RequirePerm perm="reports.view">
      <Chats />
    </RequirePerm>
  );
}

function Chats() {
  const { toast, toastNode } = useToast();
  const can = useCan();
  const canReply = can("chat.reply");
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState<"waiting" | "all" | "new" | "old">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string>("");
  const [detail, setDetail] = useState<DetailRes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&limit=80${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      setRows(d.rows);
      setSettings(d.settings);
      if (scope === "all") setWaitingCount(d.waitingCount);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setLoading(false);
    }
  }, [scope, q, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // รีเฟรชรายการทุก 30 วิ (แชทเข้าตลอด) — เฉพาะตอนไม่ได้ค้นหา
  useEffect(() => {
    if (q) return;
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load, q]);

  // 📊 โควตา LINE (แคชฝั่งเซิร์ฟเวอร์ 10 นาที) — โหลดตอนเปิดหน้า + ทุก 10 นาที
  const loadQuota = useCallback(async (fresh = false) => {
    try {
      setQuota(await botApi<Quota>(`/api/admin/chatbot/chats/quota${fresh ? "?fresh=1" : ""}`));
    } catch {
      setQuota(null);
    }
  }, []);
  useEffect(() => {
    void loadQuota();
    const t = setInterval(() => void loadQuota(), 10 * 60_000);
    return () => clearInterval(t);
  }, [loadQuota]);

  const openRoom = useCallback(
    async (id: string, quiet = false) => {
      setSel(id);
      if (!quiet) setDetailLoading(true);
      try {
        setDetail(await botApi<DetailRes>(`/api/admin/chatbot/chats?id=${id}`));
      } catch (e) {
        if (!quiet) toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        if (!quiet) setDetailLoading(false);
      }
    },
    [toast],
  );

  // ห้องที่เปิดอยู่โพลทุก 10 วิ — เห็นข้อความลูกค้าที่เพิ่งเข้ามาโดยไม่ต้องกดเอง
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(() => void openRoom(sel, true), 10_000);
    return () => clearInterval(t);
  }, [sel, openRoom]);

  // ข้อความที่จะแสดง: log ครบ (ตั้งแต่ 8 ต.ค. 69) ถ้าไม่มีใช้ messages 20 ตัวล่าสุด
  const thread: LogEntry[] = useMemo(() => (detail ? (detail.log.length ? detail.log : detail.messages) : []), [detail]);
  const threadKey = `${sel}:${thread.length}`;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadKey]);

  const counts = useMemo(() => ({ newN: rows.filter((r) => r.scope === "new").length, oldN: rows.filter((r) => r.scope === "old").length }), [rows]);
  const modeText = !settings
    ? ""
    : settings.mode === "log-only"
      ? "โหมดเก็บแชท — บอทตอบเฉพาะคนที่เปิดสวิตช์ 🤖 ไว้ · ที่เหลือแอดมินตอบ (ตอบจากหน้านี้ได้ หรือใน OA Manager)"
      : settings.mode === "new-only"
        ? `โหมดลูกค้าใหม่ก่อน — บอทตอบเฉพาะคนที่ทักครั้งแรกหลัง ${timeTh(settings.newSince)} (และรายชื่อทดสอบ)`
        : settings.enabled
          ? "โหมดรายชื่อทดสอบ — บอทตอบเฉพาะไอดีในรายชื่อ"
          : "บอทตอบทุกคน";

  /** ส่งแล้วต่อท้ายข้อความทันที + อัปเดตสถานะห้อง (ไม่ต้องรอโพล) */
  const onSent = useCallback(
    (r: ReplyRes) => {
      if (r.entry) {
        setDetail((d) => (d ? { ...d, log: [...(d.log.length ? d.log : d.messages), r.entry as LogEntry], messages: [], needsHumanFollowup: false, pausedUntil: r.pausedUntil ?? d.pausedUntil } : d));
      }
      setRows((rs) => rs.map((x) => (x.id === sel ? { ...x, needsHumanFollowup: false, pausedUntil: r.pausedUntil ?? x.pausedUntil, lastSeen: new Date().toISOString() } : x)));
      if (quota && quota.left !== null) setQuota({ ...quota, used: quota.used + 1, left: Math.max(0, quota.left - 1) });
      if (r.warn) toast(r.warn, true);
    },
    [sel, quota, toast],
  );

  const toggleBot = useCallback(
    async (id: string, allow: boolean) => {
      try {
        const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/line-customers/manage", { action: "toggle", userId: id, allow });
        toast(d.saved || (allow ? "เปิดบอทแล้ว" : "ปิดบอทแล้ว"));
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, botAllowed: allow } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, botAllowed: allow } : x));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast],
  );

  const wakeBot = useCallback(
    async (id: string) => {
      try {
        await botApi<{ ok: boolean }>("/api/admin/line-customers/manage", { action: "pause", userId: id, minutes: 0 });
        toast("ปลุกบอทแล้ว — บอทกลับมาตอบลูกค้ารายนี้");
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, pausedUntil: "" } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, pausedUntil: "" } : x));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast],
  );

  const quotaLow = quota?.left !== null && quota?.left !== undefined && quota.left < 3000;
  const quotaOut = quota?.left !== null && quota?.left !== undefined && quota.left < 500;

  return (
    <PageShell wide>
      <PageHead group="🤖 Chatbot" title="แชท LINE" count={rows.length ? `${rows.length} ห้อง` : undefined} sub={modeText} tools={<ChatbotTabs inHead />} toolsTop />

      <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScope(s.key)}
            className="min-h-[36px] rounded-full px-3.5 text-[13px] font-bold transition"
            style={scope === s.key ? { background: "var(--dk-navy)", color: "white" } : { background: "white", color: "var(--dk-navy-soft)", border: "1px solid var(--dk-hair)" }}
          >
            {s.label}
            {s.key === "waiting" && waitingCount ? ` ${waitingCount}` : s.key === "new" && counts.newN ? ` ${counts.newN}` : s.key === "old" && counts.oldN ? ` ${counts.oldN}` : ""}
          </button>
        ))}
        <div className="min-w-[220px] flex-1">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อลูกค้า (ขึ้นต้นด้วย…)" />
        </div>
        <Btn onClick={() => void load()} small>
          รีเฟรช
        </Btn>
        {/* 📊 มิเตอร์โควตา LINE — ตอบจากหน้านี้นับโควตา (OA Manager ไม่นับ) */}
        <button
          type="button"
          onClick={() => void loadQuota(true)}
          title="โควตาข้อความ LINE เดือนนี้ (push จากเว็บ/บอทนับ · ตอบใน OA Manager ไม่นับ) — กดเพื่ออ่านใหม่"
          className="min-h-[36px] rounded-full px-3.5 text-[12.5px] font-bold"
          style={
            quotaOut
              ? { background: "var(--dk-coral-ink)", color: "white" }
              : quotaLow
                ? { background: "#FFF4D6", color: "#8A5A00", border: "1px solid #F0D48A" }
                : { background: "white", color: "var(--dk-navy-soft)", border: "1px solid var(--dk-hair)" }
          }
        >
          {quota ? (quota.limit === null ? `LINE ใช้ไป ${quota.used.toLocaleString()} ข้อความ` : `LINE เหลือ ${quota.left?.toLocaleString()} / ${quota.limit.toLocaleString()}`) : "LINE โควตา —"}
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* รายการห้อง */}
        <div className="dkb-card max-h-[75vh] overflow-y-auto p-2">
          {loading && !rows.length ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !rows.length ? (
            <Empty title={scope === "waiting" ? "ไม่มีห้องที่รอแอดมิน" : "ยังไม่มีห้องแชท"} body={q ? "ไม่พบชื่อที่ค้น — ลองพิมพ์คำขึ้นต้นของชื่อ LINE" : "เมื่อลูกค้าทักมา ห้องจะขึ้นที่นี่"} />
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void openRoom(r.id)}
                className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-black/[0.03]"
                style={sel === r.id ? { background: "var(--dk-mint-bg, #ECFDF5)" } : undefined}
              >
                {r.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.pictureUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-full" style={{ background: "var(--dk-hair)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold" style={{ color: "var(--dk-navy)" }}>
                      {r.displayName || r.id.slice(0, 10) + "…"}
                    </span>
                    <Tag tone={r.scope === "new" ? "mint" : "quiet"}>{r.scope === "new" ? "ใหม่" : "เก่า"}</Tag>
                    {r.botAllowed ? <Tag tone="sky">🤖 บอทตอบ</Tag> : null}
                    {r.pausedUntil ? <Tag tone="lilac">⏸ พักบอท</Tag> : null}
                    {r.needsHumanFollowup ? <Tag tone="coral">รอแอดมิน</Tag> : null}
                  </div>
                  <p className="truncate text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                    {r.lastUserText || "—"}
                  </p>
                  <p className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    {r.lastSeen ? ago(r.lastSeen) : ""}
                    {r.messageCount ? ` · บอทคุย ${r.messageCount} ข้อความ` : ""}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* ห้องที่เลือก */}
        <div className="dkb-card flex max-h-[75vh] min-h-[420px] flex-col p-0">
          {!sel ? (
            <div className="p-6">
              <Empty title="เลือกห้องแชททางซ้าย" body="จะเห็นข้อความที่ลูกค้าพิมพ์ ที่บอทตอบ และที่แอดมินตอบจากหน้านี้ (ข้อความที่แอดมินพิมพ์เองใน LINE OA Manager ระบบไม่เห็น)" />
            </div>
          ) : detailLoading && !detail ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--dk-hair)" }}>
                <span className="text-[15px] font-bold" style={{ color: "var(--dk-navy)" }}>
                  {detail.displayName || detail.id}
                </span>
                <Tag tone={detail.scope === "new" ? "mint" : "quiet"}>{detail.scope === "new" ? "🆕 ลูกค้าใหม่" : "👤 ลูกค้าเก่า"}</Tag>
                {detail.needsHumanFollowup ? <Tag tone="coral">รอแอดมิน</Tag> : null}
                {detail.pausedUntil ? <Tag tone="lilac">⏸ บอทพักถึง {timeTh(detail.pausedUntil)}</Tag> : null}
                <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  ทักครั้งแรก {detail.createdAt ? timeTh(detail.createdAt) : "—"} · ล่าสุด {detail.lastSeen ? ago(detail.lastSeen) : "—"}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {canReply && detail.pausedUntil ? (
                    <Btn small onClick={() => void wakeBot(detail.id)} title="ให้บอทกลับมาตอบคนนี้ทันที">
                      ▶ ปลุกบอท
                    </Btn>
                  ) : null}
                  {can("orders.edit") ? (
                    <Btn small tone={detail.botAllowed ? "ghost" : "navy"} onClick={() => void toggleBot(detail.id, !detail.botAllowed)} title="สวิตช์เดียวกับหน้า ลูกค้า LINE">
                      {detail.botAllowed ? "🤖 ปิดบอทคนนี้" : "🤖 เปิดบอทคนนี้"}
                    </Btn>
                  ) : null}
                </span>
              </div>
              <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {!thread.length ? (
                  <p className="text-sm" style={{ color: "var(--dk-faint)" }}>
                    ยังไม่มีข้อความที่บันทึกไว้
                  </p>
                ) : (
                  thread.map((m, i) => {
                    const admin = m.role === "admin";
                    const mine = m.role === "assistant" || admin;
                    return (
                      <div key={i} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                        <div
                          className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed"
                          style={admin ? { background: "#E6F4F1", color: "#153B3F", border: "1px solid #BFE3DB" } : mine ? { background: "#F1F5F9", color: "var(--dk-navy)" } : { background: "#DCF8C6", color: "#1F2937" }}
                        >
                          {m.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.imageUrl} alt="" className="mb-1 max-h-60 rounded-lg" />
                          ) : null}
                          {m.card ? (
                            <a href={m.card.url} target="_blank" rel="noreferrer" className="mb-1 block rounded-lg border px-2 py-1 text-[12.5px] underline" style={{ borderColor: "#BFE3DB" }}>
                              🧾 การ์ดสินค้า: {m.card.name}
                            </a>
                          ) : null}
                          {m.text}
                          <div className="mt-1 text-[10.5px] opacity-60">
                            {admin ? `แอดมิน${m.by ? ` · ${m.by}` : ""}` : mine ? "บอท" : "ลูกค้า"}
                            {!admin && m.mode ? ` · ${m.mode}` : ""} · {timeTh(m.at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {detail.log.length === 0 && detail.messages.length ? (
                  <p className="pt-2 text-center text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                    ห้องนี้ยังไม่มีบันทึกแบบครบ (เริ่มเก็บ 8 ต.ค. 69) — แสดง 20 ข้อความล่าสุดที่บอทจำไว้
                  </p>
                ) : null}
              </div>
              {canReply ? (
                <Composer id={detail.id} disabled={quotaOut} quotaLow={quotaLow} onSent={onSent} toast={toast} />
              ) : (
                <p className="border-t px-4 py-2 text-[12px]" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-faint)" }}>
                  บัญชีนี้ดูแชทได้อย่างเดียว — ตอบลูกค้าต้องมีสิทธิ์ "ตอบลูกค้า LINE" (ตั้งค่าระบบ → บทบาท)
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
      {toastNode}
    </PageShell>
  );
}

/** ช่องพิมพ์ตอบลูกค้า — ข้อความ · แนบรูป 1 รูป · การ์ดสินค้าจากแคตตาล็อกเว็บ · Enter = ส่ง (Shift+Enter ขึ้นบรรทัด) */
function Composer({ id, disabled, quotaLow, onSent, toast }: { id: string; disabled: boolean; quotaLow: boolean; onSent: (r: ReplyRes) => void; toast: (t: string, bad?: boolean) => void }) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [card, setCard] = useState<CatalogItem | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // เปลี่ยนห้อง = ล้างช่อง
  useEffect(() => {
    setText("");
    setImage(null);
    setCard(null);
  }, [id]);

  const openPicker = useCallback(async () => {
    setPickOpen(true);
    if (catalog) return;
    try {
      const res = await fetch("/api/pricing/search?catalog=1", { cache: "no-store" });
      const d = (await res.json()) as { items?: CatalogItem[] };
      setCatalog(Array.isArray(d.items) ? d.items : []);
    } catch {
      setCatalog([]);
      toast("โหลดแคตตาล็อกสินค้าไม่ได้", true);
    }
  }, [catalog, toast]);

  const picks = useMemo(() => {
    if (!catalog) return [];
    const k = pickQ.trim().toLowerCase();
    const list = k ? catalog.filter((x) => x.name.toLowerCase().includes(k)) : catalog;
    return list.slice(0, 8);
  }, [catalog, pickQ]);

  const onFile = useCallback(
    async (f: File | undefined) => {
      if (!f) return;
      setUploading(true);
      try {
        const up = await uploadBotImage(`chat-${id}`, f);
        setImage({ url: up.url, name: f.name });
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [id, toast],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t && !image && !card) return;
    if (sending) return;
    setSending(true);
    try {
      const r = await botApi<ReplyRes>("/api/admin/chatbot/chats/reply", {
        id,
        text: t,
        imageUrl: image?.url ?? "",
        card: card ? { name: card.name, url: card.url, image: card.image, priceMin: card.priceMin, priceMax: card.priceMax } : undefined,
      });
      setText("");
      setImage(null);
      setCard(null);
      onSent(r);
      areaRef.current?.focus();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSending(false);
    }
  }, [text, image, card, sending, id, onSent, toast]);

  return (
    <div className="border-t px-3 py-2" style={{ borderColor: "var(--dk-hair)", background: "white" }}>
      {quotaLow ? (
        <p className="mb-1 text-[11.5px]" style={{ color: disabled ? "var(--dk-coral-ink)" : "#8A5A00" }}>
          {disabled ? "โควตา LINE เดือนนี้เหลือน้อยมาก — ปุ่มส่งปิดไว้ ไปตอบใน LINE OA Manager แทนนะคะ" : "โควตา LINE เหลือน้อย — ส่งเท่าที่จำเป็น ที่เหลือตอบใน OA Manager"}
        </p>
      ) : null}
      {(image || card) && (
        <div className="mb-1.5 flex flex-wrap gap-2">
          {image ? (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "var(--dk-sky)" }}>
              🖼 {image.name.slice(0, 24)}
              <button type="button" onClick={() => setImage(null)} aria-label="เอารูปออก" className="ml-1 font-bold">
                ✕
              </button>
            </span>
          ) : null}
          {card ? (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "var(--dk-sky)" }}>
              🧾 {card.name.slice(0, 30)}
              <button type="button" onClick={() => setCard(null)} aria-label="เอาการ์ดออก" className="ml-1 font-bold">
                ✕
              </button>
            </span>
          ) : null}
        </div>
      )}
      {pickOpen ? (
        <div className="mb-2 rounded-xl border p-2" style={{ borderColor: "var(--dk-hair)" }}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBox value={pickQ} onChange={setPickQ} placeholder="พิมพ์ชื่อสินค้า…" />
            </div>
            <Btn small onClick={() => setPickOpen(false)}>
              ปิด
            </Btn>
          </div>
          <div className="mt-1 max-h-48 overflow-y-auto">
            {!catalog ? (
              <p className="p-2 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                กำลังโหลดแคตตาล็อก…
              </p>
            ) : (
              picks.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => {
                    setCard(p);
                    setPickOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-black/[0.03]"
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--dk-navy)" }}>
                    {p.name}
                  </span>
                  <span className="text-[12px]" style={{ color: "#A05A00" }}>
                    {p.priceMin && p.priceMax && p.priceMax > p.priceMin ? `฿${p.priceMin.toLocaleString()}–${p.priceMax.toLocaleString()}` : p.priceMin ? `เริ่ม ฿${p.priceMin.toLocaleString()}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={disabled ? "ส่งจากหน้านี้ไม่ได้ชั่วคราว (โควตา LINE)" : "พิมพ์ตอบลูกค้า… (Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่)"}
          disabled={disabled || sending}
          className="min-h-[44px] flex-1 resize-y rounded-xl border px-3 py-2 text-[14px] outline-none focus:ring-2"
          style={{ borderColor: "var(--dk-hair)" }}
        />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading || !!image}
          title="แนบรูป 1 รูป"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-lg disabled:opacity-40"
          style={{ borderColor: "var(--dk-hair)" }}
        >
          {uploading ? "…" : "🖼"}
        </button>
        <button
          type="button"
          onClick={() => void openPicker()}
          disabled={disabled || !!card}
          title="ส่งการ์ดสินค้า (รูป ชื่อ ช่วงราคา ปุ่มสั่งซื้อ)"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-lg disabled:opacity-40"
          style={{ borderColor: "var(--dk-hair)" }}
        >
          🧾
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={disabled || sending || (!text.trim() && !image && !card)}
          className="dkb-btn dkb-btn-navy min-h-[44px] shrink-0 px-4 disabled:opacity-40"
        >
          {sending ? "กำลังส่ง…" : "ส่ง"}
        </button>
      </div>
      <p className="mt-1 text-[11px]" style={{ color: "var(--dk-faint)" }}>
        ส่งแล้วบอทจะพักให้คนนี้ 30 นาที (กด ▶ ปลุกบอท ถ้าจะให้บอทตอบต่อ) · ทุกข้อความจากหน้านี้นับโควตา LINE
      </p>
    </div>
  );
}
