"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import {
  fileHref,
  fileReady,
  formatFileSize,
  guessChoice,
  normalizeTemplate,
  TEMPLATE_MAX_MB,
  type DesignTemplate,
  type TemplateFile,
} from "@/lib/design-templates";
import { deleteTemplate, fetchTemplates, persistTemplate, uploadTemplateFile } from "@/lib/template-repo";
import { fetchOptionGroups, fetchProductNamesLite } from "@/lib/product-repo";
import { isSupabaseConfigured } from "@/lib/supabase";
import { badge, btnNeutral, btnPrimary, btnSmDanger, btnSmNeutral, card, faint, h1, muted } from "@/lib/admin-ui";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-slate-100";
const inputSm =
  "rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-amber-400 focus:outline-none";

type Draft = DesignTemplate & { _dirty?: boolean };

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

function AdminTemplatesInner() {
  const [list, setList] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  /** เทมเพลตที่กำลังอัปโหลดอยู่ → "3 ไฟล์" ฯลฯ */
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  /** การ์ดที่กางอยู่ (คลังไฟล์เยอะ — ค่าเริ่มต้นยุบหมด เห็นภาพรวมก่อน) */
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [usedBy, setUsedBy] = useState<Record<string, { id: string; name: string }[]>>({});
  /** กลุ่มตัวเลือกทั้งร้าน (โหลดครั้งเดียวตอนต้องใช้) — ไว้ผูกไฟล์กับรุ่น/ขนาด */
  const [groups, setGroups] = useState<{ label: string; choices: string[] }[] | null>(null);
  const [groupsBusy, setGroupsBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragAt, setDragAt] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    const [tpls, products] = await Promise.all([fetchTemplates(), fetchProductNamesLite()]);
    setList(tpls.map((t) => ({ ...normalizeTemplate(t) })));
    const by: Record<string, { id: string; name: string }[]> = {};
    for (const p of products)
      for (const id of p.templateIds ?? []) (by[id] ??= []).push({ id: p.id, name: p.name });
    setUsedBy(by);
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  /** โหลดรายชื่อกลุ่มตัวเลือกเมื่อเริ่มใช้จริง (ดึงตัวเลือกของสินค้าทั้งร้าน — หนักกว่าปกติ) */
  async function ensureGroups() {
    if (groups || groupsBusy) return;
    setGroupsBusy(true);
    setGroups(await fetchOptionGroups());
    setGroupsBusy(false);
  }

  function patch(id: string, p: Partial<Draft>) {
    setList((cur) => cur.map((t) => (t.id === id ? { ...t, ...p, _dirty: true } : t)));
  }
  function patchFile(tid: string, fid: string, p: Partial<TemplateFile>) {
    setList((cur) =>
      cur.map((t) =>
        t.id === tid ? { ...t, files: (t.files ?? []).map((f) => (f.id === fid ? { ...f, ...p } : f)), _dirty: true } : t
      )
    );
  }

  async function save(t: Draft) {
    setSaving(t.id);
    setError("");
    const { _dirty, fileUrl, fileName, fileSize, linkUrl, ...clean } = t;
    void _dirty;
    void fileUrl;
    void fileName;
    void fileSize;
    void linkUrl; // ฟิลด์รุ่นเก่า — แปลงเข้า files[] แล้ว ไม่ต้องเก็บซ้ำ
    const res = await persistTemplate(clean);
    setSaving(null);
    if (!res.ok) return setError(res.error ?? "บันทึกไม่สำเร็จ");
    setList((cur) => cur.map((x) => (x.id === t.id ? { ...x, _dirty: false } : x)));
  }

  async function remove(t: Draft) {
    const used = usedBy[t.id] ?? [];
    const warn = used.length
      ? `\n\n⚠️ มี ${used.length} สินค้าผูกชุดนี้อยู่ (${used.slice(0, 3).map((u) => u.name).join(", ")}${used.length > 3 ? " …" : ""})`
      : "";
    if (!confirm(`ลบชุดเทมเพลต “${t.name}” และไฟล์ทั้งหมดในชุด?${warn}`)) return;
    const res = await deleteTemplate(t.id);
    if (!res.ok) return setError(res.error ?? "ลบไม่สำเร็จ");
    setList((cur) => cur.filter((x) => x.id !== t.id));
  }

  /** อัปหลายไฟล์รวดเดียว (ลากวาง/เลือกหลายไฟล์) — เดารุ่นจากชื่อไฟล์ให้ด้วย */
  async function addFiles(t: Draft, files: File[]) {
    if (!files.length) return;
    setError("");
    const label = t.optionLabel?.trim();
    const choices = label ? (groups ?? []).find((g) => g.label === label)?.choices ?? [] : [];
    const added: TemplateFile[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy((b) => ({ ...b, [t.id]: `${i + 1}/${files.length}` }));
      const res = await uploadTemplateFile(files[i], "file");
      if (!res.ok) {
        setError(`${files[i].name}: ${res.error ?? "อัปโหลดไม่สำเร็จ"}`);
        continue;
      }
      added.push({
        id: rid("f"),
        fileUrl: res.url,
        fileName: res.name,
        fileSize: res.size,
        ...(choices.length ? { choice: guessChoice(res.name ?? "", choices) || undefined } : {}),
      });
    }
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
    if (!added.length) return;
    setList((cur) =>
      cur.map((x) =>
        x.id === t.id
          ? {
              ...x,
              files: [...(x.files ?? []), ...added],
              // ชุดยังไม่มีชื่อ → ใช้ชื่อไฟล์แรกตั้งให้
              ...(x.name.trim() ? {} : { name: (added[0].fileName ?? "").replace(/\.[^.]+$/, "") }),
              _dirty: true,
            }
          : x
      )
    );
    setOpen((o) => ({ ...o, [t.id]: true }));
  }

  async function pickPreview(t: Draft, f: File) {
    setBusy((b) => ({ ...b, [t.id]: "รูป" }));
    const res = await uploadTemplateFile(f, "preview");
    setBusy((b) => {
      const n = { ...b };
      delete n[t.id];
      return n;
    });
    if (!res.ok) return setError(res.error ?? "อัปโหลดรูปไม่สำเร็จ");
    patch(t.id, { previewUrl: res.url });
  }

  function add() {
    const t: Draft = { id: rid("tpl"), name: "", files: [], sort: list.length, _dirty: true };
    setList((cur) => [...cur, t]);
    setOpen((o) => ({ ...o, [t.id]: true }));
    void ensureGroups();
  }

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

  const q = query.trim().toLowerCase();
  const shown = q
    ? list.filter((t) =>
        (t.name + " " + (t.note ?? "") + " " + (t.files ?? []).map((f) => `${f.fileName ?? ""} ${f.choice ?? ""}`).join(" "))
          .toLowerCase()
          .includes(q)
      )
    : list;
  const totalFiles = list.reduce((n, t) => n + (t.files?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📐 คลังเทมเพลตไฟล์งาน</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            <strong>ลากไฟล์ .ai มาวางได้เลย</strong> (ทีละหลายไฟล์) — 1 ชุดมีหลายไฟล์ได้
            แล้วผูกแต่ละไฟล์กับ<strong>ตัวเลือกสินค้า</strong> เช่น เคสมือถือ ผูกไฟล์กับ &ldquo;รุ่น&rdquo; ·
            ลูกค้าเลือกรุ่นไหน ก็เห็นไฟล์ของรุ่นนั้น
          </p>
        </div>
        <button type="button" onClick={add} className={btnPrimary}>
          ＋ เพิ่มชุดเทมเพลต
        </button>
      </div>

      {!isSupabaseConfigured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
          ⚠️ ยังไม่ได้ตั้งค่าฐานข้อมูล — ตอนนี้เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น (อัปไฟล์จริงไม่ได้ ใช้ลิงก์แทนได้)
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="shrink-0 text-rose-400 hover:text-rose-600">
            ✕
          </button>
        </p>
      )}

      {list.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 ค้นหาชื่อชุด · ชื่อไฟล์ · รุ่น…"
            className={`${input} flex-1 sm:max-w-sm`}
          />
          <span className={`text-xs ${faint}`}>
            {list.length} ชุด · {totalFiles} ไฟล์
            {q ? ` · ตรงคำค้น ${shown.length} ชุด` : ""}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(Object.fromEntries(list.map((t) => [t.id, true])))}
              className={btnSmNeutral}
            >
              กางทั้งหมด
            </button>
            <button type="button" onClick={() => setOpen({})} className={btnSmNeutral}>
              ยุบทั้งหมด
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className={`mt-6 text-sm ${faint}`}>กำลังโหลด…</p>
      ) : list.length === 0 ? (
        <div className={`mt-6 ${card} p-8 text-center`}>
          <p className="text-4xl">📐</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">ยังไม่มีเทมเพลตในคลัง</p>
          <p className={`mt-1 text-xs ${muted}`}>กด &ldquo;＋ เพิ่มชุดเทมเพลต&rdquo; แล้วลากไฟล์ .ai มาวางได้เลย</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {shown.map((t, i) => {
            const used = usedBy[t.id] ?? [];
            const files = t.files ?? [];
            const label = t.optionLabel?.trim();
            const groupChoices = label ? (groups ?? []).find((g) => g.label === label)?.choices ?? [] : [];
            const expanded = !!open[t.id];
            const missing = files.filter((f) => !fileReady(f)).length;
            const uploading = busy[t.id];
            return (
              <div
                key={t.id}
                draggable={!expanded}
                onDragStart={() => {
                  dragFrom.current = i;
                  setDragAt(i);
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragAt(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.types.includes("Files")) setDropOn(t.id);
                }}
                onDragLeave={() => setDropOn((c) => (c === t.id ? null : c))}
                onDrop={(e) => {
                  const dropped = [...(e.dataTransfer.files ?? [])];
                  if (dropped.length) {
                    e.preventDefault();
                    setDropOn(null);
                    void addFiles(t, dropped);
                  } else {
                    void drop(i);
                  }
                }}
                className={`${card} transition ${dragAt === i ? "opacity-40" : ""} ${
                  dropOn === t.id ? "ring-2 ring-sky-400 ring-offset-1" : ""
                } ${t.hidden ? "bg-slate-50" : ""}`}
              >
                {/* ── หัวการ์ด: อ่านภาพรวมได้โดยไม่ต้องกาง ── */}
                <div className="flex items-center gap-3 p-3">
                  {!expanded && (
                    <span className="cursor-grab select-none text-slate-300" title="ลากเพื่อจัดลำดับ">
                      ⋮⋮
                    </span>
                  )}
                  {t.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">📐</span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void ensureGroups(); // กางการ์ด = กำลังจะแก้ → เตรียมรายชื่อกลุ่มตัวเลือกไว้เลย
                      setOpen((o) => ({ ...o, [t.id]: !o[t.id] }));
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-bold text-slate-800">
                      {t.name.trim() || <span className="text-slate-400">(ยังไม่ตั้งชื่อ)</span>}
                    </span>
                    <span className={`block truncate text-[11px] ${faint}`}>
                      {files.length} ไฟล์
                      {label ? ` · แยกตาม “${label}”` : ""}
                      {used.length ? ` · ใช้ใน ${used.length} สินค้า` : " · ยังไม่มีสินค้าผูกไว้"}
                      {t.hidden ? " · 🚫 ซ่อน" : ""}
                    </span>
                  </button>
                  {uploading && (
                    <span className={`${badge} bg-sky-50 text-sky-700 ring-1 ring-sky-200`}>⬆️ {uploading}</span>
                  )}
                  {missing > 0 && (
                    <span className={`${badge} bg-amber-50 text-amber-700 ring-1 ring-amber-200`}>⚠️ {missing} ไฟล์ว่าง</span>
                  )}
                  {t._dirty && <span className={`${badge} bg-amber-100 text-amber-800`}>ยังไม่บันทึก</span>}
                  <button
                    type="button"
                    onClick={() => {
                      void ensureGroups(); // กางการ์ด = กำลังจะแก้ → เตรียมรายชื่อกลุ่มตัวเลือกไว้เลย
                      setOpen((o) => ({ ...o, [t.id]: !o[t.id] }));
                    }}
                    className={`${btnSmNeutral} shrink-0`}
                  >
                    {expanded ? "▲ ยุบ" : "▼ แก้ไข"}
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 border-t border-slate-100 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={t.name}
                        onChange={(e) => patch(t.id, { name: e.target.value })}
                        placeholder="ชื่อชุด เช่น เทมเพลตเคสมือถือ (ทุกรุ่น)"
                        className={`${input} font-semibold`}
                      />
                      <input
                        value={t.note ?? ""}
                        onChange={(e) => patch(t.id, { note: e.target.value })}
                        placeholder="คำแนะนำสั้น ๆ เช่น โหมดสี CMYK · create outline"
                        className={input}
                      />
                    </div>

                    {/* ── ผูกไฟล์กับตัวเลือกสินค้า ── */}
                    <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">🎛️ แยกไฟล์ตามตัวเลือก</span>
                        <select
                          value={label ?? ""}
                          onFocus={ensureGroups}
                          onChange={(e) => patch(t.id, { optionLabel: e.target.value || undefined })}
                          className={inputSm}
                        >
                          <option value="">— ไม่แยก (โชว์ทุกไฟล์) —</option>
                          {label && !(groups ?? []).some((g) => g.label === label) && (
                            <option value={label}>{label}</option>
                          )}
                          {(groups ?? []).map((g) => (
                            <option key={g.label} value={g.label}>
                              {g.label} ({g.choices.length})
                            </option>
                          ))}
                        </select>
                        {groupsBusy && <span className={`text-[11px] ${faint}`}>กำลังโหลดกลุ่มตัวเลือก…</span>}
                        <span className={`text-[11px] ${faint}`}>
                          เช่น เลือก &ldquo;รุ่น&rdquo; แล้วกำหนดว่าไฟล์ไหนของรุ่นไหน — ลูกค้าเลือกรุ่นแล้วเห็นไฟล์ของรุ่นนั้น
                        </span>
                      </div>
                    </div>

                    {/* ── กล่องลากวาง ── */}
                    <label
                      className={`flex cursor-pointer flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center text-xs transition ${
                        dropOn === t.id
                          ? "border-sky-400 bg-sky-50 text-sky-700"
                          : "border-slate-300 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50/40"
                      }`}
                    >
                      <span className="text-lg">⬆️</span>
                      <span>
                        <strong>ลากไฟล์มาวางตรงนี้</strong> หรือกดเพื่อเลือก · เลือกได้ทีละหลายไฟล์ ·
                        <span className={faint}> .ai .pdf .eps .svg .psd .zip · สูงสุด {TEMPLATE_MAX_MB}MB/ไฟล์</span>
                      </span>
                      <input
                        type="file"
                        multiple
                        accept=".ai,.pdf,.eps,.svg,.psd,.zip"
                        className="hidden"
                        onChange={(e) => {
                          const fs = [...(e.target.files ?? [])];
                          e.target.value = "";
                          void addFiles(t, fs);
                        }}
                      />
                    </label>

                    {/* ── ตารางไฟล์ (แถวกระชับ เลื่อนได้เมื่อไฟล์เยอะ) ── */}
                    {files.length > 0 && (
                      <div className="max-h-[26rem] space-y-1 overflow-y-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
                        {files.map((f, fi) => (
                          <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <span className={`w-6 shrink-0 text-right text-[11px] ${faint}`}>{fi + 1}</span>
                            {label ? (
                              <select
                                value={f.choice ?? ""}
                                onFocus={ensureGroups}
                                onChange={(e) => patchFile(t.id, f.id, { choice: e.target.value || undefined })}
                                className={`${inputSm} w-44 shrink-0 ${f.choice ? "" : "text-slate-400"}`}
                                aria-label={`${label} ของไฟล์ที่ ${fi + 1}`}
                              >
                                <option value="">— ทุกตัวเลือก —</option>
                                {f.choice && !groupChoices.includes(f.choice) && <option value={f.choice}>{f.choice}</option>}
                                {groupChoices.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {f.fileUrl ? (
                              <a
                                href={fileHref(f)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 truncate text-xs font-semibold text-sky-700 underline underline-offset-2"
                              >
                                {f.fileName ?? "ไฟล์"}
                              </a>
                            ) : (
                              <input
                                value={f.linkUrl ?? ""}
                                onChange={(e) => patchFile(t.id, f.id, { linkUrl: e.target.value.trim() || undefined })}
                                placeholder="🔗 วางลิงก์ Google Drive (ไฟล์ใหญ่เกิน 50MB)"
                                className={`${inputSm} min-w-0 flex-1`}
                              />
                            )}
                            <span className={`shrink-0 text-[11px] ${faint}`}>{formatFileSize(f.fileSize)}</span>
                            <button
                              type="button"
                              onClick={() =>
                                patch(t.id, { files: files.filter((x) => x.id !== f.id) })
                              }
                              className={`${btnSmDanger} shrink-0`}
                              title="เอาไฟล์นี้ออกจากชุด"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => patch(t.id, { files: [...files, { id: rid("f") }] })}
                        className={btnSmNeutral}
                      >
                        ＋ เพิ่มแถวลิงก์
                      </button>
                      <label className={`${btnSmNeutral} cursor-pointer`}>
                        🖼 รูปตัวอย่าง
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void pickPreview(t, f);
                          }}
                        />
                      </label>
                      {t.previewUrl && (
                        <button type="button" onClick={() => patch(t.id, { previewUrl: undefined })} className={btnSmDanger}>
                          ลบรูป
                        </button>
                      )}
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!t.hidden}
                          onChange={(e) => patch(t.id, { hidden: e.target.checked || undefined })}
                          className="h-4 w-4 accent-slate-500"
                        />
                        ซ่อนทั้งชุด
                      </label>
                      {used.length > 0 && (
                        <span className={`${badge} bg-slate-100 text-slate-600`} title={used.map((u) => u.name).join("\n")}>
                          ใช้ใน {used.length} สินค้า
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={() => remove(t)} className={btnSmDanger}>
                          🗑 ลบทั้งชุด
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
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className={`mt-6 text-xs ${faint}`}>
        ผูกชุดเทมเพลตกับสินค้าได้ที่ <Link href="/admin/products" className="underline">หน้าแก้ไขสินค้า</Link> →
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
