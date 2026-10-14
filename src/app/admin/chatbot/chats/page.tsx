"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Empty, SearchBox } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { ago, botApi, Modal, uploadBotFile, uploadBotImage, useToast } from "../bot-ui";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { BANK_CARD } from "@/lib/bank-card";
import SavedReplyPicker from "./SavedReplyPicker";
import { realignEmojis, type Emoji } from "../saved-replies/shared";
import { DEFAULT_TAGS, keyFromLabel, TAG_COLORS, TAG_PALETTE, type ChatTag, type TagColor } from "@/lib/chat-tags";

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
  unread: boolean;
  /** 📝 มีร่างคำตอบบอทรอกดส่ง (โหมดร่าง 13 ต.ค. 69) */
  draftPending?: boolean;
  adminTag: string;
  adminTags: string[];
  /** 🤖 ป้ายระดับที่ AI ติดให้ + เหตุผล */
  aiTag?: { key: string; reason: string; at: string };
  adminNote: string;
  adminNotes: NoteItem[];
  adminAlias: string;
};
type NoteItem = { id: string; text: string; by: string; at: string };
type CardRef = { name: string; url: string; image?: string; price?: string };
type LogEntry = { id?: string; role: string; text: string; at: string; type?: string; mode?: string; by?: string; status?: string; approvedBy?: string; edited?: boolean; draftText?: string; imageUrl?: string; messageId?: string; imageExpired?: boolean; card?: { name: string; url: string }; cards?: CardRef[]; file?: { url: string; name: string; size: number }; notice?: { orderId: string; title: string; color: string; asText?: boolean }; draftImages?: { url: string; preview: string }[] };
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
type Settings = { mode: string; newSince: string; enabled: boolean };
type ListRes = { rows: Row[]; settings: Settings; count: number; waitingCount: number; unreadCount: number; draftCount?: number; tagCounts?: Record<string, number> };
type DetailRes = Row & { log: LogEntry[]; messages: LogEntry[]; settings: Settings };
type Quota = { limit: number | null; used: number; left: number | null; at: string; forecast?: { pct: number; perDay: number; monthTotal: number; outOn: string | null } | null };
type CatalogItem = { id?: string; name: string; url: string; image?: string; priceMin?: number; priceMax?: number };
type ReplyRes = { ok: boolean; sent: boolean; logged: boolean; entry?: LogEntry; pausedUntil?: string | null; warn?: string };
type Scope = "waiting" | "all" | "unread" | "draft" | "new" | "old";

const LINE_GREEN = "#06C755";
/** ป้ายระดับที่ AI ติดให้ (ตรงกับ URGENCY_KEYS ใน lib/server/chat-urgency.ts) */
const AI_LEVELS = ["urgent", "rush", "normal"];
// ลำดับ = งานที่ต้องลงมือก่อน (รอแอดมิน · ร่างรอส่ง) แล้วค่อยมุมมองทั่วไป
const SCOPES: { key: Scope; label: string; icon: string }[] = [
  { key: "all", label: "ทั้งหมด", icon: "💬" },
  { key: "waiting", label: "รอแอดมิน", icon: "🙋" },
  { key: "draft", label: "ร่างรอส่ง", icon: "📝" },
  { key: "unread", label: "ยังไม่อ่าน", icon: "🟢" },
  { key: "new", label: "ลูกค้าใหม่", icon: "🆕" },
  { key: "old", label: "ลูกค้าเก่า", icon: "👤" },
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
/** 🏷 ป้ายลูกค้าจากแคตตาล็อก settings/chat-tags (หลายป้ายได้ · แก้ชื่อ/สี/เพิ่ม/ลบได้ที่ปุ่ม ⚙️ จัดการป้าย) */
function TagChip({ k, tags }: { k: string; tags: ChatTag[] }) {
  const t = tags.find((x) => x.key === k);
  if (!t) return null;
  const c = TAG_PALETTE[t.color];
  return (
    <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-bold" style={{ background: c.wash, color: c.ink }}>
      {t.emoji} {t.label}
    </span>
  );
}

/** 🏦 บอทส่งภาพบัญชีรับโอน (Reply Gate ต่อท้าย image message) แต่ log จดแค่บรรทัด "[รูป] ภาพบัญชีรับโอนของร้าน" ไม่มี imageUrl
 *  → หน้าแชทวาดภาพจริงแทนบรรทัดนั้น (ภาพตายตัวใน lib/bank-card · 14 ต.ค. 69 เจ้าของร้าน "ภาพไม่แสดง") */
const BANK_IMG_LINE = /^\[รูป\]\s*ภาพบัญชีรับโอน/;
function splitBankImgs(text: string): { text: string; n: number } {
  const lines = text.split("\n");
  const keep = lines.filter((l) => !BANK_IMG_LINE.test(l.trim()));
  return { text: keep.join("\n").trimEnd(), n: lines.length - keep.length };
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
  const { confirm, dialog: confirmDialog } = useConfirm();
  const can = useCan();
  const canReply = can("chat.reply");
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  // 🏷 กรองตามป้าย (เลือกได้ทีละป้าย · ใช้ร่วมกับชิปขอบเขตด้านบนได้) — จำนวนนับจากทั้งคลังฝั่งเซิร์ฟเวอร์
  const [tagFilter, setTagFilter] = useState("");
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string>("");
  const [detail, setDetail] = useState<DetailRes | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // 🔎 14 ต.ค. 69 "ค้นหาไม่ได้จริง": คำขอรายชื่อเก่า (เปิดหน้า/รีเฟรช 30 วิ ที่ไม่มีคำค้น) ตอบช้ากว่าผลค้นหา แล้วเขียนทับรายชื่อกลับเป็นทั้งหมด
  // → นับเลขคำขอ ใช้เฉพาะคำตอบของคำขอล่าสุด
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const my = ++loadSeq.current;
    setLoading(true);
    try {
      const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&limit=80${q ? `&q=${encodeURIComponent(q)}` : ""}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ""}`);
      if (my !== loadSeq.current) return;
      setRows(d.rows);
      setSettings(d.settings);
      setWaitingCount(d.waitingCount);
      setUnreadCount(d.unreadCount);
      setDraftCount(d.draftCount ?? 0);
      setTagCounts(d.tagCounts ?? {});
    } catch (e) {
      if (my === loadSeq.current) toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      if (my === loadSeq.current) setLoading(false);
    }
  }, [scope, q, tagFilter, toast]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  // 🔗 ?id=U… เปิดห้องนั้นเลย (ลิงก์ "เปิดแชท" จากหน้า บอทเรียนรู้ · 14 ต.ค. 69)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    if (/^U[0-9a-f]{32}$/.test(id)) void openRoom(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 🔗 แถบที่อยู่ตามห้องที่เปิดอยู่เสมอ (เจ้าของร้าน 14 ต.ค. 69 "อยากส่งลิงก์แชทลูกค้าคนนั้นให้พนักงานคนอื่นเปิดดูตรง ๆ")
  //   replaceState ไม่ใช่ push — สลับห้องไปมาไม่ทำให้ปุ่มย้อนกลับของเบราว์เซอร์ต้องกดหลายสิบครั้ง
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sel) url.searchParams.set("id", sel);
    else url.searchParams.delete("id");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [sel]);
  const copyRoomLink = useCallback(async () => {
    if (!sel) return;
    const link = `${window.location.origin}/admin/chatbot/chats?id=${sel}`;
    try {
      await navigator.clipboard.writeText(link);
      toast("🔗 คัดลอกลิงก์ห้องนี้แล้ว — ส่งให้พนักงานคนอื่นเปิดได้เลย");
    } catch {
      window.prompt("คัดลอกลิงก์นี้", link);
    }
  }, [sel, toast]);

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

  // 👁 18:45 เปิดห้อง/มีข้อความใหม่ขณะเปิดอยู่ = อ่านแล้ว (webReadAt) → จุดเขียวหาย ตัวนับลด
  const markRead = useCallback((id: string) => {
    setRows((rs) => rs.map((x) => (x.id === id && x.unread ? { ...x, unread: false } : x)));
    setUnreadCount((n) => Math.max(0, n - (rows.find((x) => x.id === id)?.unread ? 1 : 0)));
    void botApi("/api/admin/line-customers/manage", { action: "read", userId: id }).catch(() => {});
  }, [rows]);

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
    if (sel && thread.length) markRead(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  const modeText = !settings
    ? ""
    : settings.mode === "draft"
      ? "📝 โหมดร่าง: บอทร่างคำตอบให้ทุกห้อง ลูกค้ายังไม่ได้รับจนกว่าแอดมินกดส่ง"
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

  // 📝 โหมดร่าง (13 ต.ค. 69): ส่ง/ทิ้งร่างของบอท · สลับโหมดทั้งร้าน (สิทธิ์ settings.manage)
  const afterDraft = useCallback(
    (logId: string, replace: LogEntry | null) => {
      setDetail((d) => {
        if (!d) return d;
        const log = (d.log.length ? d.log : d.messages).map((x) => (x.id === logId ? (replace ? { ...x, ...replace } : { ...x, status: "discarded" }) : x));
        return { ...d, log, messages: [] };
      });
      setRows((rs) => rs.map((x) => (x.id === sel ? { ...x, draftPending: false, needsHumanFollowup: replace ? false : x.needsHumanFollowup } : x)));
      setDraftCount((n) => Math.max(0, n - 1));
    },
    [sel],
  );
  const sendDraft = useCallback(
    async (m: LogEntry, text: string): Promise<boolean> => {
      if (!sel || !m.id) return false;
      try {
        const d = await botApi<{ ok: boolean; entry?: LogEntry }>("/api/admin/chatbot/chats/draft", { action: "send", id: sel, logId: m.id, text });
        afterDraft(m.id, { ...(d.entry as LogEntry), status: "sent" });
        if (quota && quota.left !== null) setQuota({ ...quota, used: quota.used + 1, left: Math.max(0, quota.left - 1) });
        toast("ส่งให้ลูกค้าแล้ว");
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
        return false;
      }
    },
    [sel, afterDraft, quota, toast],
  );
  // 🎓 14 ต.ค. 69 เจ้าของร้าน: "ปุ่มทิ้งขอเป็นการเข้าสู่เรียนรู้ เพื่อให้แอดมินตอบ" → ไม่ส่งร่าง + เปิดเรื่องในหน้า บอทเรียนรู้ แล้วแอดมินพิมพ์ตอบลูกค้าเองด้านล่าง
  const discardDraft = useCallback(
    async (m: LogEntry) => {
      if (!sel || !m.id) return;
      const ok = await confirm({
        icon: "🎓",
        title: "ไม่ส่งร่างนี้?",
        detail: "• ลูกค้าจะไม่ได้รับข้อความนี้\n• พิมพ์ตอบลูกค้าเองในช่องด้านล่างได้เลย\n• เรื่องนี้จะไปรอที่หน้า 🎓 บอทเรียนรู้ ให้สอนคำตอบที่ถูก",
        confirmLabel: "ไม่ส่ง · ให้บอทเรียนรู้",
      });
      if (!ok) return;
      try {
        const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/chatbot/chats/draft", { action: "learn", id: sel, logId: m.id });
        afterDraft(m.id, null);
        window.dispatchEvent(new Event("iducky:learning-changed"));
        toast(d.saved || "ทิ้งร่างแล้ว");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sel, afterDraft, toast, confirm],
  );
  const switchMode = useCallback(
    async (mode: "draft" | "log-only") => {
      const ok = await confirm(
        mode === "draft"
          ? {
              icon: "📝",
              title: "เปิดโหมดร่าง?",
              detail:
                "• บอทจะร่างคำตอบให้ลูกค้าทุกคนที่ทักมาทาง LINE\n• ลูกค้ายังไม่ได้รับอะไร จนกว่าแอดมินกด Enter หรือปุ่ม “ส่งให้ลูกค้า”\n• ห้องที่มีร่างจะขึ้นป้าย 📝 ร่างรอส่ง\n• ปิดโหมดได้ทุกเมื่อจากปุ่มเดิม",
              confirmLabel: "เปิดโหมดร่าง",
            }
          : {
              icon: "⏸",
              title: "ปิดโหมดร่าง?",
              detail: "• บอทกลับไปเก็บแชทอย่างเดียว ไม่ร่าง ไม่ตอบ\n• ร่างที่ค้างอยู่ยังกดส่งหรือไม่ส่งได้ตามปกติ",
              confirmLabel: "ปิดโหมดร่าง",
            },
      );
      if (!ok) return;
      try {
        const d = await botApi<{ ok: boolean; saved?: string; mode: string }>("/api/admin/chatbot/chats/draft", { action: "mode", mode });
        setSettings((x) => (x ? { ...x, mode: d.mode } : x));
        toast(d.saved || "บันทึกแล้ว");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast, confirm],
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
  // 🏷 17:55 แคตตาล็อกป้าย (settings/chat-tags) + หน้าจัดการป้าย
  const [tagCatalog, setTagCatalog] = useState<ChatTag[]>(DEFAULT_TAGS);
  // 🧾 18:15 การ์ดจากบรรทัด "[การ์ด] สินค้าที่ตรงกับรูป: โปสการ์ด" (log เก่าก่อน Reply Gate เขียน cards[]) → เทียบชื่อกับแคตตาล็อกเว็บแล้ววาดเป็นการ์ด
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  useEffect(() => {
    fetch("/api/pricing/search?catalog=1", { cache: "no-store" }).then((r) => r.json()).then((d: { items?: CatalogItem[] }) => setCatalog(Array.isArray(d.items) ? d.items : [])).catch(() => {});
  }, []);
  const cardsOf = useCallback(
    (m: LogEntry): CardRef[] => {
      if (m.cards?.length) return m.cards;
      if (m.card) return [{ name: m.card.name, url: m.card.url }];
      if (!catalog.length) return [];
      const out: CardRef[] = [];
      for (const line of m.text.split("\n")) {
        const mm = line.trim().match(/^\[การ์ด\]\s*[^:]*:\s*(.+)$/);
        if (!mm) continue;
        for (const nm of mm[1].split(/\s*,\s*/)) {
          const it = catalog.find((c) => c.name === nm.trim());
          if (it && !out.some((o) => o.url === it.url)) out.push({ name: it.name, url: it.url, image: it.image, price: it.priceMin && it.priceMax && it.priceMax > it.priceMin ? `฿${it.priceMin.toLocaleString()} – ${it.priceMax.toLocaleString()}` : it.priceMin ? `เริ่ม ฿${it.priceMin.toLocaleString()}` : undefined });
        }
      }
      return out.slice(0, 6);
    },
    [catalog],
  );
  const [tagMgrOpen, setTagMgrOpen] = useState(false);
  useEffect(() => {
    botApi<{ items: ChatTag[] }>("/api/admin/chatbot/chats/tags").then((d) => setTagCatalog(d.items)).catch(() => {});
  }, []);
  const [noteSaving, setNoteSaving] = useState(false);
  // เปลี่ยนห้อง = ปิดแผง · โน้ตในฐานเปลี่ยน (บันทึก/โพล) = ซิงก์ร่าง แต่ไม่ปิดแผง
  useEffect(() => {
    setNoteOpen(false);
  }, [sel]);

  const saveTags = useCallback(
    async (id: string, tags: string[]) => {
      try {
        const d = await botApi<{ ok: boolean; saved?: string; tags: string[] }>("/api/admin/line-customers/manage", { action: "tags", userId: id, tags });
        toast(d.saved || "บันทึกป้ายแล้ว");
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, adminTags: d.tags, adminTag: d.tags[0] ?? "" } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, adminTags: d.tags, adminTag: d.tags[0] ?? "" } : x));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast],
  );
  // 🤖 ให้ AI ประเมินความเร่งด่วนห้องนี้ใหม่ (api chats/urgency → lib/server/chat-urgency.ts) — ป้ายระดับอยู่หน้าสุด ป้ายอื่นคงเดิม
  const [aiBusy, setAiBusy] = useState(false);
  const aiRetag = useCallback(
    async (id: string) => {
      setAiBusy(true);
      try {
        const d = await botApi<{ ok: boolean; key: string; reason: string }>("/api/admin/chatbot/chats/urgency", { id });
        const apply = (x: Row): Row => {
          const tags = [d.key, ...x.adminTags.filter((t) => !AI_LEVELS.includes(t))].slice(0, 10);
          return { ...x, adminTags: tags, adminTag: d.key, aiTag: { key: d.key, reason: d.reason, at: new Date().toISOString() } };
        };
        setRows((rs) => rs.map((x) => (x.id === id ? apply(x) : x)));
        setDetail((x) => (x && x.id === id ? { ...x, ...apply(x) } : x));
        toast(`🤖 AI ประเมินแล้ว${d.reason ? ` — ${d.reason}` : ""}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        setAiBusy(false);
      }
    },
    [toast],
  );
  // 📝 18:25 หลายโน้ต ≤10 (noteAdd/noteEdit/noteDel) — ผลลัพธ์ notes[] ทั้งชุดจาก API
  const noteAction = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setNoteSaving(true);
      try {
        const d = await botApi<{ ok: boolean; notes: NoteItem[]; saved?: string }>("/api/admin/line-customers/manage", { userId: id, ...body });
        toast(d.saved || "บันทึกแล้ว");
        const latest = d.notes.length ? d.notes[d.notes.length - 1].text : "";
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, adminNotes: d.notes, adminNote: latest } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, adminNotes: d.notes, adminNote: latest } : x));
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
        return false;
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
    const f = e.dataTransfer.files[0];
    if (f) setDropFile(f);
  };

  // ใกล้หมด = เหลือ < 3,000 หรือคาดว่าจะหมดก่อนรีเซ็ตตามความเร็วที่ใช้จริง (forecast.outOn)
  const quotaLow = (quota?.left !== null && quota?.left !== undefined && quota.left < 3000) || !!quota?.forecast?.outOn;
  const quotaOut = quota?.left !== null && quota?.left !== undefined && quota.left < 500;
  // ใช้ไป / ทั้งหมด (เหลืออีก …) — เจ้าของร้าน 14 ต.ค. 69 (เดิมโชว์ "เหลือ / ทั้งหมด" อ่านแล้วนึกว่าใช้ไป)
  const quotaText = quota
    ? quota.limit === null
      ? `ใช้ไป ${quota.used.toLocaleString()}`
      : `${quota.used.toLocaleString()} / ${quota.limit.toLocaleString()} (เหลืออีก ${(quota.left ?? 0).toLocaleString()})`
    : "—";

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
    <div ref={shellRef} className="dkb -mx-4 -my-6 flex overflow-hidden md:-mx-8 md:-my-8" style={{ background: "#EEF2F7", color: "var(--dk-navy)", height: `calc(100dvh - ${topOffset}px)` }}>
      {/* ───── รายชื่อห้อง (ซ้าย) — มือถือซ่อนเมื่อเปิดห้อง ───── */}
      <aside className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r bg-white md:w-[290px] lg:w-[310px]`} style={{ borderColor: "var(--dk-hair)" }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-3">
          {/* กดหัวข้อ = ปิดห้องที่เปิดอยู่ กลับหน้า "เลือกห้องแชททางซ้าย" (เจ้าของร้าน 14 ต.ค. 69) · แถบที่อยู่ล้าง ?id= ตาม sel เอง */}
          <h1 className="text-[18px] font-extrabold">
            <button
              type="button"
              onClick={() => {
                setSel("");
                setDetail(null);
                setNoteOpen(false);
              }}
              title="กลับหน้าเลือกห้องแชท"
              className="rounded-md transition hover:opacity-70"
            >
              แชท LINE
            </button>
          </h1>
          <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
            {rows.length ? `${rows.length} ห้อง` : ""}
          </span>
          <button
            type="button"
            onClick={() => void loadQuota(true)}
            title={`โควตาข้อความ LINE เดือนนี้ (ใช้ไป / ทั้งหมด · ส่งจากหน้านี้/บอทนับ · ตอบใน OA Manager ไม่นับ)${
              quota?.forecast ? `\nใช้ไป ${quota.forecast.pct}% · เฉลี่ย ${quota.forecast.perDay.toLocaleString()}/วัน · คาดทั้งเดือน ${quota.forecast.monthTotal.toLocaleString()}${quota.forecast.outOn ? ` · คาดหมด ${quota.forecast.outOn}` : " · พอถึงสิ้นเดือน"}` : ""
            }\nใช้ถึง 80/90/95% ระบบส่งการ์ดเตือนเข้ากลุ่มแอดมินเอง — กดเพื่ออ่านใหม่`}
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
            {quota?.forecast?.outOn && !quotaOut ? ` · ~หมด ${quota.forecast.outOn}` : ""}
          </button>
        </div>
        <div className="flex items-center gap-2 px-3 pt-0.5">
          <p className="min-w-0 flex-1 text-[11.5px]" style={{ color: settings?.mode === "draft" ? "#8A5A00" : "var(--dk-faint)", fontWeight: settings?.mode === "draft" ? 700 : 400 }}>
            {modeText}
          </p>
          {settings && can("settings.manage") && (settings.mode === "draft" || settings.mode === "log-only") ? (
            <button
              type="button"
              onClick={() => void switchMode(settings.mode === "draft" ? "log-only" : "draft")}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
              style={settings.mode === "draft" ? { background: "#F1F5F9", color: "var(--dk-navy-soft)" } : { background: "#FFF4D6", color: "#8A5A00", border: "1px solid #F0D48A" }}
              title={settings.mode === "draft" ? "ปิดโหมดร่าง — บอทกลับไปเก็บแชทอย่างเดียว" : "เปิดโหมดร่าง — บอทร่างคำตอบให้ทุกห้อง แอดมินกดส่งเอง"}
            >
              {settings.mode === "draft" ? "ปิดโหมดร่าง" : "📝 เปิดโหมดร่าง"}
            </button>
          ) : null}
        </div>
        <div className="px-3 pt-2">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อลูกค้า / ชื่อที่ตั้ง / userId…" />
          {q && loading ? (
            <p className="px-1 pt-1 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              กำลังค้น “{q}” ทั้งคลังแชท…
            </p>
          ) : null}
        </div>
        {/* ── ตัวกรอง (14 ต.ค. 69 เจ้าของร้าน "ดูรก" → "เป็น dropdown ดีกว่าไหม"): 2 dropdown ในแถวเดียว ──
             แถบรายชื่อบนจอจริงแคบ แท็บ/ชิปโดนตัด · ใช้ <select> ของเครื่อง (มือถือขึ้นรายการเลือกใหญ่ กดง่าย)
             งานที่ต้องลงมือ (รอแอดมิน) ยังเห็นตลอดเป็นตัวเลขแดงบน dropdown "ดู" ไม่ต้องเปิดเมนู */}
        <div className="flex items-center gap-2 px-3 py-2">
          <FilterMenu
            id="chat-scope"
            label="ดู"
            value={scope}
            active={scope !== "all"}
            onChange={(v) => setScope(v as Scope)}
            options={SCOPES.map((s) => ({
              value: s.key,
              label: s.label,
              icon: s.icon,
              count: s.key === "waiting" ? waitingCount : s.key === "unread" ? unreadCount : s.key === "draft" ? draftCount : undefined,
              urgent: s.key === "waiting" || s.key === "draft",
            }))}
            // 🟢 ยังไม่อ่าน (เจ้าของร้าน 14 ต.ค. 69 "ต้องแสดงจำนวนที่ยังไม่ได้อ่าน") — สีเขียวแบบ LINE · รอแอดมิน/ร่างรอส่ง ดูในเมนู
            badge={unreadCount ? { n: unreadCount, title: `ยังไม่อ่าน ${unreadCount} ห้อง — เลือก "ยังไม่อ่าน" ในเมนูนี้`, bg: "var(--dk-mint-ink)" } : undefined}
          />
          <FilterMenu
            id="chat-tag"
            label="ป้าย"
            value={tagFilter}
            active={!!tagFilter}
            onChange={setTagFilter}
            options={[
              { value: "", label: "ทุกป้าย", icon: "🏷" },
              ...tagCatalog.map((t) => ({ value: t.key, label: t.label, icon: t.emoji, count: tagCounts[t.key], tone: TAG_PALETTE[t.color] })),
            ]}
          />
        </div>
        {scope === "unread" && unreadCount && !tagFilter ? (
          <div className="flex justify-end px-3 pb-1.5">
            <button
              type="button"
              onClick={() =>
                void confirm({ icon: "✓", title: `ทำเครื่องหมายว่าอ่านแล้วทั้ง ${unreadCount} ห้อง?`, confirmLabel: "อ่านแล้วทั้งหมด" }).then((ok) => {
                  if (ok !== true) return;
                  void botApi<{ saved?: string }>("/api/admin/line-customers/manage", { action: "readAll" })
                    .then((d) => {
                      toast(d.saved || "เรียบร้อย");
                      void load();
                    })
                    .catch((e) => toast(String(e), true));
                })
              }
              className="min-h-[32px] px-1.5 text-[12px] font-bold underline"
              style={{ color: "var(--dk-mint-ink)" }}
            >
              อ่านแล้วทั้งหมด
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto">
          {loading && !rows.length ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !rows.length ? (
            <div className="p-4">
              <Empty title={tagFilter ? `ไม่มีห้องที่ติดป้าย "${tagCatalog.find((t) => t.key === tagFilter)?.label ?? tagFilter}"${scope !== "all" ? " ในตัวกรองนี้" : ""}` : scope === "waiting" ? "ไม่มีห้องที่รอแอดมิน" : "ยังไม่มีห้องแชท"} body={q ? "ไม่พบชื่อนี้ — ค้นได้ทั้งชื่อ LINE ชื่อที่แอดมินตั้ง และ userId (ส่วนใดของชื่อก็ได้)" : "เมื่อลูกค้าทักมา ห้องจะขึ้นที่นี่"} />
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
                  {r.unread ? <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: LINE_GREEN }} title="ยังไม่ได้อ่าน" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{nameOf(r)}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: r.unread ? "#0E7A3A" : "var(--dk-faint)", fontWeight: r.unread ? 700 : 400 }}>
                      {listTime(r.lastSeen)}
                    </span>
                  </div>
                  {/* ข้อความล่าสุดตัวบางเสมอ (เจ้าของร้าน 14 ต.ค. 69) — ยังไม่อ่านบอกด้วยสีเข้ม + จุดเขียว + เวลาสีเขียวแทน */}
                  <p className="truncate text-[12.5px]" style={{ color: r.unread ? "var(--dk-navy-soft)" : "var(--dk-faint)", fontWeight: 400 }}>
                    {r.lastUserText || (r.messageCount ? `บอทคุย ${r.messageCount} ข้อความ` : "—")}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.adminTags.map((k) => <TagChip key={k} k={k} tags={tagCatalog} />)}
                    {r.adminNotes.length ? <span className="text-[10.5px]" title={r.adminNotes.map((n) => n.text).join("\n")} style={{ color: "var(--dk-faint)" }}>📝{r.adminNotes.length > 1 ? r.adminNotes.length : ""}</span> : null}
                    {r.scope === "new" ? <Chip tone="mint">ใหม่</Chip> : null}
                    {r.botAllowed ? <Chip tone="sky">🤖 บอทตอบ</Chip> : null}
                    {r.pausedUntil ? <Chip tone="lilac">⏸ พักบอท</Chip> : null}
                    {r.needsHumanFollowup ? <Chip tone="coral">รอแอดมิน</Chip> : null}
                    {r.draftPending ? <Chip tone="amber">📝 ร่างรอส่ง</Chip> : null}
                  </div>
                </div>
                {r.unread ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: LINE_GREEN }} aria-label="ยังไม่ได้อ่าน" /> : null}
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
              📎 วางรูปหรือไฟล์งานตรงนี้เพื่อแนบส่งให้ลูกค้า
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
                  {detail?.adminTags.map((k) => <TagChip key={k} k={k} tags={tagCatalog} />)}
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
                <IconBtn onClick={() => void copyRoomLink()} title="คัดลอกลิงก์ห้องแชทนี้ (ส่งให้พนักงานคนอื่นเปิดดูได้)">
                  🔗
                </IconBtn>
              ) : null}
              {detail ? (
                <IconBtn onClick={() => setNoteOpen((v) => !v)} title="ข้อมูลลูกค้า · ออเดอร์ · ป้าย · โน้ต" active={noteOpen}>
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
                  if (m.role === "draft") {
                    const latest = m.status === "pending" && !thread.slice(i + 1).some((x) => x.role === "draft" && x.status === "pending");
                    return latest ? (
                      <DraftCard key={m.id || i} entry={m} canSend={canReply && !quotaOut} onSend={(t) => sendDraft(m, t)} onDiscard={() => discardDraft(m)} onZoom={(url) => setLightbox({ url, name: `draft-${(m.at || "").slice(0, 16).replace(/[^0-9]/g, "")}.jpg` })} />
                    ) : (
                      <div key={m.id || i} className="mb-2 flex justify-end">
                        <details className="max-w-[78%] rounded-xl px-3 py-1.5 text-[12px] md:max-w-[62%]" style={{ background: "rgba(0,0,0,.05)", color: "#6B7280" }}>
                          <summary className="cursor-pointer">
                            📝 ร่างบอทที่ไม่ได้ส่ง · {m.status === "discarded" ? "ทิ้งแล้ว" : m.status === "superseded" ? "มีร่างใหม่กว่า" : "ยังไม่ส่ง"} · {fmtTime(m.at)}
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
                        </details>
                      </div>
                    );
                  }
                  const admin = m.role === "admin";
                  const ours = m.role === "assistant" || admin;
                  const showDay = i === 0 || dayKey(m.at) !== dayKey(thread[i - 1].at);
                  const dayChip = showDay ? (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full px-3 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(0,0,0,.08)", color: "#4B5563" }}>
                        {fmtDay(m.at)}
                      </span>
                    </div>
                  ) : null;
                  // 🎴 การ์ดแจ้งสถานะที่ระบบส่งเอง (notify.ts → chat-notice-log) — ลูกค้าเห็นเป็นการ์ด Flex ใน LINE
                  if (m.role === "system" && m.notice) {
                    return (
                      <div key={m.id || i}>
                        {dayChip}
                        <NoticeCard entry={m} />
                      </div>
                    );
                  }
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
                            {admin ? m.by || "แอดมิน" : m.approvedBy ? `บอท ✓ ${m.approvedBy}${m.edited ? " (แก้)" : ""}` : "บอท"}
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
                          {(() => {
                            // 🖼 17:30 รูปจากลูกค้า: log มี messageId (ยังไม่มี imageUrl) → โหลดผ่าน API ที่ดึงจาก LINE แล้วแคช · รูปบอท/แอดมิน: imageUrl ตรง ๆ
                            // 🐛 18:10 เคยขอรูปทุก entry ที่มี messageId (ข้อความตัวอักษรก็มี) → LINE 400 → ขึ้น "รูปหมดอายุ" ใต้ทุกข้อความ · ต้องเฉพาะ type image
                            if (m.file) return null; // ไฟล์งาน: imageUrl = ที่เก็บไฟล์ ไม่ใช่รูป
                            const isCustImg = !ours && m.type === "image";
                            if (isCustImg && !m.imageUrl && m.imageExpired) return <span className="mb-1 block text-[12px] italic" style={{ color: "var(--dk-faint)" }}>🖼 รูปหมดอายุใน LINE แล้ว (ดูได้ใน OA Manager)</span>;
                            const lazy = isCustImg && !m.imageUrl && m.messageId && m.id && sel ? `/api/admin/chatbot/chats/image?uid=${encodeURIComponent(sel)}&log=${encodeURIComponent(m.id)}` : "";
                            const src = m.imageUrl || lazy;
                            if (!src) return null;
                            const fname = `line-${(m.at || "").slice(0, 16).replace(/[^0-9]/g, "")}.jpg`;
                            return (
                              <button type="button" onClick={() => setLightbox({ url: src, name: fname })} className="mb-1 block" title="กดเพื่อดูรูปใหญ่ / ดาวน์โหลด">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={src} alt="" loading="lazy" className="max-h-64 min-h-[48px] min-w-[48px] rounded-lg transition hover:opacity-90" />
                              </button>
                            );
                          })()}
                          {cardsOf(m).length ? m.text.split("\n").filter((l) => !/^\[การ์ด\]/.test(l.trim()) && !/^\(ส่งการ์ดสินค้า/.test(l.trim())).join("\n").trim() : m.file ? m.text.replace(/^\(ส่งไฟล์[^)]*\)$/, "").replace(/^\[ลูกค้าส่งไฟล์\][^\n]*$/, "").trim() : m.type === "image" && !ours && (m.imageUrl || m.messageId) ? "" : ours ? splitBankImgs(m.text).text : m.text}
                          {ours && splitBankImgs(m.text).n
                            ? Array.from({ length: splitBankImgs(m.text).n }, (_, bi) => (
                                <button key={bi} type="button" onClick={() => setLightbox({ url: BANK_CARD.jpg, name: "bank-card.jpg" })} className="mb-1 block" title="ภาพบัญชีรับโอนที่บอทส่งให้ลูกค้า · กดเพื่อดูรูปใหญ่">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={BANK_CARD.webp} alt={BANK_CARD.alt} loading="lazy" className="max-h-64 rounded-lg transition hover:opacity-90" />
                                </button>
                              ))
                            : null}
                          {/* 🧾 17:35 การ์ดในฟองวาดเหมือนใน LINE (รูป · ชื่อ · ราคา · ปุ่ม) — ตัดบรรทัด "[การ์ด] …" ในข้อความออกเมื่อมีการ์ดจริง */}
                          {m.file ? <FileCard file={m.file} href={m.file.url || (m.id && sel ? `/api/admin/chatbot/chats/image?uid=${encodeURIComponent(sel)}&log=${encodeURIComponent(m.id)}` : "#")} archived={!!m.file.url} /> : null}
                          {cardsOf(m).length ? (
                          <CardCarousel>
                          {cardsOf(m).map((c, ci) => (
                            // 🔍 19:35 เจ้าของร้าน: กดรูปในการ์ดให้ขยายดูเหมือนรูปในแชท (lightbox) · ปุ่มล่างค่อยไปหน้าสินค้า
                            <div key={ci} className="w-[200px] shrink-0 overflow-hidden rounded-xl bg-white text-left shadow-sm" style={{ border: "1px solid rgba(0,0,0,.06)", scrollSnapAlign: "start" }}>
                              {c.image ? (
                                <button type="button" onClick={() => setLightbox({ url: c.image as string, name: `${c.name || "product"}.jpg` })} className="block w-full" title="กดเพื่อดูรูปใหญ่">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={c.image} alt={c.name} className="aspect-[4/3] w-full object-cover transition hover:opacity-90" />
                                </button>
                              ) : null}
                              <div className="px-2.5 pb-2 pt-1.5">
                                <p className="truncate text-[13px] font-bold" style={{ color: "#153B3F" }}>{c.name || "สินค้า"}</p>
                                {c.price ? <p className="text-[12px]" style={{ color: "#A05A00" }}>{c.price}</p> : null}
                                <a href={c.url} target="_blank" rel="noreferrer" className="mt-1.5 block rounded-lg py-1 text-center text-[12px] font-bold text-white" style={{ background: "#1F6F78" }}>ดูราคา / สั่งเลย</a>
                              </div>
                            </div>
                          ))}
                          </CardCarousel>
                          ) : null}
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
              <Composer id={sel} customerName={detail?.displayName ?? ""} disabled={quotaOut} quotaLow={quotaLow} onSent={onSent} toast={toast} dropFile={dropFile} onDropConsumed={() => setDropFile(null)} />
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
          noteSaving={noteSaving}
          onNoteAdd={(t) => noteAction(detail.id, { action: "noteAdd", text: t })}
          onNoteEdit={(nid, t) => noteAction(detail.id, { action: "noteEdit", noteId: nid, text: t })}
          onNoteDel={(nid) => noteAction(detail.id, { action: "noteDel", noteId: nid })}
          tags={tagCatalog}
          onTags={(ts) => void saveTags(detail.id, ts)}
          onManageTags={() => setTagMgrOpen(true)}
          aiBusy={aiBusy}
          onAiRetag={() => void aiRetag(detail.id)}
          onToggle={() => void toggleBot(detail.id, !detail.botAllowed)}
          onWake={() => void wakeBot(detail.id)}
          onClose={() => setNoteOpen(false)}
          orders={
            <OrdersBlock
              key={detail.id}
              uid={detail.id}
              canEdit={can("orders.edit")}
              confirm={confirm}
              toast={toast}
              onSent={() => {
                // การ์ดจดลงห้องแบบเบื้องหลัง (chat-notice-log) — รอแป๊บแล้วดึงห้องใหม่ให้เห็นการ์ดในแชท
                const id = detail.id;
                setTimeout(() => void openRoom(id, true), 2500);
              }}
            />
          }
        />
      ) : null}
      {lightbox ? <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} toast={toast} /> : null}
      {tagMgrOpen ? <TagManager tags={tagCatalog} onClose={() => setTagMgrOpen(false)} onSaved={(items) => setTagCatalog(items)} toast={toast} /> : null}
      {confirmDialog}
      {toastNode}
    </div>
  );
}

/** 🎴 การ์ดที่ระบบแจ้งลูกค้าเอง (สถานะออเดอร์/เงินเข้า/จัดส่ง…) — หัวสีเดียวกับการ์ดใน LINE · ไม่ใช่คำตอบแอดมิน */
function NoticeCard({ entry }: { entry: LogEntry }) {
  const n = entry.notice!;
  const tone = /^#[0-9a-f]{6}$/i.test(n.color) ? n.color : "#475569";
  return (
    <div className="mb-2 flex items-end justify-end gap-1.5">
      <span className="mb-0.5 shrink-0 text-right text-[10px] leading-tight" style={{ color: "var(--dk-faint)" }}>
        🤖 ระบบ
        <br />
        {fmtTime(entry.at)}
      </span>
      <div className="w-[260px] max-w-[78%] overflow-hidden rounded-xl bg-white text-left shadow-sm md:max-w-[62%]" style={{ border: "1px solid rgba(0,0,0,.06)" }}>
        <div className="px-3 py-2" style={{ background: tone }}>
          <p className="text-[10px] font-semibold" style={{ color: "#FFFFFFCC" }}>
            การ์ดแจ้งลูกค้า{n.asText ? " · ส่งเป็นข้อความล้วน" : ""}
          </p>
          <p className="text-[14px] font-bold leading-snug text-white">{n.title || "แจ้งลูกค้า"}</p>
        </div>
        <details className="px-3 py-1.5 text-[12px]" style={{ color: "#4B5563" }}>
          <summary className="cursor-pointer select-none" style={{ color: "var(--dk-faint)" }}>
            ข้อความที่ส่ง
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words">{entry.text}</p>
        </details>
        {n.orderId && /^OD-/.test(n.orderId) ? (
          <a href={`/admin/orders/${encodeURIComponent(n.orderId)}`} target="_blank" rel="noreferrer" className="block border-t px-3 py-1.5 text-[12px] font-bold" style={{ borderColor: "rgba(0,0,0,.06)", color: tone }}>
            📦 {n.orderId} ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

type ChatOrder = {
  id: string; date: string; customer: string; status: string; statusLabel: string; total: number; balance: number; tracking?: string;
  link: "bound" | "login" | "other" | "none"; otherName?: string; why?: string;
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/**
 * 📦 ออเดอร์ของลูกค้าในห้องนี้ (ขั้น 2 · 14 ต.ค. 69) — ผูกจากฝั่งแชท = อยู่ในห้องที่ถูกคนแล้ว ไม่ต้องค้นชื่อ LINE เดาเหมือนหน้าออเดอร์
 *   · รายการ: ใบที่ผูก LINE นี้ + ใบที่สั่งตอนล็อกอิน LINE นี้ (api chats/orders) — ไม่เดาจากเบอร์
 *   · 🔗 ผูกออเดอร์: พิมพ์เลข OD → ดูใบก่อน → ผูกผ่าน /api/admin/orders/line-bind ตัวเดิม (ยืนยันกับ LINE + ส่งย้อนหลังการ์ดที่พลาด)
 *     ใบที่ผูก LINE คนอื่นอยู่ = ถามก่อนผูกทับ
 *   · 🔔 ส่งการ์ดสถานะล่าสุดซ้ำ: /api/admin/orders/notify-test (การ์ดเดียวกับปุ่มทดสอบส่งในหน้าออเดอร์ · นับโควตา push)
 */
function OrdersBlock({
  uid, canEdit, confirm, toast, onSent,
}: {
  uid: string;
  canEdit: boolean;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  toast: (t: string, bad?: boolean) => void;
  onSent: () => void;
}) {
  const [orders, setOrders] = useState<ChatOrder[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ChatOrder | null>(null);
  const [busy, setBusy] = useState("");
  // ✨ ใบที่น่าจะใช่ (เลข OD/เบอร์ที่ลูกค้าพิมพ์ในแชท) + ใบใหม่ 2 วันที่ยังไม่ผูก — เด้งเองตอนเปิดแผง ไม่ต้องพิมพ์เลข
  const [sug, setSug] = useState<{ matched: ChatOrder[]; recent: ChatOrder[] } | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const j = await botApi<{ orders: ChatOrder[] }>(`/api/admin/chatbot/chats/orders?uid=${encodeURIComponent(uid)}`);
      setOrders(j.orders);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setOrders([]);
    }
  }, [uid]);
  const loadSug = useCallback(async () => {
    if (!canEdit) return;
    try {
      setSug(await botApi<{ matched: ChatOrder[]; recent: ChatOrder[] }>(`/api/admin/chatbot/chats/orders?uid=${encodeURIComponent(uid)}&suggest=1`));
    } catch {
      setSug({ matched: [], recent: [] });
    }
  }, [uid, canEdit]);
  useEffect(() => {
    void load();
    void loadSug();
  }, [load, loadSug]);

  // พิมพ์เลขครบ (OD-261014-5697 / 261014-5697 / 2610145697) = หาเองทันที ไม่ต้องกดปุ่ม
  useEffect(() => {
    if (!/^(OD[\s-]*)?\d{6}[\s-]?\d{4}$/i.test(q.trim())) return;
    const t = setTimeout(() => void lookup(q), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const lookup = async (raw: string = q) => {
    const t = raw.trim().replace(/^OD[\s-]*/i, "").replace(/^(\d{6})[\s-]?(\d{4})$/, "$1-$2");
    if (!t) return;
    setBusy("lookup");
    setFound(null);
    try {
      const j = await botApi<{ order: ChatOrder }>(`/api/admin/chatbot/chats/orders?uid=${encodeURIComponent(uid)}&q=${encodeURIComponent(t)}`);
      setFound(j.order);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy("");
    }
  };

  const bind = async (o: ChatOrder) => {
    if (o.link === "other") {
      const ok = await confirm({
        icon: "⚠️",
        title: `${o.id} ผูกกับ LINE คนอื่นอยู่`,
        detail: `• ตอนนี้ผูกกับ "${o.otherName ?? "อีกบัญชี"}"\n• ผูกทับ = การ์ดแจ้งสถานะของใบนี้จะส่งมาที่ห้องนี้แทน\n• เช็คให้แน่ใจว่าเป็นลูกค้าคนเดียวกับห้องนี้`,
        confirmLabel: "ผูกทับกับห้องนี้",
        danger: true,
      });
      if (ok !== true) return;
    }
    setBusy(`bind:${o.id}`);
    try {
      const res = await fetch("/api/admin/orders/line-bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: o.id, input: uid }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; resent?: boolean; missed?: string[] };
      if (!j.ok) {
        toast(j.error ?? "ผูกไม่สำเร็จ", true);
        return;
      }
      toast(j.resent ? `🔗 ผูก ${o.id} แล้ว · ส่งการ์ดสถานะล่าสุดที่พลาดไปให้ลูกค้าแล้ว` : `🔗 ผูก ${o.id} กับห้องนี้แล้ว`);
      setFound(null);
      setQ("");
      await Promise.all([load(), loadSug()]);
      if (j.resent) onSent();
    } catch {
      toast("ต่อเซิร์ฟเวอร์ไม่ได้", true);
    } finally {
      setBusy("");
    }
  };

  const resend = async (o: ChatOrder) => {
    const ok = await confirm({
      icon: "🔔",
      title: `ส่งการ์ดสถานะ ${o.id}?`,
      detail: `• ลูกค้าจะได้การ์ด "${o.statusLabel}" อีกครั้งใน LINE\n• นับโควตาข้อความ LINE 1 ข้อความ`,
      confirmLabel: "ส่งการ์ด",
    });
    if (ok !== true) return;
    setBusy(`send:${o.id}`);
    try {
      const res = await fetch("/api/admin/orders/notify-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: o.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; error?: string };
      if (j.ok) {
        toast(`🔔 ส่งการ์ด ${o.statusLabel} แล้ว`);
        onSent();
      } else toast(`ส่งไม่ได้ — ${j.reason ?? j.error ?? "ไม่ทราบสาเหตุ"}`, true);
    } catch {
      toast("ต่อเซิร์ฟเวอร์ไม่ได้", true);
    } finally {
      setBusy("");
    }
  };

  const row = (o: ChatOrder, preview = false) => (
    <li key={o.id} className="rounded-xl bg-white p-2.5" style={{ border: "1px solid var(--dk-hair)" }}>
      <div className="flex items-center gap-1.5">
        <a href={`/admin/orders/${encodeURIComponent(o.id)}`} target="_blank" rel="noreferrer" className="text-[12.5px] font-extrabold underline-offset-2 hover:underline" style={{ color: "var(--dk-navy)" }}>
          {o.id} ↗
        </a>
        <span className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={{ background: "#EEF2F7", color: "var(--dk-navy-soft)" }}>
          {o.statusLabel}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
        {o.date} · {o.customer}
      </p>
      {o.why ? <p className="mt-0.5 text-[11px] font-bold" style={{ color: "#8A5A00" }}>✨ {o.why}</p> : null}
      <p className="mt-0.5 text-[12px]">
        {baht(o.total)}
        {o.balance > 0 ? <span className="ml-1.5 font-bold" style={{ color: "#B91C1C" }}>ค้าง {baht(o.balance)}</span> : null}
        {o.tracking ? <span className="ml-1.5 font-mono text-[11px]" style={{ color: "var(--dk-faint)" }}>📮 {o.tracking}</span> : null}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {o.link === "bound" ? (
          <span className="text-[11px] font-bold" style={{ color: "#0E7A3A" }}>✓ ผูกกับห้องนี้</span>
        ) : o.link === "login" ? (
          <span className="text-[11px] font-bold" style={{ color: "#8A5A00" }}>สั่งตอนล็อกอิน LINE นี้ · ยังไม่ผูก</span>
        ) : o.link === "other" ? (
          <span className="text-[11px] font-bold" style={{ color: "#B91C1C" }}>⚠️ ผูกกับ LINE &quot;{o.otherName}&quot;</span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--dk-faint)" }}>ยังไม่ผูก LINE</span>
        )}
        <span className="ml-auto flex gap-1">
          {canEdit && o.link !== "bound" ? (
            <button type="button" disabled={!!busy} onClick={() => void bind(o)} className="min-h-[30px] rounded-full px-2.5 text-[11.5px] font-bold text-white disabled:opacity-50" style={{ background: o.link === "other" ? "#B91C1C" : LINE_GREEN }}>
              {busy === `bind:${o.id}` ? "กำลังผูก…" : o.link === "other" ? "ผูกทับ" : "🔗 ผูกกับห้องนี้"}
            </button>
          ) : null}
          {canEdit && !preview && (o.link === "bound" || o.link === "login") ? (
            <button type="button" disabled={!!busy} onClick={() => void resend(o)} title="ส่งการ์ดสถานะล่าสุดของใบนี้ให้ลูกค้าอีกครั้ง (นับโควตา)" className="min-h-[30px] rounded-full px-2.5 text-[11.5px] font-bold disabled:opacity-50" style={{ background: "#EEF2F7", color: "var(--dk-navy-soft)" }}>
              {busy === `send:${o.id}` ? "กำลังส่ง…" : "🔔 ส่งการ์ดสถานะ"}
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );

  return (
    <div className="mx-4 mt-3">
      <div className="mb-1 flex items-center">
        <p className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>📦 ออเดอร์ของลูกค้านี้</p>
        {orders && orders.length ? <span className="ml-1.5 text-[11px]" style={{ color: "var(--dk-faint)" }}>{orders.length} ใบ</span> : null}
      </div>
      {orders === null ? (
        <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>กำลังโหลด…</p>
      ) : err ? (
        <p className="text-[12px]" style={{ color: "#B91C1C" }}>{err}</p>
      ) : orders.length ? (
        <ul className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">{orders.map((o) => row(o))}</ul>
      ) : (
        <p className="rounded-xl p-2.5 text-[12px]" style={{ background: "#F6F8FB", color: "var(--dk-faint)" }}>
          ยังไม่มีออเดอร์ที่ผูกกับ LINE นี้
        </p>
      )}
      {canEdit && sug?.matched.length ? (
        <div className="mt-2 rounded-xl p-2" style={{ background: "#FFF8E6", border: "1px solid #F0D48A" }}>
          <p className="mb-1 text-[11.5px] font-bold" style={{ color: "#8A5A00" }}>✨ น่าจะเป็นของลูกค้านี้ — กดผูกได้เลย</p>
          <ul className="flex flex-col gap-1.5">{sug.matched.map((o) => row(o, true))}</ul>
        </div>
      ) : null}
      {canEdit && sug?.recent.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-[11.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
            🆕 ใบใหม่ 2 วันที่ยังไม่ผูก LINE ({sug.recent.length})
          </summary>
          <ul className="mt-1.5 flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">{sug.recent.map((o) => row(o, true))}</ul>
        </details>
      ) : null}
      {canEdit ? (
        <div className="mt-2">
          <div className="flex gap-1.5">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setFound(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void lookup(q);
              }}
              placeholder="ผูกออเดอร์: OD-261014-5697"
              className="min-h-[34px] min-w-0 flex-1 rounded-lg border px-2.5 text-[12.5px]"
              style={{ borderColor: "var(--dk-hair)" }}
            />
            <button type="button" disabled={!q.trim() || busy === "lookup"} onClick={() => void lookup(q)} className="min-h-[34px] shrink-0 rounded-lg px-3 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--dk-navy)" }}>
              {busy === "lookup" ? "…" : "หา"}
            </button>
          </div>
          {found ? <ul className="mt-1.5">{row(found, true)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

type MenuOpt = { value: string; label: string; icon?: string; count?: number; urgent?: boolean; tone?: { wash: string; ink: string; tone: string } };

/**
 * 🔽 เมนูตัวกรองในแถบรายชื่อแชท (14 ต.ค. 69 เจ้าของร้าน: ฟอนต์ใหญ่ไป · อยากมีไอคอน · ป้ายต้องเป็นสี/ไอคอนตามป้ายจริง)
 * เมนูของเครื่อง (<select>) แต่งฟอนต์/สีไม่ได้ → ทำเอง: ปุ่ม + รายการลอย (position fixed กันโดนกรอบแถบรายชื่อตัด)
 * ป้าย (tone) วาดเหมือน TagChip ในห้อง · งานที่ต้องลงมือ (urgent) ตัวเลขพื้นทึบ · ปิดด้วยคลิกข้างนอก/Esc · ลูกศรขึ้นลงเลือกได้
 */
function FilterMenu({
  id, label, value, options, onChange, active, badge,
}: {
  id: string;
  label: string;
  value: string;
  options: MenuOpt[];
  onChange: (v: string) => void;
  active: boolean;
  badge?: { n: number; title: string; bg: string };
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [hi, setHi] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const cur = options.find((o) => o.value === value) ?? options[0];

  const show = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 220);
    setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - width - 8), width });
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown") (e.preventDefault(), setHi((h) => Math.min(options.length - 1, h + 1)));
      else if (e.key === "ArrowUp") (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
      else if (e.key === "Enter") (e.preventDefault(), pick(options[hi]?.value ?? value));
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hi, options, value]);

  const t = active ? cur.tone : undefined;
  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        title={badge?.title}
        className="flex min-h-[40px] min-w-0 flex-1 items-center gap-1.5 rounded-xl border px-2.5 text-left transition"
        style={{ borderColor: t ? t.tone : active ? "var(--dk-navy)" : "var(--dk-hair)", background: t ? t.wash : active ? "#F1F5F9" : "white" }}
      >
        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
          {label}
        </span>
        {cur.icon ? <span aria-hidden="true" className="shrink-0 text-[13px] leading-none">{cur.icon}</span> : null}
        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: t ? t.ink : "var(--dk-navy)", fontWeight: active ? 700 : 500 }}>
          {cur.label}
        </span>
        {badge ? (
          <span className="shrink-0 rounded-full px-1.5 text-[11px] font-bold leading-[18px] text-white tabular-nums" style={{ background: badge.bg }}>
            {badge.n.toLocaleString()}
          </span>
        ) : null}
        <span aria-hidden="true" className="shrink-0 text-[9px]" style={{ color: "var(--dk-navy-soft)", transform: open ? "rotate(180deg)" : undefined }}>
          ▼
        </span>
      </button>
      {open && pos ? (
        <div
          ref={list}
          role="listbox"
          aria-labelledby={id}
          className="fixed z-[60] overflow-hidden rounded-xl border bg-white py-1 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width, borderColor: "var(--dk-hair)" }}
        >
          {options.map((o, i) => {
            const on = o.value === value;
            return (
              <button
                key={o.value || "_all"}
                type="button"
                role="option"
                aria-selected={on}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o.value)}
                className="flex min-h-[36px] w-full items-center gap-2 px-2.5 text-left text-[13px]"
                style={{ background: i === hi ? "#F1F5F9" : undefined }}
              >
                <span aria-hidden="true" className="w-3.5 shrink-0 text-[12px]" style={{ color: "var(--dk-navy)" }}>
                  {on ? "✓" : ""}
                </span>
                {o.tone ? (
                  // ป้าย: วาดแบบเดียวกับป้ายในห้อง (พื้น/ตัวอักษรตามสีป้าย + อีโมจิ)
                  <span className="min-w-0 truncate rounded-full px-2 py-[2px] text-[12.5px] font-bold" style={{ background: o.tone.wash, color: o.tone.ink }}>
                    {o.icon} {o.label}
                  </span>
                ) : (
                  <span className="min-w-0 truncate" style={{ color: "var(--dk-navy)", fontWeight: on ? 700 : 500 }}>
                    {o.icon ? <span aria-hidden="true" className="mr-1.5">{o.icon}</span> : null}
                    {o.label}
                  </span>
                )}
                {o.count ? (
                  <span
                    className="ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-bold leading-[18px] tabular-nums"
                    style={o.urgent ? { background: o.value === "waiting" ? "var(--dk-coral-ink)" : "var(--dk-yolk-ink)", color: "white" } : { color: "var(--dk-faint)" }}
                  >
                    {o.count.toLocaleString()}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

/**
 * 📝 การ์ดร่างคำตอบของบอท (โหมดร่าง 13 ต.ค. 69 — เจ้าของร้าน "อยากเป็นคนกดส่งเอง กลัวบอทให้ข้อมูลผิด")
 * แก้ข้อความได้ · Enter = ส่ง (Shift+Enter ขึ้นบรรทัด แบบช่องพิมพ์ด้านล่าง) · การ์ดสินค้า/รูปบัญชีในร่างส่งตามไปด้วย
 */
function DraftCard({ entry, canSend, onSend, onDiscard, onZoom }: { entry: LogEntry; canSend: boolean; onSend: (text: string) => Promise<boolean>; onDiscard: () => void; onZoom: (url: string) => void }) {
  const [text, setText] = useState(entry.draftText ?? "");
  const [busy, setBusy] = useState(false);
  const extras = entry.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\[(การ์ด|รูป|สติกเกอร์)\]/.test(l))
    .map((l) => l.replace(/^\[รูป\]\s*/, "🖼 รูป ").replace(/^\[การ์ด\]\s*/, "🧾 การ์ด ").replace(/^\[สติกเกอร์\]\s*/, "สติกเกอร์ ").trim());
  const send = async () => {
    if (busy || !canSend) return;
    if (!text.trim() && !extras.length) return;
    setBusy(true);
    const ok = await onSend(text);
    if (!ok) setBusy(false);
  };
  return (
    <div className="mb-3 flex justify-end">
      <div className="w-full max-w-[92%] rounded-2xl p-3 md:max-w-[70%]" style={{ background: "#FFF8E6", border: "1.5px dashed #E8B54A" }}>
        <div className="mb-1.5 flex items-center gap-2 text-[12px] font-bold" style={{ color: "#8A5A00" }}>
          📝 ร่างจากบอท · ลูกค้ายังไม่ได้รับ
          <span className="ml-auto font-normal" style={{ color: "#A07A2C" }}>{fmtTime(entry.at)}</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={!canSend || busy}
          rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
          className="w-full resize-y rounded-xl bg-white px-3 py-2 text-[14px] leading-relaxed outline-none"
          style={{ border: "1px solid #F0D48A" }}
        />
        {/* 🖼 รูป/การ์ดที่ส่งไปด้วย — ภาพย่อจริง กดดูใหญ่ได้ (14 ต.ค. 69 "ต้องการเห็นภาพก่อน") · ไม่มีภาพ = ป้ายข้อความแบบเดิม */}
        {entry.draftImages?.length || entry.cards?.length ? (
          <div className="mt-2">
            <p className="mb-1 text-[11.5px] font-bold" style={{ color: "#8A5A00" }}>
              ส่งพร้อมกัน{entry.draftImages?.length ? ` · รูป ${entry.draftImages.length}` : ""}
              {entry.cards?.length ? ` · การ์ดสินค้า ${entry.cards.length}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {(entry.draftImages ?? []).map((im, k) => (
                <button key={`i${k}`} type="button" onClick={() => onZoom(im.url)} title="กดเพื่อดูรูปใหญ่" className="overflow-hidden rounded-lg bg-white transition hover:opacity-90" style={{ border: "1px solid #F0D48A" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.preview} alt={`รูปที่ ${k + 1}`} loading="lazy" className="h-28 w-28 object-cover" />
                </button>
              ))}
              {(entry.cards ?? []).map((c, k) => (
                // 🧾 การ์ดสินค้าแบบที่ลูกค้าจะเห็นใน LINE (รูปจากเว็บ · ชื่อ · ช่วงราคา · ปุ่ม) — กดรูปดูใหญ่ · กดปุ่มเปิดหน้าสินค้า
                <div key={`c${k}`} className="w-[200px] shrink-0 overflow-hidden rounded-xl bg-white text-left shadow-sm" style={{ border: "1px solid rgba(0,0,0,.06)" }}>
                  {c.image ? (
                    <button type="button" onClick={() => onZoom(c.image as string)} className="block w-full" title="กดเพื่อดูรูปใหญ่">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image} alt={c.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:opacity-90" />
                    </button>
                  ) : null}
                  <div className="px-2.5 pb-2 pt-1.5">
                    <p className="truncate text-[13px] font-bold" style={{ color: "#153B3F" }}>{c.name || "สินค้า"}</p>
                    {c.price ? <p className="text-[12px]" style={{ color: "#A05A00" }}>{c.price}</p> : null}
                    <a href={c.url} target="_blank" rel="noreferrer" className="mt-1.5 block rounded-lg py-1 text-center text-[12px] font-bold text-white" style={{ background: "#1F6F78" }}>
                      ดูราคา / สั่งเลย
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : extras.length ? (
          <p className="mt-1 text-[11.5px]" style={{ color: "#8A5A00" }}>
            ส่งพร้อมกัน: {extras.join(" · ")}
          </p>
        ) : null}
        {/* ปุ่มแถวของตัวเอง ป้ายไม่ตัดบรรทัด (14 ต.ค. 69 เจ้าของร้าน "ออกแบบใหม่" — เดิมคำแนะนำ+2 ปุ่มเบียดแถวเดียว ป้ายแตก 2 บรรทัด) */}
        <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            title="ไม่ส่งร่างนี้ — แอดมินตอบลูกค้าเอง แล้วสอนคำตอบที่ถูกให้บอทที่หน้า บอทเรียนรู้"
            className="min-h-[44px] whitespace-nowrap rounded-full border bg-white px-4 text-[13px] font-bold transition hover:bg-[#FFF4D6] disabled:opacity-50"
            style={{ borderColor: "#E8C877", color: "#8A5A00" }}
          >
            ไม่ส่ง · ให้บอทเรียนรู้
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend || busy}
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] font-bold text-white transition hover:brightness-95 disabled:opacity-50"
            style={{ background: LINE_GREEN }}
          >
            {busy ? "กำลังส่ง…" : "ส่งให้ลูกค้า"}
            {!busy && canSend ? (
              <kbd className="rounded-md px-1.5 py-[1px] font-sans text-[11px] font-bold" style={{ background: "rgba(255,255,255,.25)" }}>
                Enter
              </kbd>
            ) : null}
          </button>
        </div>
        <p className="mt-1.5 text-right text-[11px]" style={{ color: "#A07A2C" }}>
          {canSend ? "Shift+Enter = ขึ้นบรรทัดใหม่ · ร่างผิด กด “ไม่ส่ง” แล้วพิมพ์ตอบเองด้านล่าง" : "บัญชีนี้ส่งไม่ได้ หรือโควตาข้อความหมด"}
        </p>
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "mint" | "sky" | "lilac" | "coral" | "amber"; children: React.ReactNode }) {
  const S: Record<string, { bg: string; fg: string }> = {
    mint: { bg: "var(--dk-mint-wash, #E7F8EE)", fg: "var(--dk-mint-ink, #166534)" },
    sky: { bg: "var(--dk-sky, #E6F1FB)", fg: "var(--dk-blue-deep, #1D4ED8)" },
    lilac: { bg: "var(--dk-lilac-wash, #EFE9FB)", fg: "var(--dk-lilac-ink, #5B21B6)" },
    coral: { bg: "var(--dk-coral-wash, #FDE8E6)", fg: "var(--dk-coral-ink, #B91C1C)" },
    amber: { bg: "#FFF4D6", fg: "#8A5A00" },
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
  customerName,
  disabled,
  quotaLow,
  onSent,
  toast,
  dropFile,
  onDropConsumed,
}: {
  id: string;
  /** ชื่อ LINE ของลูกค้า — แทน {Nickname} ในข้อความตอบกลับ */
  customerName: string;
  disabled: boolean;
  quotaLow: boolean;
  onSent: (r: ReplyRes) => void;
  toast: (t: string, bad?: boolean) => void;
  dropFile: File | null;
  onDropConsumed: () => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ url: string; name: string } | null>(null);
  const [fileAtt, setFileAtt] = useState<{ url: string; name: string; size: number } | null>(null);
  const [card, setCard] = useState<CatalogItem | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQ, setPickQ] = useState("");
  // 💬 ข้อความตอบกลับจาก LINE OA (14 ต.ค. 69): อิโมจิ LINE ของข้อความที่เลือก — "$" ในช่องพิมพ์ = อิโมจิตัวนั้น (ส่งด้วย emojis ของ Messaging API)
  const [replyOpen, setReplyOpen] = useState(false);
  const [lineEmojis, setLineEmojis] = useState<Emoji[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setText("");
    setImage(null);
    setFileAtt(null);
    setCard(null);
    setPickOpen(false);
    setReplyOpen(false);
    setLineEmojis([]);
  }, [id]);

  // textarea สูงตามข้อความเหมือน LINE OA Manager (เจ้าของร้าน 14 ต.ค. 69: ข้อความตอบกลับยาว ๆ ต้องเห็นทั้งก้อน)
  // สูงได้ถึง ~55% ของจอ (อย่างน้อย 140px) เกินนั้นค่อยเลื่อนในช่อง — ห้องแชทด้านบนยังเหลือที่ให้เห็นข้อความล่าสุด
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const max = Math.max(140, Math.round(window.innerHeight * 0.55));
    el.style.height = "0px";
    el.style.height = `${Math.min(max, Math.max(44, el.scrollHeight))}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
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
        // 📎 19:00 รูป → ส่งเป็นรูป · ไฟล์งานอื่น (AI/PSD/PDF/ZIP …) → อัปแล้วส่งเป็นลิงก์ดาวน์โหลด (LINE API ส่งไฟล์ตรงไม่ได้)
        if (f.type.startsWith("image/")) {
          const up = await uploadBotImage(`chat-${id}`, f);
          setImage({ url: up.url, name: f.name });
        } else {
          const up = await uploadBotFile(`chat-${id}`, f);
          setFileAtt({ url: up.url, name: up.name, size: up.size });
        }
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
      const f = (e.clipboardData?.files ?? [])[0];
      if (f) {
        e.preventDefault();
        void onFile(f);
      }
    },
    [onFile],
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if ((!t && !image && !card && !fileAtt) || sending) return;
    setSending(true);
    try {
      const r = await botApi<ReplyRes>("/api/admin/chatbot/chats/reply", {
        id,
        text: t,
        emojis: lineEmojis.length ? realignEmojis(t, lineEmojis) : undefined,
        imageUrl: image?.url ?? "",
        card: card ? { name: card.name, url: card.url, image: card.image, priceMin: card.priceMin, priceMax: card.priceMax } : undefined,
        file: fileAtt ?? undefined,
      });
      setText("");
      setImage(null);
      setFileAtt(null);
      setCard(null);
      setLineEmojis([]);
      onSent(r);
      areaRef.current?.focus();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSending(false);
    }
  }, [text, image, card, fileAtt, sending, id, onSent, toast, lineEmojis]);

  /** ใส่ข้อความตอบกลับที่เลือกลงตรงเคอร์เซอร์ (ช่องว่าง = แทนทั้งช่อง) — ยังไม่ส่ง ให้แอดมินแก้ก่อนได้ */
  const insertReply = useCallback(
    (snippet: string, emojis: Emoji[]) => {
      const el = areaRef.current;
      const a = text ? (el?.selectionStart ?? text.length) : 0;
      const b = text ? (el?.selectionEnd ?? text.length) : 0;
      const next = text.slice(0, a) + snippet + text.slice(b);
      // อิโมจิเดิมในช่อง (ก่อน/หลังจุดแทรก) + ของใหม่ เรียงตามตำแหน่ง "$" — ตอนส่งค่อยจับคู่ "$" ใหม่ตามลำดับ
      const dollars = (x: string) => x.split("$").length - 1;
      const nBefore = Math.min(lineEmojis.length, dollars(text.slice(0, a)));
      const nCut = dollars(text.slice(a, b));
      setLineEmojis([...lineEmojis.slice(0, nBefore), ...emojis, ...lineEmojis.slice(nBefore + nCut)]);
      setText(next);
      setReplyOpen(false);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(a + snippet.length, a + snippet.length);
      });
    },
    [text, lineEmojis],
  );

  const canSend = !disabled && !sending && (!!text.trim() || !!image || !!card || !!fileAtt);

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
      {image || card || fileAtt || uploading ? (
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
          {fileAtt ? (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#F1F5F9" }} title={fileAtt.name}>
              📎 {fileAtt.name.slice(0, 28)} · {fmtSize(fileAtt.size)}
              <button type="button" onClick={() => setFileAtt(null)} aria-label="เอาไฟล์ออก" className="ml-1 font-bold">
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
        <input ref={fileRef} type="file" accept="image/*,.pdf,.ai,.psd,.eps,.svg,.cdr,.tif,.tiff,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp4,.mov" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        <IconBtn onClick={() => fileRef.current?.click()} title="แนบรูปหรือไฟล์งาน (AI/PSD/PDF/ZIP … ≤ 4 MB)">
          {uploading ? "…" : "📎"}
        </IconBtn>
        <IconBtn onClick={() => void openPicker()} title="ส่งการ์ดสินค้า" active={pickOpen}>
          🧾
        </IconBtn>
        <IconBtn onClick={() => setReplyOpen(true)} title="ข้อความตอบกลับ / คูปอง" active={replyOpen}>
          ⊕
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
          placeholder={disabled ? "ส่งจากหน้านี้ไม่ได้ชั่วคราว (โควตา LINE)" : "พิมพ์ข้อความ… (ลากรูป/ไฟล์มาวาง หรือ Ctrl+V ก็ได้)"}
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
      {lineEmojis.length && text.includes("$") ? (
        <p className="px-3 pt-1.5 text-[11.5px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
          ตัว $ ในช่องพิมพ์ = อิโมจิ LINE {Math.min(lineEmojis.length, text.split("$").length - 1)} ตัว (ลูกค้าเห็นเป็นรูป) · ลบ $ = ลบอิโมจินั้น
        </p>
      ) : null}
      {replyOpen ? <SavedReplyPicker chatId={id} customerName={customerName} onClose={() => setReplyOpen(false)} onPick={insertReply} /> : null}
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
  detail, canReply, canToggle, noteSaving, onNoteAdd, onNoteEdit, onNoteDel, tags, onTags, onManageTags, onToggle, onWake, onClose, orders, aiBusy, onAiRetag,
}: {
  detail: Row; canReply: boolean; canToggle: boolean; noteSaving: boolean; orders: React.ReactNode; aiBusy: boolean; onAiRetag: () => void;
  onNoteAdd: (t: string) => Promise<boolean>; onNoteEdit: (id: string, t: string) => Promise<boolean>; onNoteDel: (id: string) => Promise<boolean>; tags: ChatTag[]; onTags: (ts: string[]) => void; onManageTags: () => void; onToggle: () => void; onWake: () => void; onClose: () => void;
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
          {detail.adminTags.map((k) => <TagChip key={k} k={k} tags={tags} />)}
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
      {orders}
      <div className="mx-4 mt-3">
        <p className="mb-1 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>บอท</p>
        <BotPill detail={detail} canToggle={canToggle} onToggle={onToggle} onWake={onWake} />
      </div>
      <div className="mx-4 mt-3">
        <div className="mb-1 flex items-center">
          <p className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>ป้าย (ติดได้หลายอัน)</p>
          {canReply ? (
            <button type="button" onClick={onManageTags} className="ml-auto text-[11.5px] font-bold underline" style={{ color: "var(--dk-navy-soft)" }}>
              ⚙️ จัดการป้าย
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = detail.adminTags.includes(t.key);
            const c = TAG_PALETTE[t.color];
            return (
              <button key={t.key} type="button" disabled={!canReply} onClick={() => onTags(on ? detail.adminTags.filter((k) => k !== t.key) : [...detail.adminTags, t.key])} className="min-h-[32px] rounded-full px-2.5 text-[12px] font-bold transition" style={on ? { background: c.tone, color: "white" } : { background: c.wash, color: c.ink }} aria-pressed={on}>
                {on ? "✓ " : ""}{t.emoji} {t.label}
              </button>
            );
          })}
        </div>
        {/* 🤖 AI ติดป้ายระดับให้เอง (cron ทุก 5 นาที) — โชว์เหตุผล · แอดมินกดป้ายเองหลังลูกค้าพิมพ์ล่าสุด = AI ไม่ทับ */}
        <div className="mt-1.5 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px]" style={{ background: "#F6F8FB", color: "var(--dk-navy-soft)" }}>
          <span className="min-w-0 flex-1 leading-snug">
            {detail.aiTag?.key && detail.adminTags.includes(detail.aiTag.key) ? (
              <>
                🤖 AI: <b>{tags.find((t) => t.key === detail.aiTag!.key)?.label ?? detail.aiTag.key}</b>
                {detail.aiTag.reason ? ` — ${detail.aiTag.reason}` : ""}
                {detail.aiTag.at ? <span style={{ color: "var(--dk-faint)" }}> · {ago(detail.aiTag.at)}</span> : null}
              </>
            ) : detail.aiTag?.key ? (
              <span style={{ color: "var(--dk-faint)" }}>🤖 แอดมินเลือกป้ายเองแล้ว — AI จะประเมินใหม่เมื่อลูกค้าพิมพ์มา</span>
            ) : (
              <span style={{ color: "var(--dk-faint)" }}>🤖 AI ติดป้ายความเร่งด่วนให้เองเมื่อลูกค้าพิมพ์มา</span>
            )}
          </span>
          {canReply ? (
            <button type="button" disabled={aiBusy} onClick={onAiRetag} className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold underline disabled:opacity-50" style={{ color: "var(--dk-navy-soft)" }}>
              {aiBusy ? "กำลังประเมิน…" : "ประเมินใหม่"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mx-4 mb-4 mt-3">
        <NotesBlock notes={detail.adminNotes} canReply={canReply} saving={noteSaving} onAdd={onNoteAdd} onEdit={onNoteEdit} onDel={onNoteDel} />
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


/** ⚙️ หน้าจัดการป้าย — แก้อีโมจิ/ชื่อ/สี เพิ่ม ลบ แล้วบันทึกทั้งชุดลง settings/chat-tags (ลบป้าย = ลูกค้าที่ติดอยู่จะไม่แสดงป้ายนั้น) */
function TagManager({ tags, onClose, onSaved, toast }: { tags: ChatTag[]; onClose: () => void; onSaved: (items: ChatTag[]) => void; toast: (t: string, bad?: boolean) => void }) {
  const [items, setItems] = useState<ChatTag[]>(tags.map((t) => ({ ...t })));
  const [saving, setSaving] = useState(false);
  // 🎨 19:15 เจ้าของร้าน "ให้เลือก icon ได้" — จานอีโมจิกดเลือก (พิมพ์เองก็ยังได้)
  const [emojiFor, setEmojiFor] = useState<number>(-1);
  const upd = (i: number, patch: Partial<ChatTag>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setItems((xs) => [...xs, { key: keyFromLabel("") + "-" + (xs.length + 1), label: "", emoji: "🏷", color: "sky" }]);
  const del = (i: number) => {
    const t = items[i];
    if (t.label && !window.confirm(`ลบป้าย "${t.emoji} ${t.label}"? ลูกค้าที่ติดป้ายนี้อยู่จะไม่แสดงป้ายอีก`)) return;
    setItems((xs) => xs.filter((_, j) => j !== i));
  };
  const move = (i: number, d: -1 | 1) => setItems((xs) => { const y = [...xs]; const j = i + d; if (j < 0 || j >= y.length) return xs; [y[i], y[j]] = [y[j], y[i]]; return y; });
  const save = async () => {
    const clean = items.map((t) => ({ ...t, label: t.label.trim(), emoji: t.emoji.trim() || "🏷" })).filter((t) => t.label);
    if (!clean.length) return toast("ต้องมีป้ายอย่างน้อย 1 อัน", true);
    setSaving(true);
    try {
      const d = await botApi<{ ok: boolean; items: ChatTag[]; saved?: string }>("/api/admin/chatbot/chats/tags", { items: clean });
      onSaved(d.items);
      toast(d.saved || "บันทึกแล้ว");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="⚙️ จัดการป้ายลูกค้า"
      sub="ป้ายใช้ร่วมกันทุกห้องแชท · ติดได้หลายป้ายต่อคน · ลำดับที่ตั้งไว้ = ลำดับที่แสดง"
      onClose={onClose}
      foot={
        <div className="flex w-full items-center gap-2">
          <button type="button" onClick={add} className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]">＋ เพิ่มป้าย</button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="dkb-btn dkb-btn-navy dkb-btn-sm min-h-[40px]">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      }
    >
      <div className="space-y-2">
        {items.map((t, i) => {
          const c = TAG_PALETTE[t.color];
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border p-2" style={{ borderColor: "var(--dk-hair)" }}>
              <span>
                <button type="button" onClick={() => setEmojiFor(emojiFor === i ? -1 : i)} aria-label="เลือกไอคอน" title="กดเพื่อเลือกไอคอน" className="grid h-10 w-12 place-items-center rounded-lg border text-lg" style={{ borderColor: emojiFor === i ? "var(--dk-navy)" : "var(--dk-hair)" }}>
                  {t.emoji || "🏷"}
                </button>
              </span>
              <input value={t.label} onChange={(e) => upd(i, { label: e.target.value.slice(0, 24) })} placeholder="ชื่อป้าย เช่น รอไฟล์ / รอโอน / ลูกค้าประจำ" aria-label="ชื่อป้าย" className="h-10 min-w-[160px] flex-1 rounded-lg border px-3 text-[14px]" style={{ borderColor: "var(--dk-hair)" }} />
              <div className="flex gap-1" role="radiogroup" aria-label="สี">
                {TAG_COLORS.map((col) => (
                  <button key={col} type="button" role="radio" aria-checked={t.color === col} title={TAG_PALETTE[col].name} onClick={() => upd(i, { color: col as TagColor })} className="h-7 w-7 rounded-full border-2" style={{ background: TAG_PALETTE[col].tone, borderColor: t.color === col ? "var(--dk-navy)" : "transparent", outline: t.color === col ? "2px solid white" : "none", outlineOffset: -4 }} />
                ))}
              </div>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: c.wash, color: c.ink }}>{t.emoji} {t.label || "ตัวอย่าง"}</span>
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => move(i, -1)} aria-label="เลื่อนขึ้น" className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/[0.05]">↑</button>
                <button type="button" onClick={() => move(i, 1)} aria-label="เลื่อนลง" className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/[0.05]">↓</button>
                <button type="button" onClick={() => del(i)} aria-label="ลบป้าย" className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/[0.05]" style={{ color: "var(--dk-coral-ink)" }}>🗑</button>
              </span>
              {emojiFor === i ? (
                <div className="basis-full rounded-xl border" style={{ borderColor: "var(--dk-hair)", background: "#F8FAFC" }}>
                  <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--dk-hair)" }}>
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-white text-xl" style={{ border: "1px solid var(--dk-hair)" }}>{t.emoji || "🏷"}</span>
                    <input value={t.emoji} onChange={(e) => upd(i, { emoji: e.target.value.slice(0, 4) })} placeholder="พิมพ์อีโมจิเอง (⌃⌘Space / Win+.)" aria-label="พิมพ์อีโมจิเอง" className="h-9 min-w-0 flex-1 rounded-lg border px-2 text-[13px]" style={{ borderColor: "var(--dk-hair)", background: "white" }} />
                    <button type="button" onClick={() => setEmojiFor(-1)} className="dkb-btn dkb-btn-sm">ปิด</button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto px-2 pb-2">
                    {EMOJI_GROUPS.map((g) => (
                      <div key={g.title}>
                        <p className="mt-2 mb-1 px-1 text-[11.5px] font-bold" style={{ color: "var(--dk-faint)" }}>{g.title}</p>
                        <div className="flex flex-wrap gap-0.5">
                          {g.items.map((em) => (
                            <button key={em} type="button" title={em} onClick={() => { upd(i, { emoji: em }); setEmojiFor(-1); }} className="grid h-9 w-9 place-items-center rounded-lg text-lg hover:bg-black/[0.06]" style={t.emoji === em ? { background: "var(--dk-sky, #E6F1FB)", outline: "2px solid var(--dk-navy)" } : undefined}>
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!items.length ? <p className="text-sm" style={{ color: "var(--dk-faint)" }}>ยังไม่มีป้าย กด ＋ เพิ่มป้าย</p> : null}
      </div>
    </Modal>
  );
}


/** 📝 โน้ตภายในหลายรายการ (≤10) — รายการเรียงเก่า→ใหม่ แก้ในที่/ลบได้ · ช่องเพิ่มด้านล่าง */
function NotesBlock({ notes, canReply, saving, onAdd, onEdit, onDel }: { notes: NoteItem[]; canReply: boolean; saving: boolean; onAdd: (t: string) => Promise<boolean>; onEdit: (id: string, t: string) => Promise<boolean>; onDel: (id: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string>("");
  const [editText, setEditText] = useState("");
  const full = notes.length >= 10;
  return (
    <>
      <div className="mb-1 flex items-center">
        <p className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>โน้ตภายใน (ลูกค้าไม่เห็น)</p>
        <span className="ml-auto text-[11px]" style={{ color: full ? "var(--dk-coral-ink)" : "var(--dk-faint)" }}>{notes.length}/10</span>
      </div>
      <div className="space-y-1.5">
        {notes.map((n) => (
          <div key={n.id} className="rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FFFBEA", border: "1px solid #F0D48A" }}>
            {editId === n.id ? (
              <>
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="w-full resize-y rounded-lg border bg-white px-2 py-1.5 text-[13px] outline-none" style={{ borderColor: "#F0D48A" }} />
                <div className="mt-1 flex gap-2">
                  <button type="button" disabled={saving || !editText.trim()} onClick={() => void onEdit(n.id, editText.trim()).then((ok) => ok && setEditId(""))} className="dkb-btn dkb-btn-navy dkb-btn-sm min-h-[32px]">บันทึก</button>
                  <button type="button" onClick={() => setEditId("")} className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>ยกเลิก</button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap break-words">{n.text}</p>
                <div className="mt-1 flex items-center gap-2 text-[10.5px]" style={{ color: "var(--dk-faint)" }}>
                  <span>{n.by || "แอดมิน"}{n.at ? ` · ${timeOrDay(n.at)}` : ""}</span>
                  {canReply ? (
                    <span className="ml-auto flex gap-2">
                      <button type="button" onClick={() => { setEditId(n.id); setEditText(n.text); }} className="font-bold underline">แก้</button>
                      <button type="button" onClick={() => { if (window.confirm("ลบโน้ตนี้?")) void onDel(n.id); }} className="font-bold underline" style={{ color: "var(--dk-coral-ink)" }}>ลบ</button>
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ))}
        {!notes.length ? <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>ยังไม่มีโน้ต</p> : null}
      </div>
      {canReply ? (
        <div className="mt-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} disabled={full || saving} rows={2} placeholder={full ? "โน้ตเต็ม 10 รายการ — ลบอันเก่าก่อน" : "เพิ่มโน้ต เช่น ที่อยู่ส่งของ / งานที่คุยค้าง / ข้อควรระวัง"} className="w-full resize-y rounded-xl border px-3 py-2 text-[13.5px] outline-none disabled:opacity-60" style={{ borderColor: "#F0D48A", background: "#FFFBEA" }} />
          <button type="button" onClick={() => void onAdd(draft.trim()).then((ok) => ok && setDraft(""))} disabled={saving || full || !draft.trim()} className="dkb-btn dkb-btn-navy dkb-btn-sm mt-1.5 min-h-[36px] disabled:opacity-40">
            {saving ? "กำลังบันทึก…" : "＋ เพิ่มโน้ต"}
          </button>
        </div>
      ) : null}
    </>
  );
}
function timeOrDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}


/** 🎠 แถวการ์ดเลื่อนด้วยลูกศร ‹ › เหมือน LINE (เจ้าของร้าน 9 ต.ค. 69 20:10 "ปรับเป็นลูกศรในการเลื่อน") — ซ่อนแถบสกรอล · ลูกศรโผล่เฉพาะด้านที่เลื่อนได้ · ยังปัดนิ้ว/ล้อเมาส์ได้ */
function CardCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanL(el.scrollLeft > 4);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  const go = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(208, Math.floor(el.clientWidth * 0.8)), behavior: "smooth" });
  };
  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => go(dir)}
      aria-label={dir < 0 ? "เลื่อนซ้าย" : "เลื่อนขวา"}
      className="absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-xl text-white shadow-md transition active:scale-95"
      style={{ [dir < 0 ? "left" : "right"]: 4, background: "rgba(23,58,107,.55)", backdropFilter: "blur(2px)" }}
    >
      {dir < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <div className="relative mt-2">
      {canL ? arrow(-1) : null}
      {canR ? arrow(1) : null}
      <div ref={ref} onScroll={update} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ scrollSnapType: "x proximity" }}>
        {children}
      </div>
    </div>
  );
}


/** 🎨 จานอีโมจิป้ายลูกค้า แบ่งหมวด (เจ้าของร้าน 9 ต.ค. 69 20:55 "อยากให้มีตัวเลือกได้เยอะกว่านี้" — เดิม 44 ตัวแถวเดียว) */
const EMOJI_GROUPS: { title: string; items: string[] }[] = [
  { title: "สี / สัญลักษณ์", items: ["🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "🟤", "⚫", "⚪", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "⬛", "⬜", "🔶", "🔷", "🔸", "🔹", "💠", "🔘", "🏷", "📌", "📍", "⭐", "🌟", "✨", "🔥", "⚡", "✅", "☑️", "❌", "⭕", "🚫", "⛔", "❗", "❓", "‼️", "⚠️", "🆕", "🆗", "🆓", "🆙", "🔝", "🔛", "💯", "🔞", "♻️", "🔁", "🔄", "➡️", "⬅️", "⬆️", "⬇️", "↩️", "↪️", "🔃"] },
  { title: "สถานะ / เวลา", items: ["⏳", "⌛", "⏰", "⏱", "⏲", "🕐", "🕓", "🕘", "📅", "📆", "🗓", "🔔", "🔕", "🚩", "🏁", "🎯", "🚦", "🛑", "💤", "🔒", "🔓", "🔑", "🗝", "📣", "📢", "🔊", "🔇", "👀", "🙈", "💡", "🧭", "⚙️", "🔧", "🔨", "🛠", "🧰", "🧲", "🔍", "🔎"] },
  { title: "งานพิมพ์ / แบบ", items: ["🎨", "🖌", "🖍", "✏️", "✒️", "🖊", "🖋", "📐", "📏", "📎", "🖇", "📋", "📝", "📄", "📃", "📑", "🗂", "📁", "📂", "🗃", "🖨", "🖥", "💻", "🖱", "⌨️", "🖼", "🧵", "🪡", "🧶", "🧷", "✂️", "👕", "👚", "🧢", "🎽", "👜", "🛍", "🎒", "☂️", "🧩", "🪧", "🏷"] },
  { title: "การเงิน / เอกสาร", items: ["💰", "💵", "💴", "💶", "💷", "💳", "🧾", "🪙", "💸", "💲", "🏦", "🏧", "📊", "📈", "📉", "🧮", "📇", "📰", "🗒", "📜", "📬", "📭", "📮", "✉️", "📧", "📨", "📩", "📤", "📥", "🗳"] },
  { title: "ขนส่ง / แพ็ค", items: ["📦", "🚚", "🚛", "🛵", "🏍", "🚗", "🚐", "✈️", "🚀", "🛳", "🏪", "🏬", "🏠", "🏢", "🏭", "🗺", "🧳", "🛒", "🛍", "🎁", "🎀", "📫", "🔖", "🪪", "🪜"] },
  { title: "คน / ลูกค้า", items: ["🙋", "🙋‍♀️", "🙋‍♂️", "🙇", "🙏", "👋", "👍", "👎", "👌", "✌️", "🤝", "👏", "🙌", "💪", "☝️", "👉", "👈", "✍️", "👤", "👥", "👑", "💎", "🥇", "🥈", "🥉", "🏆", "🎖", "🏅", "🤖", "👩‍💻", "👨‍💻", "👩‍🎨", "👨‍🎨", "👩‍🔧", "👨‍🔧", "🧑‍💼", "👮", "🕵️", "🧑‍🏫", "👶", "🧒", "👧", "🧑", "👩", "👨", "🧓"] },
  { title: "อารมณ์", items: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🙂", "😉", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "🤔", "🤨", "😐", "😶", "🙄", "😏", "😬", "😴", "🤒", "🤕", "🤢", "🥴", "😵", "🤯", "😱", "😨", "😰", "😥", "😢", "😭", "😤", "😠", "😡", "🤬", "💀", "👻", "💩", "🤡", "👿", "😈", "🥺", "😇", "🤗", "🤫", "🤭", "💖", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "💞", "💓", "💗", "💝"] },
  { title: "ของกิน / ธรรมชาติ", items: ["☕", "🧋", "🍵", "🥤", "🍺", "🍰", "🎂", "🍩", "🍪", "🍕", "🍔", "🍟", "🍜", "🍣", "🍎", "🍊", "🍋", "🍉", "🍓", "🥑", "🌶", "🌸", "🌺", "🌻", "🌹", "🌷", "🍀", "🌿", "🌱", "🌵", "🌈", "☀️", "🌤", "☁️", "🌧", "⛈", "❄️", "🌙", "🌊", "🔮"] },
  { title: "สัตว์", items: ["🐣", "🐥", "🐤", "🦆", "🐔", "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐧", "🐦", "🦋", "🐝", "🐞", "🐢", "🐍", "🦄", "🐳", "🐬", "🐠", "🦀", "🦐", "🐙", "🦖", "🐲", "🐉"] },
  { title: "ฉลอง / กีฬา / อื่น ๆ", items: ["🎉", "🎊", "🎈", "🎄", "🎃", "🎆", "🎇", "🪄", "🎵", "🎶", "🎤", "🎧", "🎬", "📷", "📸", "🎥", "📺", "📻", "🎮", "🕹", "🎲", "🧸", "🎪", "🎭", "🎟", "🎫", "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🏸", "🥊", "🏊", "🚴", "🧘", "🏃", "🧗", "🛹", "🎳", "🥏", "🏹", "🪁"] },
];

/** 📎 การ์ดไฟล์แบบ LINE (เจ้าของร้าน 9 ต.ค. 69 20:20 "ให้หน้าตาเหมือนใน LINE"): กล่องไอคอนนามสกุล (Ai/Ps/PDF/ZIP…) · ชื่อไฟล์ · ขนาด · สถานะเก็บถาวร */
function FileCard({ file, href, archived }: { file: { url: string; name: string; size: number }; href: string; archived: boolean }) {
  const ext = (file.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
  const ICON: Record<string, { label: string; color: string }> = {
    ai: { label: "Ai", color: "#FF7C00" }, psd: { label: "Ps", color: "#31A8FF" }, pdf: { label: "PDF", color: "#E5322D" }, eps: { label: "EPS", color: "#FF7C00" }, svg: { label: "SVG", color: "#1F6F78" },
    zip: { label: "ZIP", color: "#6B7280" }, rar: { label: "RAR", color: "#6B7280" }, "7z": { label: "7Z", color: "#6B7280" }, doc: { label: "W", color: "#2B579A" }, docx: { label: "W", color: "#2B579A" },
    xls: { label: "X", color: "#217346" }, xlsx: { label: "X", color: "#217346" }, ppt: { label: "P", color: "#D24726" }, pptx: { label: "P", color: "#D24726" }, mp4: { label: "MP4", color: "#7C3AED" }, mov: { label: "MOV", color: "#7C3AED" },
    jpg: { label: "JPG", color: "#0E7A3A" }, jpeg: { label: "JPG", color: "#0E7A3A" }, png: { label: "PNG", color: "#0E7A3A" }, txt: { label: "TXT", color: "#6B7280" }, csv: { label: "CSV", color: "#217346" },
  };
  const ic = ICON[ext] ?? { label: ext ? ext.toUpperCase().slice(0, 4) : "FILE", color: "#6B7280" };
  return (
    <a href={href} target="_blank" rel="noreferrer" title="กดเพื่อดาวน์โหลด" className="flex w-[280px] max-w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left transition hover:bg-slate-50" style={{ border: "1px solid rgba(0,0,0,.08)" }}>
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border bg-white text-[13px] font-extrabold" style={{ borderColor: "#E5E7EB", color: ic.color }}>
        {ic.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold" style={{ color: "#1F2937" }}>{file.name}</span>
        <span className="block text-[12px]" style={{ color: "#6B7280" }}>Size: {file.size ? fmtSize(file.size) : "—"}</span>
        <span className="block text-[11.5px]" style={{ color: archived ? "#0E7A3A" : "#8A5A00" }}>{archived ? "เก็บถาวรแล้ว · กดเพื่อดาวน์โหลด" : "ยังไม่ได้เก็บ · กดเพื่อดึงจาก LINE"}</span>
      </span>
    </a>
  );
}
