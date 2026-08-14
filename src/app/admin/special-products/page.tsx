"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { faint, muted } from "@/lib/admin-ui";

interface SP {
  name: string;
  detail: string;
}

/** คลังสินค้าสั่งพิเศษ — แม่แบบชื่อ+สเปคให้พนักงานเลือกตอนกด "เพิ่มรายการพิเศษ" ในออเดอร์ */
function SpecialProductsInner() {
  const [list, setList] = useState<SP[] | null>(null);
  const [q, setQ] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/special-products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setList(j.list ?? []))
      .catch(() => setErr("โหลดคลังไม่สำเร็จ"));
  }, []);

  const patch = (i: number, p: Partial<SP>) => {
    setList((xs) => (xs ? xs.map((x, j) => (j === i ? { ...x, ...p } : x)) : xs));
    setDirty(true);
    setSaved(false);
  };
  const remove = (i: number) => {
    if (!confirm(`ลบ "${list?.[i]?.name}" ออกจากคลัง?`)) return;
    setList((xs) => (xs ? xs.filter((_, j) => j !== i) : xs));
    setOpenIdx(null);
    setDirty(true);
    setSaved(false);
  };
  const add = () => {
    setList((xs) => (xs ? [{ name: "", detail: "" }, ...xs] : xs));
    setOpenIdx(0);
    setQ("");
    setDirty(true);
    setSaved(false);
  };

  async function save() {
    if (!list) return;
    setSaving(true);
    setErr("");
    const res = await fetch("/api/admin/special-products", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ list: list.filter((p) => p.name.trim()) }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
    setList((xs) => (xs ? xs.filter((p) => p.name.trim()) : xs));
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const kw = q.trim().toLowerCase();
  const shown = (list ?? [])
    .map((p, i) => ({ ...p, i }))
    .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.detail.toLowerCase().includes(kw));

  const inp =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <div className="mx-auto max-w-5xl">
      {/* หัวหน้า — โทนแบรนด์ฟ้าอ่อน ฟอนต์หัวเรื่องเดียวกับหน้าร้าน (ชุดเดียวกับหน้า ตั้งค่าระบบ) */}
      <header className="rounded-[22px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-amber-50/40 px-5 py-4 shadow-[0_6px_18px_rgba(44,129,196,0.07)] sm:px-6 sm:py-5">
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-amber-100">🛠️</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">รูปแบบการสินค้าสั่งพิเศษ</h1>
            <p className="mt-0.5 text-[13px] text-slate-500">
              คลังแม่แบบงานสั่งทำ (นำเข้าจากระบบเดิม) — พนักงานเลือกใช้ตอนกด “เพิ่มรายการพิเศษ” ในออเดอร์
            </p>
          </div>
          {list && (
            <span className="hidden shrink-0 items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200 sm:inline-flex">
              {list.length} รายการ
            </span>
          )}
        </div>
      </header>

      {/* สินค้า vs สินค้าสั่งพิเศษ ต่างกันยังไง — เขียนให้จบไม่ต้องถาม */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-base">🏷️</span>
            สินค้า (เมนู “สินค้า”)
          </p>
          <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-slate-600">
            <li>• โชว์บนหน้าเว็บ — ลูกค้ากดสั่งเองได้เลย</li>
            <li>• มีตัวเลือก (ขนาด/วัสดุ) และราคาขั้นบันได คิดราคาอัตโนมัติ</li>
            <li>• เหมาะกับของที่ขายประจำ สเปคตายตัว</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="flex items-center gap-2 font-display text-sm font-semibold text-slate-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-base ring-1 ring-amber-100">🛠️</span>
            รูปแบบการสินค้าสั่งพิเศษ (หน้านี้)
          </p>
          <ul className="mt-2.5 space-y-1 text-xs leading-relaxed text-slate-600">
            <li>• <strong>ไม่โชว์บนหน้าเว็บ</strong> — ลูกค้าสั่งเองไม่ได้ ต้องให้พนักงานคีย์ให้</li>
            <li>• เป็นแค่ “แม่แบบชื่องาน+สเปค” — พนักงานเลือกจากคลังนี้ตอนกด “เพิ่มรายการพิเศษ” ในออเดอร์ แล้วกรอกจำนวน/ราคาเองเป็นงาน ๆ ไป</li>
            <li>• เหมาะกับงานสั่งทำ/ตีราคาเป็นเคส เช่น ป้าย งานเย็บ งานตามแบบลูกค้า</li>
          </ul>
        </div>
      </div>

      {/* แถบเครื่องมือ: ค้นหา + เพิ่มรายการ */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 transition focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
          <span className="text-sm text-slate-400">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ/สเปค…"
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {kw && <span className="shrink-0 text-[11px] font-semibold text-slate-400">พบ {shown.length}</span>}
        </label>
        <button
          type="button"
          onClick={add}
          className="rounded-xl border border-dashed border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-50"
        >
          ＋ เพิ่มรายการ
        </button>
      </div>
      {err && <p className="mt-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">{err}</p>}

      {/* รายการ — กริด 2 คอลัมน์บนจอกว้าง ใบที่กำลังแก้กางเต็มแถว */}
      {list === null ? (
        <p className={`py-16 text-center text-sm ${muted}`}>กำลังโหลดคลัง…</p>
      ) : (
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {shown.map((p) => (
            <div
              key={p.i}
              className={
                openIdx === p.i
                  ? "rounded-2xl bg-white ring-2 ring-amber-300 lg:col-span-2"
                  : "rounded-2xl bg-white ring-1 ring-slate-200 transition hover:ring-amber-300"
              }
            >
              {openIdx === p.i ? (
                <div className="space-y-2.5 p-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">ชื่อสินค้าสั่งพิเศษ</span>
                    <input
                      value={p.name}
                      onChange={(e) => patch(p.i, { name: e.target.value })}
                      className={inp}
                      placeholder="เช่น ป้ายอะคริลิคตามแบบ"
                      autoFocus
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-500">สเปค/รายละเอียด (ขึ้นบรรทัดใหม่ได้)</span>
                    <textarea
                      value={p.detail}
                      onChange={(e) => patch(p.i, { detail: e.target.value })}
                      rows={Math.min(12, Math.max(4, p.detail.split("\n").length + 1))}
                      className={`${inp} resize-y font-mono text-[13px]`}
                      placeholder="สเปค/รายละเอียด (ขึ้นบรรทัดใหม่ได้)"
                    />
                  </label>
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5">
                    <button
                      type="button"
                      onClick={() => setOpenIdx(null)}
                      className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                    >
                      ปิด
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.i)}
                      className="ml-auto rounded-full px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                    >
                      🗑 ลบรายการนี้
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenIdx(p.i)}
                  className="group flex w-full items-center gap-3 px-3.5 py-3 text-left"
                  title="กดเพื่อแก้ไข"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-base ring-1 ring-amber-100">🛠</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{p.name || "(ยังไม่ตั้งชื่อ)"}</span>
                    <span className={`block truncate text-xs ${faint}`}>{p.detail.split("\n")[0] || "—"}</span>
                  </span>
                  <span className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-amber-500">›</span>
                </button>
              )}
            </div>
          ))}
          {shown.length === 0 && (
            <p className={`rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm ${muted} lg:col-span-2`}>
              {kw ? "ไม่พบรายการที่ค้นหา" : "คลังยังว่าง — กด ＋ เพิ่มรายการ"}
            </p>
          )}
        </div>
      )}

      {/* แถบบันทึกลอยติดขอบล่าง — เห็นตลอด ไม่ต้องเลื่อนหา (ชุดเดียวกับหน้า ตั้งค่าระบบ) */}
      <div className="sticky bottom-3 z-20 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur">
        {dirty ? (
          <p className="text-xs font-semibold text-orange-500">⚠️ มีการแก้ไขที่ยังไม่ได้บันทึก</p>
        ) : (
          <p className={`text-xs ${faint}`}>แก้เสร็จแล้วกดบันทึก — มีผลกับปุ่ม “เพิ่มรายการพิเศษ” ทันที</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            saved ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
        </button>
      </div>

      <p className={`mt-4 text-center text-xs ${faint}`}>
        ใช้งานคลังนี้ได้ที่หน้าออเดอร์ →{" "}
        <Link href="/admin/orders" className="font-semibold text-amber-600 hover:underline">
          คำสั่งซื้อ
        </Link>{" "}
        → เปิดออเดอร์ → “＋ เพิ่มรายการพิเศษ”
      </p>
    </div>
  );
}

/** กันคนไม่มีสิทธิ์เข้าตรง ๆ (ของจริงบังคับที่ API อีกชั้น) */
export default function SpecialProductsPage() {
  return (
    <RequirePerm perm="orders.edit">
      <SpecialProductsInner />
    </RequirePerm>
  );
}
