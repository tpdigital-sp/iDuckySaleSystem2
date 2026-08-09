"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { formatFileSize, templateHref, TEMPLATE_MAX_MB, type DesignTemplate } from "@/lib/design-templates";
import { deleteTemplate, fetchTemplates, persistTemplate, uploadTemplateFile } from "@/lib/template-repo";
import { fetchProductNamesLite } from "@/lib/product-repo";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  badge,
  btnNeutral,
  btnPrimary,
  btnSmDanger,
  btnSmGhost,
  btnSmNeutral,
  card,
  faint,
  h1,
  muted,
} from "@/lib/admin-ui";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-100";

type Draft = DesignTemplate & { _dirty?: boolean };

function newId(): string {
  return `tpl-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function AdminTemplatesInner() {
  const [list, setList] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** สินค้าที่ผูกเทมเพลตแต่ละอันไว้ — ตอบว่า "อันนี้ใครใช้อยู่บ้าง" ก่อนลบ */
  const [usedBy, setUsedBy] = useState<Record<string, { id: string; name: string }[]>>({});
  const dragFrom = useRef<number | null>(null);
  const [dragAt, setDragAt] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    const [tpls, products] = await Promise.all([fetchTemplates(), fetchProductNamesLite()]);
    setList(tpls.map((t) => ({ ...t })));
    const by: Record<string, { id: string; name: string }[]> = {};
    for (const p of products)
      for (const id of p.templateIds ?? []) (by[id] ??= []).push({ id: p.id, name: p.name });
    setUsedBy(by);
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);

  function patch(id: string, p: Partial<Draft>) {
    setList((cur) => cur.map((t) => (t.id === id ? { ...t, ...p, _dirty: true } : t)));
  }

  async function save(t: Draft) {
    setSaving(t.id);
    setError("");
    const { _dirty, ...clean } = t;
    void _dirty;
    const res = await persistTemplate(clean);
    setSaving(null);
    if (!res.ok) return setError(res.error ?? "บันทึกไม่สำเร็จ");
    setList((cur) => cur.map((x) => (x.id === t.id ? { ...x, _dirty: false } : x)));
  }

  async function remove(t: Draft) {
    const used = usedBy[t.id] ?? [];
    const warn = used.length
      ? `\n\n⚠️ ตอนนี้มี ${used.length} สินค้าผูกเทมเพลตนี้อยู่ (${used.slice(0, 3).map((u) => u.name).join(", ")}${used.length > 3 ? " …" : ""}) — ลบแล้วหน้าสินค้าจะไม่มีให้โหลด`
      : "";
    if (!confirm(`ลบเทมเพลต “${t.name}” ?${warn}`)) return;
    setBusy(t.id);
    const res = await deleteTemplate(t.id);
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "ลบไม่สำเร็จ");
    setList((cur) => cur.filter((x) => x.id !== t.id));
  }

  async function pickFile(t: Draft, kind: "file" | "preview", f: File) {
    setBusy(t.id);
    setError("");
    const res = await uploadTemplateFile(f, kind);
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "อัปโหลดไม่สำเร็จ");
    if (kind === "preview") return patch(t.id, { previewUrl: res.url });
    patch(t.id, {
      fileUrl: res.url,
      fileName: res.name,
      fileSize: res.size,
      // ยังไม่ได้พิมพ์คำแนะนำ → เติมชื่อไฟล์ให้เลย (แก้ทับได้) ไม่ต้องพิมพ์ซ้ำ
      ...(t.note?.trim() ? {} : { note: res.name }),
      // ยังไม่ได้ตั้งชื่อเทมเพลต → ใช้ชื่อไฟล์ (ตัดนามสกุล) เป็นตัวตั้งต้นให้
      ...(t.name.trim() ? {} : { name: (res.name ?? "").replace(/\.[^.]+$/, "") }),
    });
  }

  function add() {
    const t: Draft = { id: newId(), name: "", sort: list.length, _dirty: true };
    setList((cur) => [...cur, t]);
  }

  /** ลากสลับลำดับ แล้วบันทึกลำดับใหม่ทุกอันที่ขยับ */
  async function drop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragAt(null);
    if (from === null || from === to) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const renumbered = next.map((t, i) => ({ ...t, sort: i }));
    setList(renumbered);
    for (const t of renumbered) {
      const { _dirty, ...clean } = t;
      void _dirty;
      await persistTemplate(clean);
    }
  }

  const shown = query.trim()
    ? list.filter((t) => (t.name + " " + (t.note ?? "")).toLowerCase().includes(query.trim().toLowerCase()))
    : list;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📐 คลังเทมเพลตไฟล์งาน</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            อัปไฟล์ <strong>.ai</strong> (หรือ PDF/EPS/SVG/PSD/ZIP) ไว้ที่นี่ครั้งเดียว แล้วติ๊กเลือกไปใช้กับสินค้ากี่ตัวก็ได้ —
            ลูกค้ากดโหลดได้จากหน้าสินค้าโดยไม่ต้องล็อกอิน · แก้ไฟล์ที่นี่ที่เดียว สินค้าทุกตัวอัปเดตตาม
          </p>
        </div>
        <button type="button" onClick={add} className={btnPrimary}>
          ＋ เพิ่มเทมเพลต
        </button>
      </div>

      {!isSupabaseConfigured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
          ⚠️ ยังไม่ได้ตั้งค่าฐานข้อมูล — ตอนนี้เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น (อัปไฟล์จริงไม่ได้ ใช้ลิงก์แทนได้)
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {list.length > 3 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 ค้นหาเทมเพลต…"
          className={`${input} mt-4`}
        />
      )}

      {loading ? (
        <p className={`mt-6 text-sm ${faint}`}>กำลังโหลด…</p>
      ) : list.length === 0 ? (
        <div className={`mt-6 ${card} p-8 text-center`}>
          <p className="text-4xl">📐</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">ยังไม่มีเทมเพลตในคลัง</p>
          <p className={`mt-1 text-xs ${muted}`}>
            กด &ldquo;＋ เพิ่มเทมเพลต&rdquo; แล้วอัปไฟล์ .ai ของงานแต่ละแบบเข้ามาได้เลย
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((t, i) => {
            const used = usedBy[t.id] ?? [];
            const href = templateHref(t);
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => {
                  dragFrom.current = i;
                  setDragAt(i);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(i)}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragAt(null);
                }}
                className={`${card} p-4 transition ${dragAt === i ? "opacity-40" : ""} ${
                  t.hidden ? "bg-slate-50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-2 cursor-grab select-none text-slate-300" title="ลากเพื่อจัดลำดับ">
                    ⋮⋮
                  </span>
                  {t.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.previewUrl}
                      alt={`ตัวอย่าง ${t.name}`}
                      className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-2xl ring-1 ring-slate-200">
                      📐
                    </span>
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={t.name}
                      onChange={(e) => patch(t.id, { name: e.target.value })}
                      placeholder="ชื่อเทมเพลต เช่น พวงกุญแจอะคริลิค 5×5 ซม."
                      className={`${input} font-semibold`}
                    />
                    <input
                      value={t.note ?? ""}
                      onChange={(e) => patch(t.id, { note: e.target.value })}
                      placeholder="คำแนะนำสั้น ๆ (อัปไฟล์แล้วเติมชื่อไฟล์ให้อัตโนมัติ · แก้ทับได้)"
                      className={`${input} text-xs`}
                    />

                    {/* ไฟล์เทมเพลต */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                      <span className="text-xs font-semibold text-slate-600">📎 ไฟล์เทมเพลต</span>
                      {t.fileUrl ? (
                        <>
                          <a
                            href={t.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[16rem] truncate text-xs font-bold text-sky-700 underline underline-offset-2"
                          >
                            {t.fileName ?? "ไฟล์ที่อัปไว้"}
                          </a>
                          {!!t.fileSize && <span className={`text-[11px] ${faint}`}>{formatFileSize(t.fileSize)}</span>}
                          <button
                            type="button"
                            onClick={() => patch(t.id, { fileUrl: undefined, fileName: undefined, fileSize: undefined })}
                            className={btnSmDanger}
                          >
                            เอาไฟล์ออก
                          </button>
                        </>
                      ) : (
                        <label className={`${btnSmNeutral} cursor-pointer`}>
                          ⬆️ อัปโหลดไฟล์
                          <input
                            type="file"
                            accept=".ai,.pdf,.eps,.svg,.psd,.zip"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void pickFile(t, "file", f);
                            }}
                          />
                        </label>
                      )}
                      {busy === t.id && <span className={`text-[11px] ${faint}`}>กำลังอัปโหลด…</span>}
                      <span className={`text-[11px] ${faint}`}>สูงสุด {TEMPLATE_MAX_MB}MB · ใหญ่กว่านี้ใช้ลิงก์</span>
                    </div>

                    {/* ลิงก์ภายนอก + รูปตัวอย่าง */}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={t.linkUrl ?? ""}
                        onChange={(e) => patch(t.id, { linkUrl: e.target.value.trim() || undefined })}
                        placeholder="🔗 หรือใส่ลิงก์ Google Drive (ไฟล์ใหญ่)"
                        className={`${input} text-xs`}
                      />
                      <div className="flex items-center gap-2">
                        <label className={`${btnSmNeutral} shrink-0 cursor-pointer`}>
                          🖼 รูปตัวอย่าง
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void pickFile(t, "preview", f);
                            }}
                          />
                        </label>
                        {t.previewUrl && (
                          <button type="button" onClick={() => patch(t.id, { previewUrl: undefined })} className={btnSmDanger}>
                            ลบรูป
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!href && (
                        <span className={`${badge} bg-amber-50 text-amber-700 ring-1 ring-amber-200`}>
                          ⚠️ ยังไม่มีไฟล์/ลิงก์ — หน้าสินค้าจะไม่โชว์
                        </span>
                      )}
                      {used.length > 0 ? (
                        <span className={`${badge} bg-slate-100 text-slate-600`} title={used.map((u) => u.name).join("\n")}>
                          ใช้อยู่ {used.length} สินค้า
                        </span>
                      ) : (
                        <span className={`${badge} bg-slate-50 text-slate-400`}>ยังไม่มีสินค้าผูกไว้</span>
                      )}
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!t.hidden}
                          onChange={(e) => patch(t.id, { hidden: e.target.checked || undefined })}
                          className="h-4 w-4 accent-slate-500"
                        />
                        ซ่อน (ไม่โชว์หน้าสินค้า)
                      </label>

                      <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={() => remove(t)} className={btnSmDanger}>
                          🗑 ลบ
                        </button>
                        <button
                          type="button"
                          onClick={() => save(t)}
                          disabled={saving === t.id || !t.name.trim()}
                          className={t._dirty ? btnPrimary : btnNeutral}
                        >
                          {saving === t.id ? "กำลังบันทึก…" : t._dirty ? "💾 บันทึก" : "บันทึกแล้ว"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className={`mt-6 text-xs ${faint}`}>
        เลือกเทมเพลตไปใช้กับสินค้าได้ที่ <Link href="/admin/products" className="underline">หน้าแก้ไขสินค้า</Link> →
        หัวข้อ <strong>📐 เทมเพลตไฟล์งาน</strong>
      </p>
    </div>
  );
}

export default function AdminTemplatesPage() {
  return (
    <RequirePerm perm="products.manage">
      <AdminTemplatesInner />
    </RequirePerm>
  );
}
