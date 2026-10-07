"use client";

/**
 * 🏷 พิมพ์ป้าย QR ติดชั้นวาง — /admin/stock/labels?ids=a,b,c (เจ้าของร้านสั่ง 1 ต.ค. 69)
 *
 * ป้ายละ 1 SKU: QR → /admin/stock/take/<id> (หน้าเบิกบนมือถือ) + ชื่อ + รหัส + หน่วย/แพ็ค
 * ทางเข้า: ลิ้นชัก SKU (เมนู ⋯ → พิมพ์ป้าย QR) · เมนู ⋯ หัวกลุ่ม (ทั้งกลุ่ม)
 * พิมพ์ด้วย window.print() จากเดสก์ท็อป/เบราว์เซอร์ปกติ — sidebar หลังบ้านซ่อนเองตอนพิมพ์ (print:hidden ใน AdminShell)
 * ไม่ส่ง ids = ทุกตัวที่นับสต๊อก (ไม่รวม "ไม่ต้องมี stock")
 * ☑️ ติ๊กเลือกได้ว่าจะพิมพ์ใบไหน (เจ้าของร้านขอ 7 ต.ค. 69) — เปิดมาเลือกครบทุกใบ · ใบที่เอาติ๊กออกจางลงและไม่ถูกพิมพ์
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { publicOrigin } from "@/lib/shop-info";
import { code as codeCls } from "@/lib/admin-ui";
import { PageShell } from "@/components/admin/ui";

interface Sku {
  id: string;
  name: string;
  code?: string;
  family?: string;
  category?: string;
  unit: string;
  packUnit?: string;
  packSize?: number;
  noStock?: boolean;
  manualOnly?: boolean;
}
type Size = "s" | "l";
const fmtN = (n: number) => n.toLocaleString("th-TH");

function LabelsInner() {
  const sp = useSearchParams();
  const ids = useMemo(
    () =>
      (sp.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [sp],
  );
  const [all, setAll] = useState<Sku[] | null>(null);
  const [err, setErr] = useState("");
  const [size, setSize] = useState<Size>("s");
  const [origin, setOrigin] = useState("");
  /** ใบที่ "ไม่พิมพ์" (เอาติ๊กออก) — เก็บแบบตัดออก เปิดหน้ามาจึงเลือกครบทุกใบเหมือนเดิม */
  const [skip, setSkip] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSkip((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    setOrigin(publicOrigin());
    fetch("/api/admin/stock", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "โหลดคลังไม่สำเร็จ");
        setAll(j.items as Sku[]);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!all) return [];
    if (!ids.length) return all.filter((i) => !i.noStock);
    const by = new Map(all.map((i) => [i.id, i]));
    return ids.map((id) => by.get(id)).filter((x): x is Sku => !!x);
  }, [all, ids]);

  const picked = rows.filter((r) => !skip.has(r.id)).length;

  const takeUrl = (id: string) =>
    `${origin}/admin/stock/take/${encodeURIComponent(id)}`;
  const big = size === "l";

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl">
        {/* แถบเครื่องมือ — ไม่พิมพ์ */}
        <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              คลังวัสดุ
            </p>
            <h1 className="text-lg font-semibold text-slate-900">
              ป้าย QR ติดชั้นวาง{" "}
              <span className="text-sm font-medium text-slate-500">
                {all ? `${fmtN(rows.length)} ป้าย` : ""}
              </span>
            </h1>
            {rows.length > 0 && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <span className="font-semibold text-slate-700">
                  ☑️ เลือกพิมพ์ {fmtN(picked)}/{fmtN(rows.length)} ป้าย
                </span>
                <button type="button" onClick={() => setSkip(new Set())} className="text-sky-700 underline underline-offset-2 hover:text-sky-900">
                  เลือกทั้งหมด
                </button>
                <button type="button" onClick={() => setSkip(new Set(rows.map((r) => r.id)))} className="text-sky-700 underline underline-offset-2 hover:text-sky-900">
                  ไม่เลือกเลย
                </button>
                <span className="text-slate-400">กดที่ป้ายเพื่อเลือก/เอาออก</span>
              </p>
            )}
            <p className="text-xs text-slate-500">
              พนักงานสแกนป้ายด้วยกล้องมือถือ → เปิดหน้าเบิกของตัวนั้นทันที
              (ต้องล็อกอินหลังบ้านไว้ก่อน)
            </p>
          </div>
          <div
            className="inline-flex rounded-full bg-slate-100 p-0.5"
            role="radiogroup"
            aria-label="ขนาดป้าย"
          >
            {(
              [
                ["s", "เล็ก 3 คอลัมน์"],
                ["l", "ใหญ่ 2 คอลัมน์"],
              ] as [Size, string][]
            ).map(([v, lb]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={size === v}
                onClick={() => setSize(v)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${size === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {lb}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!picked}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-sm font-semibold bg-amber-500 text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-40"
          >
            🖨 พิมพ์{rows.length ? ` ${fmtN(picked)} ป้าย` : ""}
          </button>
          <Link
            href="/admin/stock"
            className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-800"
          >
            ← คลังวัสดุ
          </Link>
        </div>

        {err && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 print:hidden">
            {err}
          </p>
        )}
        {!all && !err && (
          <p className="py-10 text-center text-sm text-slate-400 print:hidden">
            กำลังโหลด…
          </p>
        )}
        {all && !rows.length && (
          <p className="py-10 text-center text-sm text-slate-400 print:hidden">
            ไม่พบวัสดุตามรายการที่ส่งมา — ป้ายอาจเป็นของตัวที่ถูกลบไปแล้ว
          </p>
        )}

        {/* ป้าย — ขอบประไว้ตัด · ขนาดคงที่ให้ตัดเท่ากันทุกใบ */}
        <div
          className={`grid gap-3 print:gap-2 ${big ? "grid-cols-1 sm:grid-cols-2 print:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 print:grid-cols-3"}`}
        >
          {rows.map((it) => {
            const on = !skip.has(it.id);
            return (
            <div
              key={it.id}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onClick={() => toggle(it.id)}
              onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), toggle(it.id))}
              title={on ? "กดเพื่อไม่พิมพ์ป้ายนี้" : "กดเพื่อพิมพ์ป้ายนี้"}
              className={`relative flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white transition print:cursor-auto print:break-inside-avoid print:rounded-none print:border-slate-300 print:opacity-100 ${big ? "p-4" : "p-3"} ${on ? "border-slate-300" : "border-slate-200 opacity-35 print:hidden"}`}
            >
              {/* ☑️ ช่องติ๊ก — จอเท่านั้น ไม่พิมพ์ */}
              <span
                aria-hidden="true"
                className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md border-2 text-[12px] font-bold print:hidden ${on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white"}`}
              >
                {on ? "✓" : ""}
              </span>
              <span
                className="shrink-0 rounded-md bg-white"
                aria-label={`QR เบิก ${it.name}`}
              >
                {origin ? (
                  <QRCodeSVG
                    value={takeUrl(it.id)}
                    size={big ? 112 : 84}
                    level="M"
                    marginSize={1}
                  />
                ) : (
                  <span
                    style={{ width: big ? 112 : 84, height: big ? 112 : 84 }}
                    className="block"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-semibold leading-snug text-slate-900 ${big ? "text-base" : "text-[13px]"}`}
                >
                  {it.name}
                </span>
                {it.code && (
                  <span className={`${codeCls} mt-0.5 block !text-slate-600`}>
                    {it.code}
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-slate-500">
                  นับเป็น{it.unit}
                  {(it.packSize ?? 0) > 1
                    ? ` · 1 ${it.packUnit || "แพ็ค"} = ${fmtN(it.packSize!)} ${it.unit}`
                    : ""}
                </span>
                <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                  📱 แกะแพ็คใหม่ → สแกนเบิก
                </span>
              </span>
            </div>
            );
          })}
        </div>
      </div>
    </PageShell>
  );
}

export default function LabelsPage() {
  return (
    <Suspense
      fallback={
        <p className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</p>
      }
    >
      <LabelsInner />
    </Suspense>
  );
}
