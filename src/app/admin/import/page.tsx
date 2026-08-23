"use client";

import RequirePerm from "@/components/RequirePerm";

import { useEffect, useState } from "react";
import Link from "next/link";
import { type CategoryId } from "@/lib/products";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import {
  Banner,
  Btn,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  SearchBox,
  Stat,
  Stats,
} from "@/components/admin/ui";

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

function AdminImportPageInner() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [importing, setImporting] = useState(false);
  /** หมวดหมู่ตามที่แอดมินตั้งไว้ในตั้งค่าระบบ (ยังไม่โหลดเสร็จ = ค่าเริ่มต้นจากโค้ด) */
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    fetchCategories({ fresh: true }).then(setCats);
  }, []);
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
      // สินค้าที่มีอยู่แล้วถูกข้าม เพราะทับของเดิมต้องใช้สิทธิ์ผู้ดูแลระบบ
      const skipped: string[] = data.skippedExisting ?? [];
      if (skipped.length) {
        setError(
          `⚠️ ข้าม ${skipped.length} รายการที่มีอยู่ในระบบแล้ว (${skipped.slice(0, 3).join(", ")}` +
            `${skipped.length > 3 ? " และอื่น ๆ" : ""}) — การนำเข้าทับของเดิมจะลบราคา/ตัวเลือกเดิมทิ้ง ` +
            `ต้องให้ผู้ดูแลระบบเป็นคนทำ`
        );
      }
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setImporting(false);
    }
  }

  const selected = rows.filter((r) => r._include).length;

  return (
    <PageShell>
      <PageHead
        group="สินค้า"
        title="นำเข้าสินค้าจาก URL"
        sub="วางลิงก์หน้ารายการราคา (เว็บ Wix) → ระบบดึงตาราง ชื่อ และรูปมาให้ตรวจ/แก้ก่อนนำเข้า — ราคาขั้นบันไดแปลงให้อัตโนมัติ"
      />

      {/* ขั้นที่ 1 — วางลิงก์ */}
      <div className="dkb-g mt-4 flex flex-wrap items-center gap-2 p-3">
        <label className="dkb-search flex-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && scrape()}
            placeholder="เช่น https://www.iduckyofficial-pricelists.com/keyring หรือ /keyring"
          />
        </label>
        <Btn tone="navy" onClick={scrape} disabled={loading || !url.trim()}>
          {loading ? "กำลังดึง…" : "ดึงข้อมูล"}
        </Btn>
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="hot" title={error} />
        </div>
      )}
      {result && (
        <div className="dkb-g mt-3 px-4 py-3 text-[14px]" style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}>
          {result}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <Stats cols={4}>
            <HeroStat
              n={selected}
              label="เลือกไว้จะนำเข้า"
              detail={`จากที่ดึงมาได้ ${rows.length} สินค้า${skipped > 0 ? ` · ข้าม ${skipped} ตาราง (ADD-ON/รูปแบบพิเศษ)` : ""}`}
              pct={rows.length ? (selected / rows.length) * 100 : 0}
            />
            <Stat label="ไม่มีรูป" value={rows.filter((r) => !r.imageUrl).length} hint="ต้องอัปรูปเองทีหลัง" />
            <Stat label="ดึงมาได้" value={rows.length} hint="ก่อนกรอง" />
          </Stats>

          <div className="dkb-g mt-4 flex flex-wrap items-center gap-2 p-3">
            <SearchBox value={filter} onChange={setFilter} placeholder="ค้นหาสินค้าในหน้านี้" />
            <Btn small onClick={() => setAllInclude(true)}>
              เลือก{filter.trim() ? "ที่ค้นเจอ" : "ทั้งหมด"}
            </Btn>
            <Btn small onClick={() => setAllInclude(false)}>
              ไม่เลือก{filter.trim() ? "ที่ค้นเจอ" : "เลย"}
            </Btn>
            <label className="dkb-g dkb-field !py-1.5">
              <span className="lb">ตั้งหมวดทุกตัว</span>
              <select onChange={(e) => setAllCategory(e.target.value as CategoryId)} defaultValue="">
                <option value="" disabled>
                  — เลือก —
                </option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ListHead title="ตรวจก่อนนำเข้า" note="ติ๊กออกได้ถ้าไม่อยากนำเข้าตัวไหน" />

          <div className="dkb-g overflow-hidden">
            <ul>
              {rows
                .map((r, i) => ({ r, i }))
                .filter(({ r }) => !filter.trim() || r.name.toLowerCase().includes(filter.trim().toLowerCase()))
                .map(({ r, i }) => (
                  <li key={i} className={`dkb-row !rounded-none px-4 ${r._include ? "" : "opacity-45"}`}>
                    <input
                      type="checkbox"
                      checked={r._include}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, _include: e.target.checked } : x)))}
                      className="h-4 w-4 shrink-0"
                      style={{ accentColor: "var(--dk-blue-deep)" }}
                    />
                    <span className="dkb-thumb !h-12 w-12 shrink-0">
                      {r.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageUrl} alt="" />
                      ) : null}
                    </span>
                    <input
                      value={r.name}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className="dkb-g min-w-48 flex-1 border-0 px-3 py-1.5 text-[14px] outline-none"
                    />
                    <select
                      value={r._category}
                      onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, _category: e.target.value as CategoryId } : x)))}
                      className="dkb-g shrink-0 border-0 px-2 py-1.5 text-[13px] outline-none"
                    >
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 text-right">
                      <span className="dkb-amt block">
                        ฿{r.price} / {r.unit}
                      </span>
                      <span className="block text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
                        {KIND_LABEL[r.kind]} · {r.pricing.tiers.length} ช่วง
                        {r.pricing.driverLabels.length ? ` × ${Object.keys(r.pricing.cells).length}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div className="mt-4 flex justify-end">
            <Btn tone="yolk" onClick={save} disabled={importing || selected === 0}>
              {importing ? "กำลังนำเข้า…" : `นำเข้า ${selected} รายการ`}
            </Btn>
          </div>
        </>
      )}

      <p className="mt-6 text-center text-[12px]" style={{ color: "var(--dk-faint)" }}>
        นำเข้าแล้วดู/แก้ต่อได้ที่{" "}
        <Link href="/admin/products" className="font-semibold underline-offset-4 hover:underline" style={{ color: "var(--dk-blue-deep)" }}>
          หน้าสินค้า
        </Link>{" "}
        · ชื่อ/หมวด/รูป/ราคา แก้ได้ทั้งหมด
      </p>
    </PageShell>
  );
}

/** กันคนที่ไม่มีสิทธิ์พิมพ์ URL เข้าตรง ๆ */
export default function AdminImportPage() {
  return (
    <RequirePerm perm="products.import">
      <AdminImportPageInner />
    </RequirePerm>
  );
}
