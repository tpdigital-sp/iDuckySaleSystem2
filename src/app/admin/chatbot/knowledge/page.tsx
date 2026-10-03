"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Empty, FChip, PageHead, PageShell, SearchBox, Tag } from "@/components/admin/ui";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { KB_TYPES, type KbImage, type KbItem, type PriceLink } from "@/lib/bot-kb-types";
import { renderChatText } from "@/lib/shop-chat";
import { ago, blobToDataUrl, botApi, ChatbotTabs, Modal, Pager, shrinkImage, uploadBotImage, useToast } from "../bot-ui";

/**
 * 📚 คลังความรู้ของบอท — ย้ายจาก AdminBuddy knowledge.html (3 ต.ค. 69)
 *
 * Q&A ที่ n8n ดึงไป (ผ่าน Pinecone) ตอบลูกค้า · เพิ่มได้ 3 ทาง:
 *   ✍️ พิมพ์เอง (+รูป · ✨ AI เรียบเรียง · ผูกลิงก์ราคา)
 *   📋 วางเนื้อหา/รูป → AI แตกเป็น Q&A หลายข้อ → ตรวจแล้วบันทึกทีเดียว
 *   🌐 ใส่ลิงก์เว็บ → AI อ่านหน้าแล้วแตกเป็น Q&A
 * บันทึก/ลบ = ส่งเข้า Pinecone ให้อัตโนมัติ (แบบเดิม)
 * ?task=<leader-task id>&q=<คำถาม> = มาจาก Leader Inbox → บันทึกแล้วปิดงานนั้นให้
 */

const PAGE = 20;
type QA = { q: string; a: string; type: string; dup?: boolean };
type Draft = {
  id?: string;
  type: string;
  title: string;
  content: string;
  localPath: string;
  linked?: PriceLink | null;
  images: (KbImage & { key: string; file?: File; preview: string })[];
  undo?: string;
};
type Mode = "manual" | "paste" | "web";

const typeOf = (it: KbItem) => (it.source === "leader-answer" ? "leader-answer" : it.type || "tip");
/** ตารางราคาที่หลงอยู่ในคลัง — ซ่อนจาก "ทั้งหมด" (แบบหน้าเดิม) ดูได้ที่ชิป 💰 ราคา */
const isPriceTable = (it: KbItem) =>
  it.type === "pricing" || it.type === "master-pricing" || (it.content.match(/\d[\d,]*\s*[-–]\s*\d[\d,]*[\u0E00-\u0E7F()\s]*=\s*\d/g)?.length ?? 0) >= 2;
const tone = (t: string) => KB_TYPES.find((x) => x.key === t)?.tone ?? "quiet";
const label = (t: string) => KB_TYPES.find((x) => x.key === t)?.label ?? (t === "sales-tip" ? "เทคนิค" : t === "master-pricing" ? "💰 ราคาสินค้า" : "อื่นๆ");
const MANUAL_TYPES = KB_TYPES.filter((t) => ["problem", "caution", "tip", "pricing"].includes(t.key));
let seq = 0;

export default function KnowledgePage() {
  return (
    <RequirePerm perm="orders.edit">
      {/* useSearchParams (ลิงก์จาก Leader Inbox) ต้องอยู่ใต้ Suspense ไม่งั้น build ล้ม */}
      <Suspense fallback={null}>
        <Knowledge />
      </Suspense>
    </RequirePerm>
  );
}

function Knowledge() {
  const params = useSearchParams();
  const { confirm, dialog } = useConfirm();
  const { toast, toastNode } = useToast();
  const [items, setItems] = useState<KbItem[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");

  const load = useCallback(async (fresh = false) => {
    try {
      const d = await botApi<{ items: KbItem[] }>(`/api/admin/chatbot/knowledge${fresh ? "?fresh=1" : ""}`);
      setItems(d.items);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
      setItems((x) => x ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // 🙋 มาจาก Leader Inbox (?task=&q=) → เปิดฟอร์มพิมพ์เองพร้อมคำถามเดิม
  useEffect(() => {
    const task = params.get("task");
    const question = params.get("q");
    if (!task || !question) return;
    setTaskId(task);
    setAdding("manual");
    setDraft({ type: "tip", title: `อัปเดต: ${question.substring(0, 20)}...`, content: `[คำถามเดิม: ${question}]\n\nคำตอบที่เรียบเรียงแล้ว: `, localPath: "", images: [] });
  }, [params]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items ?? []) {
      const t = isPriceTable(it) ? "pricing" : typeOf(it);
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((it) => {
      const price = isPriceTable(it);
      if (type === "pricing" ? !price : price) return false;
      if (type && type !== "pricing" && typeOf(it) !== type) return false;
      return !s || it.title.toLowerCase().includes(s) || it.content.toLowerCase().includes(s) || (it.localPath ?? "").toLowerCase().includes(s);
    });
  }, [items, q, type]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);

  function startAdd(m: Mode) {
    setAdding(m);
    setDraft(m === "manual" ? { type: "tip", title: "", content: "", localPath: "", images: [] } : null);
  }
  function edit(it: KbItem) {
    setTaskId("");
    setAdding("manual");
    setDraft({
      id: it.id,
      type: MANUAL_TYPES.some((t) => t.key === it.type) ? it.type : "tip",
      title: it.title,
      content: it.content,
      localPath: it.localPath ?? "",
      linked: it.linkedPriceLink ? { id: Number(it.linkedPriceLink), url: it.linkedPriceLinkUrl ?? "", description: "" } : null,
      images: (it.images ?? []).map((im) => ({ ...im, key: `e${seq++}`, preview: im.url })),
    });
  }

  async function del(it: KbItem) {
    if (!(await confirm({ icon: "🗑", title: "ลบความรู้นี้?", detail: `${it.title}\n\nลบทั้งจากคลังและจากบอท (Pinecone) — กู้คืนไม่ได้`, confirmLabel: "ลบ", danger: true }))) return;
    try {
      const r = await botApi<{ pushed: boolean }>("/api/admin/chatbot/knowledge", { action: "delete", id: it.id });
      toast(r.pushed ? "🗑️ ลบแล้ว" : "⚠️ ลบจากคลังแล้ว แต่สั่งลบในบอทไม่สำเร็จ", !r.pushed);
      setItems((x) => (x ?? []).filter((i) => i.id !== it.id));
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    }
  }

  async function syncAll() {
    // 🔎 "จากแชท·รอตรวจ" ยังไม่ผ่านการตรวจ — ไม่ส่งเข้าบอทจนกว่าแอดมินจะกดแก้ไข→บันทึก (3 ต.ค. 69)
    const ids = (items ?? []).filter((i) => i.type !== "chat-review").map((i) => i.id);
    if (!ids.length) return;
    const min = Math.ceil((ids.length * 0.9) / 60);
    if (!(await confirm({ icon: "🔄", title: `ส่งความรู้ทั้งหมด ${ids.length.toLocaleString()} รายการเข้าบอทใหม่?`, detail: `ใช้เมื่อเปลี่ยน index ของ Pinecone หรืออยาก sync ใหม่ทั้งหมด\nใช้เวลาราว ${min} นาที — เปิดหน้านี้ค้างไว้จนเสร็จ`, confirmLabel: "เริ่มซิงก์" }))) return;
    setBusy("sync");
    let sent = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i += 8) {
        setProgress(`🔄 ซิงก์ ${Math.min(i + 8, ids.length).toLocaleString()}/${ids.length.toLocaleString()}…`);
        const r = await botApi<{ sent: number; failed: number }>("/api/admin/chatbot/knowledge", { action: "sync", ids: ids.slice(i, i + 8) });
        sent += r.sent;
        failed += r.failed;
      }
      toast(`✅ ซิงก์เสร็จ ${sent.toLocaleString()} รายการ${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`, failed > 0);
    } catch (e) {
      toast(`❌ หยุดที่ ${sent} รายการ: ${(e as Error).message}`, true);
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const chips = [{ key: "", label: "ทั้งหมด" }, ...KB_TYPES];

  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="คลังความรู้ของบอท"
        count={items ? `${items.length.toLocaleString()} รายการ` : undefined}
        sub="คำถาม-คำตอบที่บอทใช้ตอบลูกค้า · บันทึก/ลบแล้วส่งเข้าบอท (Pinecone) ให้อัตโนมัติ"
        tools={
          <>
            <Btn onClick={syncAll} disabled={!!busy} title="ส่งทุกรายการเข้า Pinecone ใหม่">
              🔄 ซิงก์เข้าบอท
            </Btn>
            <Btn tone="yolk" onClick={() => startAdd("manual")}>
              ＋ เพิ่มความรู้
            </Btn>
          </>
        }
      />
      <ChatbotTabs />

      {progress && !adding && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }} aria-live="polite">
          {progress}
        </p>
      )}

      {/* ทางลัดเพิ่ม 3 แบบ — เห็นตั้งแต่เปิดหน้า */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ["manual", "✍️", "พิมพ์เอง", "1 คำถาม + รูป"],
            ["paste", "📋", "วางเนื้อหา/รูป", "AI แตกเป็นหลาย Q&A"],
            ["web", "🌐", "จากลิงก์เว็บ", "AI อ่านหน้าเว็บให้"],
          ] as const
        ).map(([m, ic, t, s]) => (
          <button key={m} type="button" onClick={() => startAdd(m)} className="min-h-[64px] rounded-2xl border bg-white px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderColor: "var(--dk-hair)" }}>
            <span className="text-[14px] font-bold" style={{ color: "var(--dk-navy)" }}>
              {ic} {t}
            </span>
            <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
              {s}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="ค้นคำถาม คำตอบ หรือที่อยู่โฟลเดอร์…"
        />
      </div>
      <div className="dkb-scroll mt-2 flex gap-1.5">
        {chips.map((c) => (
          <FChip
            key={c.key}
            on={type === c.key}
            onClick={() => {
              setType(c.key);
              setPage(1);
            }}
            label={c.label}
            count={c.key ? counts[c.key] ?? 0 : (items?.length ?? 0) - (counts.pricing ?? 0)}
          />
        ))}
      </div>

      {err && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
          {err} — <button className="underline" onClick={() => load(true)}>ลองใหม่</button>
        </p>
      )}

      <div className="mt-3 space-y-2.5">
        {items === null && [0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl" style={{ background: "var(--dk-sky)" }} />)}
        {shown.map((it) => {
          const t = isPriceTable(it) ? "pricing" : typeOf(it);
          const long = it.content.length > 220 || it.content.split("\n").length > 4;
          const full = open[it.id];
          return (
            <article key={it.id} className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: "var(--dk-hair)" }}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag tone={tone(t)}>{label(t)}</Tag>
                    <span className="text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                      {ago(it.timestamp)}
                      {(it.updatedByName || it.createdByName) && ` · ${it.updatedByName || it.createdByName}`}
                    </span>
                  </div>
                  <p className="mt-1 text-[15px] font-bold leading-snug" style={{ color: "var(--dk-navy)" }}>
                    {it.title}
                  </p>
                </div>
                <button type="button" onClick={() => edit(it)} className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px] shrink-0">
                  แก้ไข
                </button>
                <button type="button" onClick={() => del(it)} aria-label="ลบ" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-[var(--dk-coral-wash)]">
                  🗑
                </button>
              </div>
              <div className={`mt-1.5 text-[13.5px] leading-relaxed ${long && !full ? "line-clamp-3" : ""}`} style={{ color: "var(--dk-navy-soft)" }}>
                {renderChatText(it.content.replace(/^#{1,6}\s+/gm, ""), CLS)}
              </div>
              {long && (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [it.id]: !full }))} className="mt-1 text-[12.5px] font-bold" style={{ color: "var(--dk-blue-deep)" }}>
                  {full ? "ย่อ ▲" : "ดูเพิ่มเติม ▼"}
                </button>
              )}
              {(it.images?.length || it.localPath || (it.source && /^https?:/.test(it.source)) || it.linkedPriceLinkUrl) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {it.images?.slice(0, 4).map((im, i) => (
                    <a key={im.url + i} href={im.url} target="_blank" rel="noopener noreferrer" title={im.label}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Firebase Storage */}
                      <img src={im.url} alt={im.label || ""} loading="lazy" className="h-14 w-14 rounded-lg border object-cover" style={{ borderColor: "var(--dk-hair)" }} />
                    </a>
                  ))}
                  {(it.images?.length ?? 0) > 4 && <span className="text-[12px] font-bold" style={{ color: "var(--dk-faint)" }}>+{(it.images?.length ?? 0) - 4}</span>}
                  {it.localPath && (
                    <button type="button" onClick={() => navigator.clipboard.writeText(it.localPath!).then(() => toast("📋 คัดลอกที่อยู่โฟลเดอร์แล้ว"))} className="max-w-full truncate rounded-lg px-2 py-1 text-[11.5px] font-semibold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy-soft)" }}>
                      📁 {it.localPath}
                    </button>
                  )}
                  {it.linkedPriceLinkUrl && (
                    <a href={it.linkedPriceLinkUrl} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-semibold underline" style={{ color: "var(--dk-blue-deep)" }}>
                      🔗 ลิงก์ราคาที่ผูก
                    </a>
                  )}
                  {it.source && /^https?:/.test(it.source) && (
                    <a href={it.source} target="_blank" rel="noopener noreferrer" className="max-w-[260px] truncate text-[11.5px] underline" style={{ color: "var(--dk-faint)" }}>
                      🌐 {decodeURI(it.source.replace(/^https?:\/\//, ""))}
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {items !== null && filtered.length === 0 && (
        <div className="mt-4">
          <Empty title={items.length ? "ไม่เจอความรู้ที่ค้น" : "คลังยังว่าง"} body={items.length ? "ลองคำอื่น หรือเปลี่ยนชิปประเภท — ถ้ายังไม่มีเรื่องนี้ กด “＋ เพิ่มความรู้”" : "เริ่มจาก “📋 วางเนื้อหา” ให้ AI แตกเป็นคำถามคำตอบให้"} />
        </div>
      )}
      <Pager page={cur} pages={pages} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} total={filtered.length} />

      {adding === "manual" && draft && (
        <ManualForm
          draft={draft}
          setDraft={setDraft}
          taskId={taskId}
          busy={busy}
          setBusy={setBusy}
          toast={toast}
          onClose={() => {
            setAdding(null);
            setDraft(null);
          }}
          onSaved={() => {
            setAdding(null);
            setDraft(null);
            setTaskId("");
            load(true);
          }}
        />
      )}
      {(adding === "paste" || adding === "web") && (
        <GenerateForm
          mode={adding}
          toast={toast}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            load(true);
          }}
        />
      )}

      {dialog}
      {toastNode}
    </PageShell>
  );
}

const CLS = {
  row: "block",
  li: "block pl-4 -indent-3 before:content-['•_'] before:text-[var(--dk-faint)]",
  gap: "block h-1.5",
  link: "font-semibold text-[var(--dk-blue-deep)] underline underline-offset-2 break-all",
};

const fieldLabel = (t: string, hint?: string) => (
  <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
    {t} {hint && <span className="font-normal">{hint}</span>}
  </span>
);

/* ───────────── ✍️ พิมพ์เอง ───────────── */
function ManualForm({
  draft,
  setDraft,
  taskId,
  busy,
  setBusy,
  toast,
  onClose,
  onSaved,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  taskId: string;
  busy: string;
  setBusy: (b: string) => void;
  toast: (t: string, bad?: boolean) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [links, setLinks] = useState<PriceLink[] | null>(null);
  const [linkQ, setLinkQ] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });

  useEffect(() => {
    botApi<{ items: PriceLink[] }>("/api/admin/chatbot/price-links")
      .then((d) => {
        setLinks(d.items);
        // รายการที่ผูกไว้ → เติมชื่อให้ครบ (ตอนเปิดแก้รู้แค่ id/url)
        if (draft.linked && !draft.linked.description) {
          const full = d.items.find((l) => String(l.id) === String(draft.linked!.id));
          if (full) setDraft({ ...draft, linked: full });
        }
      })
      .catch(() => setLinks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวตอนเปิดฟอร์ม
  }, []);

  const linkHits = useMemo(() => {
    const s = linkQ.trim().toLowerCase();
    return (links ?? []).filter((l) => !s || `${l.description} ${l.keywords ?? ""} ${l.url}`.toLowerCase().includes(s)).slice(0, 8);
  }, [links, linkQ]);

  function pickLink(l: PriceLink) {
    const firstPath = Object.values(l.localPaths ?? {}).find(Boolean) ?? l.localPath ?? "";
    setDraft({
      ...draft,
      linked: l,
      // เติมให้เฉพาะช่องที่ยังว่าง (แบบหน้าเดิม)
      localPath: draft.localPath || firstPath,
      title: draft.title || l.description.split(/[,،、]+/)[0].trim(),
    });
    setLinkOpen(false);
    setLinkQ("");
  }

  async function reorganize() {
    const newImgs = draft.images.filter((i) => i.file);
    if (!draft.content.trim() && !draft.images.length) return toast("ใส่เนื้อหาหรือแนบรูปก่อน", true);
    setBusy("reorg");
    try {
      const images = await Promise.all(newImgs.map(async (i) => blobToDataUrl(await shrinkImage(i.file!, 1280, 0.82))));
      const d = await botApi<{ text: string }>("/api/admin/chatbot/knowledge/ai", {
        mode: "reorganize",
        content: draft.content,
        images,
        imageUrls: draft.images.filter((i) => !i.file).map((i) => i.url),
      });
      setDraft({ ...draft, undo: draft.content, content: d.text });
      toast("✨ เรียบเรียงแล้ว — ตรวจแล้วกดบันทึก (กด ↩ ย้อนได้)");
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!draft.title.trim() || !draft.content.trim()) return toast("ข้อมูลไม่ครบ — ต้องมีหัวข้อ/คำถาม และเนื้อหา", true);
    setBusy("save");
    try {
      const folder = `kb-${draft.id || Date.now()}`;
      const images: KbImage[] = [];
      let failed = 0;
      for (const im of draft.images) {
        if (!im.file) {
          images.push({ url: im.url, storagePath: im.storagePath, label: im.label });
          continue;
        }
        try {
          images.push({ ...(await uploadBotImage(folder, im.file)), label: im.label });
        } catch {
          failed++;
        }
      }
      const r = await botApi<{ pushed: boolean }>("/api/admin/chatbot/knowledge", {
        action: "save",
        id: draft.id,
        title: draft.title,
        content: draft.content,
        type: draft.type,
        localPath: draft.localPath,
        linkedPriceLink: draft.linked ? String(draft.linked.id) : "",
        linkedPriceLinkUrl: draft.linked?.url ?? "",
        images,
        taskId: taskId || undefined,
      });
      toast(
        failed ? `⚠️ บันทึกแล้ว แต่อัปรูปไม่ผ่าน ${failed} รูป` : r.pushed ? (draft.id ? "✅ อัปเดตแล้ว + ส่งเข้าบอทแล้ว" : "✅ บันทึกแล้ว + ส่งเข้าบอทแล้ว") : "⚠️ บันทึกแล้ว แต่ส่งเข้าบอท (Pinecone) ไม่สำเร็จ — กดซิงก์ทีหลังได้",
        failed > 0 || !r.pushed,
      );
      onSaved();
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setBusy("");
    }
  }

  return (
    <Modal
      wide
      title={draft.id ? "✏️ แก้ไขความรู้" : "✍️ เพิ่มความรู้ (พิมพ์เอง)"}
      sub={taskId ? "🙋 มาจาก Leader Inbox — บันทึกแล้วงานนี้จะถูกปิดให้" : "หัวข้อ = คำถามที่ลูกค้าถาม · เนื้อหา = คำตอบ · แนบรูปแล้วให้ AI อ่านช่วยเรียบเรียงได้"}
      onClose={() => !busy && onClose()}
      foot={
        <>
          <Btn onClick={onClose} disabled={!!busy}>
            ยกเลิก
          </Btn>
          <Btn tone="navy" onClick={save} disabled={!!busy}>
            {busy === "save" ? "กำลังบันทึก…" : draft.id ? "อัปเดตความรู้" : "บันทึกความรู้"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <label className="block">
          {fieldLabel("ประเภท")}
          <select className="dkb-inp mt-1" value={draft.type} onChange={(e) => set({ type: e.target.value })}>
            {MANUAL_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          {fieldLabel("หัวข้อ / คำถาม *")}
          <input className="dkb-inp mt-1" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="เช่น พวงกุญแจอะคริลิคกันน้ำไหม" autoFocus={!draft.id} />
        </label>
      </div>

      <label className="block">
        <span className="flex flex-wrap items-center justify-between gap-2">
          {fieldLabel("เนื้อหา / คำตอบ *")}
          <span className="flex gap-1.5">
            {draft.undo !== undefined && (
              <button type="button" className="min-h-[36px] rounded-lg px-2 text-[12px] font-bold hover:bg-[var(--dk-sky)]" style={{ color: "var(--dk-navy-soft)" }} onClick={() => set({ content: draft.undo!, undo: undefined })}>
                ↩ ย้อนก่อนเรียบเรียง
              </button>
            )}
            <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[36px]" onClick={reorganize} disabled={!!busy}>
              {busy === "reorg" ? "AI กำลังอ่าน…" : "✨ AI เรียบเรียง"}
            </button>
          </span>
        </span>
        <textarea className="dkb-inp mt-1" rows={9} value={draft.content} onChange={(e) => set({ content: e.target.value })} placeholder="พิมพ์หรือวางข้อมูลดิบ แล้วกด ✨ AI เรียบเรียง — หรือแนบรูปอย่างเดียวให้ AI อ่านจากรูป" />
      </label>

      <div>
        {fieldLabel("รูปประกอบ", "(ลากมาวาง หรือกดเพิ่ม · ใส่ชื่อใต้รูปได้)")}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/"));
            set({ images: [...draft.images, ...fs.map((f) => ({ key: `n${seq++}`, file: f, preview: URL.createObjectURL(f), url: "", label: "" }))] });
            e.target.value = "";
          }}
        />
        <div
          className="mt-1 flex flex-wrap gap-2 rounded-xl border-2 border-dashed p-2"
          style={{ borderColor: "var(--dk-quiet)" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const fs = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
            set({ images: [...draft.images, ...fs.map((f) => ({ key: `n${seq++}`, file: f, preview: URL.createObjectURL(f), url: "", label: "" }))] });
          }}
        >
          {draft.images.map((im) => (
            <div key={im.key} className="w-24">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- พรีวิวรูปในฟอร์ม */}
                <img src={im.preview} alt="" className="aspect-square w-24 rounded-lg object-cover" />
                <button type="button" aria-label="เอารูปนี้ออก" onClick={() => set({ images: draft.images.filter((x) => x.key !== im.key) })} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[12px] shadow">
                  ✕
                </button>
              </div>
              <input className="mt-1 w-full rounded-md border px-1.5 py-1 text-[11px]" style={{ borderColor: "var(--dk-hair)" }} placeholder="ชื่อรูป" value={im.label ?? ""} onChange={(e) => set({ images: draft.images.map((x) => (x.key === im.key ? { ...x, label: e.target.value } : x)) })} />
            </div>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} className="grid aspect-square w-24 place-items-center rounded-lg text-[12px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy-soft)" }}>
            ＋ เพิ่มรูป
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          {fieldLabel("ผูกลิงก์ราคา", "(ไม่บังคับ)")}
          {draft.linked ? (
            <div className="mt-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--dk-sky)" }}>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
                🔗 {draft.linked.description ? draft.linked.description.split(/[,،、]+/)[0] : draft.linked.url}
              </span>
              <button type="button" className="min-h-[32px] px-2 text-[12px] font-bold" style={{ color: "var(--dk-coral-ink)" }} onClick={() => set({ linked: null })}>
                ถอด
              </button>
            </div>
          ) : (
            <>
              <input className="dkb-inp mt-1" value={linkQ} onChange={(e) => { setLinkQ(e.target.value); setLinkOpen(true); }} onFocus={() => setLinkOpen(true)} placeholder={links === null ? "กำลังโหลดลิงก์…" : "ค้นชื่อสินค้าในลิงก์ราคา…"} />
              {linkOpen && linkHits.length > 0 && (
                <div className="absolute inset-x-0 z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-white shadow-xl" style={{ borderColor: "var(--dk-hair)" }}>
                  {linkHits.map((l) => (
                    <button key={l.id} type="button" onClick={() => pickLink(l)} className="block w-full px-3 py-2 text-left hover:bg-[var(--dk-sky)]">
                      <span className="block truncate text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>
                        {l.description.split(/[,،、]+/)[0]}
                      </span>
                      <span className="block truncate text-[11px]" style={{ color: "var(--dk-faint)" }}>
                        {decodeURI(l.url.split("/").filter(Boolean).pop() ?? l.url)} · {(l.images ?? []).length} รูป
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <label className="block">
          {fieldLabel("📁 ที่อยู่โฟลเดอร์ในเครื่อง", "(ไม่บังคับ)")}
          <input className="dkb-inp mt-1" value={draft.localPath} onChange={(e) => set({ localPath: e.target.value })} placeholder="\\192.168.1.100\iDuckyShop\…" />
        </label>
      </div>
    </Modal>
  );
}

/* ───────────── 📋 วางเนื้อหา / 🌐 จากเว็บ → AI แตกเป็น Q&A ───────────── */
function GenerateForm({ mode, toast, onClose, onSaved }: { mode: "paste" | "web"; toast: (t: string, bad?: boolean) => void; onClose: () => void; onSaved: () => void }) {
  const defType = mode === "paste" ? "paste-import" : "web-import";
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<{ key: string; file: File; preview: string }[]>([]);
  const [baseType, setBaseType] = useState(defType);
  const [checkDup, setCheckDup] = useState(true);
  const [qa, setQa] = useState<QA[] | null>(null);
  const [step, setStep] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const typeOptions = [{ key: defType, label: mode === "paste" ? "วางเนื้อหา" : "จากเว็บ" }, ...MANUAL_TYPES];

  async function generate() {
    setQa(null);
    try {
      let content = text.trim();
      let images: string[] = [];
      if (mode === "web") {
        if (!/^https?:\/\//i.test(url.trim())) return toast("ใส่ลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://", true);
        setStep("🌐 กำลังอ่านหน้าเว็บ…");
        content = (await botApi<{ text: string }>("/api/admin/chatbot/knowledge/ai", { mode: "scrape", url: url.trim() })).text;
      } else {
        if (!content && !files.length) return toast("วางเนื้อหาหรือแนบรูปก่อน", true);
        if (content && !files.length && content.length < 30) return toast("เนื้อหาสั้นเกินไป (อย่างน้อย 30 ตัวอักษร)", true);
        if (files.length) {
          setStep("🖼 กำลังย่อรูป…");
          images = await Promise.all(files.map(async (f) => blobToDataUrl(await shrinkImage(f.file, 1280, 0.82))));
        }
        // มีทั้งข้อความ + รูป → อ่านรูปเป็นข้อความก่อน แล้วรวมเป็นก้อนเดียว (2 ขั้นแบบเดิม)
        if (content && images.length) {
          setStep("🖼 AI กำลังอ่านข้อความในรูป…");
          const ocr = await botApi<{ text: string }>("/api/admin/chatbot/knowledge/ai", { mode: "ocr", images }).catch(() => null);
          if (ocr?.text) content = `=== ข้อมูลจากเนื้อหา ===\n${content}\n\n=== ข้อมูลจากภาพ ===\n${ocr.text}`;
          images = [];
        }
      }
      setStep("✨ AI กำลังแตกเป็นคำถาม-คำตอบ…");
      const r = await botApi<{ items: { q: string; a: string }[] }>("/api/admin/chatbot/knowledge/ai", { mode: "faq", content, images });
      let list: QA[] = r.items.map((x) => ({ ...x, type: baseType }));
      if (checkDup) {
        setStep("🔍 กำลังเช็คข้อที่ซ้ำกับในคลัง…");
        const d = await botApi<{ duplicates: number[] }>("/api/admin/chatbot/knowledge/ai", { mode: "dedupe", items: r.items }).catch(() => ({ duplicates: [] as number[] }));
        list = list.map((x, i) => (d.duplicates.includes(i) ? { ...x, dup: true } : x));
      }
      setQa(list);
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setStep("");
    }
  }

  async function saveAll() {
    const keep = (qa ?? []).filter((x) => !x.dup && x.q.trim() && x.a.trim());
    if (!keep.length) return toast("ไม่มีข้อที่จะบันทึก", true);
    let saved = 0;
    let pushed = 0;
    try {
      for (let i = 0; i < keep.length; i += 8) {
        setStep(`💾 กำลังบันทึก ${Math.min(i + 8, keep.length)}/${keep.length}…`);
        const r = await botApi<{ saved: number; pushed: number }>("/api/admin/chatbot/knowledge", {
          action: "bulk",
          source: mode === "web" ? url.trim() : "paste",
          items: keep.slice(i, i + 8).map((x) => ({ q: x.q, a: x.a, type: x.type })),
        });
        saved += r.saved;
        pushed += r.pushed;
      }
      toast(pushed === saved ? `✅ บันทึก ${saved} ข้อ + ส่งเข้าบอทแล้ว` : `⚠️ บันทึก ${saved} ข้อ · ส่งเข้าบอทได้ ${pushed} — กดซิงก์ทีหลังได้`, pushed !== saved);
      onSaved();
    } catch (e) {
      toast(`❌ บันทึกได้ ${saved} ข้อแล้วหยุด: ${(e as Error).message}`, true);
    } finally {
      setStep("");
    }
  }

  const keepCount = (qa ?? []).filter((x) => !x.dup).length;
  const dupCount = (qa ?? []).filter((x) => x.dup).length;

  return (
    <Modal
      wide
      title={mode === "paste" ? "📋 วางเนื้อหา → AI แตกเป็น Q&A" : "🌐 จากลิงก์เว็บ → AI แตกเป็น Q&A"}
      sub={qa ? "ตรวจทุกข้อก่อนบันทึก — แก้ได้ เปลี่ยนประเภทได้ กด ✕ ตัดทิ้งได้" : mode === "paste" ? "วางรายละเอียดสินค้า/แชท/ประกาศ หรือแนบรูปโบรชัวร์-ตารางราคา" : "ใส่ลิงก์หน้าสินค้า/บทความ AI จะอ่านแล้วสร้างคำถามที่ลูกค้าน่าจะถาม"}
      onClose={() => !step && onClose()}
      foot={
        qa ? (
          <>
            <span className="msg">{step || `จะบันทึก ${keepCount} ข้อ${dupCount ? ` · ข้าม ${dupCount} ข้อที่ซ้ำ` : ""}`}</span>
            <Btn onClick={() => setQa(null)} disabled={!!step}>
              ← แก้ต้นฉบับ
            </Btn>
            <Btn tone="navy" onClick={saveAll} disabled={!!step || !keepCount}>
              บันทึก {keepCount} ข้อ
            </Btn>
          </>
        ) : (
          <>
            <span className="msg">{step}</span>
            <Btn onClick={onClose} disabled={!!step}>
              ยกเลิก
            </Btn>
            <Btn tone="navy" onClick={generate} disabled={!!step}>
              {step ? "กำลังทำ…" : "✨ สร้าง Q&A"}
            </Btn>
          </>
        )
      }
    >
      {!qa ? (
        <>
          {mode === "web" ? (
            <label className="block">
              {fieldLabel("ลิงก์หน้าเว็บ *")}
              <input className="dkb-inp mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" autoFocus />
            </label>
          ) : (
            <>
              <label className="block">
                {fieldLabel("เนื้อหา", "(อย่างน้อย 30 ตัวอักษร ถ้าไม่มีรูป)")}
                <textarea className="dkb-inp mt-1" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="วางรายละเอียดสินค้า ข้อความจากแชท หรือประกาศของร้าน…" autoFocus />
              </label>
              <div>
                {fieldLabel("รูป", "(AI อ่านข้อความในรูปด้วย · รูปไม่ถูกเก็บถาวร)")}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    const fs = [...(e.target.files ?? [])].filter((f) => f.type.startsWith("image/")).slice(0, 8 - files.length);
                    setFiles([...files, ...fs.map((f) => ({ key: `p${seq++}`, file: f, preview: URL.createObjectURL(f) }))]);
                    e.target.value = "";
                  }}
                />
                <div className="mt-1 flex flex-wrap gap-2">
                  {files.map((f) => (
                    <div key={f.key} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- พรีวิวรูปที่จะให้ AI อ่าน */}
                      <img src={f.preview} alt="" className="h-20 w-20 rounded-lg object-cover" />
                      <button type="button" aria-label="เอารูปนี้ออก" onClick={() => setFiles(files.filter((x) => x.key !== f.key))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-[11px] shadow">
                        ✕
                      </button>
                    </div>
                  ))}
                  {files.length < 8 && (
                    <button type="button" onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-lg text-[12px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-navy-soft)" }}>
                      ＋ รูป
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
              ประเภทเริ่มต้น
              <select className="dkb-inp !w-auto !py-1.5" value={baseType} onChange={(e) => setBaseType(e.target.value)}>
                {typeOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-h-[40px] items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--dk-navy)" }}>
              <input type="checkbox" className="h-5 w-5" checked={checkDup} onChange={(e) => setCheckDup(e.target.checked)} />
              เช็คข้อที่ซ้ำกับในคลัง (ข้ามให้อัตโนมัติ)
            </label>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {qa.map((x, i) => (
            <div key={i} className="rounded-xl border p-2.5" style={{ borderColor: x.dup ? "var(--dk-yolk-deep)" : "var(--dk-hair)", background: x.dup ? "var(--dk-yolk-wash)" : "white", opacity: x.dup ? 0.75 : 1 }}>
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color: "var(--dk-faint)" }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {x.dup && (
                    <p className="text-[12px] font-bold" style={{ color: "var(--dk-yolk-ink)" }}>
                      ⚠️ ซ้ำกับที่มีในคลัง — จะไม่บันทึก
                    </p>
                  )}
                  <input className={`dkb-inp !py-2 font-bold ${x.dup ? "line-through" : ""}`} value={x.q} onChange={(e) => setQa(qa.map((y, k) => (k === i ? { ...y, q: e.target.value } : y)))} />
                  <textarea className={`dkb-inp !py-2 !text-[13.5px] ${x.dup ? "line-through" : ""}`} rows={2} value={x.a} onChange={(e) => setQa(qa.map((y, k) => (k === i ? { ...y, a: e.target.value } : y)))} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <select className="dkb-inp !w-auto !py-1.5 !text-[12px]" value={x.type} onChange={(e) => setQa(qa.map((y, k) => (k === i ? { ...y, type: e.target.value } : y)))}>
                    {typeOptions.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {x.dup ? (
                    <button type="button" className="min-h-[36px] px-2 text-[12px] font-bold" style={{ color: "var(--dk-blue-deep)" }} onClick={() => setQa(qa.map((y, k) => (k === i ? { ...y, dup: false } : y)))}>
                      เก็บไว้
                    </button>
                  ) : (
                    <button type="button" aria-label="ตัดข้อนี้" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--dk-coral-wash)]" onClick={() => setQa(qa.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
