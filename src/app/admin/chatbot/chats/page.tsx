"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Empty, SearchBox } from "@/components/admin/ui";
import { useCan, useIsAdministrator } from "@/lib/perm-context";
import { ago, botApi, Modal, uploadBotFile, uploadBotImage, useToast } from "../bot-ui";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { BANK_CARD } from "@/lib/bank-card";
import SavedReplyPicker from "./SavedReplyPicker";
import RedraftButton from "./RedraftButton";
import FlexView from "./FlexView";
import { realignEmojis, type Emoji } from "../saved-replies/shared";
import { DEFAULT_TAGS, keyFromLabel, TAG_COLORS, TAG_PALETTE, type ChatTag, type TagColor } from "@/lib/chat-tags";
import type { OaLive } from "@/lib/server/oa-chat-sync";
import { isDraftLive } from "@/lib/draft-live";

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
  /** 📝 โหมดร่างรายคน — บอทร่างคำตอบให้คนนี้รอแอดมินกดส่ง (settings/bot-whitelist.draftUserIds · 19 ต.ค. 69) */
  botDraft?: boolean;
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
type LogEntry = { id?: string; role: string; text: string; at: string; type?: string; mode?: string; by?: string; status?: string; approvedBy?: string; edited?: boolean; draftText?: string; imageUrl?: string; messageId?: string; imageExpired?: boolean; card?: { name: string; url: string }; cards?: CardRef[]; file?: { url: string; name: string; size: number }; notice?: { orderId: string; title: string; color: string; asText?: boolean }; draftImages?: { url: string; preview: string }[]; flex?: unknown[] };
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
type Settings = { mode: string; newSince: string; enabled: boolean };
type ListRes = { rows: Row[]; settings: Settings; count: number; waitingCount: number; unreadCount: number; draftCount?: number; tagCounts?: Record<string, number>; next?: string; partial?: boolean };
/** oaLive = สถานะดึงข้อความจาก LINE OA Manager รอบนี้ (lib/server/oa-chat-sync.ts · 15 ต.ค. 69) */
type DetailRes = Row & { log: LogEntry[]; messages: LogEntry[]; settings: Settings; partial?: boolean; oaLive?: OaLive };
/** คีย์ entry ในห้อง — log มี id เสมอ · messages (ห้องเก่า) ไม่มี ใช้ role+เวลา */
const entryKey = (e: LogEntry) => e.id ?? `${e.role}|${e.at}`;
type Quota = { limit: number | null; used: number; left: number | null; at: string; forecast?: { pct: number; perDay: number; monthTotal: number; outOn: string | null } | null };
type CatalogItem = { id?: string; name: string; url: string; image?: string; priceMin?: number; priceMax?: number };
type ReplyRes = { ok: boolean; sent: boolean; logged: boolean; entry?: LogEntry; pausedUntil?: string | null; warn?: string };
type Scope = "waiting" | "all" | "unread" | "draft" | "new" | "old";

const LINE_GREEN = "#06C755";
/**
 * 🎨 โทนแบบ LINE OA Manager (เจ้าของร้าน 19 ต.ค. 69 "ออกแบบให้เหมือนหน้า LineOA ให้ความรู้สึกใช้งานที่ง่าย")
 *   รายชื่อพื้นขาว เส้นคั่นบาง · ห้องที่เลือกพื้นเทาอ่อน+แถบเขียวซ้าย · พื้นห้องแชทเทาอมฟ้า · ฟองแอดมินเขียว LINE · ฟองบอทฟ้า (มีป้ายชื่อกำกับ ไม่ใช้สีอย่างเดียว)
 *   ช่องพิมพ์: กล่องข้อความกว้างเต็มแถว + แถบเครื่องมือมีป้ายคำใต้กล่อง + ปุ่ม "ส่ง" สี่เหลี่ยมเขียวมุมขวาล่าง
 *   ตั้งเป็นตัวแปร --ln-* ที่ชั้นนอกครั้งเดียว ส่วนอื่นอ้าง var() เท่านั้น
 */
const LN_VARS = {
  "--ln-green": LINE_GREEN,
  "--ln-green-ink": "#0A7A3B",
  "--ln-bg": "#F3F5F8",
  "--ln-line": "#ECEFF3",
  "--ln-sel": "#EEF1F5",
  "--ln-hover": "#F7F8FA",
  "--ln-me": "#9BE39A",
  "--ln-me-ink": "#0B2E13",
  "--ln-bot": "#DDEBFB",
  "--ln-them-line": "#E3E7ED",
  "--ln-field": "#F1F3F6",
} as React.CSSProperties;
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
  const rowsRef = useRef<Row[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
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
  // ⚡ 15 ต.ค. 69 เจ้าของร้าน "ต้องการให้ update ข้อมูล realtime ก่อนเข้าตอบ": ห้องที่เปิดอยู่ดึงเฉพาะข้อความใหม่ทุก 3 วิ · รายชื่อดึงเฉพาะห้องที่ขยับทุก 5 วิ
  //   + กลับมาที่แท็บ/หน้าต่าง = ดึงทันที · แท็บซ่อนอยู่ = หยุดโพล · มุมหัวห้องโชว์ "🟢 สด HH:mm:ss" (แดง = ดึงไม่ได้)
  //   💬🔄 ข้อความที่แอดมินพิมพ์เองใน LINE OA Manager: LINE ไม่ส่ง webhook → เซิร์ฟเวอร์ดึงจาก OA ตอนเปิด/โพลห้อง (ต้องมีคุกกี้ OA ในกล่อง ⚙️ หน้า ลูกค้า LINE
  //   + รู้รหัสห้อง OA ของคนนี้) · หัวห้องโชว์ "OA ✓ / OA ยังไม่เชื่อม / OA ยังไม่ผูกห้อง / OA ⚠️" · ปุ่ม 🔌 ทดสอบ (สิทธิ์ตั้งค่าระบบ) คืนเส้น API + ฟิลด์ตัวอย่างไว้ไล่
  const [live, setLive] = useState<{ at: number; ok: boolean }>({ at: 0, ok: true });
  const detailRef = useRef<DetailRes | null>(null);
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [waitingCount, setWaitingCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // 📜 15 ต.ค. 69 เจ้าของร้าน "ต้องการให้แสดงลูกค้าให้ครบ": เดิมได้ 80 ห้องล่าสุดแล้วตัน (เลื่อนลงสุดไม่มีอะไรต่อ ทั้งที่คลังมีหมื่นกว่าห้อง)
  //   → เลื่อนถึงท้ายรายการ = โหลดหน้าถัดไปต่อท้ายเอง (cursor = lastSeen ของแถวสุดท้าย · next ว่าง = ครบแล้ว)
  //   หน้าที่กรองออกหมด (เช่น "ใหม่" ในห้องเก่า ๆ) ไม่ไล่ต่อเอง ให้กดปุ่มดูห้องเก่ากว่านี้ — กันเลื่อนทีเดียวแล้วระบบอ่านทั้งคลัง
  const [next, setNext] = useState("");
  const [moreBusy, setMoreBusy] = useState(false);
  const [lastPageEmpty, setLastPageEmpty] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  /** ตัวกรองของรายชื่อที่โหลดอยู่ — รีเฟรช 30 วิ (ตัวกรองเดิม) = เติมหน้าแรกทับ เก็บหน้าที่เลื่อนมาแล้วไว้ · เปลี่ยนตัวกรอง = เริ่มใหม่ */
  const listKeyRef = useRef("");

  // 🔎 14 ต.ค. 69 "ค้นหาไม่ได้จริง": คำขอรายชื่อเก่า (เปิดหน้า/รีเฟรช 30 วิ ที่ไม่มีคำค้น) ตอบช้ากว่าผลค้นหา แล้วเขียนทับรายชื่อกลับเป็นทั้งหมด
  // → นับเลขคำขอ ใช้เฉพาะคำตอบของคำขอล่าสุด
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const my = ++loadSeq.current;
    setLoading(true);
    try {
      const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&limit=80${q ? `&q=${encodeURIComponent(q)}` : ""}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ""}`);
      if (my !== loadSeq.current) return;
      const key = `${scope}|${q}|${tagFilter}`;
      if (listKeyRef.current === key) {
        // รีเฟรชตัวกรองเดิม: หน้าแรกชุดใหม่นำ แล้วตามด้วยห้องที่เลื่อนมาแล้วซึ่งไม่อยู่ในหน้าแรก (ห้องที่เพิ่งทักจะขยับขึ้นหน้าแรกเอง) · cursor คงเดิม
        const ids = new Set(d.rows.map((r) => r.id));
        setRows((prev) => (prev.length > d.rows.length ? [...d.rows, ...prev.filter((r) => !ids.has(r.id))] : d.rows));
        setNext((cur) => (cur ? cur : (d.next ?? "")));
      } else {
        listKeyRef.current = key;
        setRows(d.rows);
        setNext(d.next ?? "");
        setLastPageEmpty(false);
      }
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

  /** 📜 หน้าถัดไปต่อท้าย (เรียกจาก sentinel ท้ายรายการ หรือปุ่ม "ดูห้องเก่ากว่านี้") */
  const loadMore = useCallback(async () => {
    if (!next || moreBusy || q) return;
    const cursor = next;
    const key = listKeyRef.current;
    setMoreBusy(true);
    try {
      const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&limit=80&before=${encodeURIComponent(cursor)}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ""}`);
      if (listKeyRef.current !== key) return; // เปลี่ยนตัวกรองไปแล้วระหว่างรอ
      setRows((prev) => {
        const have = new Set(prev.map((r) => r.id));
        return [...prev, ...d.rows.filter((r) => !have.has(r.id))];
      });
      setNext(d.next ?? "");
      setLastPageEmpty(d.rows.length === 0);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setMoreBusy(false);
    }
  }, [next, moreBusy, q, scope, tagFilter, toast]);

  // เลื่อนถึงท้ายรายการ = โหลดต่อเอง (เฉพาะเมื่อหน้าก่อนยังมีแถว — หน้าว่างให้กดปุ่มเอง)
  useEffect(() => {
    const el = moreRef.current;
    if (!el || !next || moreBusy || lastPageEmpty || q) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((x) => x.isIntersecting)) void loadMore();
      },
      { root: listRef.current, rootMargin: "0px 0px 240px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [next, moreBusy, lastPageEmpty, q, loadMore, rows.length]);

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

  // รีเฟรชรายการเต็มทุก 30 วิ (ชิปนับ/ห้องที่หลุดจากขอบเขต) — เฉพาะตอนไม่ได้ค้นหา
  useEffect(() => {
    if (q) return;
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load, q]);

  /** ⚡ ห้องที่ขยับหลังห้องล่าสุดที่มีอยู่ (since=) → แทนที่แถวเดิมแล้วดันขึ้นบน · ปรับตัวนับยังไม่อ่าน/ร่างตามส่วนต่าง */
  const pollList = useCallback(async () => {
    if (q) return;
    const key = listKeyRef.current;
    const newest = rowsRef.current.reduce((m, r) => (r.lastSeen > m ? r.lastSeen : m), "");
    if (!newest) return load();
    const d = await botApi<ListRes>(`/api/admin/chatbot/chats?scope=${scope}&since=${encodeURIComponent(newest)}${tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : ""}`);
    if (listKeyRef.current !== key || !d.rows.length) return;
    const prev = rowsRef.current;
    const was = new Map(prev.map((r) => [r.id, r]));
    const dUnread = d.rows.reduce((n, r) => n + Number(r.unread) - Number(was.get(r.id)?.unread ?? false), 0);
    const dDraft = d.rows.reduce((n, r) => n + Number(r.draftPending) - Number(was.get(r.id)?.draftPending ?? false), 0);
    const ids = new Set(d.rows.map((r) => r.id));
    setRows([...d.rows, ...prev.filter((r) => !ids.has(r.id))]);
    if (dUnread) setUnreadCount((n) => Math.max(0, n + dUnread));
    if (dDraft) setDraftCount((n) => Math.max(0, n + dDraft));
  }, [q, scope, tagFilter, load]);
  useEffect(() => {
    if (q) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void pollList().catch(() => {});
    }, 5_000);
    return () => clearInterval(t);
  }, [pollList, q]);

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
        setLive({ at: Date.now(), ok: true });
      } catch (e) {
        if (!quiet) toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        if (!quiet) setDetailLoading(false);
      }
    },
    [toast],
  );

  /** ⚡ ดึงเฉพาะ entry ที่ใหม่กว่าตัวล่าสุดที่มี (after=) แล้วรวมเข้ากับที่มีอยู่ (คีย์ซ้ำ = ทับด้วยของใหม่ เช่น ร่างที่เพิ่งส่ง) · ห้องที่ยังไม่มี log = โหลดเต็ม */
  const pollRoom = useCallback(
    async (id: string) => {
      const cur = detailRef.current;
      if (!cur || cur.id !== id || !cur.log.length) return openRoom(id, true);
      const newest = cur.log.reduce((m, e) => (e.at > m ? e.at : m), "");
      const d = await botApi<DetailRes>(`/api/admin/chatbot/chats?id=${id}&after=${encodeURIComponent(newest)}`);
      setDetail((prev) => {
        if (!prev || prev.id !== d.id) return prev;
        const { log: fresh, messages: _m, partial: _p, ...meta } = d;
        if (!fresh.length) return { ...prev, ...meta };
        const map = new Map(prev.log.map((e) => [entryKey(e), e]));
        for (const e of fresh) map.set(entryKey(e), e);
        const log = [...map.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
        return { ...prev, ...meta, log };
      });
    },
    [openRoom],
  );
  // ห้องที่เปิดอยู่: ข้อความใหม่ทุก 3 วิ · ทุกรอบที่ 10 (30 วิ) โหลดเต็มกันพลาด · แท็บซ่อน = ไม่โพล
  useEffect(() => {
    if (!sel) return;
    let n = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      n += 1;
      const p = n % 10 === 0 ? openRoom(sel, true) : pollRoom(sel);
      void p.then(() => setLive({ at: Date.now(), ok: true })).catch(() => setLive((v) => ({ ...v, ok: false })));
    }, 3_000);
    return () => clearInterval(t);
  }, [sel, openRoom, pollRoom]);
  // กลับมาที่แท็บ/หน้าต่าง (เช่น สลับจาก OA Manager มาตอบ) = ดึงรายชื่อ+ห้องทันที ไม่รอรอบ
  useEffect(() => {
    const kick = () => {
      if (document.visibilityState !== "visible") return;
      void load();
      if (sel) void openRoom(sel, true).then(() => setLive({ at: Date.now(), ok: true }));
    };
    window.addEventListener("focus", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      window.removeEventListener("focus", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [load, sel, openRoom]);

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
  // ✕ ลบร่างทิ้งเฉย ๆ — เฉพาะเจ้าของร้าน (Administrator · เซิร์ฟเวอร์เช็คซ้ำ) · 19 ต.ค. 69 "เพิ่มกากบาทกดลบให้หน่อย เห็นแค่สิทธิ์เจ้าของก่อน"
  const isOwner = useIsAdministrator();
  const deleteDraft = useCallback(
    async (m: LogEntry) => {
      if (!sel || !m.id) return;
      const ok = await confirm({ icon: "🗑", title: "ลบร่างนี้?", detail: "• ลูกค้าจะไม่ได้รับข้อความนี้\n• ไม่ส่งไปหน้า 🎓 บอทเรียนรู้", confirmLabel: "ลบร่าง", danger: true });
      if (ok !== true) return;
      try {
        const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/chatbot/chats/draft", { action: "delete", id: sel, logId: m.id });
        afterDraft(m.id, null);
        toast(d.saved || "ลบร่างแล้ว");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sel, afterDraft, toast, confirm],
  );
  // ↻ ให้บอทตอบใหม่ (ทิ้งร่างนี้ + สั่งร่างใหม่) · 19 ต.ค. 69 "เพิ่มปุ่ม refresh ใหม่ให้หน่อย ให้บอทตอบใหม่"
  const regenDraft = useCallback(
    async (m: LogEntry) => {
      if (!sel || !m.id) return;
      try {
        const d = await botApi<{ ok: boolean; saved?: string; redraft?: boolean }>("/api/admin/chatbot/chats/draft", { action: "regen", id: sel, logId: m.id });
        afterDraft(m.id, null);
        if (d.redraft) setRedraftAt((x) => ({ ...x, [sel]: Date.now() }));
        toast(d.saved || "ส่งให้บอทร่างใหม่แล้ว", !d.redraft);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sel, afterDraft, toast],
  );
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

  /** 🤖 ห้องที่เพิ่งสั่งบอทร่าง (เปิดสวิตช์แล้วร่างเอง) — id → เวลา */
  const [redraftAt, setRedraftAt] = useState<Record<string, number>>({});
  // 📝 โหมดร่างรายคน (เจ้าของร้าน 19 ต.ค. 69 "เปิดโหมดร่างกับลูกค้าที่เลือกได้ไหม") — มีผลเมื่อ n8n Build AI Request อ่าน draftUserIds แล้ว
  const toggleDraftUser = useCallback(
    async (id: string, on: boolean) => {
      try {
        const d = await botApi<{ ok: boolean; saved?: string; redraft?: boolean }>("/api/admin/chatbot/chats/draft", { action: "user", id, on });
        toast(d.saved || (on ? "เปิดร่างให้ลูกค้านี้แล้ว" : "ปิดร่างให้ลูกค้านี้แล้ว"));
        // เปิดแล้วเซิร์ฟเวอร์สั่งบอทร่างข้อความค้างให้เอง → แถบเหนือช่องพิมพ์ขึ้น "⏳ บอทกำลังร่าง…" แทนปุ่ม
        if (d.redraft) setRedraftAt((m) => ({ ...m, [id]: Date.now() }));
        setRows((rs) => rs.map((x) => (x.id === id ? { ...x, botDraft: on } : x)));
        setDetail((x) => (x && x.id === id ? { ...x, botDraft: on } : x));
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
  // 🔌 15 ต.ค. 69 ทดสอบดึงข้อความห้องนี้จาก LINE OA Manager (API ภายในของ chat.line.biz ยังไม่ยืนยันเส้น — เจ้าของร้านกดจาก browser ที่ล็อกอินแล้ว)
  const [oaProbe, setOaProbe] = useState<OaProbe | null>(null);
  const [oaProbeBusy, setOaProbeBusy] = useState(false);
  const probeOa = useCallback(async () => {
    if (!sel || oaProbeBusy) return;
    setOaProbeBusy(true);
    try {
      const d = await botApi<{ ok: boolean; probe: OaProbe }>("/api/admin/line-customers/oa-tags", { action: "probe-messages", userId: sel });
      setOaProbe(d.probe);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setOaProbeBusy(false);
    }
  }, [sel, oaProbeBusy, toast]);
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
  // เปลี่ยนห้อง: จอกว้าง (≥1440px) เปิดแผงข้อมูลลูกค้าค้างไว้แบบ LINE OA (เห็นออเดอร์/ป้าย/โน้ตโดยไม่ต้องกด) · จอแคบ/มือถือปิด (แผงเป็นแผ่นเต็มจอ)
  //   โน้ตในฐานเปลี่ยน (บันทึก/โพล) = ซิงก์ร่าง แต่ไม่ปิดแผง
  useEffect(() => {
    setNoteOpen(!!sel && window.matchMedia("(min-width: 1440px)").matches);
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
  // 👉 จอว่าง (ยังไม่เลือกห้อง): ห้องที่ควรตอบก่อนจากรายชื่อที่โหลดอยู่ — รอแอดมิน > ร่างรอส่ง > ยังไม่อ่าน (รายชื่อเรียงห้องล่าสุดก่อน)
  const nextUp = sel ? undefined : (rows.find((r) => r.needsHumanFollowup) ?? rows.find((r) => r.draftPending) ?? rows.find((r) => r.unread));
  return (
    <div ref={shellRef} className="dkb -mx-4 -my-6 flex overflow-hidden md:-mx-8 md:-my-8" style={{ ...LN_VARS, background: "var(--ln-bg)", color: "var(--dk-navy)", height: `calc(100dvh - ${topOffset}px)` }}>
      {/* ───── รายชื่อห้อง (ซ้าย) — มือถือซ่อนเมื่อเปิดห้อง ───── */}
      <aside className={`${sel ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r bg-white md:w-[300px] lg:w-[340px]`} style={{ borderColor: "var(--ln-line)" }}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3">
          {/* กดหัวข้อ = ปิดห้องที่เปิดอยู่ กลับหน้า "เลือกห้องแชททางซ้าย" (เจ้าของร้าน 14 ต.ค. 69) · แถบที่อยู่ล้าง ?id= ตาม sel เอง */}
          <h1 className="text-[19px] font-extrabold">
            <button
              type="button"
              onClick={() => {
                setSel("");
                setDetail(null);
                setNoteOpen(false);
              }}
              title={`กลับหน้าเลือกห้องแชท${modeText ? `\n${modeText}` : ""}`}
              className="rounded-md transition hover:opacity-70"
            >
              แชท LINE
            </button>
          </h1>
          <span className="text-[12px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
            {rows.length ? `${rows.length.toLocaleString()} ห้อง` : ""}
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
        {/* โหมดบอท: ข้อมูลนิ่ง → ขึ้นเป็นแถบเฉพาะตอนโหมดร่าง (ต้องลงมือกดส่ง) หรือคนที่สลับโหมดได้ · ที่เหลืออยู่ใน title หัวข้อ */}
        {settings && (settings.mode === "draft" || can("settings.manage")) ? (
        <div className="mx-4 mt-1.5 flex items-center gap-2 rounded-lg px-2.5 py-1" style={settings.mode === "draft" ? { background: "var(--dk-yolk-wash)" } : undefined}>
          <p className="min-w-0 flex-1 text-[11.5px] leading-snug" style={{ color: settings.mode === "draft" ? "var(--dk-yolk-ink)" : "var(--dk-faint)", fontWeight: settings.mode === "draft" ? 700 : 400 }}>
            {modeText}
          </p>
          {can("settings.manage") && (settings.mode === "draft" || settings.mode === "log-only") ? (
            <button
              type="button"
              onClick={() => void switchMode(settings.mode === "draft" ? "log-only" : "draft")}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold"
              style={settings.mode === "draft" ? { background: "white", color: "var(--dk-navy-soft)" } : { background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
              title={settings.mode === "draft" ? "ปิดโหมดร่าง — บอทกลับไปเก็บแชทอย่างเดียว" : "เปิดโหมดร่าง — บอทร่างคำตอบให้ทุกห้อง แอดมินกดส่งเอง"}
            >
              {settings.mode === "draft" ? "ปิดโหมดร่าง" : "📝 เปิดโหมดร่าง"}
            </button>
          ) : null}
        </div>
        ) : null}
        <div className="px-4 pt-2">
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
        <div className="flex items-center gap-2 px-4 pb-2.5 pt-2">
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
            // 19 ต.ค. 69: เลือก "ร่างรอส่ง"/"รอแอดมิน" อยู่ = เลขของมุมมองนั้น (เดิมโชว์เลขยังไม่อ่านเสมอ → "ร่างรอส่ง 388" ทั้งที่ร่างจริง 0 อ่านผิด)
            badge={
              scope === "draft"
                ? draftCount
                  ? { n: draftCount, title: `ร่างรอส่ง ${draftCount} ห้อง`, bg: "var(--dk-yolk-ink)" }
                  : undefined
                : scope === "waiting"
                  ? waitingCount
                    ? { n: waitingCount, title: `รอแอดมิน ${waitingCount} ห้อง`, bg: "var(--dk-coral-ink)" }
                    : undefined
                  : unreadCount
                    ? { n: unreadCount, title: `ยังไม่อ่าน ${unreadCount} ห้อง — เลือก "ยังไม่อ่าน" ในเมนูนี้`, bg: "var(--dk-mint-ink)" }
                    : undefined
            }
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
        <div ref={listRef} className="flex-1 overflow-y-auto border-t" style={{ borderColor: "var(--ln-line)" }}>
          {loading && !rows.length ? (
            <p className="p-4 text-sm" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !rows.length ? (
            <div className="p-4">
              <Empty title={tagFilter ? `ไม่มีห้องที่ติดป้าย "${tagCatalog.find((t) => t.key === tagFilter)?.label ?? tagFilter}"${scope !== "all" ? " ในตัวกรองนี้" : ""}` : scope === "waiting" ? "ไม่มีห้องที่รอแอดมิน" : "ยังไม่มีห้องแชท"} body={q ? "ไม่พบชื่อนี้ — ค้นได้ทั้งชื่อ LINE ชื่อที่แอดมินตั้ง และ userId (ส่วนใดของชื่อก็ได้)" : "เมื่อลูกค้าทักมา ห้องจะขึ้นที่นี่"} />
            </div>
          ) : (
            // 📋 แถวแบบ LINE OA (19 ต.ค. 69): ชื่อ+เวลา / ข้อความล่าสุด+จุดเขียว / ป้าย · ห้องที่เลือก = พื้นเทา+แถบเขียวซ้าย
            //   ป้ายที่ต้องลงมือ (รอแอดมิน · ร่างรอส่ง) เป็นเม็ดทึบนำหน้า · สถานะบอท/ลูกค้าใหม่/โน้ต เป็นตัวหนังสือจาง ๆ ต่อท้าย (เดิมเม็ดสีเท่ากันหมดจนแยกไม่ออก)
            rows.map((r) => {
              const on = sel === r.id;
              const quiet = [r.scope === "new" ? "🆕 ใหม่" : "", r.pausedUntil ? "⏸ พักบอท" : r.botAllowed ? "🤖 บอทตอบ" : "", r.botDraft ? "📝 ร่างก่อนส่ง" : "", r.adminNotes.length ? `📝${r.adminNotes.length > 1 ? r.adminNotes.length : ""}` : ""].filter(Boolean);
              const hasChips = r.needsHumanFollowup || r.draftPending || r.adminTags.length > 0 || quiet.length > 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void openRoom(r.id)}
                  aria-current={on ? "true" : undefined}
                  className="relative flex w-full items-start gap-3 border-b px-4 py-3 text-left transition hover:bg-[var(--ln-hover)] active:bg-[var(--ln-sel)]"
                  style={{ borderColor: "var(--ln-line)", background: on ? "var(--ln-sel)" : undefined }}
                >
                  {on ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--ln-green)" }} /> : null}
                  <Avatar src={r.pictureUrl} size={46} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ fontWeight: r.unread ? 800 : 700 }}>
                        {nameOf(r)}
                      </span>
                      <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: r.unread ? "var(--ln-green-ink)" : "var(--dk-faint)", fontWeight: r.unread ? 700 : 400 }}>
                        {listTime(r.lastSeen)}
                      </span>
                    </div>
                    {/* ข้อความล่าสุดตัวบางเสมอ (เจ้าของร้าน 14 ต.ค. 69) — ยังไม่อ่านบอกด้วยสีเข้ม + จุดเขียว + เวลาสีเขียวแทน */}
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px]" style={{ color: r.unread ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                        {r.lastUserText || (r.messageCount ? `บอทคุย ${r.messageCount} ข้อความ` : "—")}
                      </p>
                      {r.unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--ln-green)" }} title="ยังไม่ได้อ่าน" aria-label="ยังไม่ได้อ่าน" /> : null}
                    </div>
                    {hasChips ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {r.needsHumanFollowup ? <Chip tone="coral" solid>🙋 รอแอดมิน</Chip> : null}
                        {r.draftPending ? <Chip tone="amber" solid>📝 ร่างรอส่ง</Chip> : null}
                        {r.adminTags.map((k) => <TagChip key={k} k={k} tags={tagCatalog} />)}
                        {quiet.length ? (
                          <span className="text-[10.5px]" style={{ color: "var(--dk-faint)" }} title={r.adminNotes.length ? r.adminNotes.map((n) => n.text).join("\n") : undefined}>
                            {quiet.join(" · ")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })
          )}
          {/* 📜 ท้ายรายการ: โหลดต่อเอง / ปุ่มเมื่อหน้าก่อนว่าง / บอกว่าครบแล้ว */}
          {rows.length && !q ? (
            <div ref={moreRef} className="px-3 py-3 text-center text-[12px]" style={{ color: "var(--dk-faint)" }}>
              {moreBusy ? (
                "กำลังโหลดห้องเก่ากว่านี้…"
              ) : next ? (
                <button type="button" onClick={() => void loadMore()} className="min-h-[36px] rounded-full border bg-white px-4 font-bold" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-navy)" }}>
                  {lastPageEmpty ? "ยังไม่เจอในชุดนี้ · ดูห้องเก่ากว่านี้" : "ดูห้องเก่ากว่านี้"}
                </button>
              ) : (
                `ครบแล้ว ${rows.length.toLocaleString()} ห้อง`
              )}
            </div>
          ) : null}
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
          // ยังไม่เลือกห้อง (19 ต.ค. 69 เจ้าของร้าน "ปรับให้ใหม่หน่อย" + "เพิ่ม filter ขึ้นอีก"): ไม่ใช่แค่ "เลือกห้อง"
          //   ① ปุ่มเปิดห้องที่ควรตอบก่อน (nextUp) ② งานค้าง 3 แบบเห็นครบแม้เป็น 0 ③ ทางลัดตัวกรองทุกแบบ: มุมมองลูกค้า + ป้ายพร้อมจำนวน (ชุดเดียวกับ dropdown ดู/ป้าย)
          <div className="m-auto w-full max-w-[520px] px-6 py-8">
            <h2 className="text-[19px] font-extrabold" style={{ color: "var(--dk-navy)" }}>
              งานค้างในแชท
            </h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
              เลือกห้องทางซ้าย หรือกดตัวกรองด้านล่างเพื่อคัดรายชื่อ
            </p>

            {nextUp ? (
              <button
                type="button"
                onClick={() => void openRoom(nextUp.id)}
                className="mt-4 flex min-h-[60px] w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-white shadow-sm transition hover:brightness-[.96]"
                style={{ background: "var(--ln-green-ink)" }}
              >
                <Avatar src={nextUp.pictureUrl} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-bold opacity-90">
                    ตอบห้องถัดไป · {nextUp.needsHumanFollowup ? "🙋 รอแอดมิน" : nextUp.draftPending ? "📝 ร่างรอส่ง" : "🟢 ยังไม่อ่าน"} · {listTime(nextUp.lastSeen)}
                  </span>
                  <span className="block truncate text-[15px] font-extrabold">{nameOf(nextUp)}</span>
                </span>
                <span aria-hidden="true" className="text-xl font-bold">
                  →
                </span>
              </button>
            ) : null}

            <p className="mb-1.5 mt-5 text-[11.5px] font-extrabold tracking-wide" style={{ color: "var(--dk-navy-soft, var(--dk-faint))" }}>
              ต้องลงมือ
            </p>
            <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--ln-line)" }}>
              {(
                [
                  ["waiting", waitingCount, "🙋", "รอแอดมินตอบ", "บอทส่งต่อให้คนตอบ", "var(--dk-coral-ink)"],
                  ["draft", draftCount, "📝", "ร่างบอทรอกดส่ง", "ตรวจแล้วกดส่งให้ลูกค้า", "var(--dk-yolk-ink)"],
                  ["unread", unreadCount, "🟢", "ยังไม่อ่าน", "ลูกค้าทักมาแต่ยังไม่มีใครเปิด", "var(--ln-green-ink)"],
                ] as const
              ).map(([k, n, icon, label, hint, ink], i) => (
                <button
                  key={k}
                  type="button"
                  disabled={!n}
                  onClick={() => setScope(k)}
                  aria-pressed={scope === k}
                  className="relative flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left transition enabled:hover:bg-[var(--ln-hover)] disabled:cursor-default"
                  style={{ borderTop: i ? "1px solid var(--ln-line)" : undefined, background: scope === k ? "var(--ln-sel)" : undefined }}
                >
                  {n ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: ink }} /> : null}
                  <span className="w-14 shrink-0 text-right text-[22px] font-extrabold tabular-nums leading-none" style={{ color: n ? ink : "var(--dk-faint)" }}>
                    {n.toLocaleString()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold" style={{ color: n ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                      {icon} {label}
                    </span>
                    <span className="block truncate text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                      {n ? hint : "✓ ไม่มีค้าง"}
                    </span>
                  </span>
                  {n ? (
                    <span className="shrink-0 text-[12px] font-bold" style={{ color: ink }}>
                      {scope === k ? "กำลังดู" : "ดูห้อง ›"}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <p className="mb-1.5 mt-5 text-[11.5px] font-extrabold tracking-wide" style={{ color: "var(--dk-navy-soft, var(--dk-faint))" }}>
              ดูลูกค้า
            </p>
            <div className="flex flex-wrap gap-2">
              {SCOPES.filter((s) => s.key === "all" || s.key === "new" || s.key === "old").map((s) => {
                const on = scope === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setScope(s.key)}
                    aria-pressed={on}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition hover:bg-[var(--ln-hover)]"
                    style={{ borderColor: on ? "var(--dk-navy)" : "var(--ln-line)", background: on ? "var(--dk-navy)" : "white", color: on ? "white" : "var(--dk-navy)" }}
                  >
                    {s.icon} {s.label}
                  </button>
                );
              })}
            </div>

            {tagCatalog.length ? (
              <>
                <p className="mb-1.5 mt-5 flex items-baseline text-[11.5px] font-extrabold tracking-wide" style={{ color: "var(--dk-navy-soft, var(--dk-faint))" }}>
                  <span className="flex-1">ป้าย</span>
                  {tagFilter ? (
                    <button type="button" onClick={() => setTagFilter("")} className="min-h-[28px] text-[12px] font-bold underline" style={{ color: "var(--dk-navy)" }}>
                      ล้างป้าย
                    </button>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  {tagCatalog.map((t) => {
                    const on = tagFilter === t.key;
                    const n = tagCounts[t.key] ?? 0;
                    const pal = TAG_PALETTE[t.color];
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTagFilter(on ? "" : t.key)}
                        aria-pressed={on}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold transition hover:brightness-[.97]"
                        style={{ borderColor: on ? pal.ink : n ? pal.tone : "var(--ln-line)", background: on ? pal.ink : n ? pal.wash : "white", color: on ? "white" : n ? pal.ink : "var(--dk-faint)" }}
                      >
                        <span>
                          {t.emoji} {t.label}
                        </span>
                        <span className="tabular-nums" style={{ opacity: n ? 1 : 0.7 }}>
                          {n.toLocaleString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <ul className="mt-6 space-y-1 border-t pt-3 text-[12px] leading-relaxed" style={{ borderColor: "var(--ln-line)", color: "var(--dk-faint)" }}>
              <li>⟳ รายชื่ออัปเดตเองทุก 5 วินาที · ห้องที่เปิดอยู่ทุก 3 วินาที</li>
              <li>📎 ลากรูป/ไฟล์มาวางในห้อง = แนบส่งให้ลูกค้า</li>
              <li>💬 ข้อความที่พิมพ์ใน LINE OA Manager ดึงมาให้เมื่อเชื่อม OA ไว้ (กล่อง ⚙️ หน้า ลูกค้า LINE)</li>
            </ul>
          </div>
        ) : (
          <>
            {/* หัวห้องแบบ LINE OA: รูป · ชื่อ+ป้าย / บรรทัดสถานะเล็ก · ขวา = สวิตช์บอท + ปุ่มเครื่องมือ (สถานะบอทอยู่ที่สวิตช์ ไม่ซ้ำเป็นเม็ดข้างชื่อ) */}
            <div className="flex min-h-[60px] items-center gap-2 border-b bg-white px-2 py-2 md:px-4" style={{ borderColor: "var(--ln-line)" }}>
              <button type="button" onClick={() => setSel("")} aria-label="กลับไปรายชื่อ" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl md:hidden">
                ←
              </button>
              <Avatar src={detail?.pictureUrl} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <span className="truncate text-[16px] font-extrabold">{detail ? nameOf(detail) : sel}</span>
                  {detail?.needsHumanFollowup ? <Chip tone="coral" solid>🙋 รอแอดมิน</Chip> : null}
                  <span className="hidden items-center gap-1 sm:flex">
                    {detail?.adminTags.map((k) => <TagChip key={k} k={k} tags={tagCatalog} />)}
                    {detail?.scope === "new" ? <Chip tone="mint">ใหม่</Chip> : null}
                    {detail?.botDraft ? <Chip tone="amber">📝 ร่างก่อนส่ง</Chip> : null}
                  </span>
                </div>
                <p className="truncate text-[11px]" style={{ color: "var(--dk-faint)" }}>
                  {detail?.createdAt ? `ทักครั้งแรก ${fmtDay(detail.createdAt)}` : ""}
                  {detail?.lastSeen ? ` · ล่าสุด ${ago(detail.lastSeen)}` : ""}
                  {live.at ? (
                    <span title={live.ok ? "อัปเดตเองทุก 3 วินาที" : "ดึงข้อมูลไม่ได้ — จะลองใหม่เอง"}>
                      {live.ok ? ` · 🟢 สด ${new Date(live.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : " · 🔴 อัปเดตไม่ได้ กำลังลองใหม่"}
                    </span>
                  ) : null}
                  {detail?.oaLive ? <OaLiveBadge live={detail.oaLive} canSetup={can("settings.manage")} /> : null}
                </p>
              </div>
              {/* 🤖 17:05 เจ้าของร้าน "กดแล้วควรแสดงอะไรที่แตกต่าง" — สวิตช์เป็นเม็ดยาบอกสถานะชัด: เขียว "บอทตอบ: เปิด" / เทา "บอทตอบ: ปิด" / ม่วง "พักถึง HH:mm" (กดเพื่อสลับ) */}
              {detail ? <BotPill detail={detail} canToggle={can("orders.edit") || canReply} onToggle={() => void toggleBot(detail.id, !detail.botAllowed)} onWake={() => void wakeBot(detail.id)} /> : null}
              {detail ? (
                <IconBtn onClick={() => void copyRoomLink()} title="คัดลอกลิงก์ห้องแชทนี้ (ส่งให้พนักงานคนอื่นเปิดดูได้)">
                  🔗
                </IconBtn>
              ) : null}
              {/* 🔌 เครื่องมือไล่ปัญหา (สิทธิ์ตั้งค่าระบบ) — มือถือซ่อน หัวห้องแคบ */}
              {detail && can("settings.manage") ? (
                <span className="hidden md:contents">
                <IconBtn onClick={() => void probeOa()} title="🔌 ทดสอบดึงข้อความห้องนี้จาก LINE OA Manager (เส้น API ที่ตอบ · ฟิลด์ตัวอย่าง) — ใช้ไล่ปัญหาเมื่อข้อความที่พิมพ์ใน OA ไม่ขึ้น" active={oaProbeBusy}>
                  {oaProbeBusy ? "⏳" : "🔌"}
                </IconBtn>
                </span>
              ) : null}
              {detail ? (
                <button
                  type="button"
                  onClick={() => setNoteOpen((v) => !v)}
                  title="ข้อมูลลูกค้า · ออเดอร์ · ป้าย · โน้ต"
                  aria-pressed={noteOpen}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-bold transition active:scale-95"
                  style={noteOpen ? { background: "var(--ln-sel)", color: "var(--dk-navy)", boxShadow: "inset 0 0 0 1.5px var(--dk-navy-soft)" } : { color: "var(--dk-navy-soft)", boxShadow: "inset 0 0 0 1px var(--ln-them-line)" }}
                >
                  <span className="text-[17px] leading-none">👤</span>
                  <span className="hidden lg:inline">ข้อมูลลูกค้า</span>
                </button>
              ) : null}
            </div>

            {/* ข้อความ */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-3 py-3 md:px-6" style={{ background: "var(--ln-bg)" }}>
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
                    // ⏳ ร่างหมดอายุ (เกิน 24 ชม. / ร้านตอบไปแล้วหลังร่าง) = ไม่ขึ้นการ์ดให้กดส่ง (lib/draft-live.ts · 19 ต.ค. 69 ร่างค้างจาก 14–15 ต.ค.)
                    const answered = thread.slice(i + 1).some((x) => x.role === "admin" || x.role === "assistant");
                    const stale = m.status === "expired" || (m.status === "pending" && (answered || !isDraftLive(m.at, detail?.lastAdminAt)));
                    return latest && !stale ? (
                      <DraftCard key={m.id || i} entry={m} canSend={canReply && !quotaOut} onSend={(t) => sendDraft(m, t)} onDiscard={() => discardDraft(m)} onDelete={isOwner ? () => void deleteDraft(m) : undefined} onRegen={canReply ? () => regenDraft(m) : undefined} onZoom={(url) => setLightbox({ url, name: `draft-${(m.at || "").slice(0, 16).replace(/[^0-9]/g, "")}.jpg` })} />
                    ) : (
                      <div key={m.id || i} className="mb-2 flex justify-end">
                        <details className="max-w-[78%] rounded-xl px-3 py-1.5 text-[12px] md:max-w-[62%]" style={{ background: "rgba(0,0,0,.05)", color: "#6B7280" }}>
                          <summary className="cursor-pointer">
                            📝 ร่างบอทที่ไม่ได้ส่ง · {stale ? "หมดอายุ (เกิน 24 ชม. หรือร้านตอบไปแล้ว)" : m.status === "discarded" ? "ทิ้งแล้ว" : m.status === "superseded" ? "มีร่างใหม่กว่า" : "ยังไม่ส่ง"} · {fmtTime(m.at)}
                          </summary>
                          <p className="mt-1 whitespace-pre-wrap">{m.text}</p>
                        </details>
                      </div>
                    );
                  }
                  const admin = m.role === "admin";
                  const ours = m.role === "assistant" || admin;
                  // 🧾 19 ต.ค. 69 ข้อความนี้มีการ์ด Flex จริง (payload) → วาดการ์ดแบบเดียวกับใน LINE ใต้ฟอง · ฟองเหลือแต่ข้อความ (ตัดบรรทัด "[การ์ด] …")
                  const hasFlex = ours && !!m.flex?.length;
                  const flexOnly = hasFlex && !m.text.split("\n").filter((l) => !/^\[การ์ด\]/.test(l.trim()) && !/^\(ส่งการ์ดสินค้า/.test(l.trim())).join("").trim() && !m.imageUrl;
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
                            {/* 📥 mode "oa" = พิมพ์ใน LINE OA Manager แล้วนำเข้าจาก CSV (15 ต.ค. 69) · mode "auto" = ข้อความตอบกลับอัตโนมัติของ LINE */}
                            {admin ? `${m.by || "แอดมิน"}${m.mode === "oa" ? " · OA" : ""}` : m.approvedBy ? `บอท ✓ ${m.approvedBy}${m.edited ? " (แก้)" : ""}` : m.mode === "auto" ? "ตอบอัตโนมัติ" : m.mode === "oa" ? "ร้าน (OA)" : "บอท"}
                            <br />
                            {fmtTime(m.at)}
                          </span>
                        ) : null}
                        <div
                          className={`${flexOnly ? "hidden " : ""}max-w-[78%] whitespace-pre-wrap break-words px-3.5 py-2 text-[14px] leading-relaxed md:max-w-[62%]`}
                          style={
                            // ฟองแบบ LINE: แอดมิน = เขียว LINE · บอท = ฟ้า (ป้าย "บอท" ข้างฟองกำกับอีกชั้น) · ลูกค้า = ขาวขอบบาง
                            admin
                              ? { background: "var(--ln-me)", color: "var(--ln-me-ink)", borderRadius: "18px 4px 18px 18px" }
                              : ours
                                ? { background: "var(--ln-bot)", color: "var(--dk-navy)", borderRadius: "18px 4px 18px 18px" }
                                : { background: "white", color: "var(--dk-navy)", borderRadius: "4px 18px 18px 18px", boxShadow: "inset 0 0 0 1px var(--ln-them-line)" }
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
                          {hasFlex || cardsOf(m).length ? m.text.split("\n").filter((l) => !/^\[การ์ด\]/.test(l.trim()) && !/^\(ส่งการ์ดสินค้า/.test(l.trim())).join("\n").trim() : m.file ? m.text.replace(/^\(ส่งไฟล์[^)]*\)$/, "").replace(/^\[ลูกค้าส่งไฟล์\][^\n]*$/, "").trim() : m.type === "image" && !ours && (m.imageUrl || m.messageId) ? "" : ours ? splitBankImgs(m.text).text : m.text}
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
                          {!hasFlex && cardsOf(m).length ? (
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
                      {hasFlex ? (
                        <div className="mb-2 flex justify-end">
                          <FlexView items={m.flex ?? []} onZoom={(url) => setLightbox({ url, name: `card-${(m.at || "").slice(0, 16).replace(/[^0-9]/g, "")}.jpg` })} />
                        </div>
                      ) : null}
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

            {/* 🤖 ลูกค้าพิมพ์ค้างไว้ก่อนเปิดร่าง → ให้บอทร่างย้อนหลัง (19 ต.ค. 69 · RedraftButton) */}
            {canReply && detail && (detail.botDraft || settings?.mode === "draft") && thread.length && thread[thread.length - 1].role === "user" ? (
              <RedraftButton key={detail.id} id={detail.id} toast={toast} startedAt={redraftAt[detail.id]} lastUserAt={thread[thread.length - 1].at} />
            ) : null}
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
          shopDraft={settings?.mode === "draft"}
          canDraftUser={can("settings.manage")}
          onDraftUser={() => void toggleDraftUser(detail.id, !detail.botDraft)}
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
      {oaProbe ? <OaProbeModal probe={oaProbe} onClose={() => setOaProbe(null)} onRetry={() => void probeOa()} busy={oaProbeBusy} /> : null}
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

  const owed = (orders ?? []).reduce((n, o) => n + (o.balance > 0 ? o.balance : 0), 0);
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
    // 📦 หุบได้ (เจ้าของร้าน 19 ต.ค. 69 "หุบให้หน่อย") — เริ่มหุบ · หัวข้อสรุป จำนวนใบ/ยอดค้าง/ใบที่น่าจะใช่ ให้เห็นโดยไม่ต้องกาง
    <PanelSection
      title="📦 ออเดอร์"
      foldKey="orders"
      summary={
        <>
          <span className="tabular-nums" style={{ color: "var(--dk-faint)" }}>
            {orders === null ? "กำลังโหลด…" : orders.length ? `${orders.length} ใบ` : "ยังไม่ผูก"}
          </span>
          {owed > 0 ? <b className="ml-1.5 tabular-nums" style={{ color: "var(--dk-coral-ink)" }}>ค้าง {baht(owed)}</b> : null}
          {canEdit && sug?.matched.length ? <b className="ml-1.5" style={{ color: "var(--dk-yolk-ink)" }}>✨ น่าจะใช่ {sug.matched.length}</b> : null}
        </>
      }
      right={orders && orders.length ? <span className="tabular-nums" style={{ color: "var(--dk-faint)" }}>{orders.length} ใบ</span> : null}
    >
      {orders === null ? (
        <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>กำลังโหลด…</p>
      ) : err ? (
        <p className="text-[12px]" style={{ color: "#B91C1C" }}>{err}</p>
      ) : orders.length ? (
        <ul className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">{orders.map((o) => row(o))}</ul>
      ) : (
        <p className="rounded-xl p-2.5 text-[12px]" style={{ background: "var(--ln-field)", color: "var(--dk-faint)" }}>
          ยังไม่มีออเดอร์ที่ผูกกับ LINE นี้ — ผูกด้วยเลข OD ด้านล่าง
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
    </PanelSection>
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
 * ออกแบบใหม่ 19 ต.ค. 69 (เจ้าของร้าน "ช่วยออกแบบให้ใหม่หน่อย" — เดิมกล่องเหลืองทั้งก้อน ช่องข้อความเตี้ยต้องเลื่อนอ่าน การ์ดเล็กชื่อขาด):
 *   · หัว: ป้าย "ร่างจากบอท" + สถานะ + เวลา · ปุ่ม ↻ ตอบใหม่ / ✕ ลบ ชิดขวา
 *   · ตัว: "ลูกค้าจะเห็นแบบนี้" เรียงตามที่ LINE ส่งจริง (ข้อความ → การ์ด/รูป) — ข้อความเป็นฟองที่แก้ได้ในตัว สูงตามเนื้อหา ไม่ต้องเลื่อนในกล่อง
 *   · ท้าย: คำแนะนำซ้าย · ไม่ส่ง / ส่งให้ลูกค้า ขวา
 * Enter = ส่ง (Shift+Enter ขึ้นบรรทัด แบบช่องพิมพ์ด้านล่าง) · การ์ดสินค้า/รูปบัญชีในร่างส่งตามไปด้วย
 */
function DraftCard({ entry, canSend, onSend, onDiscard, onDelete, onRegen, onZoom }: { entry: LogEntry; canSend: boolean; onSend: (text: string) => Promise<boolean>; onDiscard: () => void; onDelete?: () => void; onRegen?: () => Promise<void>; onZoom: (url: string) => void }) {
  const [text, setText] = useState(entry.draftText ?? "");
  const [busy, setBusy] = useState(false);
  const [regen, setRegen] = useState(false);
  const [focused, setFocused] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const extras = entry.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\[(การ์ด|รูป|สติกเกอร์)\]/.test(l))
    .map((l) => l.replace(/^\[รูป\]\s*/, "🖼 รูป ").replace(/^\[การ์ด\]\s*/, "🧾 การ์ด ").replace(/^\[สติกเกอร์\]\s*/, "สติกเกอร์ ").trim());
  // ฟองข้อความสูงตามเนื้อหา (ไม่ต้องเลื่อนอ่านในกล่อง) · เพดาน 60% ของจอ เกินค่อยเลื่อน
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const max = Math.round(window.innerHeight * 0.6);
    el.style.height = "0px";
    el.style.height = `${Math.min(max, el.scrollHeight + 2)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [text]);
  const send = async () => {
    if (busy || !canSend) return;
    if (!text.trim() && !extras.length) return;
    setBusy(true);
    const ok = await onSend(text);
    if (!ok) setBusy(false);
  };
  const edited = text !== (entry.draftText ?? "");
  const images = entry.draftImages ?? [];
  // 🧾 มีการ์ด Flex จริงใน payload → วาดแบบที่ลูกค้าจะเห็น (FlexView) แทนการ์ดย่อ
  const flex = entry.flex ?? [];
  const cards = flex.length ? [] : entry.cards ?? [];
  return (
    <div className="mb-3 flex justify-end">
      <div className="w-full max-w-[96%] overflow-hidden rounded-2xl bg-white shadow-sm md:max-w-[640px]" style={{ boxShadow: "0 1px 3px rgba(0,0,0,.08), inset 4px 0 0 var(--dk-yolk-deep)" }}>
        {/* หัว */}
        <div className="flex items-center gap-2 border-b px-4 py-2" style={{ borderColor: "var(--ln-line)", background: "var(--dk-yolk-wash)" }}>
          <span className="rounded-full px-2 py-0.5 text-[11.5px] font-extrabold text-white" style={{ background: "var(--dk-yolk-ink)" }}>
            📝 ร่างจากบอท
          </span>
          <span className="min-w-0 truncate text-[12px] font-bold" style={{ color: "var(--dk-yolk-ink)" }}>
            ลูกค้ายังไม่ได้รับ{edited ? " · แก้แล้ว" : ""}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--dk-yolk-ink)" }}>
            {fmtTime(entry.at)}
          </span>
          {onRegen ? (
            <button
              type="button"
              onClick={() => {
                setRegen(true);
                void onRegen().finally(() => setRegen(false));
              }}
              disabled={busy || regen}
              title="ให้บอทตอบใหม่ — ทิ้งร่างนี้แล้วร่างใหม่จากข้อความลูกค้า (ขึ้นราว 15–30 วินาที)"
              aria-label="ให้บอทตอบใหม่"
              className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white px-3 text-[12px] font-bold transition hover:brightness-95 disabled:opacity-40"
              style={{ color: "var(--dk-yolk-ink)", boxShadow: "inset 0 0 0 1px var(--dk-yolk-deep)" }}
            >
              <span className={`text-[14px] leading-none ${regen ? "animate-spin" : ""}`}>↻</span>
              <span className="hidden sm:inline">{regen ? "กำลังสั่ง…" : "ตอบใหม่"}</span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              title="ลบร่างนี้ทิ้ง (ไม่ส่ง · ไม่ส่งไปบอทเรียนรู้) — เฉพาะเจ้าของร้าน"
              aria-label="ลบร่างนี้"
              className="-mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] transition hover:bg-black/10 disabled:opacity-40"
              style={{ color: "var(--dk-yolk-ink)" }}
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* ตัว: ลูกค้าจะเห็นแบบนี้ (ลำดับเดียวกับที่ LINE ส่ง) */}
        <div className="px-4 pb-3 pt-2.5" style={{ background: "var(--ln-bg)" }}>
          <p className="mb-1.5 text-[11px] font-bold" style={{ color: "var(--dk-faint)" }}>
            ลูกค้าจะเห็นแบบนี้ · แตะข้อความเพื่อแก้ก่อนส่ง
          </p>
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!canSend || busy}
            rows={2}
            className="block w-full resize-none rounded-2xl px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none transition"
            style={{
              background: "var(--ln-bot)",
              color: "var(--dk-navy)",
              borderRadius: "18px 18px 18px 4px",
              boxShadow: focused ? "0 0 0 2px var(--dk-yolk-deep)" : "none",
            }}
          />
          {images.length || cards.length ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {images.map((im, k) => (
                <button key={`i${k}`} type="button" onClick={() => onZoom(im.url)} title="กดเพื่อดูรูปใหญ่" className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm transition hover:opacity-90">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.preview} alt={`รูปที่ ${k + 1}`} loading="lazy" className="h-36 w-36 object-cover" />
                </button>
              ))}
              {cards.map((c, k) => (
                // 🧾 การ์ดสินค้าแบบที่ลูกค้าเห็นใน LINE — ชื่อเต็ม 2 บรรทัด · ราคา · ปุ่ม · กดรูปดูใหญ่
                <div key={`c${k}`} className="w-[248px] shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-sm">
                  {c.image ? (
                    <button type="button" onClick={() => onZoom(c.image as string)} className="block w-full" title="กดเพื่อดูรูปใหญ่">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image} alt={c.name} loading="lazy" className="aspect-[4/3] w-full object-cover transition hover:opacity-90" />
                    </button>
                  ) : null}
                  <div className="px-3 pb-3 pt-2">
                    <p className="line-clamp-2 text-[13.5px] font-extrabold leading-snug" style={{ color: "#153B3F" }}>
                      {c.name || "สินค้า"}
                    </p>
                    {c.price ? (
                      <p className="mt-0.5 line-clamp-2 text-[12px] font-bold" style={{ color: "#A05A00" }}>
                        {c.price}
                      </p>
                    ) : null}
                    <a href={c.url} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl py-1.5 text-center text-[12.5px] font-bold text-white" style={{ background: "#1F6F78" }}>
                      ดูราคา / สั่งเลย ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {flex.length ? (
            <div className="mt-2 flex">
              <FlexView items={flex} onZoom={onZoom} />
            </div>
          ) : !images.length && !cards.length && extras.length ? (
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--dk-yolk-ink)" }}>
              ส่งพร้อมกัน: {extras.join(" · ")}
            </p>
          ) : null}
        </div>

        {/* ท้าย */}
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5" style={{ borderColor: "var(--ln-line)" }}>
          <p className="min-w-0 flex-1 text-[11px] leading-snug" style={{ color: "var(--dk-faint)" }}>
            {canSend ? "Enter ส่ง · Shift+Enter ขึ้นบรรทัด · ร่างผิด กด “ไม่ส่ง” แล้วพิมพ์ตอบเองด้านล่าง" : "บัญชีนี้ส่งไม่ได้ หรือโควตาข้อความหมด"}
          </p>
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy}
            title="ไม่ส่งร่างนี้ — แอดมินตอบลูกค้าเอง แล้วสอนคำตอบที่ถูกให้บอทที่หน้า บอทเรียนรู้"
            className="min-h-[44px] whitespace-nowrap rounded-xl bg-white px-4 text-[13px] font-bold transition hover:brightness-95 disabled:opacity-50"
            style={{ color: "var(--dk-yolk-ink)", boxShadow: "inset 0 0 0 1px var(--dk-yolk-deep)" }}
          >
            ไม่ส่ง · ให้บอทเรียนรู้
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend || busy}
            className="inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-extrabold text-white transition hover:brightness-95 disabled:opacity-50"
            style={{ background: "var(--ln-green)" }}
          >
            {busy ? "กำลังส่ง…" : edited ? "ส่งฉบับที่แก้" : "ส่งให้ลูกค้า"}
            {!busy && canSend ? (
              <kbd className="rounded-md px-1.5 py-[1px] font-sans text-[11px] font-bold" style={{ background: "rgba(255,255,255,.25)" }}>
                Enter
              </kbd>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

/** solid = งานที่ต้องลงมือ (รอแอดมิน/ร่างรอส่ง) พื้นทึบตัวขาว ให้เด่นกว่าป้ายสถานะทั่วไป */
function Chip({ tone, solid, children }: { tone: "mint" | "sky" | "lilac" | "coral" | "amber"; solid?: boolean; children: React.ReactNode }) {
  const S: Record<string, { bg: string; fg: string }> = {
    mint: { bg: "var(--dk-mint-wash, #E7F8EE)", fg: "var(--dk-mint-ink, #166534)" },
    sky: { bg: "var(--dk-sky, #E6F1FB)", fg: "var(--dk-blue-deep, #1D4ED8)" },
    lilac: { bg: "var(--dk-lilac-wash, #EFE9FB)", fg: "var(--dk-lilac-ink, #5B21B6)" },
    coral: { bg: "var(--dk-coral-wash, #FDE8E6)", fg: "var(--dk-coral-ink, #B91C1C)" },
    amber: { bg: "var(--dk-yolk-wash, #FFF4D6)", fg: "var(--dk-yolk-ink, #8A5A00)" },
  };
  return (
    <span className="rounded-full px-1.5 py-[1px] text-[10.5px] font-bold" style={solid ? { background: S[tone].fg, color: "white" } : { background: S[tone].bg, color: S[tone].fg }}>
      {children}
    </span>
  );
}

/* ── 💬🔄 สถานะดึงข้อความจาก LINE OA Manager (15 ต.ค. 69) ───────────────────────
 * off/no-cookie = ยังไม่วางคุกกี้ (กล่อง ⚙️ หน้า ลูกค้า LINE · คนมีสิทธิ์ตั้งค่าระบบกดไปตั้งได้) · unmapped = ไม่รู้รหัสห้อง OA ของคนนี้
 * ok = ดึงได้ (added>0 บอกจำนวนที่เพิ่งเข้า · pending = OA ช้า รอบโพลหน้าเห็น) · error = คุกกี้หมด/OA ล่ม/เส้น API ไม่ตอบ (ห้องยังใช้ได้ปกติ) */
function OaLiveBadge({ live, canSetup }: { live: OaLive; canSetup: boolean }) {
  if (live.state === "off") {
    const text = live.reason === "no-cookie" ? "OA ยังไม่เชื่อม" : "OA ไม่รู้เลขบัญชี";
    const title = live.reason === "no-cookie" ? "ข้อความที่พนักงานพิมพ์ใน LINE OA Manager ยังไม่เข้า — วางคุกกี้ ses ของ chat.line.biz ในกล่อง ⚙️ เชื่อม LINE OA Manager ที่หน้า ลูกค้า LINE ก่อน" : "ไม่รู้เลข OA (U…) — ตั้งในกล่อง ⚙️ หน้า ลูกค้า LINE";
    return canSetup ? (
      <a href="/admin/line-customers?oa=1" className="underline decoration-dotted" style={{ color: "#8A5A00" }} title={title}>
        {` · 🔌 ${text}`}
      </a>
    ) : (
      <span title={title} style={{ color: "#8A5A00" }}>{` · 🔌 ${text}`}</span>
    );
  }
  if (live.state === "unmapped")
    return (
      <span title="ระบบไม่รู้ว่าห้องนี้คือห้องไหนใน LINE OA Manager (รหัสห้อง OA ≠ userId) — วางลิงก์ห้องแชท OA ไว้ในออเดอร์ของลูกค้าคนนี้ หรือผูกจากหน้า ลูกค้า LINE แล้วข้อความที่พิมพ์ใน OA จะเข้าเอง" style={{ color: "#8A5A00" }}>
        {" · 🔌 OA ยังไม่ผูกห้อง"}
      </span>
    );
  if (live.state === "error")
    return (
      <span title={`ดึงข้อความจาก LINE OA Manager ไม่ได้: ${live.error}\nห้องยังใช้ได้ปกติ — ระบบจะลองใหม่ใน 1 นาที`} style={{ color: "var(--dk-coral-ink)" }}>
        {" · 🔌 OA ⚠️"}
      </span>
    );
  return (
    <span title={`ข้อความที่พนักงานพิมพ์ใน LINE OA Manager ดึงมารวมให้แล้ว (ล่าสุด ${new Date(live.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${live.pending ? " · OA ตอบช้า รอบหน้าเห็น" : ""})`} style={{ color: "var(--dk-mint-ink)" }}>
      {live.added ? ` · 🔌 OA +${live.added}` : " · 🔌 OA ✓"}
    </span>
  );
}

type OaProbe = {
  ok: boolean;
  botId: string;
  chatId: string;
  error?: string;
  path?: string;
  count?: number;
  accountCount?: number;
  sampleKeys?: string[];
  sample?: Record<string, unknown>;
  parsed?: { id: string; at: string; from: string; by: string; type: string; text: string }[];
};

/** 🔌 ผลทดสอบดึงข้อความห้องนี้จาก OA — ไว้ไล่ว่าเส้น API/ชื่อฟิลด์ตรงไหม (ไม่โชว์คุกกี้) */
function OaProbeModal({ probe: p, onClose, onRetry, busy }: { probe: OaProbe; onClose: () => void; onRetry: () => void; busy: boolean }) {
  const fromText = (f: string) => (f === "account" ? "ร้าน" : f === "user" ? "ลูกค้า" : "ไม่รู้ฝั่ง");
  return (
    <Modal
      title="🔌 ทดสอบดึงข้อความจาก LINE OA Manager"
      sub={`เลข OA ${p.botId ? `${p.botId.slice(0, 6)}…${p.botId.slice(-4)}` : "-"} · รหัสห้อง OA ${p.chatId ? `${p.chatId.slice(0, 6)}…${p.chatId.slice(-4)}` : "ไม่รู้"}`}
      onClose={onClose}
      foot={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">
            ปิด
          </button>
          <button type="button" disabled={busy} onClick={onRetry} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-extrabold text-white disabled:opacity-50">
            {busy ? "กำลังทดสอบ…" : "ลองอีกครั้ง"}
          </button>
        </div>
      }
    >
      <div className="rounded-xl p-3 text-[12.5px] leading-relaxed" style={{ background: p.ok ? "var(--dk-mint-wash)" : "var(--dk-coral-wash)", color: p.ok ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
        {p.ok ? (
          <>
            <b>ต่อได้ ✓</b> อ่านออก {p.count ?? 0} ข้อความ (ฝั่งร้าน {p.accountCount ?? 0}) — ข้อความฝั่งร้านที่ยังไม่มีใน log จะถูกเติมเองตอนเปิด/โพลห้อง
          </>
        ) : (
          <>
            <b>ยังไม่ได้:</b> {p.error}
          </>
        )}
        {(p.path || p.sampleKeys?.length) && (
          <span className="mt-1 block break-all font-mono text-[10.5px] opacity-70">
            {p.path && `← ${p.path}`}
            {p.sampleKeys?.length ? ` · ฟิลด์: ${p.sampleKeys.join(",")}` : ""}
          </span>
        )}
      </div>
      {p.parsed?.length ? (
        <div className="mt-3">
          <p className="text-[11.5px] font-bold" style={{ color: "var(--dk-faint)" }}>
            ที่อ่านออก 5 ตัวท้าย
          </p>
          <ul className="mt-1 space-y-1 text-[12px]">
            {p.parsed.map((m, i) => (
              <li key={m.id || i} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                <span className="font-semibold">{fromText(m.from)}{m.by ? ` · ${m.by}` : ""}</span>
                <span style={{ color: "var(--dk-faint)" }}>{` · ${m.type} · ${new Date(m.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`}</span>
                {m.text ? <span className="block truncate">{m.text}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {p.sample ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] font-bold" style={{ color: "var(--dk-faint)" }}>
            ตัวอย่างข้อมูลดิบ 1 รายการ (ไว้เทียบชื่อฟิลด์)
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-900 p-2 text-[10.5px] leading-snug text-slate-100">{JSON.stringify(p.sample, null, 1)}</pre>
        </details>
      ) : null}
      {!p.ok && !p.chatId ? (
        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--dk-faint)" }}>
          รหัสห้องใน OA Manager ไม่ใช่ userId — ระบบรู้ได้จากลิงก์ห้องแชท OA ที่วางไว้ในออเดอร์ของลูกค้าคนนี้ หรือการผูกจากหน้า ลูกค้า LINE
        </p>
      ) : null}
      {!p.ok && p.error?.includes("คุกกี้") ? (
        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--dk-faint)" }}>
          วางคุกกี้: กด <a className="underline font-bold" href="/admin/line-customers?oa=1">เปิดกล่องเชื่อม LINE OA Manager</a> (หน้า ลูกค้า LINE · แถว “ป้ายจาก LINE OA” ปุ่ม 🔌/⚙️) → วางค่า ses ที่ก๊อปจาก chat.line.biz (F12 → Application → Cookies)
        </p>
      ) : null}
    </Modal>
  );
}

/** ปุ่มไอคอนแบบ LINE OA: ไม่มีพื้น · โฉบ = พื้นเทาอ่อน · เปิดอยู่ (active) = พื้นเทา+ขอบ */
function IconBtn({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[18px] transition hover:bg-[var(--ln-field)] active:scale-95"
      style={active ? { background: "var(--ln-sel)", boxShadow: "inset 0 0 0 1.5px var(--dk-navy-soft)" } : undefined}
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
    // กล่องแบบ OA: เดสก์ท็อปเริ่มสูง ~3 บรรทัด · มือถือ 1 บรรทัด (เหลือที่ให้ห้องแชท)
    const min = window.innerWidth >= 768 ? 72 : 44;
    el.style.height = "0px";
    el.style.height = `${Math.min(max, Math.max(min, el.scrollHeight))}px`;
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
    <div className="border-t bg-white" style={{ borderColor: "var(--ln-line)", paddingBottom: "env(safe-area-inset-bottom)" }}>
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
      {/* ✍️ ช่องพิมพ์แบบ LINE OA Manager (19 ต.ค. 69): กล่องข้อความกว้างเต็มแถวด้านบน · แถบเครื่องมือมีป้ายคำด้านล่าง · ปุ่ม "ส่ง" เขียวมุมขวาล่าง (นิ้วโป้งถึง) */}
      <input ref={fileRef} type="file" accept="image/*,.pdf,.ai,.psd,.eps,.svg,.cdr,.tif,.tiff,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.mp4,.mov" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      <div className="px-3 pt-2 md:px-4">
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
          placeholder={disabled ? "ส่งจากหน้านี้ไม่ได้ชั่วคราว (โควตา LINE)" : `พิมพ์ข้อความถึง ${customerName || "ลูกค้า"}…`}
          disabled={disabled || sending}
          className="block min-h-[44px] w-full resize-none bg-transparent py-1.5 text-[15px] leading-relaxed outline-none"
          style={{ color: "var(--dk-navy)" }}
        />
      </div>
      {lineEmojis.length && text.includes("$") ? (
        <p className="px-3 pb-1 text-[11.5px] font-semibold md:px-4" style={{ color: "var(--dk-navy-soft)" }}>
          ตัว $ ในช่องพิมพ์ = อิโมจิ LINE {Math.min(lineEmojis.length, text.split("$").length - 1)} ตัว (ลูกค้าเห็นเป็นรูป) · ลบ $ = ลบอิโมจินั้น
        </p>
      ) : null}
      <div className="flex items-center gap-0.5 px-1.5 pb-1.5 md:gap-1 md:px-3">
        <ToolBtn icon={uploading ? "⏳" : "📎"} label="แนบไฟล์" title="แนบรูปหรือไฟล์งาน (AI/PSD/PDF/ZIP … ≤ 4 MB) · ลากมาวางในห้อง หรือ Ctrl+V ก็ได้" onClick={() => fileRef.current?.click()} />
        <ToolBtn icon="🧾" label="การ์ดสินค้า" title="ส่งการ์ดสินค้าจากหน้าเว็บ" active={pickOpen} onClick={() => void openPicker()} />
        <ToolBtn icon="💬" label="ข้อความตอบกลับ" title="ข้อความตอบกลับสำเร็จรูป / คูปอง (ชุดเดียวกับ LINE OA Manager)" active={replyOpen} onClick={() => setReplyOpen(true)} />
        <span className="ml-auto hidden px-2 text-right text-[10.5px] leading-tight lg:block" style={{ color: "var(--dk-faint)" }}>
          Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่
          <br />
          ส่งแล้วบอทพักให้คนนี้ 30 นาที · นับโควตา LINE
        </span>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          title="ส่งให้ลูกค้า (Enter) — ส่งแล้วบอทพักให้คนนี้ 30 นาที (▶ ปลุกได้ที่หัวห้อง) · นับโควตา LINE"
          className="ml-auto min-h-[44px] shrink-0 rounded-xl px-6 text-[15px] font-extrabold text-white transition active:scale-95 disabled:opacity-35 lg:ml-0"
          style={{ background: "var(--ln-green)" }}
        >
          {sending ? "กำลังส่ง…" : "ส่ง"}
        </button>
      </div>
      {replyOpen ? <SavedReplyPicker chatId={id} customerName={customerName} onClose={() => setReplyOpen(false)} onPick={insertReply} /> : null}
    </div>
  );
}

/** ปุ่มในแถบเครื่องมือช่องพิมพ์ — ไอคอน+ป้ายคำ (มือถือป้ายอยู่ใต้ไอคอน) กดง่ายกว่าไอคอนเดี่ยว */
function ToolBtn({ icon, label, title, active, onClick }: { icon: string; label: string; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className="flex min-h-[44px] min-w-[56px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 transition hover:bg-[var(--ln-field)] active:scale-95 md:flex-row md:gap-1.5 md:px-2.5"
      style={active ? { background: "var(--ln-sel)", boxShadow: "inset 0 0 0 1.5px var(--dk-navy-soft)" } : undefined}
    >
      <span className="text-[18px] leading-none">{icon}</span>
      <span className="whitespace-nowrap text-[10.5px] font-bold md:text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
        {label}
      </span>
    </button>
  );
}


/** 🤖 สวิตช์บอทรายคนแบบอ่านสถานะออก (กดสลับ) — เขียว = บอทตอบ · เทา = ปิด (แอดมินตอบ) · ม่วง = พักชั่วคราว */
function BotPill({ detail, canToggle, onToggle, onWake }: { detail: Row; canToggle: boolean; onToggle: () => void; onWake: () => void }) {
  if (detail.pausedUntil) {
    return (
      <button type="button" onClick={onWake} disabled={!canToggle} title="บอทพักเพราะแอดมินตอบอยู่ — กดเพื่อปลุกให้ตอบต่อทันที" className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition active:scale-95" style={{ background: "var(--dk-lilac-wash, #EFE9FB)", color: "var(--dk-lilac-ink, #5B21B6)" }}>
        ⏸<span className="hidden sm:inline"> พักถึง {fmtTime(detail.pausedUntil)}</span> <span className="rounded-full bg-white/70 px-1.5 text-[11px]">▶ ปลุก</span>
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
      className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full pl-2 pr-3 text-[12.5px] font-bold transition active:scale-95"
      style={on ? { background: "#C9F2D0", color: "#0E7A3A" } : { background: "#E5E7EB", color: "#4B5563" }}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full text-[13px]" style={{ background: on ? LINE_GREEN : "#9CA3AF", color: "white" }}>🤖</span>
      {/* มือถือหัวห้องแคบ: เหลือ "เปิด/ปิด" ข้างไอคอน 🤖 */}
      <span className="hidden sm:inline">บอทตอบ: </span>
      {on ? "เปิด" : "ปิด"}
    </button>
  );
}

/**
 * หัวข้อส่วนในแผงข้อมูลลูกค้า — ชื่อส่วนซ้าย · ตัวนับ/ปุ่มขวา · คั่นด้วยเส้นบางแบบ LINE OA
 * foldKey = หุบได้ (กดหัวข้อ) จำสถานะต่อเครื่อง · หุบอยู่โชว์ summary แทนเนื้อหา (ของที่ต้องลงมือยังเห็นจากหัวข้อ)
 */
function PanelSection({ title, right, children, foldKey, summary }: { title: string; right?: React.ReactNode; children: React.ReactNode; foldKey?: string; summary?: React.ReactNode }) {
  const [open, setOpen] = useState(!foldKey);
  useEffect(() => {
    if (!foldKey) return;
    try {
      setOpen(localStorage.getItem(`chat.panel.${foldKey}`) === "1");
    } catch {}
  }, [foldKey]);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(`chat.panel.${foldKey}`, v ? "0" : "1");
      } catch {}
      return !v;
    });
  };
  const head = (
    <>
      {foldKey ? (
        <span aria-hidden="true" className="w-3 shrink-0 text-[10px]" style={{ color: "var(--dk-navy-soft)", transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}>
          ▶
        </span>
      ) : null}
      <h3 className="shrink-0 text-[13px] font-extrabold" style={{ color: "var(--dk-navy)" }}>
        {title}
      </h3>
      {foldKey && !open && summary ? <span className="min-w-0 flex-1 truncate text-[11.5px]">{summary}</span> : null}
    </>
  );
  return (
    <section className="border-t px-4 py-3" style={{ borderColor: "var(--ln-line)" }}>
      <div className={`flex min-h-[28px] items-center gap-2 ${open ? "mb-2" : ""}`}>
        {foldKey ? (
          <button type="button" onClick={toggle} aria-expanded={open} className="-my-2 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left">
            {head}
          </button>
        ) : (
          head
        )}
        {right && (open || !foldKey) ? <div className="ml-auto flex shrink-0 items-center text-[11.5px]">{right}</div> : null}
      </div>
      {open ? children : null}
    </section>
  );
}

/**
 * ℹ️ แผงข้อมูลลูกค้าด้านขวา — ฟิลด์เดียวกับหน้า ลูกค้า LINE
 * จัดใหม่ 19 ต.ค. 69 (เจ้าของร้าน "ออกแบบ จัดวาง layout ให้ใหม่"): เดิมรูปใหญ่กลางจอ + ตารางวันที่กินครึ่งจอแรก ออเดอร์/โน้ตต้องเลื่อนหา
 *   · โปรไฟล์แนวนอน (รูป 56 · ชื่อ · ชื่อ LINE · ป้ายสถานะ) + วันที่ยุบเป็นบรรทัดเล็ก (ข้อมูลนิ่ง) + userId พร้อมปุ่มคัดลอก
 *   · สวิตช์บอทอยู่แถวเดียวกับคำอธิบาย · แล้วเรียงส่วนตามที่ใช้บ่อย: ป้าย → ออเดอร์ → โน้ต (หัวข้อส่วนแบบเดียวกันหมด)
 */
function InfoPanel({
  detail, canReply, canToggle, noteSaving, onNoteAdd, onNoteEdit, onNoteDel, tags, onTags, onManageTags, onToggle, onWake, onClose, orders, aiBusy, onAiRetag, shopDraft, canDraftUser, onDraftUser,
}: {
  detail: Row; canReply: boolean; canToggle: boolean; noteSaving: boolean; orders: React.ReactNode; aiBusy: boolean; onAiRetag: () => void;
  shopDraft: boolean; canDraftUser: boolean; onDraftUser: () => void;
  onNoteAdd: (t: string) => Promise<boolean>; onNoteEdit: (id: string, t: string) => Promise<boolean>; onNoteDel: (id: string) => Promise<boolean>; tags: ChatTag[]; onTags: (ts: string[]) => void; onManageTags: () => void; onToggle: () => void; onWake: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [tagPick, setTagPick] = useState(false);
  const [tagQ, setTagQ] = useState("");
  useEffect(() => {
    setCopied(false);
    setTagPick(false);
    setTagQ("");
  }, [detail.id]);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(detail.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("คัดลอก userId", detail.id);
    }
  };
  const meta = [
    detail.createdAt ? `ทักครั้งแรก ${fmtDay(detail.createdAt)}` : "",
    detail.lastSeen ? `ล่าสุด ${ago(detail.lastSeen)}` : "",
    detail.lastAdminAt ? `แอดมินตอบ ${ago(detail.lastAdminAt)}` : "",
    detail.messageCount ? `บอทคุย ${detail.messageCount} ข้อความ` : "",
  ].filter(Boolean);
  const aiOn = !!detail.aiTag?.key && detail.adminTags.includes(detail.aiTag.key);
  const body = (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 border-b bg-white px-4 py-2" style={{ borderColor: "var(--ln-line)" }}>
        <span className="text-[15px] font-extrabold">ข้อมูลลูกค้า</span>
        <button type="button" onClick={onClose} aria-label="ปิด" className="ml-auto grid h-11 w-11 place-items-center rounded-xl text-lg hover:bg-[var(--ln-field)]">✕</button>
      </div>

      {/* โปรไฟล์ */}
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          <Avatar src={detail.pictureUrl} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-extrabold leading-tight">{nameOf(detail)}</p>
            {detail.adminAlias && detail.displayName ? (
              <p className="truncate text-[12px]" style={{ color: "var(--dk-faint)" }}>
                ชื่อ LINE: {detail.displayName}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-1">
              {detail.needsHumanFollowup ? <Chip tone="coral" solid>🙋 รอแอดมิน</Chip> : null}
              <Chip tone={detail.scope === "new" ? "mint" : "sky"}>{detail.scope === "new" ? "🆕 ลูกค้าใหม่" : "👤 ลูกค้าเก่า"}</Chip>
            </div>
          </div>
        </div>
        {meta.length ? (
          <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
            {meta.join(" · ")}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void copyId()}
          title="คัดลอก userId ของ LINE"
          className="mt-1 flex max-w-full items-center gap-1.5 rounded-md text-left text-[10.5px] transition hover:opacity-70"
          style={{ color: "var(--dk-faint)" }}
        >
          <span className="truncate font-mono">{detail.id}</span>
          <span className="shrink-0 font-sans font-bold" style={{ color: copied ? "var(--ln-green-ink)" : "var(--dk-navy-soft)" }}>
            {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
          </span>
        </button>
        {/* สวิตช์บอทแถวเดียวกับคำอธิบาย */}
        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--ln-field)" }}>
          <span className="min-w-0 flex-1 text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
            บอทตอบลูกค้านี้
          </span>
          <BotPill detail={detail} canToggle={canToggle} onToggle={onToggle} onWake={onWake} />
        </div>
        {/* 📝 ร่างก่อนส่งรายคน — เปิดแล้วบอทคิดคำตอบให้คนนี้แต่เก็บเป็นร่างรอกดส่ง (แม้ร้านอยู่โหมดเก็บแชทอย่างเดียว) · ร้านเปิดโหมดร่างทั้งร้านอยู่ = ทุกคนร่างอยู่แล้ว */}
        <div className="mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: detail.botDraft || shopDraft ? "var(--dk-yolk-wash)" : "var(--ln-field)" }}>
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: detail.botDraft || shopDraft ? "var(--dk-yolk-ink)" : "var(--dk-navy-soft)" }}>
            <b>📝 ร่างก่อนส่ง</b>
            <span className="block text-[11px] font-normal">
              {shopDraft ? "เปิดทั้งร้านอยู่ — ทุกห้องร่างอยู่แล้ว" : detail.botDraft ? "บอทร่างคำตอบ รอแอดมินกดส่ง" : "บอทไม่ร่างให้ลูกค้านี้"}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!detail.botDraft}
            onClick={onDraftUser}
            disabled={!canDraftUser || shopDraft}
            title={!canDraftUser ? "สลับได้เฉพาะผู้มีสิทธิ์ตั้งค่าระบบ" : shopDraft ? "ร้านเปิดโหมดร่างทั้งร้านอยู่ — ปิดโหมดร่างทั้งร้านก่อนถึงจะเลือกรายคนได้" : detail.botDraft ? "ปิดร่างให้ลูกค้านี้" : "เปิดร่างให้ลูกค้านี้ — บอทร่างคำตอบ รอแอดมินกดส่ง"}
            className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50"
            style={{ background: detail.botDraft || shopDraft ? "var(--dk-yolk-ink)" : "var(--dk-quiet)" }}
          >
            <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all" style={{ left: detail.botDraft || shopDraft ? 22 : 2 }} />
          </button>
        </div>
      </div>

      {/* 🏷 ป้าย */}
      <PanelSection
        title="🏷 ป้าย"
        right={
          canReply ? (
            <button type="button" onClick={onManageTags} className="min-h-[28px] font-bold underline" style={{ color: "var(--dk-navy-soft)" }}>
              ⚙️ จัดการป้าย
            </button>
          ) : null
        }
      >
        {/* 🏷 19 ต.ค. 69 เจ้าของร้าน "ถ้ามี tag เยอะมันจะรก": โชว์เฉพาะป้ายที่ติดอยู่ (กด ✕ เอาออก) + ปุ่ม "＋ ติดป้าย" กางรายการเลือก (แบบ LINE OA "เพิ่มแท็ก") */}
        <div className="flex flex-wrap items-center gap-1.5">
          {detail.adminTags.map((k) => {
            const t = tags.find((x) => x.key === k);
            if (!t) return null;
            const c = TAG_PALETTE[t.color];
            return (
              <span key={k} className="inline-flex min-h-[32px] items-center gap-1 rounded-full pl-2.5 pr-1 text-[12.5px] font-bold" style={{ background: c.wash, color: c.ink }}>
                {t.emoji} {t.label}
                {canReply ? (
                  <button type="button" onClick={() => onTags(detail.adminTags.filter((x) => x !== k))} aria-label={`เอาป้าย ${t.label} ออก`} title="เอาป้ายนี้ออก" className="grid h-6 w-6 place-items-center rounded-full text-[11px] hover:bg-black/10">
                    ✕
                  </button>
                ) : (
                  <span className="w-1.5" />
                )}
              </span>
            );
          })}
          {!detail.adminTags.length && !canReply ? <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>ยังไม่ติดป้าย</span> : null}
          {canReply ? (
            <button
              type="button"
              onClick={() => setTagPick((v) => !v)}
              aria-expanded={tagPick}
              className="min-h-[32px] rounded-full px-3 text-[12.5px] font-bold transition active:scale-95"
              style={tagPick ? { background: "var(--dk-navy)", color: "white", border: "1.5px solid var(--dk-navy)" } : { color: "var(--dk-navy-soft)", border: "1.5px dashed var(--dk-faint)" }}
            >
              {tagPick ? "เสร็จ" : detail.adminTags.length ? "＋ ป้าย" : "＋ ติดป้าย"}
            </button>
          ) : null}
        </div>
        {tagPick && canReply ? (
          <div className="mt-2 overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--ln-them-line)" }}>
            {tags.length > 8 ? (
              <input
                value={tagQ}
                onChange={(e) => setTagQ(e.target.value)}
                placeholder="ค้นป้าย…"
                className="block w-full border-b px-3 py-2 text-[13px] outline-none"
                style={{ borderColor: "var(--ln-line)" }}
              />
            ) : null}
            <div className="max-h-[260px] overflow-y-auto py-1">
              {tags
                .filter((t) => !tagQ.trim() || t.label.toLowerCase().includes(tagQ.trim().toLowerCase()))
                .map((t) => {
                  const on = detail.adminTags.includes(t.key);
                  const c = TAG_PALETTE[t.color];
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => onTags(on ? detail.adminTags.filter((k) => k !== t.key) : [...detail.adminTags, t.key])}
                      className="flex min-h-[40px] w-full items-center gap-2.5 px-3 text-left text-[13px] hover:bg-[var(--ln-hover)]"
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[12px] font-bold"
                        style={on ? { background: c.tone, color: "white" } : { boxShadow: "inset 0 0 0 1.5px var(--dk-faint)" }}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate rounded-full px-2 py-[2px] font-bold" style={{ background: c.wash, color: c.ink }}>
                        {t.emoji} {t.label}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : null}
        {/* 🤖 AI ติดป้ายระดับให้เอง (cron ทุก 5 นาที) — โชว์เหตุผล · แอดมินกดป้ายเองหลังลูกค้าพิมพ์ล่าสุด = AI ไม่ทับ */}
        <div className="mt-2 flex items-start gap-2 text-[11.5px] leading-snug" style={{ color: "var(--dk-navy-soft)" }}>
          <span aria-hidden="true">🤖</span>
          <span className="line-clamp-2 min-w-0 flex-1" title={detail.aiTag?.reason || undefined}>
            {aiOn ? (
              <>
                AI ติด <b>{tags.find((t) => t.key === detail.aiTag!.key)?.label ?? detail.aiTag!.key}</b>
                {detail.aiTag!.reason ? ` — ${detail.aiTag!.reason}` : ""}
                {detail.aiTag!.at ? <span style={{ color: "var(--dk-faint)" }}> · {ago(detail.aiTag!.at)}</span> : null}
              </>
            ) : detail.aiTag?.key ? (
              <span style={{ color: "var(--dk-faint)" }}>แอดมินเลือกป้ายเองแล้ว — AI จะประเมินใหม่เมื่อลูกค้าพิมพ์มา</span>
            ) : (
              <span style={{ color: "var(--dk-faint)" }}>AI ติดป้ายความเร่งด่วนให้เองเมื่อลูกค้าพิมพ์มา</span>
            )}
          </span>
          {canReply ? (
            <button type="button" disabled={aiBusy} onClick={onAiRetag} className="shrink-0 font-bold underline disabled:opacity-50" style={{ color: "var(--dk-navy-soft)" }}>
              {aiBusy ? "กำลังประเมิน…" : "ประเมินใหม่"}
            </button>
          ) : null}
        </div>
      </PanelSection>

      {/* 📦 ออเดอร์ */}
      {orders}

      {/* 📝 โน้ต */}
      <NotesBlock notes={detail.adminNotes} canReply={canReply} saving={noteSaving} onAdd={onNoteAdd} onEdit={onNoteEdit} onDel={onNoteDel} />
      <p className="px-4 pb-4 text-[10.5px]" style={{ color: "var(--dk-faint)" }}>
        ป้าย/โน้ตชุดเดียวกับหน้า ลูกค้า LINE
      </p>
    </div>
  );
  return (
    <>
      <aside className="hidden w-[340px] shrink-0 border-l bg-white lg:block" style={{ borderColor: "var(--ln-line)" }}>{body}</aside>
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
    <PanelSection title="📝 โน้ตภายใน" right={<span className="tabular-nums" style={{ color: full ? "var(--dk-coral-ink)" : "var(--dk-faint)" }}>ลูกค้าไม่เห็น · {notes.length}/10</span>}>
      <div className={notes.length ? "space-y-1.5" : ""}>
        {notes.map((n) => (
          <div key={n.id} className="rounded-xl px-3 py-2 text-[13px]" style={{ background: "var(--dk-yolk-wash)", boxShadow: "inset 0 0 0 1px var(--dk-yolk-deep)" }}>
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
      </div>
      {canReply ? (
        // ช่องเพิ่มโน้ตพื้นเทาแบบช่องกรอกทั่วไป (โน้ตที่บันทึกแล้วเท่านั้นที่เป็นกระดาษโน้ตเหลือง) · ปุ่มบันทึกชิดขวาใต้ช่อง
        <div className={notes.length ? "mt-2" : ""}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} disabled={full || saving} rows={2} placeholder={full ? "โน้ตเต็ม 10 รายการ — ลบอันเก่าก่อน" : "เพิ่มโน้ต เช่น ที่อยู่ส่งของ / งานที่คุยค้าง / ข้อควรระวัง"} className="block w-full resize-y rounded-xl px-3 py-2 text-[13.5px] outline-none disabled:opacity-60" style={{ background: "var(--ln-field)" }} />
          <div className="mt-1.5 flex justify-end">
            <button type="button" onClick={() => void onAdd(draft.trim()).then((ok) => ok && setDraft(""))} disabled={saving || full || !draft.trim()} className="dkb-btn dkb-btn-navy dkb-btn-sm min-h-[40px] disabled:opacity-40">
              {saving ? "กำลังบันทึก…" : "＋ บันทึกโน้ต"}
            </button>
          </div>
        </div>
      ) : !notes.length ? (
        <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>ยังไม่มีโน้ต</p>
      ) : null}
    </PanelSection>
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
