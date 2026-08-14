"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCan } from "@/lib/perm-context";
import {
  badge,
  btnSmGhost,
  btnSmNeutral,
  card,
  code as codeCls,
  h1,
  input as inputCls,
  label as labelCls,
  subtle,
  TONE,
} from "@/lib/admin-ui";

/**
 * ผูกตัวเลือกสินค้า → SKU ในคลัง (งานกวาดครั้งเดียว)
 *
 * แถวจาก "คลังตัวเลือกกลาง" ขึ้นก่อนเสมอ — ผูกครั้งเดียวมีผลกับทุกสินค้าที่ลิงก์คลังนั้น
 * คุ้มกว่าไล่ผูกรายสินค้าหลายเท่า (สีไหม 13 ค่า = 14 สินค้าได้ผลทันที)
 */

interface Choice {
  name: string;
  stockItemId: string | null;
}
interface PresetRow {
  kind: "preset";
  key: string;
  presetId: string;
  label: string;
  usedBy: number;
  choices: Choice[];
}
interface ProductRow {
  kind: "product";
  key: string;
  productId: string;
  productName: string;
  draft: boolean;
  label: string;
  choices: Choice[];
}
type Row = PresetRow | ProductRow;
interface Sku {
  id: string;
  code?: string;
  name: string;
  unit: string;
  family?: string;
  aliases?: string[];
}

const norm = (s: string) =>
  String(s || "").toLowerCase().replace(/เเ/g, "แ").replace(/\s+/g, "").replace(/[็่้๊๋์]/g, "");

export default function StockLinkPage() {
  const can = useCan();
  const mayEdit = can("orders.edit");
  const [rows, setRows] = useState<Row[]>([]);
  const [items, setItems] = useState<Sku[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/stock/link");
    const j = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      return;
    }
    setRows([...j.presetRows, ...j.productRows]);
    setItems(j.items);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function setLink(row: Row, choice: string, stockItemId: string | null) {
    const tag = `${row.key}|${choice}`;
    setSaving(tag);
    setErr("");
    const body =
      row.kind === "preset"
        ? { presetId: row.presetId, choice, stockItemId }
        : { productId: row.productId, label: row.label, choice, stockItemId };
    const res = await fetch("/api/admin/stock/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    setSaving(null);
    if (!res.ok || !j?.ok) {
      setErr(j?.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    // อัปเดตในจอทันที ไม่ต้องโหลดใหม่ทั้งตาราง (แถวเยอะ)
    setRows((prev) =>
      prev.map((r) =>
        r.key !== row.key ? r : { ...r, choices: r.choices.map((c) => (c.name === choice ? { ...c, stockItemId } : c)) }
      )
    );
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .map((r) => ({ ...r, choices: onlyOpen ? r.choices.filter((c) => !c.stockItemId) : r.choices }))
      .filter((r) => r.choices.length > 0)
      .filter(
        (r) =>
          !needle ||
          r.label.toLowerCase().includes(needle) ||
          (r.kind === "product" && r.productName.toLowerCase().includes(needle)) ||
          r.choices.some((c) => c.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "preset" ? -1 : 1; // คลังกลางก่อน คุ้มกว่า
        if (a.kind === "preset" && b.kind === "preset") return b.usedBy - a.usedBy;
        return b.choices.length - a.choices.length;
      });
  }, [rows, q, onlyOpen]);

  const totalChoices = rows.reduce((s, r) => s + r.choices.length, 0);
  const doneChoices = rows.reduce((s, r) => s + r.choices.filter((c) => c.stockItemId).length, 0);
  const pct = totalChoices ? Math.round((doneChoices / totalChoices) * 100) : 0;

  if (!mayEdit) {
    return <div className={`${card} py-12 text-center text-sm text-slate-400`}>บัญชีนี้ไม่มีสิทธิ์จัดการสต๊อก</div>;
  }

  return (
    <div className="w-full pb-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>ผูกตัวเลือกสินค้ากับคลัง</h1>
          <p className={`mt-1 ${subtle}`}>
            ลูกค้าเลือกค่าไหน = ตัดวัสดุตัวไหน · แถวจากคลังตัวเลือกกลางขึ้นก่อน เพราะผูกครั้งเดียวมีผลหลายสินค้า
          </p>
        </div>
        <Link href="/admin/stock" className={btnSmNeutral}>
          ← กลับหน้าคลัง
        </Link>
      </div>

      {err && <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${TONE.danger.bg} ${TONE.danger.text} ${TONE.danger.ring}`}>{err}</p>}

      <div className={`${card} mb-4 p-4`}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">
            ผูกแล้ว {doneChoices.toLocaleString("th-TH")} จาก {totalChoices.toLocaleString("th-TH")} ค่า
          </span>
          <span className="tabular-nums text-slate-400">{pct}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${TONE.ok.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นชื่อสินค้า มิติ หรือค่าตัวเลือก…"
          className={`${inputCls} w-full sm:w-72`}
        />
        <button
          type="button"
          onClick={() => setOnlyOpen((v) => !v)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
            onlyOpen ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          เฉพาะที่ยังไม่ผูก
        </button>
      </div>

      {loading ? (
        <div className={`${card} py-16 text-center text-sm text-slate-400`}>กำลังโหลด…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-600">
            {onlyOpen ? "ผูกครบทุกค่าแล้ว" : "ไม่พบรายการที่ค้นหา"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => (
            <section key={row.key} className={`${card} overflow-hidden`}>
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                {row.kind === "preset" ? (
                  <>
                    <span className={`${badge} ${TONE.ok.bg} ${TONE.ok.text}`}>คลังกลาง</span>
                    <span className="text-sm font-semibold text-slate-800">{row.label}</span>
                    <span className="text-[11px] text-slate-400">มีผลกับสินค้า {row.usedBy} ตัว</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-slate-800">{row.label}</span>
                    <span className="truncate text-[11px] text-slate-400">{row.productName}</span>
                    {row.draft && <span className={`${badge} bg-slate-100 text-slate-500`}>ร่าง</span>}
                  </>
                )}
                <span className={`${badge} ml-auto bg-slate-100 text-slate-500`}>{row.choices.length} ค่า</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {/* key ต้องมีลำดับด้วย — ข้อมูลเก่ามีชื่อตัวเลือกซ้ำในกลุ่มเดียวกัน ("เคลือบพิเศษ" 2 ครั้ง) */}
                {row.choices.map((c, ci) => (
                  <li key={`${ci}-${c.name}`} className="flex flex-wrap items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{c.name}</span>
                    <ChoiceLink
                      items={items}
                      choiceName={c.name}
                      value={c.stockItemId}
                      busy={saving === `${row.key}|${c.name}`}
                      onPick={(id) => setLink(row, c.name, id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** ช่องผูก SKU ต่อหนึ่งค่า — เดาให้จากชื่อ/alias แต่ไม่ผูกให้เอง ต้องกดยืนยัน */
function ChoiceLink({
  items,
  choiceName,
  value,
  busy,
  onPick,
}: {
  items: Sku[];
  choiceName: string;
  value: string | null;
  busy: boolean;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const picked = value ? items.find((i) => i.id === value) : null;

  /** ตัวที่น่าจะใช่ — ชื่อหรือ alias ตรงกับค่าตัวเลือก · แสดงเป็นปุ่มลัด ไม่ผูกอัตโนมัติ */
  const suggest = useMemo(() => {
    const n = norm(choiceName);
    if (n.length < 2) return null;
    return (
      items.find((i) => norm(i.name) === n) ??
      items.find((i) => (i.aliases ?? []).some((a) => norm(a) === n)) ??
      items.find((i) => norm(i.name).includes(n) && n.length >= 3) ??
      null
    );
  }, [items, choiceName]);

  const hits = useMemo(() => {
    const needle = norm(q);
    if (!needle) return items.slice(0, 40);
    return items
      .filter((i) => norm(i.name).includes(needle) || norm(i.code ?? "").includes(needle) || (i.aliases ?? []).some((a) => norm(a).includes(needle)))
      .slice(0, 40);
  }, [items, q]);

  if (picked) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-right">
          <span className="block text-sm font-medium text-slate-900">{picked.name}</span>
          {picked.code && <span className={codeCls}>{picked.code}</span>}
        </span>
        <button type="button" disabled={busy} onClick={() => onPick(null)} className={btnSmGhost}>
          ถอด
        </button>
      </span>
    );
  }

  return (
    <span ref={boxRef} className="relative flex shrink-0 items-center gap-2">
      {suggest && !open && (
        <button type="button" disabled={busy} onClick={() => onPick(suggest.id)} className={btnSmNeutral} title={suggest.code}>
          ใช้ “{suggest.name.slice(0, 22)}”
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} className={btnSmNeutral}>
        {busy ? "กำลังบันทึก…" : "เลือก SKU"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นชื่อ รหัส หรือชื่อที่เคยเรียก…"
            className={inputCls}
          />
          <ul className="mt-1 max-h-64 overflow-y-auto">
            {hits.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(i.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{i.name}</span>
                    <span className="flex gap-2">
                      {i.code && <span className={codeCls}>{i.code}</span>}
                      {i.family && <span className="text-[11px] text-slate-400">{i.family}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {hits.length === 0 && <li className={`${labelCls} px-2 py-3 text-center`}>ไม่พบ SKU</li>}
          </ul>
        </div>
      )}
    </span>
  );
}
