"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { faint, h1, muted } from "@/lib/admin-ui";

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
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className={h1}>🛠️ รูปแบบการสินค้าสั่งพิเศษ</h1>
      <p className={`mt-1 ${muted}`}>
        คลังแม่แบบงานสั่งทำ {list ? `${list.length} รายการ` : ""} (นำเข้าจากระบบเดิม) — ใช้ตอนกด “เพิ่มรายการพิเศษ” ในออเดอร์
      </p>

      {/* สินค้า vs สินค้าสั่งพิเศษ ต่างกันยังไง — เขียนให้จบไม่ต้องถาม */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-bold text-slate-800">🏷️ สินค้า (เมนู “สินค้า”)</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li>• โชว์บนหน้าเว็บ — ลูกค้ากดสั่งเองได้เลย</li>
            <li>• มีตัวเลือก (ขนาด/วัสดุ) และราคาขั้นบันได คิดราคาอัตโนมัติ</li>
            <li>• เหมาะกับของที่ขายประจำ สเปคตายตัว</li>
          </ul>
        </div>
        <div className="rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-200">
          <p className="text-sm font-bold text-slate-800">🛠️ รูปแบบการสินค้าสั่งพิเศษ (หน้านี้)</p>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            <li>• <strong>ไม่โชว์บนหน้าเว็บ</strong> — ลูกค้าสั่งเองไม่ได้ ต้องให้พนักงานคีย์ให้</li>
            <li>• เป็นแค่ “แม่แบบชื่องาน+สเปค” — พนักงานเลือกจากคลังนี้ตอนกด “เพิ่มรายการพิเศษ” ในออเดอร์ แล้วกรอกจำนวน/ราคาเองเป็นงาน ๆ ไป</li>
            <li>• เหมาะกับงานสั่งทำ/ตีราคาเป็นเคส เช่น ป้าย งานเย็บ งานตามแบบลูกค้า</li>
          </ul>
        </div>
      </div>

      {/* แถบเครื่องมือ */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 focus-within:border-amber-300">
          <span className="text-sm text-slate-400">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ/สเปค…"
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={add}
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700"
        >
          ＋ เพิ่มรายการ
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className={`rounded-full px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40 ${
            saved ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
        </button>
      </div>
      {dirty && <p className="mt-2 text-xs font-semibold text-amber-600">⚠️ มีการแก้ไขที่ยังไม่ได้บันทึก — อย่าลืมกด 💾 บันทึก</p>}
      {err && <p className="mt-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{err}</p>}

      {/* รายการ */}
      {list === null ? (
        <p className="py-16 text-center text-sm text-slate-400">กำลังโหลดคลัง…</p>
      ) : (
        <div className="mt-3 space-y-2">
          {shown.map((p) => (
            <div key={p.i} className="rounded-xl bg-white ring-1 ring-slate-200">
              {openIdx === p.i ? (
                <div className="space-y-2 p-4">
                  <input
                    value={p.name}
                    onChange={(e) => patch(p.i, { name: e.target.value })}
                    className={inp}
                    placeholder="ชื่อสินค้าสั่งพิเศษ"
                    autoFocus
                  />
                  <textarea
                    value={p.detail}
                    onChange={(e) => patch(p.i, { detail: e.target.value })}
                    rows={Math.min(12, Math.max(4, p.detail.split("\n").length + 1))}
                    className={`${inp} resize-y font-mono text-[13px]`}
                    placeholder="สเปค/รายละเอียด (ขึ้นบรรทัดใหม่ได้)"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenIdx(null)}
                      className="rounded-full bg-slate-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                    >
                      ปิด
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.i)}
                      className="ml-auto rounded-full px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
                    >
                      🗑 ลบรายการนี้
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenIdx(p.i)}
                  className="block w-full px-4 py-3 text-left hover:bg-amber-50/40"
                >
                  <span className="block truncate text-sm font-semibold text-slate-800">{p.name || "(ยังไม่ตั้งชื่อ)"}</span>
                  <span className={`block truncate text-xs ${faint}`}>{p.detail.split("\n")[0] || "—"}</span>
                </button>
              )}
            </div>
          ))}
          {shown.length === 0 && (
            <p className={`rounded-xl bg-slate-50 px-4 py-8 text-center text-sm ${muted}`}>
              {kw ? "ไม่พบรายการที่ค้นหา" : "คลังยังว่าง — กด ＋ เพิ่มรายการ"}
            </p>
          )}
        </div>
      )}

      <p className={`mt-6 text-center text-xs ${faint}`}>
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
