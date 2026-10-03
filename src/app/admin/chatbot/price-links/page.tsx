"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Empty, PageHead, PageShell, SearchBox, Tag } from "@/components/admin/ui";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import type { PriceLink, PriceLinkImage } from "@/lib/bot-kb-types";
import { botApi, ChatbotTabs, Modal, Pager, uploadBotImage, useToast } from "../bot-ui";

/**
 * 🔗 ลิงก์ราคา & รูปตอบลูกค้า (ของบอท) — ย้ายจาก AdminBuddy pricelinks.html (3 ต.ค. 69)
 *
 * 1 รายการ = ลิงก์หน้าราคา + รายชื่อสินค้า + คีย์เวิร์ด + รูปแบ่งกลุ่มตามสินค้า (ภาพราคา / ภาพตัวอย่างสินค้า)
 * แอดมินเปิดหาแล้วกดคัดลอกลิงก์/บันทึกรูปไปส่งลูกค้า · บอทใช้จับคู่ลิงก์ (ผ่าน Pinecone)
 * ≠ /admin/price-links (ลิงก์ราคาที่ยิงจากหน้าสินค้าบนเว็บ) — คนละระบบ
 */

const PAGE = 10;
const NOGROUP = "__unlabeled__";

/** ภาพในฟอร์ม: มี url = อยู่ใน Storage แล้ว · มี file = ยังไม่อัป */
type FImg = PriceLinkImage & { key: string; file?: File; preview: string };
type Form = { id: number; isNew: boolean; url: string; description: string; keywords: string; images: FImg[]; paths: Record<string, string> };

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/]/g, "");
const firstName = (d: string) => d.split(/[,،、]+/)[0]?.trim() || d;
let seq = 0;
const k = () => `i${Date.now()}${seq++}`;

export default function PriceLinksPage() {
  return (
    <RequirePerm perm="orders.edit">
      <PriceLinks />
    </RequirePerm>
  );
}

function PriceLinks() {
  const { confirm, dialog } = useConfirm();
  const { toast, toastNode } = useToast();
  const [items, setItems] = useState<PriceLink[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [viewer, setViewer] = useState<{ urls: string[]; i: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await botApi<{ items: PriceLink[] }>("/api/admin/chatbot/price-links");
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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const n = norm(s);
    const list = [...(items ?? [])].sort((a, b) => b.id - a.id);
    if (!s) return list;
    return list.filter((l) => {
      const hay = `${l.url} ${l.description} ${l.keywords ?? ""} ${(l.images ?? []).map((i) => i.label ?? "").join(" ")}`.toLowerCase();
      return hay.includes(s) || (n.length >= 2 && norm(hay).includes(n));
    });
  }, [items, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const noKeywords = (items ?? []).filter((l) => !(l.keywords ?? "").trim()).length;

  const dupOf = form && form.url.trim() ? (items ?? []).find((l) => l.url === form.url.trim() && l.id !== form.id) : undefined;

  function openNew() {
    setForm({ id: Date.now(), isNew: true, url: "", description: "", keywords: "", images: [], paths: {} });
  }
  function openEdit(l: PriceLink) {
    const paths: Record<string, string> = { ...(l.localPaths ?? {}) };
    const imgs: FImg[] = (l.images ?? []).map((i) => ({ ...i, kind: i.kind === "sample" ? "sample" : "price", key: k(), preview: i.url }));
    // ของเก่ามี localPath เดียว → ผูกกับกลุ่มแรก (แบบหน้าเดิม)
    if (l.localPath && !Object.keys(paths).length) paths[imgs[0]?.label || NOGROUP] = l.localPath;
    setForm({ id: l.id, isNew: false, url: l.url, description: l.description, keywords: l.keywords ?? "", images: imgs, paths });
  }

  async function analyze() {
    if (!form?.url.trim()) return toast("ใส่ลิงก์ก่อน", true);
    setBusy("analyze");
    try {
      const d = await botApi<{ description: string; keywords: string }>("/api/admin/chatbot/price-links", { action: "analyze", url: form.url.trim() });
      setForm((f) => (f ? { ...f, description: d.description, keywords: d.keywords || f.keywords } : f));
      toast("✨ AI อ่านหน้าเว็บแล้ว — ตรวจรายละเอียดก่อนบันทึก");
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!form) return;
    if (!form.url.trim() || !form.description.trim()) return toast("ต้องมีลิงก์และรายละเอียดสินค้า", true);
    if (dupOf) return toast(`⚠️ ลิงก์นี้มีอยู่แล้ว: ${dupOf.description}`, true);
    setBusy("save");
    try {
      const pending = form.images.filter((i) => i.file);
      const done: PriceLinkImage[] = [];
      let failed = 0;
      for (let n = 0; n < form.images.length; n++) {
        const im = form.images[n];
        if (!im.file) {
          done.push({ url: im.url!, storagePath: im.storagePath, label: im.label, kind: im.kind, caption: im.caption });
          continue;
        }
        setProgress(`กำลังอัปรูป ${pending.indexOf(im) + 1}/${pending.length}…`);
        try {
          const up = await uploadBotImage(String(form.id), im.file);
          done.push({ ...up, label: im.label, kind: im.kind, caption: im.caption });
        } catch {
          failed++;
        }
      }
      setProgress("กำลังบันทึก…");
      const paths: Record<string, string> = {};
      const labels = new Set(done.map((i) => i.label || NOGROUP));
      for (const [g, p] of Object.entries(form.paths)) if (p.trim() && (labels.has(g) || g === NOGROUP)) paths[g] = p.trim();
      const r = await botApi<{ pushed: boolean | null }>("/api/admin/chatbot/price-links", {
        action: "save",
        id: form.id,
        item: { id: form.isNew ? undefined : form.id, url: form.url.trim(), description: form.description.trim(), keywords: form.keywords.trim(), images: done, localPaths: paths },
      });
      toast(
        failed
          ? `⚠️ บันทึกแล้ว แต่อัปรูปไม่ผ่าน ${failed} รูป — เปิดแก้แล้วเพิ่มใหม่`
          : r.pushed === false
            ? "⚠️ บันทึกแล้ว แต่ส่งเข้าบอท (Pinecone) ไม่สำเร็จ — กดซิงก์ทีหลังได้"
            : "✅ บันทึกลิงก์แล้ว",
        failed > 0 || r.pushed === false,
      );
      setForm(null);
      load();
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function del(l: PriceLink) {
    if (!(await confirm({ icon: "🗑", title: "ลบลิงก์ราคานี้?", detail: `${firstName(l.description)}\n${l.url}`, confirmLabel: "ลบลิงก์", danger: true }))) return;
    try {
      await botApi("/api/admin/chatbot/price-links", { action: "delete", id: l.id });
      toast("🗑️ ลบแล้ว");
      setForm(null);
      load();
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    }
  }

  async function genKeywords() {
    setBusy("kw");
    let total = 0;
    try {
      for (let round = 0; round < 10; round++) {
        setProgress(`✨ กำลังสร้างคีย์เวิร์ด… (ได้แล้ว ${total})`);
        const r = await botApi<{ done: number; remaining: number }>("/api/admin/chatbot/price-links", { action: "keywords" });
        total += r.done;
        if (!r.remaining || !r.done) break;
      }
      toast(`✅ สร้างคีย์เวิร์ดให้ ${total} รายการ`);
      load();
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function syncAll() {
    const ids = (items ?? []).map((l) => l.id);
    if (!ids.length) return;
    if (!(await confirm({ icon: "🔄", title: `ส่งลิงก์ทั้งหมด ${ids.length} รายการเข้าบอทใหม่?`, detail: "ใช้เมื่อเปลี่ยน index ของ Pinecone หรืออยากให้บอทเห็นคีย์เวิร์ดล่าสุด\nใช้เวลาราว 1 วินาทีต่อรายการ — เปิดหน้านี้ค้างไว้จนเสร็จ", confirmLabel: "เริ่มซิงก์" }))) return;
    setBusy("sync");
    let sent = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i += 8) {
        setProgress(`🔄 ซิงก์ ${Math.min(i + 8, ids.length)}/${ids.length}…`);
        const r = await botApi<{ sent: number; failed: number }>("/api/admin/chatbot/price-links", { action: "sync", ids: ids.slice(i, i + 8) });
        sent += r.sent;
        failed += r.failed;
      }
      toast(`✅ ซิงก์เสร็จ ${sent} รายการ${failed ? ` · ไม่สำเร็จ ${failed}` : ""}`, failed > 0);
    } catch (e) {
      toast(`❌ หยุดที่ ${sent} รายการ: ${(e as Error).message}`, true);
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  function copy(text: string, what: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`📋 คัดลอก${what}แล้ว`),
      () => toast("คัดลอกไม่ได้ — ลากคลุมแล้วคัดลอกเอง", true),
    );
  }

  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="ลิงก์ราคา & รูปตอบลูกค้า"
        count={items ? `${items.length} ลิงก์` : undefined}
        sub="ลิงก์หน้าราคา + รูปราคา/ตัวอย่างงาน แยกตามสินค้า — หาเจอแล้วคัดลอกส่งลูกค้าได้เลย · บอทใช้จับคู่ลิงก์ตอนตอบ"
        tools={
          <>
            <Btn onClick={syncAll} disabled={!!busy} title="ส่งทุกลิงก์เข้า Pinecone ใหม่">
              🔄 ซิงก์เข้าบอท
            </Btn>
            {noKeywords > 0 && (
              <Btn onClick={genKeywords} disabled={!!busy} title="ให้ AI สร้างคีย์เวิร์ดให้ลิงก์ที่ยังว่าง">
                ✨ สร้างคีย์เวิร์ด ({noKeywords})
              </Btn>
            )}
            <Btn tone="yolk" onClick={openNew}>
              ＋ เพิ่มลิงก์
            </Btn>
          </>
        }
      />
      <ChatbotTabs />

      {progress && !form && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }} aria-live="polite">
          {progress}
        </p>
      )}

      <div className="mt-4">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="ค้นชื่อสินค้า คีย์เวิร์ด ลิงก์ หรือชื่อกลุ่มรูป…"
        />
      </div>
      {err && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
          {err} — <button className="underline" onClick={load}>ลองใหม่</button>
        </p>
      )}

      <div className="mt-4 space-y-3">
        {items === null && [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl" style={{ background: "var(--dk-sky)" }} />)}
        {shown.map((l) => {
          const imgs = l.images ?? [];
          const groups = [...new Set(imgs.map((i) => i.label).filter(Boolean))];
          const paths = Object.entries(l.localPaths ?? (l.localPath ? { "": l.localPath } : {})).filter(([, p]) => p);
          return (
            <article key={l.id} className="rounded-2xl border bg-white p-3 sm:p-4" style={{ borderColor: "var(--dk-hair)" }}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => openEdit(l)} className="text-left">
                    <p className="text-[15.5px] font-bold leading-snug hover:underline" style={{ color: "var(--dk-navy)" }}>
                      {firstName(l.description)}
                    </p>
                  </button>
                  <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
                    {l.description}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="max-w-full truncate text-[12.5px] font-semibold underline underline-offset-2" style={{ color: "var(--dk-blue-deep)" }}>
                      {decodeURI(l.url.replace(/^https?:\/\//, ""))}
                    </a>
                    {!(l.keywords ?? "").trim() && <Tag tone="yolk">ยังไม่มีคีย์เวิร์ด</Tag>}
                    {groups.length > 0 && <Tag tone="sky">{groups.length} กลุ่มรูป</Tag>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  <button type="button" className="dkb-btn dkb-btn-yolk dkb-btn-sm min-h-[40px]" onClick={() => copy(l.url, "ลิงก์")}>
                    📋 คัดลอกลิงก์
                  </button>
                  <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" onClick={() => openEdit(l)}>
                    แก้ไข
                  </button>
                </div>
              </div>

              {imgs.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {imgs.slice(0, 6).map((im, i) => (
                    <button key={im.url + i} type="button" onClick={() => setViewer({ urls: imgs.map((x) => x.url), i })} className="w-24 shrink-0 text-left" title={im.label || ""}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- รูปจาก Firebase Storage ขนาดต่างกัน */}
                      <img src={im.url} alt={im.label || "รูป"} loading="lazy" className="aspect-square w-24 rounded-xl border object-cover" style={{ borderColor: "var(--dk-hair)" }} />
                      <span className="mt-0.5 block truncate text-[11px] font-semibold" style={{ color: "var(--dk-navy-soft)" }}>
                        {im.kind === "sample" ? "🖼 " : ""}
                        {im.label || "—"}
                      </span>
                    </button>
                  ))}
                  {imgs.length > 6 && (
                    <button type="button" onClick={() => setViewer({ urls: imgs.map((x) => x.url), i: 6 })} className="grid aspect-square w-24 shrink-0 place-items-center rounded-xl text-[15px] font-bold" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
                      +{imgs.length - 6}
                    </button>
                  )}
                </div>
              )}

              {((l.keywords ?? "").trim() || paths.length > 0) && (
                <div className="mt-2 space-y-1 border-t pt-2 text-[12px]" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-faint)" }}>
                  {(l.keywords ?? "").trim() && <p className="line-clamp-1">🔑 {l.keywords}</p>}
                  {paths.map(([g, p]) => (
                    <button key={g} type="button" onClick={() => copy(p, "ที่อยู่โฟลเดอร์")} className="block max-w-full truncate text-left hover:underline" title="กดเพื่อคัดลอกที่อยู่โฟลเดอร์">
                      📁 {g && g !== NOGROUP ? `${g}: ` : ""}
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {items !== null && filtered.length === 0 && (
        <div className="mt-4">
          <Empty title={items.length ? "ไม่เจอลิงก์ที่ค้น" : "ยังไม่มีลิงก์ราคา"} body={items.length ? "ลองคำอื่น หรือกด “＋ เพิ่มลิงก์”" : "กด “＋ เพิ่มลิงก์” แล้วใส่ลิงก์หน้าราคา — AI ช่วยอ่านหน้าเว็บให้ได้"} />
        </div>
      )}
      <Pager page={cur} pages={pages} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} total={filtered.length} />

      {form && (
        <LinkForm
          form={form}
          setForm={setForm}
          dupOf={dupOf}
          busy={busy}
          progress={progress}
          onAnalyze={analyze}
          onSave={save}
          onDelete={() => {
            const l = items?.find((x) => x.id === form.id);
            if (l) del(l);
          }}
          toast={toast}
        />
      )}

      {viewer && (
        <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center gap-3 p-4" style={{ background: "rgba(10,20,40,.88)" }} onClick={() => setViewer(null)} role="dialog" aria-label="ดูรูป">
          {/* eslint-disable-next-line @next/next/no-img-element -- ดูรูปขนาดเต็ม */}
          <img src={viewer.urls[viewer.i]} alt="" className="max-h-[78vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dkb-btn dkb-btn-ghost min-h-[44px]" disabled={viewer.i <= 0} onClick={() => setViewer({ ...viewer, i: viewer.i - 1 })}>
              ←
            </button>
            <span className="text-[13px] font-bold tabular-nums text-white">
              {viewer.i + 1}/{viewer.urls.length}
            </span>
            <button type="button" className="dkb-btn dkb-btn-ghost min-h-[44px]" disabled={viewer.i >= viewer.urls.length - 1} onClick={() => setViewer({ ...viewer, i: viewer.i + 1 })}>
              →
            </button>
            <a href={viewer.urls[viewer.i]} target="_blank" rel="noopener noreferrer" className="dkb-btn dkb-btn-yolk min-h-[44px]">
              เปิดรูปเต็ม / บันทึก
            </a>
          </div>
        </div>
      )}

      {dialog}
      {toastNode}
    </PageShell>
  );
}

/** ฟอร์มเพิ่ม/แก้ — รูปแบ่งกลุ่มตามชื่อสินค้า (label) · แต่ละกลุ่มมีภาพราคา + ภาพตัวอย่าง (มีคำบรรยาย) + โฟลเดอร์ในเครื่อง */
function LinkForm({
  form,
  setForm,
  dupOf,
  busy,
  progress,
  onAnalyze,
  onSave,
  onDelete,
  toast,
}: {
  form: Form;
  setForm: (f: Form | null) => void;
  dupOf?: PriceLink;
  busy: string;
  progress: string;
  onAnalyze: () => void;
  onSave: () => void;
  onDelete: () => void;
  toast: (t: string, bad?: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<{ label: string; kind: "price" | "sample" }>({ label: "", kind: "price" });
  const groups = useMemo(() => {
    const order: string[] = [];
    for (const im of form.images) {
      const g = im.label || NOGROUP;
      if (!order.includes(g)) order.push(g);
    }
    return order;
  }, [form.images]);

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const pick = (label: string, kind: "price" | "sample") => {
    target.current = { label, kind };
    fileRef.current?.click();
  };
  const addFiles = (files: FileList | File[], label: string, kind: "price" | "sample") => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    set({ images: [...form.images, ...list.map((f) => ({ key: k(), file: f, preview: URL.createObjectURL(f), url: "", label, kind, caption: "" }))] });
  };
  const newGroup = () => {
    const name = prompt("ชื่อกลุ่มสินค้าใหม่ (เช่น พวงกุญแจอะคริลิค):")?.trim();
    if (!name) return;
    if (groups.includes(name)) return toast("มีกลุ่มชื่อนี้แล้ว", true);
    pick(name, "price");
  };
  const renameGroup = (from: string, to: string) => {
    const t = to.trim();
    const paths = { ...form.paths };
    if (paths[from] !== undefined) {
      paths[t || NOGROUP] = paths[from];
      delete paths[from];
    }
    set({ images: form.images.map((i) => ((i.label || NOGROUP) === from ? { ...i, label: t } : i)), paths });
  };
  const copyGroup = (g: string) => {
    const name = prompt("ชื่อกลุ่มใหม่ที่จะคัดลอกไป:")?.trim();
    if (!name) return;
    if (groups.includes(name)) return toast("มีกลุ่มชื่อนี้แล้ว", true);
    const copies = form.images.filter((i) => (i.label || NOGROUP) === g).map((i) => ({ ...i, key: k(), label: name }));
    set({ images: [...form.images, ...copies], paths: form.paths[g] ? { ...form.paths, [name]: form.paths[g] } : form.paths });
  };
  const dropGroup = (g: string) => {
    const paths = { ...form.paths };
    delete paths[g];
    set({ images: form.images.filter((i) => (i.label || NOGROUP) !== g), paths });
  };
  const patchImg = (key: string, patch: Partial<FImg>) => set({ images: form.images.map((i) => (i.key === key ? { ...i, ...patch } : i)) });

  return (
    <Modal
      wide
      title={form.isNew ? "➕ เพิ่มลิงก์ราคา" : "✏️ แก้ไขลิงก์ราคา"}
      sub="ใส่ลิงก์แล้วกด ✨ ให้ AI อ่านรายชื่อสินค้า+คีย์เวิร์ดให้ · รูปจัดเป็นกลุ่มตามสินค้า"
      onClose={() => !busy && setForm(null)}
      foot={
        <>
          {!form.isNew && (
            <button type="button" className="dkb-btn dkb-btn-ghost mr-auto" style={{ color: "var(--dk-coral-ink)" }} disabled={!!busy} onClick={onDelete}>
              🗑 ลบ
            </button>
          )}
          {progress && <span className="msg">{progress}</span>}
          <Btn onClick={() => setForm(null)} disabled={!!busy}>
            ยกเลิก
          </Btn>
          <Btn tone="navy" onClick={onSave} disabled={!!busy || !!dupOf}>
            {busy === "save" ? "กำลังบันทึก…" : "บันทึกลิงก์"}
          </Btn>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files, target.current.label, target.current.kind);
          e.target.value = "";
        }}
      />
      <label className="block">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
          ลิงก์หน้าราคา *
        </span>
        <div className="mt-1 flex gap-2">
          <input className="dkb-inp" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" inputMode="url" autoFocus={form.isNew} />
          <button type="button" className="dkb-btn dkb-btn-ghost min-h-[44px] shrink-0" onClick={onAnalyze} disabled={!!busy || !form.url.trim()}>
            {busy === "analyze" ? "กำลังอ่าน…" : "✨ AI อ่านหน้า"}
          </button>
        </div>
        {dupOf && (
          <span className="mt-1 block text-[12.5px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
            ⚠️ ลิงก์ซ้ำกับ: {firstName(dupOf.description)}
          </span>
        )}
      </label>
      <label className="block">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
          รายชื่อสินค้าในลิงก์นี้ * <span className="font-normal">(คั่นด้วยคอมมา — ชื่อแรกใช้เป็นหัวการ์ด)</span>
        </span>
        <textarea className="dkb-inp mt-1" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="พวงกุญแจอะคริลิค, เข็มกลัดอะคริลิค, …" />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
          คีย์เวิร์ดที่ลูกค้าพิมพ์ <span className="font-normal">(คำพ้อง คำย่อ อังกฤษ คำที่พิมพ์ผิดบ่อย)</span>
        </span>
        <input className="dkb-inp mt-1" value={form.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="พวงกุญแจ, keychain, อะคริลิค, …" />
      </label>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-bold" style={{ color: "var(--dk-navy)" }}>
            รูป ({form.images.length})
          </p>
          <div className="flex gap-1.5">
            <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" onClick={newGroup}>
              ＋ กลุ่มสินค้าใหม่
            </button>
            {groups.length === 0 && (
              <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" onClick={() => pick("", "price")}>
                ＋ รูปไม่แยกกลุ่ม
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-3">
          {groups.map((g) => {
            const inG = form.images.filter((i) => (i.label || NOGROUP) === g);
            const label = g === NOGROUP ? "" : g;
            return (
              <section key={g} className="rounded-2xl border p-3" style={{ borderColor: "var(--dk-hair)", background: "var(--dk-sky)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="dkb-inp !w-auto min-w-0 flex-1 !bg-white !py-2 font-bold"
                    defaultValue={label}
                    placeholder="(ไม่มีชื่อกลุ่ม)"
                    onBlur={(e) => e.target.value.trim() !== label && renameGroup(g, e.target.value)}
                    aria-label="ชื่อกลุ่ม"
                  />
                  <span className="text-[12px] tabular-nums" style={{ color: "var(--dk-faint)" }}>
                    {inG.length} รูป
                  </span>
                  <button type="button" className="min-h-[36px] rounded-lg px-2 text-[12px] font-bold hover:bg-white" style={{ color: "var(--dk-blue-deep)" }} onClick={() => copyGroup(g)}>
                    คัดลอกกลุ่ม
                  </button>
                  <button type="button" className="min-h-[36px] rounded-lg px-2 text-[12px] font-bold hover:bg-white" style={{ color: "var(--dk-coral-ink)" }} onClick={() => dropGroup(g)}>
                    ลบกลุ่ม
                  </button>
                </div>
                {(["price", "sample"] as const).map((kind) => {
                  const list = inG.filter((i) => (i.kind ?? "price") === kind);
                  return (
                    <div
                      key={kind}
                      className="mt-2 rounded-xl bg-white p-2"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        addFiles(e.dataTransfer.files, label, kind);
                      }}
                    >
                      <p className="mb-1.5 text-[12px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
                        {kind === "price" ? "💰 ภาพราคา" : "🖼 ภาพตัวอย่างสินค้า"} <span className="font-normal">· ลากรูปมาวางได้</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {list.map((im) => (
                          <div key={im.key} className="w-24">
                            <div className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element -- พรีวิวรูปในฟอร์ม */}
                              <img src={im.preview} alt="" className="aspect-square w-24 rounded-lg border object-cover" style={{ borderColor: "var(--dk-hair)" }} />
                              {im.file && <span className="absolute left-1 top-1 rounded px-1 text-[10px] font-bold" style={{ background: "var(--dk-yolk)", color: "var(--dk-navy)" }}>ใหม่</span>}
                              <button type="button" aria-label="เอารูปนี้ออก" onClick={() => set({ images: form.images.filter((x) => x.key !== im.key) })} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[12px] shadow">
                                ✕
                              </button>
                            </div>
                            {kind === "sample" && (
                              <input className="mt-1 w-full rounded-md border px-1.5 py-1 text-[11px]" style={{ borderColor: "var(--dk-hair)" }} placeholder="คำบรรยาย" value={im.caption ?? ""} onChange={(e) => patchImg(im.key, { caption: e.target.value })} />
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => pick(label, kind)} className="grid aspect-square w-24 place-items-center rounded-lg border-2 border-dashed text-[12px] font-bold" style={{ borderColor: "var(--dk-quiet)", color: "var(--dk-navy-soft)" }}>
                          ＋ เพิ่มรูป
                        </button>
                      </div>
                    </div>
                  );
                })}
                <input
                  className="dkb-inp mt-2 !bg-white !py-2 !text-[12.5px]"
                  value={form.paths[g] ?? ""}
                  onChange={(e) => set({ paths: { ...form.paths, [g]: e.target.value } })}
                  placeholder="📁 ที่อยู่โฟลเดอร์ในเครื่อง (ไม่บังคับ) เช่น \\192.168.1.100\iDuckyShop\…"
                />
              </section>
            );
          })}
          {groups.length === 0 && (
            <p className="rounded-xl px-3 py-4 text-center text-[13px]" style={{ background: "var(--dk-sky)", color: "var(--dk-navy-soft)" }}>
              ยังไม่มีรูป — กด “＋ กลุ่มสินค้าใหม่” แล้วเลือกรูปราคาของสินค้านั้น
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
