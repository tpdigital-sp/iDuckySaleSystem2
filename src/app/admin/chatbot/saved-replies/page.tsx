"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Banner, Btn, Empty, PageHead, PageShell, SearchBox } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ago, botApi, Modal, useToast } from "../bot-ui";
import { emojisOf, realignEmojis, RichText, textOf, type Emoji, type Reply } from "./shared";

/**
 * 💬 ข้อความตอบกลับ (เจ้าของร้านขอ 14 ต.ค. 69) — สำเนาจาก LINE OA Manager
 *   chat.line.biz/{OA}/settings/savedReplies/list ที่พนักงานใช้กดส่งลูกค้า
 * หน้าตาตามหน้า OA: ตาราง ชื่อ | ข้อความ (บรรทัดเดียว) | ⭐ | 🗑 หน้าละ 10 · กดแถว = หน้าแก้ไข (ชื่อ ≤30 · ข้อความ ≤1000)
 * ⚠️ แก้/ลบ/ติดดาวที่นี่ = สำเนาของเรา ไม่ยิงกลับ LINE OA · "🔄 โหลดจาก LINE OA" เขียนทับทั้งชุด (เตือนก่อน)
 * คุกกี้ OA ใช้ไม่ได้ → ทางสำรอง "📋 วาง JSON" จาก DevTools
 */
type Meta = { fetchedAt: string; fetchedBy: string; source: string; count: number };
type Res = { items: Reply[]; meta: Meta | null; saved?: string };

const PAGE_SIZE = 10;
const TITLE_MAX = 30;
const TEXT_MAX = 1000;
/** ตัวแทนชื่อแบบเดียวกับปุ่มในหน้า OA — LINE แทนค่าตอนส่ง */
const PH_USER = "{Nickname}";
const PH_ACCOUNT = "{AccountName}";
const EMOJIS = "😊 🙏 💖 💕 ✨ 🎉 👍 👌 🙂 😄 🥰 😍 🤗 😅 🙇‍♀️ 💳 🧾 🔗 📦 🚚 📍 📞 💬 📝 ✅ ❌ ⚠️ ❗ ⏰ 📅 🎁 🛒 💰 🖨 🎨 📐 🔥 ⭐ 👉 ▶️".split(" ");

const len = (s: string) => [...s].length;

export default function SavedRepliesPage() {
  const can = useCan();
  if (can("chat.reply")) return <SavedReplies />;
  return (
    <RequirePerm perm="orders.edit">
      <SavedReplies />
    </RequirePerm>
  );
}

function SavedReplies() {
  const { toast, toastNode } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [data, setData] = useState<Res | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  /** null = หน้ารายการ · "new" = สร้างใหม่ · อื่น ๆ = id ที่กำลังแก้ */
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setData(await botApi<Res>("/api/admin/chatbot/saved-replies"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    const d = await botApi<Res>("/api/admin/chatbot/saved-replies", body);
    setData(d);
    if (d.saved) toast(d.saved);
    return d;
  };

  const sync = async () => {
    const ok = await confirm({
      icon: "🔄",
      title: "โหลดจาก LINE OA ใหม่?",
      detail: "รายการที่นี่จะถูกเขียนทับด้วยของใน LINE OA ทั้งชุด\nที่แก้/ลบ/ติดดาวไว้ในหน้านี้จะหายไป",
      confirmLabel: "โหลดใหม่",
    });
    if (ok !== true) return;
    setSyncing(true);
    setErr("");
    try {
      await act({ action: "sync" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const toggleFav = async (r: Reply) => {
    // เปลี่ยนในจอก่อน — กดรัว ๆ ไม่ต้องรอเซิร์ฟเวอร์
    setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === r.id ? { ...x, favorite: !r.favorite } : x)) } : d));
    try {
      await act({ action: "favorite", id: r.id, favorite: !r.favorite });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      void load();
    }
  };

  const remove = async (r: Reply) => {
    const ok = await confirm({ icon: "🗑", title: `ลบ “${r.title}”?`, detail: "ลบจากรายการในระบบนี้เท่านั้น — ใน LINE OA ยังอยู่", confirmLabel: "ลบ", danger: true });
    if (ok !== true) return false;
    try {
      await act({ action: "delete", id: r.id });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      return false;
    }
  };

  const all = data?.items ?? [];
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return all.filter((r) => (!favOnly || r.favorite) && (!k || r.title.toLowerCase().includes(k) || textOf(r).toLowerCase().includes(k)));
  }, [all, q, favOnly]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  useEffect(() => setPage(1), [q, favOnly]);

  if (editing) {
    const r = editing === "new" ? null : (all.find((x) => x.id === editing) ?? null);
    return (
      <PageShell>
        <Editor
          key={editing}
          reply={r}
          onBack={() => setEditing(null)}
          onSave={async (title, text, emojis) => {
            await act({ action: "save", id: r?.id, title, text, emojis });
            setEditing(null);
          }}
          onDelete={
            r
              ? async () => {
                  if (await remove(r)) setEditing(null);
                }
              : undefined
          }
        />
        {confirmDialog}
        {toastNode}
      </PageShell>
    );
  }

  const meta = data?.meta;
  const favCount = all.filter((r) => r.favorite).length;
  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="ข้อความตอบกลับ"
        count={data ? `${all.length} ข้อความ` : undefined}
        sub={
          meta
            ? `สำเนาจาก LINE OA Manager · โหลดล่าสุด ${ago(meta.fetchedAt)} โดย ${meta.fetchedBy}${meta.source === "วาง JSON" ? " (วาง JSON)" : ""}`
            : "ข้อความสำเร็จรูปที่ตั้งไว้ใน LINE OA Manager — กดโหลดเพื่อดึงมาเก็บไว้ที่นี่"
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อหรือข้อความ…" />
        </div>
        <button
          type="button"
          onClick={() => setFavOnly((v) => !v)}
          aria-pressed={favOnly}
          className="min-h-[44px] rounded-full px-4 text-[13.5px] font-bold"
          style={favOnly ? { background: "var(--dk-navy)", color: "white" } : { background: "var(--dk-hair)", color: "var(--dk-navy-soft)" }}
        >
          ⭐ ติดดาว {favCount}
        </button>
        <Btn tone="yolk" onClick={() => setEditing("new")}>
          ＋ สร้างใหม่
        </Btn>
        <Btn onClick={() => void sync()} disabled={syncing} title="ดึงใหม่จาก LINE OA (เขียนทับรายการนี้)">
          {syncing ? "กำลังโหลด…" : "🔄 โหลดจาก LINE OA"}
        </Btn>
        <Btn onClick={() => setImportOpen(true)} title="ทางสำรองเมื่อคุกกี้ OA ใช้ไม่ได้">
          📋 วาง JSON
        </Btn>
      </div>

      {err && (
        <div className="mt-4">
          <Banner tone="hot" title="โหลดข้อความตอบกลับไม่ได้" detail={err} href={/คุกกี้|เชื่อม/.test(err) ? "/admin/line-customers" : undefined} />
        </div>
      )}

      <div className="dkb-card mt-4 overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,6fr)_auto] gap-4 px-5 py-3.5 text-[13px] font-bold md:grid" style={{ background: "var(--dk-sky, #F3F6F9)", color: "var(--dk-navy-soft)" }}>
          <span>ชื่อ</span>
          <span>ข้อความ</span>
          <span className="w-[88px]" />
        </div>
        {loading && !data ? (
          <p className="px-5 py-8 text-sm" style={{ color: "var(--dk-faint)" }}>
            กำลังโหลด…
          </p>
        ) : !rows.length ? (
          <div className="p-4">
            <Empty
              title={q || favOnly ? "ไม่พบข้อความที่ค้น" : "ยังไม่มีข้อความตอบกลับ"}
              body={q || favOnly ? "ลองค้นคำอื่น หรือปิดตัวกรอง ⭐" : "กด “🔄 โหลดจาก LINE OA” หรือ “＋ สร้างใหม่”"}
            />
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,6fr)_auto] md:gap-4 md:px-5" style={{ borderTop: "1px solid var(--dk-hair)" }}>
              <button type="button" onClick={() => setEditing(r.id)} className="min-w-0 flex-1 py-3.5 text-left md:contents" title="แก้ไข">
                <span className="block truncate text-[14.5px] font-bold md:py-4" style={{ color: "var(--dk-navy)" }}>
                  {r.title}
                </span>
                <span className="mt-0.5 block truncate text-[13.5px] md:mt-0 md:py-4" style={{ color: "var(--dk-navy-soft)" }}>
                  {textOf(r) ? <RichText text={textOf(r)} emojis={emojisOf(r)} oneLine /> : "—"}
                </span>
              </button>
              <span className="flex w-[88px] shrink-0 items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => void toggleFav(r)}
                  aria-pressed={!!r.favorite}
                  aria-label={r.favorite ? "เอาดาวออก" : "ติดดาว"}
                  className="grid h-10 w-10 place-items-center rounded-full text-[19px] hover:bg-[var(--dk-sky)]"
                  style={{ color: r.favorite ? "#22B14C" : "var(--dk-faint)" }}
                >
                  {r.favorite ? "★" : "☆"}
                </button>
                <button type="button" onClick={() => void remove(r)} aria-label="ลบ" className="grid h-10 w-10 place-items-center rounded-full text-[16px] hover:bg-[var(--dk-sky)]">
                  🗑
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      <NumPager page={cur} pages={pages} onPage={setPage} />

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={(d) => {
            setData(d);
            setImportOpen(false);
            toast(d.saved || "นำเข้าแล้ว");
          }}
        />
      )}
      {confirmDialog}
      {toastNode}
    </PageShell>
  );
}

/** เลขหน้าแบบหน้า OA: ‹ 1 2 3 4 5 › */
function NumPager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  // หน้าเยอะ = โชว์รอบ ๆ หน้าปัจจุบัน 5 ช่อง
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => from + i);
  const arrow = "grid h-11 w-11 place-items-center rounded-xl text-[20px] font-bold disabled:opacity-30";
  return (
    <nav className="mt-5 flex items-center justify-center gap-1.5" aria-label="เลขหน้า">
      <button type="button" className={arrow} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="หน้าก่อน" style={{ color: "var(--dk-navy)" }}>
        ‹
      </button>
      {nums.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPage(n)}
          aria-current={n === page ? "page" : undefined}
          className="grid h-11 min-w-[44px] place-items-center rounded-xl px-2 text-[15px] font-bold tabular-nums"
          style={n === page ? { background: "#22B14C", color: "white" } : { color: "var(--dk-navy)" }}
        >
          {n}
        </button>
      ))}
      <button type="button" className={arrow} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="หน้าถัดไป" style={{ color: "var(--dk-navy)" }}>
        ›
      </button>
    </nav>
  );
}

/** หน้าแก้ไขข้อความตอบกลับ — ช่องเหมือนหน้า OA (ชื่อ 30 · ข้อความ 1000 · อิโมจิ / ชื่อผู้ใช้ / ชื่อบัญชี) */
function Editor({ reply, onBack, onSave, onDelete }: { reply: Reply | null; onBack: () => void; onSave: (title: string, text: string, emojis: Emoji[]) => Promise<void>; onDelete?: () => void }) {
  const [title, setTitle] = useState(reply?.title ?? "");
  const [text, setText] = useState(reply ? textOf(reply) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const dirty = title !== (reply?.title ?? "") || text !== (reply ? textOf(reply) : "");
  const nonText = reply?.messages.filter((m) => !m.text) ?? [];
  const lineEmojis = emojisOf(reply);
  const emojisNow = realignEmojis(text, lineEmojis);

  const insert = (s: string) => {
    const el = ta.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + s + text.slice(b);
    if (len(next) > TEXT_MAX) return;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(a + s.length, a + s.length);
    });
  };

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      await onSave(title.trim(), text, emojisNow);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm("ยังไม่ได้บันทึก — ออกจากหน้านี้เลยไหม?")) return;
    onBack();
  };

  const tLen = len(title);
  const xLen = len(text);
  const label = "mb-2 block text-[17px] font-extrabold";
  const counter = (n: number, max: number) => (
    <span className="shrink-0 text-[13px] tabular-nums" style={{ color: n > max ? "var(--dk-coral-ink)" : "var(--dk-faint)" }}>
      <b style={{ color: n > max ? "var(--dk-coral-ink)" : "var(--dk-navy-soft)" }}>{n}</b>/{max}
    </span>
  );
  const chip = "min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold";

  return (
    <div className="mx-auto max-w-[860px]">
      <button type="button" onClick={back} className="min-h-[40px] text-[13.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
        ← กลับไปรายการข้อความตอบกลับ
      </button>
      <div className="dkb-card mt-2 p-5 md:p-7">
        <h1 className="text-[24px] font-extrabold" style={{ color: "var(--dk-navy)" }}>
          {reply ? "แก้ไขข้อความตอบกลับ" : "สร้างข้อความตอบกลับ"}
        </h1>

        <label className="mt-6 block">
          <span className={label} style={{ color: "var(--dk-navy)" }}>
            ชื่อ
          </span>
          <span className="flex items-center gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="min-h-[48px] w-full min-w-0 rounded-xl bg-white px-4 text-[15px] outline-none"
              style={{ border: `1px solid ${tLen > TITLE_MAX ? "var(--dk-coral-ink)" : "var(--dk-hair)"}` }}
              placeholder="เช่น แจ้งยอดบิลบริษัท"
            />
            {counter(tLen, TITLE_MAX)}
          </span>
          <span className="mt-1.5 block text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            ชื่อจะไม่ถูกแสดงต่อผู้ใช้ LINE
          </span>
        </label>

        <label className="mt-6 block">
          <span className={label} style={{ color: "var(--dk-navy)" }}>
            ข้อความ
          </span>
          <textarea
            ref={ta}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            rows={12}
            className="w-full resize-y rounded-xl bg-white px-4 py-3 text-[15px] leading-relaxed outline-none"
            style={{ border: `1px solid ${xLen > TEXT_MAX ? "var(--dk-coral-ink)" : "var(--dk-hair)"}` }}
          />
          <span className="mt-1 flex justify-end">{counter(xLen, TEXT_MAX)}</span>
        </label>
        {lineEmojis.length > 0 && (
          <div className="mb-3 rounded-xl p-3" style={{ background: "var(--dk-sky, #F3F6F9)" }}>
            <p className="mb-1.5 text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
              ตัวอย่างที่ลูกค้าเห็น — ตัว $ ในช่องข้อความคืออิโมจิ LINE {emojisNow.length}/{lineEmojis.length} ตัว
              {emojisNow.length < lineEmojis.length ? " (ลบ $ ไปแล้ว อิโมจิที่เกินจะหาย)" : ""}
            </p>
            <p className="max-h-60 overflow-auto whitespace-pre-wrap text-[14px] leading-relaxed" style={{ color: "var(--dk-navy)" }}>
              <RichText text={text} emojis={emojisNow} />
            </p>
          </div>
        )}

        <div className="relative mt-2 flex flex-wrap gap-2">
          <button type="button" className={chip} style={{ border: "1px solid var(--dk-hair)", color: "var(--dk-navy)" }} onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen}>
            อิโมจิ
          </button>
          <button type="button" className={chip} style={{ border: "1px solid var(--dk-hair)", color: "var(--dk-navy)" }} onClick={() => insert(PH_USER)} title={`แทรก ${PH_USER} — LINE ใส่ชื่อลูกค้าให้ตอนส่ง`}>
            ชื่อผู้ใช้
          </button>
          <button type="button" className={chip} style={{ border: "1px solid var(--dk-hair)", color: "var(--dk-navy)" }} onClick={() => insert(PH_ACCOUNT)} title={`แทรก ${PH_ACCOUNT} — LINE ใส่ชื่อบัญชีร้านให้ตอนส่ง`}>
            ชื่อบัญชี
          </button>
          {emojiOpen && (
            <div className="absolute left-0 top-full z-20 mt-2 grid w-[min(100%,340px)] grid-cols-8 gap-1 rounded-2xl bg-white p-2 shadow-xl" style={{ border: "1px solid var(--dk-hair)" }}>
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => insert(e)} className="grid h-10 place-items-center rounded-lg text-[20px] hover:bg-[var(--dk-sky)]">
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          ข้อความที่ประกอบด้วยชื่อผู้ใช้จะถูกส่งไปยังผู้ใช้ที่อนุญาตให้คุณดูโปรไฟล์ได้เท่านั้น
        </p>
        {nonText.length > 0 && (
          <p className="mt-2 text-[12.5px] font-bold" style={{ color: "var(--dk-yolk-ink, #8A5A00)" }}>
            ข้อความนี้มีรูป/ไฟล์อีก {nonText.length} ชิ้นจาก LINE OA — บันทึกที่นี่จะเหลือเฉพาะข้อความตัวอักษร
          </p>
        )}

        {err && (
          <p className="mt-4 text-[13.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
            {err}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2 pt-5" style={{ borderTop: "1px solid var(--dk-hair)" }}>
          <Btn tone="navy" onClick={() => void save()} disabled={busy || !title.trim() || !text.trim() || tLen > TITLE_MAX || xLen > TEXT_MAX || (!!reply && !dirty)}>
            {busy ? "กำลังบันทึก…" : "บันทึก"}
          </Btn>
          <Btn onClick={back} disabled={busy}>
            ยกเลิก
          </Btn>
          {onDelete && (
            <span className="ml-auto">
              <Btn onClick={onDelete} disabled={busy}>
                🗑 ลบ
              </Btn>
            </span>
          )}
        </div>
        {reply?.editedAt && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--dk-faint)" }}>
            แก้ล่าสุดในระบบนี้ {ago(reply.editedAt)} โดย {reply.editedBy}
          </p>
        )}
      </div>
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (d: Res) => void }) {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      onDone(await botApi<Res>("/api/admin/chatbot/saved-replies", { action: "import", json }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="📋 วาง JSON ข้อความตอบกลับ"
      sub="ทางสำรองเมื่อโหลดจาก LINE OA ไม่ได้"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>ยกเลิก</Btn>
          <Btn tone="navy" onClick={() => void go()} disabled={busy || !json.trim()}>
            {busy ? "กำลังนำเข้า…" : "นำเข้า (เขียนทับของเดิม)"}
          </Btn>
        </>
      }
    >
      <ol className="mb-3 list-decimal pl-5 text-[13px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
        <li>เปิด chat.line.biz → ตั้งค่า → ข้อความตอบกลับ ใน Chrome</li>
        <li>กด F12 (หรือ ⌥⌘I) → แท็บ Network → รีเฟรชหน้า</li>
        <li>คลิกคำขอที่ชื่อมีคำว่า savedReplies → แท็บ Response → ก๊อปทั้งหมดมาวางด้านล่าง (ถ้ามีหลายหน้า ให้ตั้งจำนวนต่อหน้าในหน้า OA ให้มากที่สุดก่อน)</li>
      </ol>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={10}
        className="w-full rounded-xl px-3 py-2 font-mono text-[12.5px] outline-none"
        style={{ border: "1px solid var(--dk-hair)" }}
        placeholder='{"list":[…]}'
      />
      {err && (
        <p className="mt-2 text-[13px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}
    </Modal>
  );
}
