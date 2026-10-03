"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { Btn, Empty, PageHead, PageShell, SearchBox } from "@/components/admin/ui";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { useCan } from "@/lib/perm-context";
import type { PricingItem } from "@/lib/bot-kb-types";
import { ago, botApi, ChatbotTabs, Modal, Pager, useToast } from "../bot-ui";

/**
 * 💰 ตารางราคาของบอท — ย้ายจาก AdminBuddy pricing.html (3 ต.ค. 69)
 *
 * ข้อความราคาที่ n8n (quote-engine) อ่านไปตอบลูกค้า — 1 บรรทัด = 1 แบบ "ชื่อสินค้า: 1-10=245, 11-29=225, 1000+=175"
 * ⚠️ รูปแบบบรรทัดนี้ quote-engine + ปุ่มแยกรายการพึ่งอยู่ — ปุ่ม AI เรียบเรียงจัดให้ตามรูปแบบนี้
 * ลบ / นำเข้าทับ ต้องมีสิทธิ์ตั้งค่าระบบ (หน้าเดิมใช้ PIN ในเบราว์เซอร์ที่ใครก็รีเซ็ตได้)
 */

const PAGE = 20;

/** แยกเนื้อหาเป็นรายการ: บรรทัดที่มี ":" ใน 80 ตัวแรก = รายการใหม่ · บรรทัดอื่นต่อท้ายรายการก่อนหน้า (ตรรกะเดิม) */
function parseToItems(content: string): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx > 0 && idx < 80) out.push({ name: line.slice(0, idx).trim(), content: line.slice(idx + 1).trim() || "(ไม่มีข้อมูลราคา)" });
    else if (out.length) out[out.length - 1].content += `\n${line}`;
    else out.push({ name: line, content: "(ไม่มีข้อมูลราคา)" });
  }
  return out;
}

export default function PricingPage() {
  return (
    <RequirePerm perm="orders.edit">
      <Pricing />
    </RequirePerm>
  );
}

function Pricing() {
  const can = useCan();
  const canDestroy = can("settings.manage");
  const { confirm, dialog } = useConfirm();
  const { toast, toastNode } = useToast();
  const [items, setItems] = useState<PricingItem[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  /** null = ปิด · {} = เพิ่มใหม่ · {id} = แก้ */
  const [edit, setEdit] = useState<{ id?: string; name: string; content: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [split, setSplit] = useState<{ rows: { name: string; content: string }[]; delOrig: boolean } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await botApi<{ items: PricingItem[] }>("/api/admin/chatbot/pricing");
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
    return (items ?? []).filter((p) => !s || p.name.toLowerCase().includes(s) || p.content.toLowerCase().includes(s));
  }, [items, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      toast(`❌ ${(e as Error).message}`, true);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!edit) return;
    const r = await run("save", () => botApi("/api/admin/chatbot/pricing", { action: "save", ...edit }));
    if (r) {
      toast(edit.id ? "✅ บันทึกแล้ว" : "✅ เพิ่มแล้ว");
      setEdit(null);
      load();
    }
  }

  async function del(p: { id: string; name: string }) {
    if (!(await confirm({ icon: "🗑", title: "ลบรายการนี้?", detail: `${p.name}\n\n⚠️ กู้คืนไม่ได้ — บอทจะไม่เห็นราคานี้อีก`, confirmLabel: "ลบเลย", danger: true }))) return;
    const r = await run("del", () => botApi("/api/admin/chatbot/pricing", { action: "delete", id: p.id }));
    if (r) {
      toast("🗑️ ลบแล้ว");
      setEdit(null);
      load();
    }
  }

  async function duplicate(id: string) {
    const r = await run("dup", () => botApi("/api/admin/chatbot/pricing", { action: "duplicate", id }));
    if (r) {
      toast("📋 คัดลอกแล้ว — ชื่อลงท้าย (Copy)");
      load();
    }
  }

  async function aiTidy() {
    if (!edit?.content.trim()) return toast("ไม่มีเนื้อหาให้เรียบเรียง", true);
    const r = await run("ai", () => botApi<{ text: string }>("/api/admin/chatbot/pricing", { action: "ai", content: edit.content }));
    if (r) {
      setEdit((e) => (e ? { ...e, content: r.text } : e));
      toast("✅ เรียบเรียงแล้ว — ตรวจดูแล้วกดบันทึก");
    }
  }

  function openSplit() {
    if (!edit?.content.trim()) return toast("ไม่มีเนื้อหาให้แยก", true);
    const rows = parseToItems(edit.content);
    if (rows.length <= 1) return toast("พบเพียง 1 บรรทัด — ไม่ต้องแยก", true);
    setSplit({ rows, delOrig: !!edit.id && canDestroy });
  }

  async function confirmSplit() {
    if (!split) return;
    const rows = split.rows.filter((r) => r.name.trim());
    if (!rows.length) return toast("ไม่มีรายการที่ใช้ได้", true);
    const r = await run("split", () =>
      botApi<{ created: number; deletedOriginal: boolean; deniedDelete: boolean }>("/api/admin/chatbot/pricing", {
        action: "split",
        id: edit?.id,
        items: rows,
        deleteOriginal: split.delOrig,
      }),
    );
    if (r) {
      toast(`✅ แยกเป็น ${r.created} รายการ${r.deletedOriginal ? " + ลบต้นฉบับแล้ว" : r.deniedDelete ? " (ไม่มีสิทธิ์ลบต้นฉบับ — เก็บไว้)" : ""}`);
      setSplit(null);
      setEdit(null);
      load();
    }
  }

  async function runImport() {
    const r = await run("import", () => botApi<{ removed: number; imported: number }>("/api/admin/chatbot/pricing", { action: "import" }));
    if (r) {
      toast(`✅ นำเข้า ${r.imported} รายการ (ลบของเดิม ${r.removed})`);
      setImportOpen(false);
      load();
    }
  }

  return (
    <PageShell>
      <PageHead
        group="🤖 Chatbot"
        title="ตารางราคาของบอท"
        count={items ? `${items.length.toLocaleString()} รายการ` : undefined}
        sub="ราคาแบบข้อความที่บอทใช้ตอบลูกค้า · 1 บรรทัด = 1 แบบ เช่น “12x12 นิ้ว: 1-10=245, 11-29=225, 1000+=175”"
        tools={
          <>
            {canDestroy && (
              <Btn onClick={() => setImportOpen(true)} title="ล้างแล้วนำเข้าใหม่จากคลังความรู้ (ประเภทราคา)">
                📥 นำเข้าจากคลังความรู้
              </Btn>
            )}
            <Btn tone="yolk" onClick={() => setEdit({ name: "", content: "" })}>
              ＋ เพิ่มราคา
            </Btn>
          </>
        }
      />
      <ChatbotTabs />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="ค้นชื่อสินค้า หรือเนื้อหาราคา…"
          />
        </div>
        {q && (
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--dk-navy-soft)" }}>
            เจอ {filtered.length.toLocaleString()} รายการ
          </span>
        )}
      </div>

      {err && <p className="mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>{err} — <button className="underline" onClick={load}>ลองใหม่</button></p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items === null &&
          [0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl" style={{ background: "var(--dk-sky)" }} />)}
        {shown.map((p) => {
          const long = p.content.length > 300;
          const full = open[p.id];
          return (
            <article key={p.id} className="flex flex-col rounded-2xl border bg-white" style={{ borderColor: "var(--dk-hair)" }}>
              <header className="flex items-start gap-2 px-4 pt-3">
                <button type="button" onClick={() => setEdit({ id: p.id, name: p.name, content: p.content })} className="min-w-0 flex-1 text-left">
                  <p className="text-[15px] font-bold leading-snug hover:underline" style={{ color: "var(--dk-navy)" }}>
                    {p.name || "(ไม่มีชื่อ)"}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--dk-faint)" }}>
                    {p.content.split("\n").filter(Boolean).length} บรรทัด{p.updatedAt ? ` · แก้ ${ago(p.updatedAt)}` : ""}
                  </p>
                </button>
                <button type="button" title="คัดลอกเป็นรายการใหม่" disabled={!!busy} onClick={() => duplicate(p.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-[var(--dk-sky)]">
                  📋
                </button>
                {canDestroy && (
                  <button type="button" title="ลบ" disabled={!!busy} onClick={() => del(p)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-[var(--dk-coral-wash)]">
                    🗑
                  </button>
                )}
              </header>
              <pre
                className="mx-4 mb-3 mt-2 whitespace-pre-wrap break-words rounded-xl px-3 py-2 font-mono text-[12.5px] leading-relaxed tabular-nums"
                style={{ background: "var(--dk-sky)", color: "var(--dk-navy)" }}
              >
                {long && !full ? `${p.content.slice(0, 300)}…` : p.content}
              </pre>
              {long && (
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [p.id]: !full }))} className="mx-4 mb-3 self-start text-[12.5px] font-bold" style={{ color: "var(--dk-blue-deep)" }}>
                  {full ? "ย่อ ▲" : "อ่านเพิ่ม ▼"}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {items !== null && filtered.length === 0 && (
        <div className="mt-4">
          <Empty
            title={items.length ? "ไม่เจอราคาที่ค้น" : "ยังไม่มีตารางราคา"}
            body={items.length ? "ลองคำอื่น หรือกด “＋ เพิ่มราคา” ถ้ายังไม่มีสินค้านี้" : "กด “＋ เพิ่มราคา” หรือนำเข้าจากคลังความรู้"}
          />
        </div>
      )}
      <Pager page={cur} pages={pages} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} total={filtered.length} />

      {/* ── แก้/เพิ่ม ── */}
      {edit && !split && (
        <Modal
          title={edit.id ? "✏️ แก้ไขราคา" : "➕ เพิ่มราคาใหม่"}
          sub="บอทอ่านเนื้อหานี้ตรง ๆ — 1 บรรทัด = 1 แบบ “ชื่อ: ช่วง=ราคา, …” ใช้ - คั่นช่วง และ + แทน “ขึ้นไป”"
          onClose={() => setEdit(null)}
          foot={
            <>
              {edit.id && canDestroy && (
                <button type="button" className="dkb-btn dkb-btn-ghost mr-auto" style={{ color: "var(--dk-coral-ink)" }} disabled={!!busy} onClick={() => del({ id: edit.id!, name: edit.name })}>
                  🗑 ลบ
                </button>
              )}
              <Btn onClick={() => setEdit(null)}>ยกเลิก</Btn>
              <Btn tone="navy" onClick={save} disabled={!!busy}>
                {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}
              </Btn>
            </>
          }
        >
          <label className="block">
            <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
              ชื่อสินค้า / หัวข้อ *
            </span>
            <input className="dkb-inp mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น หมอนอิงยัดใย" autoFocus />
          </label>
          <label className="block">
            <span className="text-[12.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
              เนื้อหาราคา *
            </span>
            <textarea
              className="dkb-inp mt-1 font-mono !text-[13px]"
              rows={13}
              value={edit.content}
              onChange={(e) => setEdit({ ...edit, content: e.target.value })}
              placeholder={"12x12 นิ้ว: 1-10=245, 11-29=225, 30-49=205, 1000+=175\n14x14 นิ้ว: 1-10=255, 11-29=235, …"}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" onClick={aiTidy} disabled={!!busy}>
              {busy === "ai" ? "กำลังเรียบเรียง…" : "✨ AI เรียบเรียงตามรูปแบบ"}
            </button>
            <button type="button" className="dkb-btn dkb-btn-ghost dkb-btn-sm min-h-[40px]" onClick={openSplit} disabled={!!busy}>
              ✂️ แยกบรรทัดเป็นหลายรายการ
            </button>
          </div>
        </Modal>
      )}

      {/* ── แยกรายการ ── */}
      {split && (
        <Modal
          wide
          title={`✂️ แยกเป็น ${split.rows.filter((r) => r.name.trim()).length} รายการ`}
          sub="แก้ชื่อ/เนื้อหาได้ก่อนยืนยัน · กด ✕ เพื่อตัดแถวที่ไม่ต้องการ"
          onClose={() => setSplit(null)}
          foot={
            <>
              {edit?.id && (
                <label className="mr-auto flex min-h-[40px] items-center gap-2 text-[13px] font-semibold" style={{ color: canDestroy ? "var(--dk-navy)" : "var(--dk-faint)" }}>
                  <input type="checkbox" className="h-5 w-5" disabled={!canDestroy} checked={split.delOrig} onChange={(e) => setSplit({ ...split, delOrig: e.target.checked })} />
                  ลบรายการต้นฉบับ{!canDestroy && " (ต้องมีสิทธิ์ตั้งค่าระบบ)"}
                </label>
              )}
              <Btn onClick={() => setSplit(null)}>ย้อนกลับ</Btn>
              <Btn tone="navy" onClick={confirmSplit} disabled={!!busy}>
                {busy === "split" ? "กำลังแยก…" : "ยืนยันแยก"}
              </Btn>
            </>
          }
        >
          {split.rows.map((r, i) => (
            <div key={i} className="grid gap-1.5 rounded-xl border p-2.5" style={{ borderColor: "var(--dk-hair)" }}>
              <div className="flex gap-2">
                <input className="dkb-inp !py-2 font-bold" value={r.name} onChange={(e) => setSplit({ ...split, rows: split.rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" aria-label="ตัดแถวนี้" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--dk-coral-wash)]" onClick={() => setSplit({ ...split, rows: split.rows.filter((_, k) => k !== i) })}>
                  ✕
                </button>
              </div>
              <textarea className="dkb-inp !py-2 font-mono !text-[12.5px]" rows={2} value={r.content} onChange={(e) => setSplit({ ...split, rows: split.rows.map((x, k) => (k === i ? { ...x, content: e.target.value } : x)) })} />
            </div>
          ))}
        </Modal>
      )}

      {/* ── นำเข้า ── */}
      {importOpen && (
        <Modal
          title="📥 นำเข้าจากคลังความรู้"
          onClose={() => setImportOpen(false)}
          foot={
            <>
              <Btn onClick={() => setImportOpen(false)}>ยกเลิก</Btn>
              <button type="button" className="dkb-btn" style={{ background: "var(--dk-coral-ink)", color: "white" }} onClick={runImport} disabled={!!busy}>
                {busy === "import" ? "กำลังนำเข้า…" : "ลบของเดิมแล้วนำเข้า"}
              </button>
            </>
          }
        >
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--dk-navy)" }}>
            ดึงทุกรายการในคลังความรู้ที่เป็นประเภท <b>“ราคา”</b> มาเป็นตารางราคา (ตัดคำว่า “ราคา” หน้าชื่อออก)
          </p>
          <p className="rounded-xl px-3 py-2 text-[13.5px] font-bold leading-relaxed" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
            ⚠️ ตารางราคาที่มีอยู่ตอนนี้ {items?.length ?? 0} รายการจะถูกลบทั้งหมดก่อน — รวมที่แก้มือไว้ กู้คืนไม่ได้ · คลังความรู้ไม่ถูกแตะ
          </p>
        </Modal>
      )}

      {dialog}
      {toastNode}
    </PageShell>
  );
}
