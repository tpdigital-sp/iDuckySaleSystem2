"use client";

import { useState } from "react";
import Link from "next/link";
import { CATEGORIES, type CategoryId } from "@/lib/products";
import { btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

interface Row {
  name: string;
  unit: string;
  price: number;
  options: unknown[];
  pricing: { driverLabels: string[]; tiers: unknown[]; cells: Record<string, number[]> };
  imageUrl?: string;
  kind: "tiers" | "matrix" | "size";
  _include: boolean;
  _category: CategoryId;
}

const KIND_LABEL: Record<string, string> = { tiers: "ราคาตามจำนวน", matrix: "ขนาด × จำนวน", size: "ราคาตามขนาด" };

export default function AdminImportPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string>("");
  const [filter, setFilter] = useState("");

  async function scrape() {
    setError(""); setResult(""); setRows([]); setLoading(true);
    try {
      const res = await fetch("/api/admin/import?action=scrape", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "ดึงข้อมูลไม่สำเร็จ"); return; }
      setRows((data.products ?? []).map((p: Row) => ({ ...p, _include: true, _category: "acrylic" as CategoryId })));
      setSkipped(data.skipped ?? 0);
      if (!data.products?.length) setError("ไม่พบตารางสินค้าในหน้านี้ (อาจเป็นหน้ารูปล้วน หรือ URL ไม่ถูก)");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setLoading(false);
    }
  }

  function setAllCategory(c: CategoryId) {
    setRows((rs) => rs.map((r) => ({ ...r, _category: c })));
  }
  // เลือก/ไม่เลือก เฉพาะรายการที่ตรงกับตัวกรอง (ถ้ากรองอยู่)
  function setAllInclude(v: boolean) {
    const q = filter.trim().toLowerCase();
    setRows((rs) => rs.map((r) => (!q || r.name.toLowerCase().includes(q) ? { ...r, _include: v } : r)));
  }

  async function save() {
    const items = rows.filter((r) => r._include && r.name.trim()).map((r) => ({
      name: r.name.trim(), category: r._category, price: r.price, unit: r.unit,
      options: r.options, pricing: r.pricing, imageUrl: r.imageUrl,
    }));
    if (!items.length) { setError("เลือกสินค้าที่จะนำเข้าอย่างน้อย 1 ตัว"); return; }
    setImporting(true); setError(""); setResult("");
    try {
      const res = await fetch("/api/admin/import?action=save", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "นำเข้าไม่สำเร็จ"); return; }
      const withImg = (data.results ?? []).filter((r: { image: boolean }) => r.image).length;
      setResult(`นำเข้าสำเร็จ ${data.imported} รายการ (มีรูป ${withImg} รายการ) ✓`);
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setImporting(false);
    }
  }

  const selected = rows.filter((r) => r._include).length;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>นำเข้าสินค้าจาก URL</h1>
      <p className={`mt-1 ${muted}`}>
        วางลิงก์หน้ารายการราคา (เว็บ Wix) → ระบบดึงตาราง+ชื่อ+รูปมาให้ <strong>ตรวจ/แก้ก่อนนำเข้า</strong> — ราคาขั้นบันไดแปลงให้อัตโนมัติ
      </p>

      <div className={`mt-5 flex flex-wrap items-center gap-2 p-3 ${card}`}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && scrape()}
          placeholder="เช่น https://www.iduckyofficial-pricelists.com/keyring หรือ /keyring"
          className="min-w-64 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
        />
        <button type="button" onClick={scrape} disabled={loading || !url.trim()} className={btnPrimary}>
          {loading ? "กำลังดึง…" : "🔍 ดึงข้อมูล"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}
      {result && <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{result}</div>}

      {rows.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              พบ <strong>{rows.length}</strong> สินค้า{skipped > 0 ? ` · ข้าม ${skipped} ตาราง (ADD-ON/รูปแบบพิเศษ)` : ""} · เลือก <strong>{selected}</strong>
            </p>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              ตั้งหมวดทุกตัว:
              <select
                onChange={(e) => setAllCategory(e.target.value as CategoryId)}
                defaultValue=""
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-400"
              >
                <option value="" disabled>— เลือก —</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="ค้นหาสินค้าในหน้านี้… (กรองด้วยชื่อ)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
            </div>
            <button type="button" onClick={() => setAllInclude(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              ✓ เลือก{filter.trim() ? "ที่ค้นเจอ" : "ทั้งหมด"}
            </button>
            <button type="button" onClick={() => setAllInclude(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              ✕ ไม่เลือก{filter.trim() ? "ที่ค้นเจอ" : "เลย"}
            </button>
          </div>

          <div className={`mt-3 overflow-hidden ${card}`}>
            <ul className="divide-y divide-slate-100">
              {rows.map((r, i) => ({ r, i })).filter(({ r }) => !filter.trim() || r.name.toLowerCase().includes(filter.trim().toLowerCase())).map(({ r, i }) => (
                <li key={i} className={`flex flex-wrap items-center gap-3 p-3 ${r._include ? "" : "opacity-50"}`}>
                  <input
                    type="checkbox"
                    checked={r._include}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, _include: e.target.checked } : x)))}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-12 w-12 object-cover" />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center text-lg text-slate-300">📦</span>
                    )}
                  </span>
                  <input
                    value={r.name}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="min-w-48 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  />
                  <select
                    value={r._category}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, _category: e.target.value as CategoryId } : x)))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                  >
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                  </select>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    <span className="block font-bold text-slate-900">฿{r.price} / {r.unit}</span>
                    <span className={faint}>{KIND_LABEL[r.kind]} · {r.pricing.tiers.length} ช่วง{r.pricing.driverLabels.length ? ` × ${Object.keys(r.pricing.cells).length}` : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex justify-end">
            <button type="button" onClick={save} disabled={importing || selected === 0} className={`${btnPrimary} disabled:opacity-40`}>
              {importing ? "กำลังนำเข้า…" : `นำเข้า ${selected} รายการ`}
            </button>
          </div>
        </>
      )}

      <p className={`mt-6 text-center text-xs ${faint}`}>
        นำเข้าแล้วดู/แก้ต่อได้ที่ <Link href="/admin/products" className="font-semibold text-amber-600 hover:underline">หน้าสินค้า</Link> · ชื่อ/หมวด/รูป/ราคา แก้ได้ทั้งหมด
      </p>
    </div>
  );
}
