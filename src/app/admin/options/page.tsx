"use client";

import RequirePerm from "@/components/RequirePerm";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_PRESETS,
  slugifyPreset,
  type OptionPreset,
} from "@/lib/option-presets";
import { deletePreset, fetchPresets, persistPreset } from "@/lib/preset-repo";
import { resetPresetsLocal } from "@/lib/preset-store";
import { fetchProducts } from "@/lib/product-repo";
import { isSupabaseConfigured } from "@/lib/supabase";
import { badge, btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

type Draft = OptionPreset & { _saving?: boolean; _dirty?: boolean };

function AdminOptionsPageInner() {
  const [presets, setPresets] = useState<Draft[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const dragFrom = useRef<number | null>(null);
  /** คลังที่กำลังลากในลิสต์ซ้าย (ref อ่านได้ทันทีตอน drop · state ไว้ทำจาง) */
  const dragPreset = useRef<number | null>(null);
  const [dragPresetAt, setDragPresetAt] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    const [list, products] = await Promise.all([fetchPresets(), fetchProducts()]);
    setPresets(list.map((p) => ({ ...p })));
    setSelected(0);
    // นับว่าคลังแต่ละอันถูกใช้ (ลิงก์) กี่สินค้า
    const count: Record<string, number> = {};
    for (const prod of products)
      for (const o of prod.options ?? [])
        if (o.presetId) count[o.presetId] = (count[o.presetId] ?? 0) + 1;
    setUsage(count);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  function patch(i: number, next: Partial<Draft>) {
    setPresets((ps) => ps.map((p, j) => (j === i ? { ...p, ...next, _dirty: true } : p)));
  }

  /** ตัดช่องว่าง/ตัวเลือกที่ว่างออก ก่อนเขียนลงฐานข้อมูล */
  function cleanOf(p: Draft): OptionPreset {
    return {
      id: p.id,
      label: p.label.trim(),
      note: p.note?.trim() || undefined,
      choices: p.choices
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), ...(c.extra ? { extra: c.extra } : {}) })),
      ...(typeof p.sort === "number" ? { sort: p.sort } : {}),
      ...(p.hidden ? { hidden: true } : {}),
    };
  }

  /**
   * ลากสลับลำดับคลังในลิสต์ — บันทึกลำดับใหม่ทันที (ไม่ต้องกดบันทึกทีละอัน)
   * ข้ามอันที่ยังกรอกไม่ครบ (ไม่มีชื่อ/ไม่มีตัวเลือก) — เก็บลำดับไว้ในหน้าจอจนกว่าจะบันทึกเอง
   */
  async function movePreset(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= presets.length) return;
    const arr = [...presets];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    const next = arr.map((p, i) => ({ ...p, sort: i }));
    setPresets(next);
    // ให้คลังที่เลือกอยู่ยังเป็นอันเดิมหลังสลับที่
    const selId = presets[selected]?.id;
    const at = next.findIndex((p) => p.id === selId);
    if (at >= 0) setSelected(at);
    for (const p of next) {
      if (presets.find((x) => x.id === p.id)?.sort === p.sort) continue; // ลำดับไม่เปลี่ยน
      const clean = cleanOf(p);
      if (!clean.label || clean.choices.length === 0) continue;
      await persistPreset(clean);
    }
  }

  /** ปิด/เปิดใช้งานคลัง — ปิดแล้วจะไม่ขึ้นให้เลือกในเมนู "แทรกจากคลัง" ของสินค้า */
  async function toggleHidden(i: number) {
    const p = presets[i];
    const hidden = !p.hidden;
    setPresets((ps) => ps.map((x, j) => (j === i ? { ...x, hidden } : x)));
    const clean = cleanOf({ ...p, hidden });
    if (!clean.label || clean.choices.length === 0) return;
    const res = await persistPreset(clean);
    if (!res.ok) {
      setError(res.error ?? "บันทึกไม่สำเร็จ");
      setPresets((ps) => ps.map((x, j) => (j === i ? { ...x, hidden: p.hidden } : x)));
    }
  }

  async function save(i: number) {
    const p = presets[i];
    const clean: OptionPreset = cleanOf(p);
    if (!clean.label || clean.choices.length === 0) {
      setError("ต้องมีชื่อคลังและตัวเลือกอย่างน้อย 1 รายการ");
      return;
    }
    setError("");
    setPresets((ps) => ps.map((x, j) => (j === i ? { ...x, _saving: true } : x)));
    const res = await persistPreset(clean);
    if (!res.ok) {
      setError(res.error ?? "บันทึกไม่สำเร็จ");
      setPresets((ps) => ps.map((x, j) => (j === i ? { ...x, _saving: false } : x)));
      return;
    }
    setPresets((ps) => ps.map((x, j) => (j === i ? { ...x, _saving: false, _dirty: false } : x)));
  }

  async function remove(i: number) {
    const p = presets[i];
    if (usage[p.id] > 0) {
      setError(
        `ลบไม่ได้ — คลัง “${p.label}” ถูกใช้อยู่ ${usage[p.id]} สินค้า · ไปตัดลิงก์ที่สินค้าก่อน`
      );
      return;
    }
    if (!confirm(`ลบคลัง “${p.label}” ?`)) return;
    await deletePreset(p.id);
    refresh();
  }

  function addPreset() {
    const ids = new Set(presets.map((p) => p.id));
    let id = "preset";
    let n = 1;
    while (ids.has(id)) id = `preset-${++n}`;
    setPresets((ps) => [{ id, label: "", note: "", choices: [{ name: "" }], _dirty: true }, ...ps]);
    setSelected(0);
    setError("");
  }

  function handleReset() {
    if (!confirm("คืนคลังกลับเป็นค่าตั้งต้น? (เฉพาะโหมดเดโม)")) return;
    resetPresetsLocal();
    refresh();
  }

  // จัดลำดับตัวเลือกด้วยการลาก (ลำดับมีผลกับหน้าร้าน — ตัวแรก = ค่าเริ่มต้น)
  function reorderChoice(i: number, to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    setPresets((ps) =>
      ps.map((p, j) => {
        if (j !== i) return p;
        const arr = [...p.choices];
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return { ...p, choices: arr, _dirty: true };
      })
    );
  }

  const existingIds = useMemo(() => new Set(presets.map((p) => p.id)), [presets]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets.map((p, i) => ({ p, i })).filter(({ p }) => !q || p.label.toLowerCase().includes(q));
  }, [presets, query]);

  const sel = presets[selected] as Draft | undefined;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>
            คลังตัวเลือก <span className="font-medium text-slate-400">({presets.length})</span>
          </h1>
          <p className={`mt-1 ${muted}`}>
            กลุ่มตัวเลือกที่ใช้ซ้ำได้ เช่น ชนิดกระดาษ เคลือบ — แก้ที่นี่ที่เดียว สินค้าที่ “ลิงก์” จะอัปเดตตามทันที
          </p>
        </div>
        <div className="flex gap-2">
          {!isSupabaseConfigured && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              ↩ คืนค่าตั้งต้น
            </button>
          )}
          <button type="button" onClick={addPreset} className={btnPrimary}>
            ＋ คลังใหม่
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className={`mt-5 p-10 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>
      ) : presets.length === 0 ? (
        <div className={`mt-5 p-10 text-center text-sm ${muted} ${card}`}>
          ยังไม่มีคลัง — กด “＋ คลังใหม่” หรือ{" "}
          <button
            type="button"
            onClick={() => {
              setPresets(DEFAULT_PRESETS.map((p) => ({ ...p, _dirty: true })));
              setSelected(0);
            }}
            className="font-semibold text-amber-600 underline"
          >
            โหลดคลังตั้งต้น
          </button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {/* ── ซ้าย: รายการคลัง ── */}
          <div className={`overflow-hidden ${card}`}>
            <div className="border-b border-slate-100 p-2">
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาคลัง…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                />
              </div>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {filtered.map(({ p, i }) => {
                const used = usage[p.id] ?? 0;
                const active = i === selected;
                const canDrag = !query; // กำลังค้นหา = ลำดับที่เห็นไม่ตรงกับลำดับจริง จึงลากไม่ได้
                return (
                  <li
                    key={i}
                    draggable={canDrag}
                    onDragStart={() => {
                      dragPreset.current = i;
                      setDragPresetAt(i);
                    }}
                    onDragEnd={() => {
                      dragPreset.current = null;
                      setDragPresetAt(null);
                    }}
                    onDragOver={(e) => {
                      if (dragPreset.current !== null) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragPreset.current;
                      dragPreset.current = null;
                      setDragPresetAt(null);
                      if (from !== null) void movePreset(from, i);
                    }}
                    className={`group relative flex items-stretch border-b border-slate-100 transition ${
                      active ? "border-l-2 border-l-amber-500 bg-amber-50" : "hover:bg-slate-50"
                    } ${dragPresetAt === i ? "opacity-40" : ""}`}
                  >
                    {canDrag && (
                      <span
                        className="grid w-5 shrink-0 cursor-grab place-items-center text-slate-300 active:cursor-grabbing"
                        title="ลากเพื่อสลับลำดับ"
                        aria-hidden
                      >
                        ⠿
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-1 py-2.5 pl-1 pr-1 text-left"
                    >
                      <span className="flex w-full items-center gap-1.5 text-sm font-semibold text-slate-800">
                        <span className={`truncate ${p.hidden ? "text-slate-400 line-through" : ""}`}>
                          {p.label || "(ยังไม่ตั้งชื่อ)"}
                        </span>
                        {p._dirty && <span className="ml-auto shrink-0 text-[10px] text-amber-600">● ยังไม่บันทึก</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                        {p.choices.length} ตัวเลือก
                        {used > 0 && <span className={`${badge} bg-emerald-50 text-emerald-700`}>ใช้ {used}</span>}
                        {p.hidden && <span className={`${badge} bg-slate-100 text-slate-500`}>ปิดอยู่</span>}
                      </span>
                    </button>
                    {/* ปุ่มปิดใช้งาน / ลบ — โผล่ตอนชี้เมาส์ (ปิด = ยังอยู่ในระบบ แต่ไม่ให้แทรกเข้าสินค้าใหม่) */}
                    <span className="flex shrink-0 items-center gap-0.5 pr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => void toggleHidden(i)}
                        title={p.hidden ? "เปิดใช้งานคลังนี้" : "ปิดใช้งาน — ซ่อนจากเมนูแทรกในสินค้า (ของเดิมไม่กระทบ)"}
                        aria-label={p.hidden ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        className="rounded-md px-1.5 py-1 text-xs text-slate-400 transition hover:bg-white hover:text-slate-700"
                      >
                        {p.hidden ? "🚫" : "👁"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(i)}
                        title={used > 0 ? `ลบไม่ได้ — ใช้อยู่ ${used} สินค้า` : "ลบคลังนี้"}
                        aria-label="ลบคลัง"
                        className="rounded-md px-1.5 py-1 text-xs text-rose-300 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        🗑
                      </button>
                    </span>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-slate-400">ไม่พบคลังที่ตรงกับ “{query}”</li>
              )}
            </ul>
            <button
              type="button"
              onClick={addPreset}
              className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-amber-600 transition hover:bg-amber-50"
            >
              ＋ เพิ่มคลังใหม่
            </button>
          </div>

          {/* ── ขวา: แก้ไขคลังที่เลือก ── */}
          {sel && (
            <div className={`p-4 ${card}`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-400">ชื่อคลัง</span>
                  <input
                    value={sel.label}
                    onChange={(e) =>
                      patch(selected, {
                        label: e.target.value,
                        ...((usage[sel.id] ?? 0) === 0 && sel.id.startsWith("preset")
                          ? { id: uniqueId(slugifyPreset(e.target.value) || "preset", existingIds, sel.id) }
                          : {}),
                      })
                    }
                    placeholder="ชื่อคลัง เช่น ชนิดกระดาษ"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-400">id</span>
                  <div className="mt-1 flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                    <code className="truncate text-[11px] text-slate-500">{sel.id}</code>
                  </div>
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-[11px] font-semibold text-slate-400">คำอธิบาย (ไม่บังคับ)</span>
                <input
                  value={sel.note ?? ""}
                  onChange={(e) => patch(selected, { note: e.target.value })}
                  placeholder="เช่น กระดาษมาตรฐานงานโปสการ์ด"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 outline-none focus:border-amber-400"
                />
              </label>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">
                  ตัวเลือก <span className="text-slate-400">{sel.choices.length}</span>
                </p>
                {(usage[sel.id] ?? 0) > 0 ? (
                  <span className={`${badge} bg-emerald-50 text-emerald-700`}>🔗 ลิงก์อยู่ {usage[sel.id]} สินค้า</span>
                ) : (
                  <span className="text-[11px] text-slate-300">ยังไม่มีสินค้าลิงก์</span>
                )}
              </div>
              <p className={`mb-2 text-[11px] ${faint}`}>ลากปุ่ม ⠿ เพื่อเรียงลำดับ · ตัวแรก = ค่าเริ่มต้นบนหน้าร้าน</p>

              <div className="space-y-1.5">
                {sel.choices.map((c, ci) => (
                  <div
                    key={ci}
                    draggable
                    onDragStart={() => {
                      dragFrom.current = ci;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => reorderChoice(selected, ci)}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                  >
                    <span className="cursor-grab select-none text-slate-300" title="ลากเพื่อเรียง">⠿</span>
                    <span className="w-4 shrink-0 text-center text-xs text-slate-300">{ci + 1}</span>
                    <input
                      value={c.name}
                      onChange={(e) =>
                        patch(selected, {
                          choices: sel.choices.map((x, j) => (j === ci ? { ...x, name: e.target.value } : x)),
                        })
                      }
                      placeholder="ชื่อตัวเลือก เช่น เคลือบด้าน"
                      className="flex-1 rounded-md border border-transparent bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                    />
                    {/* บวกเพิ่มต่อหน่วยเมื่อเลือกตัวนี้ — มีผลกับทุกสินค้าที่ลิงก์คลังนี้ */}
                    <label
                      className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-400"
                      title="บวกเพิ่มต่อหน่วยเมื่อลูกค้าเลือกตัวเลือกนี้ (มีผลทุกสินค้าที่ลิงก์คลังนี้ · กลุ่มที่เป็นคอลัมน์ตารางราคาใช้ราคาในตารางแทน)"
                    >
                      +฿
                      <input
                        value={c.extra ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const n = Number(raw);
                          patch(selected, {
                            choices: sel.choices.map((x, j) =>
                              j === ci
                                ? { ...x, extra: raw === "" ? undefined : Number.isFinite(n) && n >= 0 ? n : x.extra }
                                : x
                            ),
                          });
                        }}
                        inputMode="numeric"
                        placeholder="0"
                        className="w-14 rounded-md border border-transparent bg-slate-50 px-2 py-1.5 text-center text-xs text-slate-700 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-100"
                        aria-label={`ราคาบวกเพิ่มของตัวเลือกที่ ${ci + 1}`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => patch(selected, { choices: sel.choices.filter((_, j) => j !== ci) })}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50"
                      aria-label="ลบตัวเลือก"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch(selected, { choices: [...sel.choices, { name: "" }] })}
                  className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
                >
                  ＋ เพิ่มตัวเลือก
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => remove(selected)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                >
                  🗑 ลบคลัง
                </button>
                <button
                  type="button"
                  onClick={() => save(selected)}
                  disabled={sel._saving || !sel._dirty}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  {sel._saving ? "กำลังบันทึก…" : sel._dirty ? "💾 บันทึก" : "✓ บันทึกแล้ว"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className={`mt-6 text-center text-xs ${faint}`}>
        อยากผูกคลังกับสินค้า? เปิด{" "}
        <Link href="/admin/products" className="font-semibold text-amber-600 hover:underline">
          หน้าสินค้า
        </Link>{" "}
        → แก้ไข → ส่วน “ตัวเลือกสินค้า” → “แทรกจากคลัง”
      </p>
    </div>
  );
}

function uniqueId(base: string, taken: Set<string>, self: string): string {
  if (!taken.has(base) || base === self) return base;
  let n = 1;
  let id = `${base}-${++n}`;
  while (taken.has(id) && id !== self) id = `${base}-${++n}`;
  return id;
}

/** กันคนที่ไม่มีสิทธิ์พิมพ์ URL เข้าตรง ๆ */
export default function AdminOptionsPage() {
  return (
    <RequirePerm perm="presets.manage">
      <AdminOptionsPageInner />
    </RequirePerm>
  );
}
