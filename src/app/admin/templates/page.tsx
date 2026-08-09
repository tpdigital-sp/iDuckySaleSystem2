"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import {
  fileHref,
  fileReady,
  formatFileSize,
  groupByCategory,
  guessChoice,
  NO_CATEGORY,
  normalizeTemplate,
  templateCategories,
  TEMPLATE_MAX_MB,
  type DesignTemplate,
  type TemplateFile,
} from "@/lib/design-templates";
import {
  deleteTemplate,
  fetchTemplateCategories,
  fetchTemplates,
  persistTemplate,
  persistTemplateCategories,
  uploadTemplateFile,
} from "@/lib/template-repo";
import { fetchProduct, fetchProductNamesLite } from "@/lib/product-repo";
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
  /** รายชื่อสินค้าทั้งร้าน (id + ชื่อ) — ให้เลือก "สินค้าอ้างอิง" ตอนผูกไฟล์กับตัวเลือก */
  const [productList, setProductList] = useState<{ id: string; name: string }[]>([]);
  /**
   * ตัวเลือกของ "สินค้าอ้างอิง" แต่ละตัว (โหลดทีละสินค้าเมื่อเลือก — เบากว่าดึงทั้งร้าน)
   * productId → [{ label, choices }]
   */
  const [prodOpts, setProdOpts] = useState<Record<string, { label: string; choices: string[] }[]>>({});
  const [optsBusy, setOptsBusy] = useState<string | null>(null);
  /** ชุดที่กำลังลากจัดลำดับ (เก็บเป็น id — ลิสต์ที่เห็นถูกกรอง/จัดกลุ่ม ใช้ index ไม่ได้) */
  const dragId = useRef<string | null>(null);
  const [dragAt, setDragAt] = useState<string | null>(null);
  /** ตัวกรองหมวด ("" = ทุกหมวด) */
  const [cat, setCat] = useState("");
  /** รายชื่อหมวดที่แอดมินตั้งไว้ (จัดลำดับเองได้ · หมวดว่างก็เก็บไว้ได้) */
  const [catList, setCatList] = useState<string[]>([]);
  const [catPanel, setCatPanel] = useState(false);
  const [newCat, setNewCat] = useState("");

  async function refresh() {
    setLoading(true);
    const [tpls, products, cats] = await Promise.all([
      fetchTemplates(),
      fetchProductNamesLite(),
      fetchTemplateCategories(),
    ]);
    setList(tpls.map((t) => ({ ...normalizeTemplate(t) })));
    setCatList(cats);
    const by: Record<string, { id: string; name: string }[]> = {};
    for (const p of products)
      for (const id of p.templateIds ?? []) (by[id] ??= []).push({ id: p.id, name: p.name });
    setUsedBy(by);
    setProductList(products.map((p) => ({ id: p.id, name: p.name })));
    setLoading(false);
  }
  useEffect(() => {
    void refresh();
  }, []);

  /** โหลดตัวเลือกของสินค้าอ้างอิงตัวหนึ่ง (ครั้งเดียวต่อสินค้า) */
  async function ensureProductOptions(pid: string) {
    if (!pid || prodOpts[pid] || optsBusy === pid) return;
    setOptsBusy(pid);
    const p = await fetchProduct(pid);
    const groups = (p?.options ?? [])
      .map((o) => ({
        label: o.label?.trim() ?? "",
        choices: (o.choices ?? []).map((c) => c.name?.trim()).filter((n): n is string => !!n),
      }))
      .filter((g) => g.label && g.choices.length);
    setProdOpts((cur) => ({ ...cur, [pid]: groups }));
    setOptsBusy(null);
  }
  /** โหลดตัวเลือกของสินค้าอ้างอิงที่ชุดต่าง ๆ ตั้งไว้แล้ว (ตอนกางการ์ด) */
  useEffect(() => {
    for (const t of list) if (t.optionProductId) void ensureProductOptions(t.optionProductId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  function patch(id: string, p: Partial<Draft>) {
    setList((cur) => cur.map((t) => (t.id === id ? { ...t, ...p, _dirty: true } : t)));
  }

  // ── จัดการหมวดหมู่ ──
  async function saveCats(next: string[]) {
    setCatList(next);
    const res = await persistTemplateCategories(next);
    if (!res.ok) setError(res.error ?? "บันทึกหมวดไม่สำเร็จ");
  }
  async function addCat() {
    const name = newCat.trim();
    if (!name) return;
    if (catList.includes(name)) return setError(`มีหมวด “${name}” อยู่แล้ว`);
    setNewCat("");
    await saveCats([...catList, name]);
  }
  /** เปลี่ยนชื่อหมวด — ต้องไล่อัปเดตทุกชุดที่ใช้ชื่อเดิมด้วย ไม่งั้นชุดจะหลุดไปกองรวม */
  async function renameCat(from: string) {
    const to = prompt(`เปลี่ยนชื่อหมวด “${from}” เป็น`, from)?.trim();
    if (!to || to === from) return;
    if (catList.includes(to)) return setError(`มีหมวด “${to}” อยู่แล้ว`);
    await saveCats(catList.map((c) => (c === from ? to : c)));
    const affected = list.filter((t) => t.category?.trim() === from);
    setList((cur) => cur.map((t) => (t.category?.trim() === from ? { ...t, category: to } : t)));
    for (const t of affected) {
      const { _dirty, ...clean } = t;
      void _dirty;
      await persistTemplate({ ...clean, category: to });
    }
  }
  async function removeCat(name: string) {
    const affected = list.filter((t) => t.category?.trim() === name);
    if (
      !confirm(
        affected.length
          ? `ลบหมวด “${name}”?\n\n${affected.length} ชุดที่อยู่ในหมวดนี้จะย้ายไป “${NO_CATEGORY}” (ไฟล์ไม่หาย)`
          : `ลบหมวด “${name}”?`
      )
    )
      return;
    await saveCats(catList.filter((c) => c !== name));
    if (affected.length) {
      setList((cur) => cur.map((t) => (t.category?.trim() === name ? { ...t, category: undefined } : t)));
      for (const t of affected) {
        const { _dirty, ...clean } = t;
        void _dirty;
        await persistTemplate({ ...clean, category: undefined });
      }
    }
    if (cat === name) setCat("");
  }
  async function moveCat(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= catList.length) return;
    const next = [...catList];
    [next[i], next[j]] = [next[j], next[i]];
    await saveCats(next);
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
    const choices =
      label && t.optionProductId
        ? (prodOpts[t.optionProductId] ?? []).find((g) => g.label === label)?.choices ?? []
        : [];
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
  }

  /** วางชุดที่ลากไว้ลงตำแหน่งของชุดเป้าหมาย (อ้างด้วย id — ปลอดภัยแม้ลิสต์ถูกกรอง/จัดกลุ่ม) */
  async function dropOnTemplate(targetId: string) {
    const from = dragId.current;
    dragId.current = null;
    setDragAt(null);
    if (!from || from === targetId) return;
    const fi = list.findIndex((t) => t.id === from);
    const ti = list.findIndex((t) => t.id === targetId);
    if (fi < 0 || ti < 0) return;
    const next = [...list];
    const [moved] = next.splice(fi, 1);
    // ลากข้ามหมวด = ย้ายหมวดตามปลายทางไปด้วย (ตรงกับที่ตาเห็น)
    const targetCat = list[ti].category;
    next.splice(ti, 0, { ...moved, category: targetCat });
    const renumbered = next.map((t, i) => ({ ...t, sort: i }));
    setList(renumbered);
    for (const t of renumbered) {
      const { _dirty, ...clean } = t;
      void _dirty;
      await persistTemplate(clean);
    }
  }

  const q = query.trim().toLowerCase();
  const shown = list
    .filter((t) => !cat || (cat === NO_CATEGORY ? !t.category?.trim() : t.category?.trim() === cat))
    .filter(
      (t) =>
        !q ||
        (
          t.name +
          " " +
          (t.note ?? "") +
          " " +
          (t.category ?? "") +
          " " +
          (t.files ?? []).map((f) => `${f.fileName ?? ""} ${f.choice ?? ""}`).join(" ")
        )
          .toLowerCase()
          .includes(q)
    );
  const totalFiles = list.reduce((n, t) => n + (t.files?.length ?? 0), 0);
  /** หมวดที่ตั้งไว้ (ตามลำดับที่จัด) + หมวดที่ชุดใช้อยู่แต่ยังไม่ได้ตั้ง (ข้อมูลเก่า) ต่อท้าย */
  const cats = [...catList, ...templateCategories(list).filter((c) => !catList.includes(c))];
  const noCatCount = list.filter((t) => !t.category?.trim()).length;
  /** จัดกลุ่มตามหมวดเมื่อดูรวมทุกหมวด · เลือกหมวดเดียวอยู่แล้วไม่ต้องมีหัวกลุ่มซ้ำ */
  const catGroups = cat
    ? [{ category: cat, items: shown }]
    : groupByCategory(shown).sort((a, b) => {
        // เรียงตามลำดับหมวดที่แอดมินจัดไว้ · "ยังไม่จัดหมวด" ท้ายสุดเสมอ
        if (a.category === NO_CATEGORY) return 1;
        if (b.category === NO_CATEGORY) return -1;
        return cats.indexOf(a.category) - cats.indexOf(b.category);
      });

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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCatPanel((v) => !v)} className={btnNeutral}>
            🗂 ตั้งค่าหมวดหมู่{catList.length ? ` (${catList.length})` : ""}
          </button>
          <button type="button" onClick={add} className={btnPrimary}>
            ＋ เพิ่มชุดเทมเพลต
          </button>
        </div>
      </div>

      {/* ── ตั้งค่าหมวดหมู่: เพิ่ม / เปลี่ยนชื่อ / ลบ / จัดลำดับ ── */}
      {catPanel && (
        <div className={`mt-3 ${card} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">🗂 หมวดหมู่ของคลังเทมเพลต</p>
            <button type="button" onClick={() => setCatPanel(false)} className={btnSmNeutral}>
              ปิด
            </button>
          </div>
          <p className={`mt-1 text-xs ${muted}`}>
            ตั้งไว้ที่นี่แล้วในแต่ละชุดจะเลือกจากรายการนี้ได้เลย ไม่ต้องพิมพ์ซ้ำ ·
            เปลี่ยนชื่อหมวด ระบบไล่อัปเดตชุดที่ใช้อยู่ให้เอง · ลำดับที่จัดไว้ = ลำดับกลุ่มในหน้าคลัง
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCat();
                }
              }}
              placeholder="ชื่อหมวดใหม่ เช่น เคสมือถือ"
              className={`${input} max-w-xs`}
            />
            <button type="button" onClick={() => void addCat()} disabled={!newCat.trim()} className={btnPrimary}>
              ＋ เพิ่มหมวด
            </button>
          </div>

          {catList.length === 0 ? (
            <p className={`mt-3 rounded-xl bg-slate-50 p-3 text-center text-xs ${faint}`}>
              ยังไม่มีหมวด — เพิ่มหมวดแรกได้เลย
            </p>
          ) : (
            <ul className="mt-3 space-y-1">
              {catList.map((c, i) => {
                const n = list.filter((t) => t.category?.trim() === c).length;
                return (
                  <li key={c} className="flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-slate-100 hover:bg-slate-50">
                    <span className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => void moveCat(i, -1)}
                        disabled={i === 0}
                        className="h-3.5 text-[9px] leading-none text-slate-400 disabled:opacity-20"
                        aria-label={`เลื่อน ${c} ขึ้น`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveCat(i, 1)}
                        disabled={i === catList.length - 1}
                        className="h-3.5 text-[9px] leading-none text-slate-400 disabled:opacity-20"
                        aria-label={`เลื่อน ${c} ลง`}
                      >
                        ▼
                      </button>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">🗂 {c}</span>
                    <span className={`text-[11px] ${faint}`}>{n} ชุด</span>
                    <button type="button" onClick={() => void renameCat(c)} className={btnSmNeutral}>
                      ✏️ เปลี่ยนชื่อ
                    </button>
                    <button type="button" onClick={() => void removeCat(c)} className={btnSmDanger}>
                      🗑 ลบ
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

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
            placeholder="🔍 ค้นหาชื่อชุด · ชื่อไฟล์ · รุ่น · หมวด…"
            className={`${input} flex-1 sm:max-w-sm`}
          />
          <span className={`text-xs ${faint}`}>
            {list.length} ชุด · {totalFiles} ไฟล์
            {q || cat ? ` · ตรงเงื่อนไข ${shown.length} ชุด` : ""}
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

      {/* ── ตัวกรองหมวด — คลิกเพื่อดูเฉพาะหมวดนั้น ── */}
      {(cats.length > 0 || noCatCount > 0) && list.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCat("")}
            className={`${badge} ${cat === "" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
          >
            ทุกหมวด ({list.length})
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c === cat ? "" : c)}
              className={`${badge} ${c === cat ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              🗂 {c} ({list.filter((t) => t.category?.trim() === c).length})
            </button>
          ))}
          {noCatCount > 0 && (
            <button
              type="button"
              onClick={() => setCat(NO_CATEGORY === cat ? "" : NO_CATEGORY)}
              className={`${badge} ${cat === NO_CATEGORY ? "bg-slate-900 text-white" : "bg-white text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {NO_CATEGORY} ({noCatCount})
            </button>
          )}
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
        <div className="mt-3 space-y-4">
          {shown.length === 0 && (
            <p className={`${card} p-6 text-center text-sm ${faint}`}>ไม่มีชุดที่ตรงกับที่กรองไว้</p>
          )}
          {catGroups.map((grp) => (
        <div key={grp.category} className="space-y-2.5">
          {/* หัวกลุ่มหมวด — โผล่เฉพาะตอนดูรวมทุกหมวดและมีมากกว่า 1 กลุ่ม */}
          {!cat && catGroups.length > 1 && (
            <p className="flex items-center gap-2 pt-1 text-xs font-bold text-slate-500">
              <span className={grp.category === NO_CATEGORY ? "text-slate-400" : ""}>
                {grp.category === NO_CATEGORY ? "📂" : "🗂"} {grp.category}
              </span>
              <span className={`font-normal ${faint}`}>({grp.items.length})</span>
              <span className="h-px flex-1 bg-slate-200" />
            </p>
          )}
          {grp.items.map((t) => {
            const used = usedBy[t.id] ?? [];
            const files = t.files ?? [];
            const label = t.optionLabel?.trim();
            const prodGroups = t.optionProductId ? prodOpts[t.optionProductId] ?? [] : [];
            const groupChoices = label ? prodGroups.find((g) => g.label === label)?.choices ?? [] : [];
            const expanded = !!open[t.id];
            const missing = files.filter((f) => !fileReady(f)).length;
            const uploading = busy[t.id];
            return (
              <div
                key={t.id}
                draggable={!expanded}
                onDragStart={() => {
                  dragId.current = t.id;
                  setDragAt(t.id);
                }}
                onDragEnd={() => {
                  dragId.current = null;
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
                    void dropOnTemplate(t.id);
                  }
                }}
                className={`${card} transition ${dragAt === t.id ? "opacity-40" : ""} ${
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
                    {/* หมวดหมู่ — เลือกจากรายการที่ตั้งไว้ (เพิ่มหมวดใหม่ที่ปุ่ม 🗂 ตั้งค่าหมวดหมู่ ด้านบน) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600">🗂 หมวดหมู่</label>
                      <select
                        value={t.category?.trim() ?? ""}
                        onChange={(e) => patch(t.id, { category: e.target.value || undefined })}
                        className={`${inputSm} max-w-[16rem] py-2`}
                      >
                        <option value="">— {NO_CATEGORY} —</option>
                        {cats.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCatPanel(true)}
                        className={`${btnSmNeutral} shrink-0`}
                        title="เพิ่ม/แก้ชื่อ/ลบหมวด"
                      >
                        ⚙️ ตั้งค่าหมวด
                      </button>
                    </div>

                    {/* ── ผูกไฟล์กับตัวเลือกสินค้า: เลือกสินค้าก่อน → ค่อยเลือกกลุ่มตัวเลือกของสินค้านั้น ── */}
                    <div className="space-y-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">🎛️ แยกไฟล์ตามตัวเลือก</span>
                        <span className={`text-[11px] ${faint}`}>
                          เลือกสินค้าก่อน แล้วเลือกว่าจะแยกตามกลุ่มไหนของสินค้านั้น (เช่น เคสมือถือ → รุ่น)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">1️⃣ สินค้า</span>
                        <select
                          value={t.optionProductId ?? ""}
                          onChange={(e) => {
                            const pid = e.target.value;
                            void ensureProductOptions(pid);
                            // เปลี่ยนสินค้า = กลุ่มเดิมอาจไม่มีในสินค้าใหม่ → ล้างกลุ่มไว้ก่อน
                            patch(t.id, { optionProductId: pid || undefined, optionLabel: undefined });
                          }}
                          className={`${inputSm} max-w-[16rem]`}
                        >
                          <option value="">— เลือกสินค้า —</option>
                          {/* สินค้าที่ผูกชุดนี้อยู่แล้วขึ้นก่อน จะได้ไม่ต้องไล่หา */}
                          {used.length > 0 && (
                            <optgroup label="สินค้าที่ผูกชุดนี้อยู่">
                              {used.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="สินค้าทั้งหมด">
                            {productList.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        {optsBusy === t.optionProductId && (
                          <span className={`text-[11px] ${faint}`}>กำลังโหลดตัวเลือก…</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">2️⃣ กลุ่มตัวเลือก</span>
                        <select
                          value={label ?? ""}
                          disabled={!t.optionProductId}
                          onChange={(e) => patch(t.id, { optionLabel: e.target.value || undefined })}
                          className={`${inputSm} max-w-[16rem] disabled:bg-slate-100 disabled:text-slate-400`}
                        >
                          <option value="">— ไม่แยก (โชว์ทุกไฟล์) —</option>
                          {label && !prodGroups.some((g) => g.label === label) && (
                            <option value={label}>{label} (ไม่มีในสินค้านี้แล้ว)</option>
                          )}
                          {prodGroups.map((g) => (
                            <option key={g.label} value={g.label}>
                              {g.label} ({g.choices.length})
                            </option>
                          ))}
                        </select>
                        {!t.optionProductId && <span className={`text-[11px] ${faint}`}>← เลือกสินค้าก่อน</span>}
                        {t.optionProductId && prodGroups.length === 0 && optsBusy !== t.optionProductId && (
                          <span className="text-[11px] font-semibold text-amber-600">
                            สินค้านี้ยังไม่มีกลุ่มตัวเลือก
                          </span>
                        )}
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
          ))}
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
