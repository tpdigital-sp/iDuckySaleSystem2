"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Empty, SearchBox } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { ago, botApi, uploadBotImage, useToast } from "../bot-ui";
import { CUSTOMER_TAGS, type CustomerTag } from "@/lib/line-tags";

/**
 * 💬 แชท LINE / ตอบลูกค้า — หน้าตาเลียนแบบ LINE OA Manager (เจ้าของร้าน 9 ต.ค. 69 16:05: "ออกแบบใหม่ เลียนแบบ LINE OA + รองรับตอบแชทบนมือถือ")
 *   · เดสก์ท็อป: 2 คอลัมน์เต็มจอ (รายชื่อซ้าย 380px · ห้องสนทนาขวา) ไม่มีสกรอลทั้งหน้า — สกรอลเฉพาะรายชื่อ/ข้อความ
 *   · มือถือ: หน้ารายชื่อ → แตะห้อง = เปิดห้องเต็มจอ (ปุ่ม ← กลับ) · ช่องพิมพ์ติดขอบล่าง เผื่อ safe-area · สูง 100dvh กันคีย์บอร์ดดันหลุด
 *   · ฟอง: ลูกค้าซ้ายสีขาว + รูปโปรไฟล์ · ฝั่งร้าน (บอท/แอดมิน) ขวา — แอดมินเขียว LINE · บอทฟ้าอ่อน · เวลาเล็ก ๆ ข้างฟอง · คั่นวันเป็นเม็ดยากลางจอ
 *
 * ของเดิม (8–9 ต.ค. 69): ห้อง = line-conversations/{id} + log (ลูกค้า/บอท/แอดมินจากเว็บ · แอดมินพิมพ์ใน OA Manager ไม่เห็น)
 *   · ส่ง = POST /api/admin/chatbot/chats/reply (สิทธิ์ chat.reply · push นับโควตา · พักบอท 30 นาที) · มิเตอร์โควตา · 🤖 เปิด/ปิดบอท · ▶ ปลุกบอท
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
  adminTag: string;
  adminNote: string;
  adminAlias: string;
};
type LogEntry = { role: string; text: string; at: string; type?: string; mode?: string; by?: string; imageUrl?: string; card?: { name: string; url: string } };
type Settings = { mode: string; newSince: string; enabled: boolean };
type ListRes = { rows: Row[]; settings: Settings; count: number; waitingCount: number };
type DetailRes = Row & { log: LogEntry[]; messages: LogEntry[]; settings: Settings };
type Quota = { limit: number | null; used: number; left: number | null; at: string };
type CatalogItem = { id?: string; name: string; url: string; image?: string; priceMin?: number; priceMax?: number };
type ReplyRes = { ok: boolean; sent: boolean; logged: boolean; entry?: LogEntry; pausedUntil?: string | null; warn?: string };
type Scope = "waiting" | "all" | "new" | "old";

const LINE_GREEN = "#06C755";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "waiting", label: "🙋 รอแอดมิน" },
  { key: "new", label: "🆕 ใหม่" },
  { key: "old", label: "👤 เก่า" },
];

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
};
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const same = (a: Date, b: Date) => a.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) === b.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
  if (same(d, today)) return "วันนี้";
  const y = new Date(today.getTime() - 86400_000);
  if (same(d, y)) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit" });
};
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
/** เวลาในรายชื่อแบบ LINE: วันนี้ = HH:mm · อื่น ๆ = d MMM */
const listTime = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dayKey(iso) === dayKey(new Date().toISOString()) ? fmtTime(iso) : d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });
};

function Avatar({ src, size = 44 }: { src?: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="shrink-0 rounded-full" style={{ width: size, height: size, background: "var(--dk-hair)" }} />
  );
}

const nameOf = (r: { adminAlias?: string; displayName?: string; id: string }) => r.adminAlias || r.displayName || r.id.slice(0, 10) + "…";
const tagOf = (k: string) => CUSTOMER_TAGS.find((t) => t.key === k) ?? null;
/** 🏷 ป้ายความเร่งด่วน — ชุดเดียวกับหน้า ลูกค้า LINE (CUSTOMER_TAGS) */
function TagChip({ k }: { k: string }) {
  const t = tagOf(k);
  if (!t) return null;
  return (
    <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-bold" style={{ background: t.wash, color: t.ink }}>
      {t.dot} {t.label}
    </span>
  );
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
  const [scope, setScope] = useState<Scope>("all");
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

  // 📊 โควตา LINE (แคชฝั่งเซิร์ฟเวอร์ 10 นาที)
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

  // ห้องที่เปิดอยู่โพลทุก 10 วิ
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(() => void openRoom(sel, true), 10_000);
    return () => clearInterval(t);
  }, [sel, openRoom]);

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
      ? "บอทตอบเฉพาะคนที่เปิดสวิตช์ 🤖 · ที่เหลือแอดมินตอบ"
      : settings.mode === "new-only"
        ? "บอทตอบเฉพาะลูกค้าใหม่"
        : settings.enabled
          ? "บอทตอบเฉพาะรายชื่อทดสอบ"
          : "บอทตอบทุกคน";

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

  // 🏷📝 ป้าย + โน้ต (เจ้าของร้าน 9 ต.ค. 69 16:20 "ทำ note ติด tag ได้") — ฟิลด์เดียวกับหน้า ลูกค้า LINE (adminTag/adminNote) ผ่าน manage API
  const [noteOpen, setNoteOpen] = useState(false);
  // 🔍 17:05 "กดขยายดูภาพใหญ่ + ดาวน์โหลดได้"
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  // เปลี่ยนห้อง = ปิดแผง · โน้ตในฐานเปลี่ยน (บันทึก/โพล) = ซิงก์ร่าง แต่ไม่ปิดแผง
  useEffect(() => {
    setNoteOpen(false);
  }, [sel]);
  useEffect(() => {
    setNoteDraft(detail?.adminNote ?? "");
  }, [sel, detail?.adminNote]);
  const saveTag = useCallback(
    async (id: string, tag: CustomerTag | "") => {
      try {
        const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/line-customers/manage", { action: "tag", userId: id, tag });
        toast(d.saved || "บันทึกป้ายแล้ว");
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, adminTag: tag } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, adminTag: tag } : x));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast],
  );
  const saveNote = useCallback(
    async (id: string, note: string) => {
      setNoteSaving(true);
      try {
        const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/line-customers/manage", { action: "note", userId: id, adminNote: note });
        toast(d.saved || "บันทึกโน้ตแล้ว");
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, adminNote: note } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, adminNote: note } : x));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        setNoteSaving(false);
      }
    },
    [toast],
  );

  // 🖼 16:35 เจ้าของร้าน "ต้องการให้สามารถโยนภาพได้" — ลากรูปวางที่ไหนก็ได้ในห้อง (หรือ Ctrl/Cmd+V ในช่องพิมพ์) → Composer อัปแล้วแนบ
  const [dropFile, setDropFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const onDragEnter = (e: React.DragEvent) => {
    if (!canReply || !sel) return;
    if (![...e.dataTransfer.types].includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!canReply || !sel) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
    if (f) setDropFile(f);
    else toast("รับเฉพาะไฟล์รูปภาพ (JPG/PNG)", true);
  };

  const quotaLow = quota?.left !== null && quota?.left !== undefined && quota.left < 3000;
  const quotaOut = quota?.left !== null && quota?.left !== undefined && quota.left < 500;
  const quotaText = quota ? (quota.limit === null ? `ใช้ไป ${quota.used.toLocaleString()}` : `${quota.left?.toLocaleString()} / ${quota.limit.toLocaleString()}`) : "—";

  // 🖥 ชั้นนอก: ยกเลิก padding ของ <main> แล้วกินเต็มจอที่เหลือ — วัดระยะจากขอบบนจริง (มือถือมีหัว AdminShell + แถบสถานะเชื่อมต่อ 2 บรรทัด · เดสก์ท็อปไม่มี)
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [topOffset, setTopOffset] = useState(56);
  useEffect(() => {
    const measure = () => {
      const el = shellRef.current;
      if (el) setTopOffset(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div ref={shellRef} className="-mx-4 -my-6 flex overflow-hidden md:-mx-8 md:-my-8" style={{ background: "#EEF2F7", color: "var(--dk-navy)", height: `calc(100dvh - ${topOffset}px)` }}>
      {/* ───── รายชื่อห้อง (ซ้าย) — มือถือซ่อนเมื่อเปิดห้อง ───── */}
      <aside className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r bg-white md:w-[290px] lg:w-[310px]`} style={{ borderColor: "var(--dk-hair)" }}>
        <div className="flex items-center gap-2 px-3 pt-3">
          <h1 className="text-[18px] font-extrabold">แชท LINE</h1>
          <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
            {rows.length ? `${rows.length} ห้อง` : ""}
          </span>
          <button
            type="button"
            onClick={() => void loadQuota(true)}
            title="โควตาข้อความ LINE เดือนนี้ (ส่งจากหน้านี้/บอทนับ · ตอบใน OA Manager ไม่นับ) — กดเพื่ออ่านใหม่"
            className="ml-auto rounded-full px-2.5 py-1 text-[11.5px] font-bold"
            style={
              quotaOut
                ? { background: "var(--dk-coral-ink)", color: "white" }
                : quotaLow
                  ? { background: "#FFF4D6", color: "#8A5A00", border: "1px solid #F0D48A" }
                  : { background: "#F1F5F9", color: "var(--dk-navy-soft)" }
            }
          >
            โควตา {quotaText}
          </button>
        </div>
        <p className="px-3 pt-0.5 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
          {modeText}
        </p>
        <div className="px-3 pt-2">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อลูกค้า…" />
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 py-2">
          {SCOPES.map((s) => {
            const n = s.key === "waiting" ? waitingCount : s.key === "new" ? counts.newN : s.key === "old" ? counts.oldN : 0;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setScope(s.key)}
                className="min-h-[30px] rounded-full px-2.5 text-[12px] font-bold transition"
                style={scope === s.key ? { background: "var(--dk-navy)", color: "white" } : { background: "#F1F5F9", color: "var(--dk-navy-soft)" }}
              >
                {s.label}
                {n ? ` ${n}` : ""}
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && !rows.length ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !rows.length ? (
            <div className="p-4">
              <Empty title={scope === "waiting" ? "ไม่มีห้องที่รอแอดมิน" : "ยังไม่มีห้องแชท"} body={q ? "ไม่พบชื่อที่ค้น — ลองพิมพ์คำขึ้นต้นของชื่อ LINE" : "เมื่อลูกค้าทักมา ห้องจะขึ้นที่นี่"} />
            </div>
          ) : (
            rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void openRoom(r.id)}
                className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition active:bg-black/[0.04]"
                style={{ borderColor: "#F1F3F6", background: sel === r.id ? "#EDF6FF" : undefined }}
              >
                <div className="relative">
                  <Avatar src={r.pictureUrl} size={46} />
                  {r.needsHumanFollowup ? <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: LINE_GREEN }} /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{nameOf(r)}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--dk-faint)" }}>
                      {listTime(r.lastSeen)}
                    </span>
                  </div>
                  <p className="truncate text-[12.5px]" style={{ color: r.needsHumanFollowup ? "var(--dk-navy)" : "var(--dk-faint)", fontWeight: r.needsHumanFollowup ? 600 : 400 }}>
                    {r.lastUserText || (r.messageCount ? `บอทคุย ${r.messageCount} ข้อความ` : "—")}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.adminTag ? <TagChip k={r.adminTag} /> : null}
                    {r.adminNote ? <span className="text-[10.5px]" title={r.adminNote} style={{ color: "var(--dk-faint)" }}>📝</span> : null}
                    {r.scope === "new" ? <Chip tone="mint">ใหม่</Chip> : null}
                    {r.botAllowed ? <Chip tone="sky">🤖 บอทตอบ</Chip> : null}
                    {r.pausedUntil ? <Chip tone="lilac">⏸ พักบอท</Chip> : null}
                    {r.needsHumanFollowup ? <Chip tone="coral">รอแอดมิน</Chip> : null}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ───── ห้องสนทนา (ขวา) — มือถือเต็มจอเมื่อเปิดห้อง ───── */}
      <section
        className={`${sel ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col`}
        onDragEnter={onDragEnter}
        onDragOver={(e) => {
          if (canReply && sel) e.preventDefault();
        }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" style={{ background: "rgba(6,199,85,.12)", border: `3px dashed ${LINE_GREEN}` }}>
            <div className="rounded-2xl bg-white px-5 py-3 text-[15px] font-bold shadow" style={{ color: "#0E7A3A" }}>
              🖼 วางรูปตรงนี้เพื่อแนบส่งให้ลูกค้า
            </div>
          </div>
        ) : null}
        {!sel ? (
          <div className="m-auto max-w-md p-6 text-center">
            <div className="text-5xl">💬</div>
            <p className="mt-2 text-[15px] font-bold">เลือกห้องแชททางซ้าย</p>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
              เห็นข้อความลูกค้า บอท และที่แอดมินตอบจากหน้านี้ · ข้อความที่แอดมินพิมพ์เองใน LINE OA Manager ระบบไม่เห็น
            </p>
          </div>
        ) : (
          <>
            {/* หัวห้อง */}
            <div className="flex items-center gap-2 border-b bg-white px-2 py-2 md:px-4" style={{ borderColor: "var(--dk-hair)" }}>
              <button type="button" onClick={() => setSel("")} aria-label="กลับไปรายชื่อ" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl md:hidden">
                ←
              </button>
              <Avatar src={detail?.pictureUrl} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold">{detail ? nameOf(detail) : sel}</span>
                  {detail?.adminTag ? <TagChip k={detail.adminTag} /> : null}
                  {detail?.scope === "new" ? <Chip tone="mint">ใหม่</Chip> : null}
                  {detail?.pausedUntil ? <Chip tone="lilac">⏸ พักถึง {fmtTime(detail.pausedUntil)}</Chip> : detail?.botAllowed ? <Chip tone="sky">🤖 บอทตอบ</Chip> : null}
                  {detail?.needsHumanFollowup ? <Chip tone="coral">รอแอดมิน</Chip> : null}
                </div>
                <p className="truncate text-[11px]" style={{ color: "var(--dk-faint)" }}>
                  {detail?.createdAt ? `ทักครั้งแรก ${fmtDay(detail.createdAt)}` : ""}
                  {detail?.lastSeen ? ` · ล่าสุด ${ago(detail.lastSeen)}` : ""}
                </p>
              </div>
              {/* 🤖 17:05 เจ้าของร้าน "กดแล้วควรแสดงอะไรที่แตกต่าง" — สวิตช์เป็นเม็ดยาบอกสถานะชัด: เขียว "บอทตอบ: เปิด" / เทา "บอทตอบ: ปิด" / ม่วง "พักถึง HH:mm" (กดเพื่อสลับ) */}
              {detail ? <BotPill detail={detail} canToggle={can("orders.edit") || canReply} onToggle={() => void toggleBot(detail.id, !detail.botAllowed)} onWake={() => void wakeBot(detail.id)} /> : null}
              {detail ? (
                <IconBtn onClick={() => setNoteOpen((v) => !v)} title="ข้อมูลลูกค้า · ป้าย · โน้ต" active={noteOpen}>
                  ℹ️
                </IconBtn>
              ) : null}
            </div>

            {/* ข้อความ */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-3 md:px-6" style={{ background: "#EEF2F7" }}>
              {detailLoading && !detail ? (
                <p className="text-sm" style={{ color: "var(--dk-faint)" }}>
                  กำลังโหลด…
                </p>
              ) : !thread.length ? (
                <p className="py-8 text-center text-sm" style={{ color: "var(--dk-faint)" }}>
                  ยังไม่มีข้อความที่บันทึกไว้
                </p>
              ) : (
                thread.map((m, i) => {
                  const admin = m.role === "admin";
                  const ours = m.role === "assistant" || admin;
                  const showDay = i === 0 || dayKey(m.at) !== dayKey(thread[i - 1].at);
                  return (
                    <div key={i}>
                      {showDay ? (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full px-3 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(0,0,0,.08)", color: "#4B5563" }}>
                            {fmtDay(m.at)}
                          </span>
                        </div>
                      ) : null}
                      <div className={`mb-2 flex items-end gap-1.5 ${ours ? "justify-end" : "justify-start"}`}>
                        {!ours ? <Avatar src={detail?.pictureUrl} size={28} /> : null}
                        {ours ? (
                          <span className="mb-0.5 shrink-0 text-right text-[10px] leading-tight" style={{ color: "var(--dk-faint)" }}>
                            {admin ? m.by || "แอดมิน" : "บอท"}
                            <br />
                            {fmtTime(m.at)}
                          </span>
                        ) : null}
                        <div
                          className="max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed md:max-w-[62%]"
                          style={
                            admin
                              ? { background: "#C9F2D0", color: "#143B1E", borderRadius: "18px 4px 18px 18px" }
                              : ours
                                ? { background: "#E4EEFB", color: "var(--dk-navy)", borderRadius: "18px 4px 18px 18px" }
                                : { background: "white", color: "#1F2937", borderRadius: "4px 18px 18px 18px", boxShadow: "0 1px 1px rgba(0,0,0,.05)" }
                          }
                        >
                          {m.imageUrl ? (
                            <button type="button" onClick={() => setLightbox({ url: m.imageUrl as string, name: `line-${(m.at || "").slice(0, 16).replace(/[^0-9]/g, "")}.jpg` })} className="mb-1 block" title="กดเพื่อดูรูปใหญ่ / ดาวน์โหลด">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={m.imageUrl} alt="" className="max-h-64 rounded-lg transition hover:opacity-90" />
                            </button>
                          ) : null}
                          {m.card ? (
                            <a href={m.card.url} target="_blank" rel="noreferrer" className="mb-1 block rounded-lg border bg-white/70 px-2 py-1 text-[12.5px] underline" style={{ borderColor: "#A8DFB3" }}>
                              🧾 การ์ดสินค้า: {m.card.name}
                            </a>
                          ) : null}
                          {m.text}
                        </div>
                        {!ours ? (
                          <span className="mb-0.5 shrink-0 text-[10px]" style={{ color: "var(--dk-faint)" }}>
                            {fmtTime(m.at)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
              {detail && detail.log.length === 0 && detail.messages.length ? (
                <p className="pb-2 text-center text-[11px]" style={{ color: "var(--dk-faint)" }}>
                  ห้องนี้ยังไม่มีบันทึกแบบครบ (เริ่มเก็บ 8 ต.ค. 69) — แสดง 20 ข้อความล่าสุดที่บอทจำไว้
                </p>
              ) : null}
            </div>

            {canReply ? (
              <Composer id={sel} disabled={quotaOut} quotaLow={quotaLow} onSent={onSent} toast={toast} dropFile={dropFile} onDropConsumed={() => setDropFile(null)} />
            ) : (
              <p className="border-t bg-white px-4 py-3 text-[12px]" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-faint)" }}>
                บัญชีนี้ดูแชทได้อย่างเดียว — ตอบลูกค้าต้องมีสิทธิ์ "ตอบลูกค้า LINE" (ตั้งค่าระบบ → บทบาท)
              </p>
            )}
          </>
        )}
      </section>

      {/* ℹ️ แผงข้อมูลลูกค้า (ขวา) — เจ้าของร้าน 17:05 "ต้องแสดงด้านขวามือ" เหมือน LINE OA Manager · เดสก์ท็อปเป็นคอลัมน์ที่ 3 · มือถือเป็นแผ่นเลื่อนเต็มจอ */}
      {detail && noteOpen ? (
        <InfoPanel
          detail={detail}
          canReply={canReply}
          canToggle={can("orders.edit") || canReply}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          noteSaving={noteSaving}
          onSaveNote={() => void saveNote(detail.id, noteDraft.trim())}
          onTag={(t) => void saveTag(detail.id, t)}
          onToggle={() => void toggleBot(detail.id, !detail.botAllowed)}
          onWake={() => void wakeBot(detail.id)}
          onClose={() => setNoteOpen(false)}
        />
      ) : null}
      {lightbox ? <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} toast={toast} /> : null}
      {toastNode}
    </div>
  );
}

function Chip({ tone, children }: { tone: "mint" | "sky" | "lilac" | "coral"; children: React.ReactNode }) {
  const S: Record<string, { bg: string; fg: string }> = {
    mint: { bg: "var(--dk-mint-wash, #E7F8EE)", fg: "var(--dk-mint-ink, #166534)" },
    sky: { bg: "var(--dk-sky, #E6F1FB)", fg: "var(--dk-blue-deep, #1D4ED8)" },
    lilac: { bg: "var(--dk-lilac-wash, #EFE9FB)", fg: "var(--dk-lilac-ink, #5B21B6)" },
    coral: { bg: "var(--dk-coral-wash, #FDE8E6)", fg: "var(--dk-coral-ink, #B91C1C)" },
  };
  return (
    <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-bold" style={{ background: S[tone].bg, color: S[tone].fg }}>
      {children}
    </span>
  );
}

function IconBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition active:scale-95"
      style={active ? { background: "var(--dk-sky, #E6F1FB)" } : { background: "#F1F5F9" }}
    >
      {children}
    </button>
  );
}

/** ช่องพิมพ์แบบ LINE: ติดขอบล่าง · ปุ่มรูป/การ์ดซ้าย · ปุ่มส่งเขียวกลมขวา · Enter ส่ง (Shift+Enter ขึ้นบรรทัด) · ปุ่มเลือกสินค้าเป็นแผ่นเลื่อนขึ้น */
function Composer({
  id,
  disabled,
  quotaLow,
  onSent,
  toast,
  dropFile,
  onDropConsumed,
}: {
  id: string;
  disabled: boolean;
  quotaLow: boolean;
  onSent: (r: ReplyRes) => void;
  toast: (t: string, bad?: boolean) => void;
  dropFile: File | null;
  onDropConsumed: () => void;
}) {
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

  useEffect(() => {
    setText("");
    setImage(null);
    setCard(null);
    setPickOpen(false);
  }, [id]);

  // textarea สูงตามข้อความ (1–5 บรรทัด) เหมือนแอปแชท
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(140, Math.max(44, el.scrollHeight))}px`;
  }, [text]);

  const openPicker = useCallback(async () => {
    setPickOpen((v) => !v);
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
    return (k ? catalog.filter((x) => x.name.toLowerCase().includes(k)) : catalog).slice(0, 10);
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

  // รูปที่ลากมาวาง/วางจากคลิปบอร์ด → อัปเหมือนกดปุ่ม 🖼
  useEffect(() => {
    if (!dropFile) return;
    void onFile(dropFile);
    onDropConsumed();
  }, [dropFile, onFile, onDropConsumed]);
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        void onFile(f);
      }
    },
    [onFile],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if ((!t && !image && !card) || sending) return;
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

  const canSend = !disabled && !sending && (!!text.trim() || !!image || !!card);

  return (
    <div className="border-t bg-white" style={{ borderColor: "var(--dk-hair)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {quotaLow ? (
        <p className="px-3 pt-1.5 text-[11.5px]" style={{ color: disabled ? "var(--dk-coral-ink)" : "#8A5A00" }}>
          {disabled ? "โควตา LINE เดือนนี้เหลือน้อยมาก — ปุ่มส่งปิดไว้ ไปตอบใน LINE OA Manager แทนนะคะ" : "โควตา LINE เหลือน้อย — ส่งเท่าที่จำเป็น ที่เหลือตอบใน OA Manager"}
        </p>
      ) : null}
      {pickOpen ? (
        <div className="border-b px-3 py-2" style={{ borderColor: "var(--dk-hair)" }}>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchBox value={pickQ} onChange={setPickQ} placeholder="พิมพ์ชื่อสินค้า…" />
            </div>
            <button type="button" onClick={() => setPickOpen(false)} className="text-[13px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
              ปิด
            </button>
          </div>
          <div className="mt-1 max-h-52 overflow-y-auto">
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
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] active:bg-black/[0.04]"
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-9 w-9 rounded-md object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="shrink-0 text-[12px]" style={{ color: "#A05A00" }}>
                    {p.priceMin && p.priceMax && p.priceMax > p.priceMin ? `฿${p.priceMin.toLocaleString()}–${p.priceMax.toLocaleString()}` : p.priceMin ? `เริ่ม ฿${p.priceMin.toLocaleString()}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
      {image || card || uploading ? (
        <div className="flex flex-wrap items-start gap-2 px-3 pt-2">
          {uploading && !image ? (
            <span className="grid h-24 w-24 place-items-center rounded-xl text-[12px]" style={{ background: "#F1F5F9", color: "var(--dk-faint)" }}>
              กำลังอัปรูป…
            </span>
          ) : null}
          {image ? (
            // 🖼 16:50 เจ้าของร้าน "ให้เห็นเป็นภาพที่อัปโหลด" — พรีวิวรูปจริง 96px แทนชิปชื่อไฟล์ · กดรูปเปิดดูเต็ม · ✕ มุมขวาบนเอาออก
            <span className="relative inline-block">
              <a href={image.url} target="_blank" rel="noreferrer" title={image.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.name} className="h-24 w-24 rounded-xl border object-cover" style={{ borderColor: "var(--dk-hair)", background: "#F1F5F9" }} />
              </a>
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="เอารูปออก"
                className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold text-white shadow"
                style={{ background: "var(--dk-navy)" }}
              >
                ✕
              </button>
            </span>
          ) : null}
          {card ? (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#F1F5F9" }}>
              🧾 {card.name.slice(0, 30)}
              <button type="button" onClick={() => setCard(null)} aria-label="เอาการ์ดออก" className="ml-1 font-bold">
                ✕
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5 px-2 py-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <IconBtn onClick={() => fileRef.current?.click()} title="แนบรูป">
          {uploading ? "…" : "🖼"}
        </IconBtn>
        <IconBtn onClick={() => void openPicker()} title="ส่งการ์ดสินค้า" active={pickOpen}>
          🧾
        </IconBtn>
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={disabled ? "ส่งจากหน้านี้ไม่ได้ชั่วคราว (โควตา LINE)" : "พิมพ์ข้อความ… (ลากรูปมาวาง หรือ Ctrl+V ก็ได้)"}
          disabled={disabled || sending}
          className="min-h-[44px] flex-1 resize-none rounded-[22px] px-4 py-2.5 text-[15px] outline-none"
          style={{ background: "#F1F5F9", color: "var(--dk-navy)" }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label="ส่ง"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg text-white transition active:scale-95 disabled:opacity-35"
          style={{ background: LINE_GREEN }}
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
      <p className="px-3 pb-1.5 text-[10.5px]" style={{ color: "var(--dk-faint)" }}>
        ส่งแล้วบอทพักให้คนนี้ 30 นาที (▶ ปลุกได้ที่หัวห้อง) · ข้อความจากหน้านี้นับโควตา LINE
      </p>
    </div>
  );
}


/** 🤖 สวิตช์บอทรายคนแบบอ่านสถานะออก (กดสลับ) — เขียว = บอทตอบ · เทา = ปิด (แอดมินตอบ) · ม่วง = พักชั่วคราว */
function BotPill({ detail, canToggle, onToggle, onWake }: { detail: Row; canToggle: boolean; onToggle: () => void; onWake: () => void }) {
  if (detail.pausedUntil) {
    return (
      <button type="button" onClick={onWake} disabled={!canToggle} title="บอทพักเพราะแอดมินตอบอยู่ — กดเพื่อปลุกให้ตอบต่อทันที" className="flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition active:scale-95" style={{ background: "var(--dk-lilac-wash, #EFE9FB)", color: "var(--dk-lilac-ink, #5B21B6)" }}>
        ⏸ พักถึง {fmtTime(detail.pausedUntil)} <span className="rounded-full bg-white/70 px-1.5 text-[11px]">▶ ปลุก</span>
      </button>
    );
  }
  const on = detail.botAllowed;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!canToggle}
      title={on ? "บอทกำลังตอบคนนี้ — กดเพื่อปิด (แอดมินตอบเอง)" : "บอทไม่ตอบคนนี้ — กดเพื่อเปิดให้บอทตอบ"}
      className="flex min-h-[36px] items-center gap-1.5 rounded-full pl-2 pr-3 text-[12.5px] font-bold transition active:scale-95"
      style={on ? { background: "#C9F2D0", color: "#0E7A3A" } : { background: "#E5E7EB", color: "#4B5563" }}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full text-[13px]" style={{ background: on ? LINE_GREEN : "#9CA3AF", color: "white" }}>🤖</span>
      {on ? "บอทตอบ: เปิด" : "บอทตอบ: ปิด"}
    </button>
  );
}

/** ℹ️ แผงข้อมูลลูกค้าด้านขวา — ชื่อ/รูป/ไอดี · สถานะบอท · ป้าย · โน้ตภายใน (ฟิลด์เดียวกับหน้า ลูกค้า LINE) */
function InfoPanel({
  detail, canReply, canToggle, noteDraft, setNoteDraft, noteSaving, onSaveNote, onTag, onToggle, onWake, onClose,
}: {
  detail: Row; canReply: boolean; canToggle: boolean; noteDraft: string; setNoteDraft: (v: string) => void; noteSaving: boolean;
  onSaveNote: () => void; onTag: (t: CustomerTag | "") => void; onToggle: () => void; onWake: () => void; onClose: () => void;
}) {
  const body = (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--dk-hair)" }}>
        <span className="text-[14px] font-extrabold">ข้อมูลลูกค้า</span>
        <button type="button" onClick={onClose} aria-label="ปิด" className="ml-auto grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-black/[0.05]">✕</button>
      </div>
      <div className="flex flex-col items-center px-4 pt-4 text-center">
        <Avatar src={detail.pictureUrl} size={72} />
        <p className="mt-2 text-[16px] font-extrabold">{nameOf(detail)}</p>
        {detail.adminAlias && detail.displayName ? <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>ชื่อ LINE: {detail.displayName}</p> : null}
        <p className="mt-1 break-all font-mono text-[10.5px]" style={{ color: "var(--dk-faint)" }}>{detail.id}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {detail.adminTag ? <TagChip k={detail.adminTag} /> : null}
          <Chip tone={detail.scope === "new" ? "mint" : "sky"}>{detail.scope === "new" ? "🆕 ลูกค้าใหม่" : "👤 ลูกค้าเก่า"}</Chip>
          {detail.needsHumanFollowup ? <Chip tone="coral">รอแอดมิน</Chip> : null}
        </div>
      </div>
      <dl className="mx-4 mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl p-3 text-[12.5px]" style={{ background: "#F6F8FB" }}>
        <dt style={{ color: "var(--dk-faint)" }}>ทักครั้งแรก</dt><dd>{detail.createdAt ? fmtDay(detail.createdAt) : "—"}</dd>
        <dt style={{ color: "var(--dk-faint)" }}>ล่าสุด</dt><dd>{detail.lastSeen ? ago(detail.lastSeen) : "—"}</dd>
        <dt style={{ color: "var(--dk-faint)" }}>บอทคุย</dt><dd>{detail.messageCount ? `${detail.messageCount} ข้อความ` : "—"}</dd>
        <dt style={{ color: "var(--dk-faint)" }}>แอดมินตอบล่าสุด</dt><dd>{detail.lastAdminAt ? ago(detail.lastAdminAt) : "—"}</dd>
      </dl>
      <div className="mx-4 mt-3">
        <p className="mb-1 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>บอท</p>
        <BotPill detail={detail} canToggle={canToggle} onToggle={onToggle} onWake={onWake} />
      </div>
      <div className="mx-4 mt-3">
        <p className="mb-1 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>ป้ายความเร่งด่วน</p>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOMER_TAGS.map((t) => (
            <button key={t.key} type="button" disabled={!canReply} onClick={() => onTag(detail.adminTag === t.key ? "" : t.key)} className="min-h-[32px] rounded-full px-2.5 text-[12px] font-bold transition" style={detail.adminTag === t.key ? { background: t.tone, color: "white" } : { background: t.wash, color: t.ink }}>
              {t.dot} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-4 mb-4 mt-3">
        <p className="mb-1 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>โน้ตภายใน (ลูกค้าไม่เห็น)</p>
        <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} disabled={!canReply} rows={5} placeholder="เช่น ที่อยู่ส่งของ / งานที่คุยค้าง / ข้อควรระวัง" className="w-full resize-y rounded-xl border px-3 py-2 text-[13.5px] outline-none" style={{ borderColor: "#F0D48A", background: "#FFFBEA" }} />
        {canReply ? (
          <button type="button" onClick={onSaveNote} disabled={noteSaving || noteDraft.trim() === (detail.adminNote ?? "")} className="dkb-btn dkb-btn-navy dkb-btn-sm mt-1.5 min-h-[36px] disabled:opacity-40">
            {noteSaving ? "กำลังบันทึก…" : "บันทึกโน้ต"}
          </button>
        ) : null}
        <p className="mt-2 text-[10.5px]" style={{ color: "var(--dk-faint)" }}>ป้าย/โน้ตชุดเดียวกับหน้า ลูกค้า LINE</p>
      </div>
    </div>
  );
  return (
    <>
      <aside className="hidden w-[300px] shrink-0 border-l bg-white lg:block" style={{ borderColor: "var(--dk-hair)" }}>{body}</aside>
      <div className="fixed inset-0 z-50 bg-white lg:hidden">{body}</div>
    </>
  );
}

/** 🔍 ดูรูปใหญ่ + ดาวน์โหลด — ESC/คลิกพื้นหลังปิด · ดาวน์โหลดผ่าน blob (Storage คนละโดเมน แค่ download attr ไม่พอ) */
function Lightbox({ url, name, onClose, toast }: { url: string; name: string; onClose: () => void; toast: (t: string, bad?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name.replace(/\.jpg$/, "") + "." + ext;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      window.open(url, "_blank", "noopener");
      toast("ดาวน์โหลดตรงไม่ได้ เปิดรูปในแท็บใหม่ให้แทน", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "rgba(0,0,0,.88)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="ดูรูป">
      <div className="flex items-center gap-2 px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <span className="truncate text-[13px] text-white/80">{name}</span>
        <button type="button" onClick={() => void download()} disabled={busy} className="ml-auto rounded-full bg-white px-3.5 py-1.5 text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>
          {busy ? "กำลังโหลด…" : "⬇ ดาวน์โหลด"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-bold text-white">เปิดแท็บใหม่</a>
        <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg text-white">✕</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
    </div>
  );
}
