"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Banner, Btn, Empty, PageHead, PageShell } from "@/components/admin/ui";
import { useCan } from "@/lib/perm-context";
import { ago, botApi, ChatbotTabs, useToast } from "../bot-ui";
import { useConfirm, type ConfirmOptions } from "@/components/admin/ConfirmDialog";

/**
 * 🎓 บอทเรียนรู้ (เจ้าของร้าน 14 ต.ค. 69: "ปุ่มทิ้งขอเป็นการเข้าสู่เรียนรู้ เพื่อให้แอดมินตอบจะดีกว่า")
 *
 * ที่มา: โหมดร่าง — แอดมินกด "ไม่ส่ง · ให้บอทเรียนรู้" บนร่างของบอทในหน้าแชท LINE → เรื่องมารอที่นี่
 * แต่ละเรื่อง: ลูกค้าถาม · บอทร่างไว้ (ไม่ได้ส่ง) · แอดมินตอบลูกค้าจริง (ดึงจากห้องแชท ใช้เป็นคำตอบตั้งต้นได้)
 *   → กด "บันทึกให้บอทเรียนรู้" = เพิ่มเข้า 📚 คลังความรู้ (type chat-experience) + ส่งเข้าบอท · "ไม่ต้องสอน" = ปิดเรื่อง
 */
type Reply = { text: string; by: string; at: string };
type Item = {
  id: string;
  uid: string;
  customerName: string;
  pictureUrl: string;
  question: string;
  botAnswer: string;
  draftAt: string;
  status: string;
  openedBy: string;
  adminReplies: Reply[];
  learnedBy?: string;
  learnedAt?: string;
  kbTitle?: string;
  kbContent?: string;
};
type ListRes = { items: Item[]; openCount: number };

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function LearningPage() {
  const can = useCan();
  if (can("chat.reply")) return <Learning />;
  return (
    <RequirePerm perm="orders.edit">
      <Learning />
    </RequirePerm>
  );
}

function Learning() {
  const { toast, toastNode } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [data, setData] = useState<ListRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setData(await botApi<ListRes>(`/api/admin/chatbot/learning?status=${tab}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);
  useEffect(() => {
    void load();
  }, [load]);

  const done = useCallback(
    (id: string) => {
      setData((d) => (d ? { items: d.items.filter((x) => x.id !== id), openCount: Math.max(0, d.openCount - 1) } : d));
    },
    [],
  );

  const items = data?.items ?? [];
  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="บอทเรียนรู้"
        count={data ? `${data.openCount} รอสอน` : undefined}
        sub="ร่างที่แอดมินกด “ไม่ส่ง · ให้บอทเรียนรู้” ในหน้าแชท LINE มารอที่นี่ — เขียนคำตอบที่ถูกแล้วบันทึก บอทจะตอบเรื่องแบบนี้ได้ถูกครั้งหน้า"
        tools={<ChatbotTabs inHead />}
        toolsTop
      />

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["open", `รอสอน${data ? ` ${data.openCount}` : ""}`],
            ["done", "สอนแล้ว / ข้าม"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className="min-h-[44px] rounded-full px-4 text-[13.5px] font-bold"
            style={tab === k ? { background: "var(--dk-navy)", color: "white" } : { background: "var(--dk-hair)", color: "var(--dk-navy-soft)" }}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto">
          <Btn small onClick={() => void load()} title="โหลดใหม่">
            ↻ โหลดใหม่
          </Btn>
        </span>
      </div>

      {err && (
        <div className="mt-4">
          <Banner tone="hot" title="โหลดรายการไม่ได้" detail={err} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {loading && !items.length ? (
          <p className="py-6 text-sm" style={{ color: "var(--dk-faint)" }}>
            กำลังโหลด…
          </p>
        ) : !items.length ? (
          <Empty
            title={tab === "open" ? "ไม่มีเรื่องรอสอน" : "ยังไม่มีเรื่องที่สอนแล้ว"}
            body={tab === "open" ? "เมื่อบอทร่างคำตอบไม่ดี กด “ไม่ส่ง · ให้บอทเรียนรู้” ที่การ์ดร่างในหน้าแชท LINE แล้วพิมพ์ตอบลูกค้าเอง เรื่องจะมารอที่นี่" : "เรื่องที่กดบันทึกหรือข้ามจะย้ายมาอยู่แท็บนี้"}
          />
        ) : tab === "open" ? (
          items.map((it) => <OpenCard key={it.id} it={it} toast={toast} confirm={confirm} onDone={() => done(it.id)} />)
        ) : (
          items.map((it) => <DoneRow key={it.id} it={it} />)
        )}
      </div>
      {confirmDialog}
      {toastNode}
    </PageShell>
  );
}

function Who({ it }: { it: Item }) {
  return (
    <div className="flex items-center gap-2.5">
      {it.pictureUrl ? <img src={it.pictureUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="h-9 w-9 shrink-0 rounded-full" style={{ background: "var(--dk-hair)" }} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold" style={{ color: "var(--dk-navy)" }}>
          {it.customerName || "ลูกค้า LINE"}
        </p>
        <p className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
          บอทร่างเมื่อ {fmtWhen(it.draftAt)} · {ago(it.draftAt)}
          {it.openedBy ? ` · ${it.openedBy} กดไม่ส่ง` : ""}
        </p>
      </div>
      <a href={`/admin/chatbot/chats?id=${it.uid}`} className="dkb-btn dkb-btn-ghost dkb-btn-sm shrink-0" title="เปิดห้องแชทนี้">
        เปิดแชท
      </a>
    </div>
  );
}

function Quote({ label, text, tone }: { label: string; text: string; tone: "cust" | "bot" | "admin" }) {
  const S = {
    cust: { bg: "white", border: "var(--dk-hair)", fg: "var(--dk-navy)" },
    bot: { bg: "var(--dk-coral-wash, #FDE8E6)", border: "transparent", fg: "var(--dk-coral-ink, #B91C1C)" },
    admin: { bg: "var(--dk-mint-wash, #E7F8EE)", border: "transparent", fg: "var(--dk-mint-ink, #166534)" },
  }[tone];
  return (
    <div>
      <p className="mb-1 text-[11.5px] font-bold" style={{ color: tone === "cust" ? "var(--dk-faint)" : S.fg }}>
        {label}
      </p>
      <p className="whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[13.5px] leading-relaxed" style={{ background: S.bg, border: `1px solid ${S.border}`, color: tone === "bot" ? "var(--dk-navy-soft)" : "var(--dk-navy)" }}>
        {text || "—"}
      </p>
    </div>
  );
}

function OpenCard({ it, toast, confirm, onDone }: { it: Item; toast: (m: string, bad?: boolean) => void; confirm: (o: ConfirmOptions) => Promise<boolean | "alt">; onDone: () => void }) {
  const firstReply = it.adminReplies.map((r) => r.text).join("\n\n");
  const [title, setTitle] = useState(it.question.split("\n").filter(Boolean).join(" ").slice(0, 300));
  const [content, setContent] = useState(firstReply);
  const [busy, setBusy] = useState(false);

  const teach = async () => {
    if (!title.trim() || !content.trim()) {
      toast("ใส่ทั้งคำถามและคำตอบที่ถูกก่อนนะคะ", true);
      return;
    }
    setBusy(true);
    try {
      const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/chatbot/learning", { action: "teach", id: it.id, title, content });
      toast(d.saved || "บอทเรียนรู้แล้ว");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      setBusy(false);
    }
  };
  const skip = async () => {
    const ok = await confirm({ icon: "⏭", title: "ไม่ต้องสอนเรื่องนี้?", detail: "ใช้กับเรื่องเฉพาะลูกค้ารายนี้ ที่ลูกค้าคนอื่นไม่ได้ถาม\nเรื่องจะย้ายไปแท็บ “สอนแล้ว / ข้าม”", confirmLabel: "ไม่ต้องสอน" });
    if (ok !== true) return;
    setBusy(true);
    try {
      const d = await botApi<{ ok: boolean; saved?: string }>("/api/admin/chatbot/learning", { action: "skip", id: it.id });
      toast(d.saved || "ข้ามแล้ว");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      setBusy(false);
    }
  };

  return (
    <div className="dkb-card p-4" style={{ borderLeft: "4px solid var(--dk-yolk-ink, #8A5A00)" }}>
      <Who it={it} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Quote label="ลูกค้าถาม" text={it.question} tone="cust" />
        <Quote label="✗ บอทร่างไว้ (ไม่ได้ส่ง)" text={it.botAnswer} tone="bot" />
      </div>
      {it.adminReplies.length ? (
        <div className="mt-3">
          <Quote label={`✓ แอดมินตอบลูกค้าจริง${it.adminReplies[0].by ? ` (${it.adminReplies[0].by})` : ""}`} text={firstReply} tone="admin" />
        </div>
      ) : (
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
          ยังไม่เห็นคำตอบของแอดมินในห้องนี้ — ถ้ายังไม่ได้ตอบลูกค้า กด “เปิดแชท” แล้วตอบก่อน ระบบจะดึงมาเป็นคำตอบตั้งต้นให้
        </p>
      )}

      <div className="mt-4 rounded-2xl p-3" style={{ background: "var(--dk-yolk-wash, #FFF4D6)" }}>
        <p className="mb-2 text-[13px] font-extrabold" style={{ color: "var(--dk-yolk-ink, #8A5A00)" }}>
          🎓 สอนบอท — ครั้งหน้าลูกค้าถามแบบนี้ บอทจะตอบตามนี้
        </p>
        <label className="block">
          <span className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
            คำถาม (เขียนให้กว้าง ๆ ใช้ได้กับลูกค้าคนอื่น)
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            className="mt-1 min-h-[44px] w-full rounded-xl bg-white px-3 text-[14px] outline-none"
            style={{ border: "1px solid var(--dk-hair)" }}
            placeholder="เช่น ส่งไฟล์งานทางไหนได้บ้าง"
          />
        </label>
        <label className="mt-2 block">
          <span className="text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
            คำตอบที่ถูก
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={busy}
            rows={Math.min(10, Math.max(3, content.split("\n").length + 1))}
            className="mt-1 w-full resize-y rounded-xl bg-white px-3 py-2 text-[14px] leading-relaxed outline-none"
            style={{ border: "1px solid var(--dk-hair)" }}
            placeholder="พิมพ์คำตอบที่อยากให้บอทตอบ — ไม่ต้องใส่ชื่อลูกค้า เลขออเดอร์ หรือยอดเงินเฉพาะราย"
          />
        </label>
        {it.adminReplies.length && content !== firstReply ? (
          <button type="button" onClick={() => setContent(firstReply)} className="mt-1 text-[12px] font-bold underline" style={{ color: "var(--dk-mint-ink, #166534)" }}>
            ใช้คำตอบที่แอดมินตอบลูกค้าจริง
          </button>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Btn tone="navy" onClick={() => void teach()} disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกให้บอทเรียนรู้"}
          </Btn>
          <Btn onClick={() => void skip()} disabled={busy}>
            ไม่ต้องสอน
          </Btn>
        </div>
      </div>
    </div>
  );
}

function DoneRow({ it }: { it: Item }) {
  const learned = it.status === "learned";
  return (
    <details className="dkb-card p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-[13.5px]">
        <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={learned ? { background: "var(--dk-mint-wash, #E7F8EE)", color: "var(--dk-mint-ink, #166534)" } : { background: "var(--dk-hair)", color: "var(--dk-navy-soft)" }}>
          {learned ? "✓ สอนแล้ว" : "ข้าม"}
        </span>
        <span className="min-w-0 flex-1 truncate font-bold" style={{ color: "var(--dk-navy)" }}>
          {learned ? it.kbTitle : it.question.split("\n")[0] || "—"}
        </span>
        <span className="shrink-0 text-[12px]" style={{ color: "var(--dk-faint)" }}>
          {it.learnedBy} · {it.learnedAt ? fmtWhen(it.learnedAt) : ""}
        </span>
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Quote label={`ลูกค้าถาม · ${it.customerName || "ลูกค้า LINE"}`} text={it.question} tone="cust" />
        <Quote label="✗ บอทร่างไว้" text={it.botAnswer} tone="bot" />
      </div>
      {learned && it.kbContent ? (
        <div className="mt-3">
          <Quote label="🎓 คำตอบที่สอนบอท" text={it.kbContent} tone="admin" />
        </div>
      ) : null}
    </details>
  );
}
