"use client";

/**
 * 🧾 "ของที่ต้องสั่ง" ในกล่อง 🛒 รอของเข้า (หน้าออเดอร์) — Order.needsPurchase.items
 *
 * เจ้าของร้านขอ 7 ต.ค. 69:
 *   - ของที่ต้องสั่งไม่ตรงกับชื่อสินค้าลูกค้าเสมอไป (ปลอกหมอนอิง → ซิป 16") → พนักงานระบุเอง
 *   - ต้อง "ดึงจากระบบ stock มาให้เลือก" → ช่องค้นหาวัสดุจาก /admin/stock (ชื่อ/รหัส/ชื่อเดิม) + โชว์คงเหลือ
 *     ไม่มีในคลังก็พิมพ์ชื่อเองได้ (แถว ➕ ท้ายผลค้นหา)
 *   - 💡 แนะนำวัสดุที่ผูกกับสินค้าในออเดอร์ (StockItem.bomFor / productIds) กดเพิ่มได้ทีเดียว
 * ลูกค้าโอนแล้ว → รายการนี้ไปเป็นคำขอในระบบสั่งของ TP + แจ้งไลน์ (server/tp-order-bridge.ts)
 *
 * โหมด draft (ยังไม่ติ๊ก): รายการเป็นร่างในหน้าจอ onSave = เก็บร่าง · หน้าออเดอร์บันทึกพร้อมติ๊กทีเดียว (เจ้าของร้านเคาะ 7 ต.ค. 69)
 * โหมดปกติ (ติ๊กแล้ว): บันทึกทันทีตอนเพิ่ม/ลบ · จำนวนบันทึกตอนออกจากช่อง (ไม่บันทึกทุกตัวอักษร — ประตูเขียนออเดอร์คิดกฎทั้งใบทุกครั้ง)
 * กล่องนี้อยู่แถบขวาที่แคบ → แต่ละรายการเป็นการ์ด 2 บรรทัด (ชื่อเต็มบรรทัด · จำนวน/หน่วย/คงเหลือบรรทัดล่าง)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cleanNeedsPurchaseItems, needsPurchaseItemText, type NeedsPurchaseItem } from "@/lib/admin-data";

/** ส่วนที่ใช้จาก StockItem (GET /api/admin/stock) */
type StockLite = {
  id: string;
  name: string;
  code?: string;
  aliases?: string[];
  category?: string;
  unit?: string;
  balance?: number;
  imageUrl?: string;
  productIds?: string[];
  productQtyPer?: Record<string, number>;
  bomFor?: Record<string, number>;
  noStock?: boolean;
};

// โหลดคลังครั้งเดียวต่อการเปิดหน้า (ใช้ร่วมกันทุกกล่องในหน้า) — คลังมีพันกว่ารายการ ไม่ต้องโหลดซ้ำทุกครั้งที่พิมพ์
let stockCache: Promise<StockLite[]> | null = null;
function loadStock(): Promise<StockLite[]> {
  stockCache ??= fetch("/api/admin/stock")
    .then((r) => r.json())
    .then((j) => ((j?.items ?? []) as StockLite[]).filter((i) => i.name && !i.noStock))
    .catch(() => {
      stockCache = null; // โหลดไม่ได้ = ลองใหม่รอบหน้า
      return [];
    });
  return stockCache;
}

const fmt = (n?: number) => Number(n ?? 0).toLocaleString("th-TH");

function score(it: StockLite, q: string): number {
  const n = it.name.toLowerCase();
  if (n.startsWith(q)) return 0;
  if (n.split(/[\s·()/-]+/).some((w) => w.startsWith(q))) return 1;
  if (n.includes(q)) return 2;
  if ([it.code, it.category, ...(it.aliases ?? [])].some((s) => String(s ?? "").toLowerCase().includes(q))) return 3;
  return -1;
}

export default function NeedsPurchaseItemsEditor({
  items,
  editable,
  draft = false,
  products,
  onSave,
}: {
  items?: NeedsPurchaseItem[];
  editable: boolean;
  /** 🛒 โหมดร่างก่อนติ๊ก — รายการอยู่ในหน้าจอ ยังไม่ลงออเดอร์ (ข้อความเตือนบอกให้กดปุ่มรอของเข้าหลังใส่) */
  draft?: boolean;
  /** สินค้าในออเดอร์ — ใช้แนะนำวัสดุที่ผูกไว้ในคลัง */
  products: { productId: string; name: string; qty: number }[];
  onSave: (items: NeedsPurchaseItem[]) => void;
}) {
  const saved = useMemo(() => cleanNeedsPurchaseItems(items), [items]);
  const [stock, setStock] = useState<StockLite[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({});
  const boxRef = useRef<HTMLDivElement>(null);

  // โหลดคลังตอนกล่องนี้แก้ได้ (ใบที่ของเข้าแล้วไม่ต้องโหลด)
  useEffect(() => {
    if (!editable) return;
    let alive = true;
    void loadStock().then((s) => alive && setStock(s));
    return () => {
      alive = false;
    };
  }, [editable]);

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const byId = useMemo(() => new Map((stock ?? []).map((s) => [s.id, s])), [stock]);
  const chosen = new Set(saved.map((i) => i.stockItemId).filter(Boolean));

  /** 💡 วัสดุที่ผูกกับสินค้าในออเดอร์ — bomFor (วัสดุแฝง) ก่อน · productIds ใช้เฉพาะสินค้าที่ผูกไม่เกิน 4 ตัว (เกินนั้นมักเป็นตัวเลือกสี/ไซซ์ ทุกตัว ชวนสับสน) */
  const suggestions = useMemo(() => {
    if (!stock) return [];
    const out = new Map<string, { it: StockLite; qty: number; for: string }>();
    for (const p of products) {
      const bom = stock.filter((s) => s.bomFor?.[p.productId]);
      const linked = stock.filter((s) => s.productIds?.includes(p.productId));
      const pick = [...bom.map((s) => ({ s, per: s.bomFor![p.productId] })), ...(linked.length <= 4 ? linked.map((s) => ({ s, per: s.productQtyPer?.[p.productId] ?? 1 })) : [])];
      for (const { s, per } of pick) {
        const cur = out.get(s.id);
        out.set(s.id, { it: s, qty: (cur?.qty ?? 0) + per * p.qty, for: cur ? `${cur.for}, ${p.name}` : p.name });
      }
    }
    return [...out.values()].filter((x) => !chosen.has(x.it.id)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock, products, saved]);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query || !stock) return [];
    return stock
      .map((it) => [it, score(it, query)] as const)
      .filter(([, s]) => s >= 0)
      .sort((a, b) => a[1] - b[1] || a[0].name.localeCompare(b[0].name, "th"))
      .slice(0, 8)
      .map(([it]) => it);
  }, [stock, query]);
  // ท้ายผลค้นหาเสมอ: ใช้ชื่อที่พิมพ์เอง (ของที่ยังไม่มีในคลัง)
  const options: (StockLite | { custom: string })[] = query ? [...results, { custom: q.trim() }] : [];

  if (!editable) {
    return saved.length ? (
      <ul className="mt-1.5 space-y-0.5 text-[12.5px] font-semibold text-slate-700">
        {saved.map((i, n) => (
          <li key={n}>• {needsPurchaseItemText(i)}</li>
        ))}
      </ul>
    ) : null;
  }

  const save = (next: NeedsPurchaseItem[]) => onSave(cleanNeedsPurchaseItems(next));
  const add = (o: StockLite | { custom: string }, qty?: number) => {
    const line: NeedsPurchaseItem =
      "custom" in o ? { name: o.custom, qty: qty || 1 } : { name: o.name, qty: qty || 1, unit: o.unit || "ชิ้น", stockItemId: o.id };
    // เลือกตัวเดิมซ้ำ = บวกจำนวน (ไม่ขึ้นสองบรรทัด)
    const dup = saved.findIndex((s) => (line.stockItemId ? s.stockItemId === line.stockItemId : !s.stockItemId && s.name === line.name));
    save(dup >= 0 ? saved.map((s, i) => (i === dup ? { ...s, qty: (s.qty ?? 0) + (line.qty ?? 1) } : s)) : [...saved, line]);
    setQ("");
    setOpen(false);
    setIdx(0);
  };
  const commitQty = (n: number) => {
    const raw = qtyDraft[n];
    if (raw === undefined) return;
    setQtyDraft((d) => {
      const { [n]: _, ...rest } = d;
      return rest;
    });
    const v = Math.max(0, Number(raw) || 0);
    if (v !== (saved[n].qty ?? 0)) save(saved.map((s, i) => (i === n ? { ...s, qty: v || undefined } : s)));
  };
  const remove = (n: number) => save(saved.filter((_, i) => i !== n));

  return (
    <div className="mt-2" ref={boxRef}>
      <p className="mb-1 text-[11px] font-bold text-rose-700">
        ของที่ต้องสั่ง <span className="text-rose-600">*</span>{" "}
        <span className="font-normal text-slate-500">(วัสดุจริง ไม่ใช่ชื่อสินค้า)</span>
      </p>

      {/* ⛔ บังคับใส่ — ยังไม่ใส่ = ลูกค้าโอนแล้วระบบยังไม่ส่งเข้า TP (เจ้าของร้านสั่ง 7 ต.ค. 69) */}
      {/* สีเหลืองอำพัน (ไม่ใช่แดง) — กล่องแม่เป็นโทนแดงอยู่แล้ว แดงซ้อนแดงอ่านยาก · เจ้าของร้านขอเปลี่ยนสี 7 ต.ค. 69 */}
      {saved.length === 0 && (
        <p role="alert" className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] font-bold leading-relaxed text-amber-900">
          {draft
            ? "ใส่ของที่ต้องสั่งอย่างน้อย 1 รายการ แล้วกดปุ่ม 🛒 ด้านล่าง"
            : "⚠️ ยังไม่มีรายการ — ค้นหาวัสดุด้านล่างเพื่อเพิ่ม"}
        </p>
      )}

      {/* รายการที่เลือกแล้ว — การ์ด 2 บรรทัด */}
      {saved.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {saved.map((s, n) => {
            const st = s.stockItemId ? byId.get(s.stockItemId) : undefined;
            return (
              <li key={`${s.stockItemId ?? s.name}-${n}`} className="rounded-lg border border-rose-200 bg-white px-2.5 py-2">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[12.5px] font-bold leading-snug text-slate-800">{s.name}</span>
                  <button
                    type="button"
                    onClick={() => remove(n)}
                    aria-label={`ลบ ${s.name}`}
                    className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <input
                    value={qtyDraft[n] ?? (s.qty ? String(s.qty) : "")}
                    onChange={(e) => setQtyDraft((d) => ({ ...d, [n]: e.target.value.replace(/[^\d.]/g, "") }))}
                    onBlur={() => commitQty(n)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    inputMode="decimal"
                    placeholder="จำนวน"
                    aria-label={`จำนวน ${s.name}`}
                    className="h-8 w-20 rounded-md border border-rose-200 px-2 text-right text-[12.5px] tabular-nums focus:border-rose-400 focus:outline-none"
                  />
                  <span className="text-[12px] text-slate-600">{s.unit || "ชิ้น"}</span>
                  {st ? (
                    <span className={`text-[11px] font-semibold ${Number(st.balance) < 0 ? "text-rose-600" : "text-slate-500"}`}>· คงเหลือ {fmt(st.balance)}</span>
                  ) : (
                    !s.stockItemId && <span className="rounded bg-slate-100 px-1.5 text-[10.5px] font-semibold text-slate-500">พิมพ์เอง · ไม่มีในคลัง</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 💡 แนะนำจากสินค้าในออเดอร์ */}
      {suggestions.length > 0 && (
        <div className="mb-2">
          <p className="mb-1 text-[10.5px] font-semibold text-slate-500">💡 วัสดุที่ผูกกับสินค้าในออเดอร์ — กดเพื่อเพิ่ม</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((x) => (
              <button
                key={x.it.id}
                type="button"
                onClick={() => add(x.it, x.qty)}
                title={`สำหรับ ${x.for}`}
                className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100"
              >
                + {x.it.name} ×{fmt(x.qty)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ค้นหาจากคลัง */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setIdx(0);
          }}
          onFocus={() => q && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !options.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % options.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + options.length) % options.length); }
            else if (e.key === "Enter") { e.preventDefault(); add(options[idx]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={stock ? '🔍 ค้นหาวัสดุในคลัง เช่น ซิป, ผ้า, P-…' : "กำลังโหลดคลังสต๊อก…"}
          aria-label="ค้นหาวัสดุในคลังสต๊อก"
          role="combobox"
          aria-expanded={open && options.length > 0}
          className="h-9 w-full rounded-lg border border-rose-200 bg-white px-2.5 text-[12.5px] text-slate-800 focus:border-rose-400 focus:outline-none"
        />
        {open && options.length > 0 && (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-rose-200 bg-white p-1 shadow-lg">
            {options.map((o, i) => (
              <li
                key={"custom" in o ? "__custom" : o.id}
                role="option"
                aria-selected={i === idx}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setIdx(i)}
                onClick={() => add(o)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${i === idx ? "bg-rose-50" : ""} ${"custom" in o ? "mt-1 border-t border-dashed border-rose-200" : ""}`}
              >
                {"custom" in o ? (
                  <span className="text-[12px] font-bold text-rose-700">➕ ใช้ “{o.custom}” <span className="font-normal text-slate-500">(พิมพ์เอง · ไม่มีในคลัง)</span></span>
                ) : (
                  <>
                    {o.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <span className="h-7 w-7 shrink-0 rounded bg-slate-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-slate-800">{o.name}</span>
                      {o.code && <span className="block truncate text-[10.5px] text-slate-400">{o.code}</span>}
                    </span>
                    <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${Number(o.balance) < 0 ? "text-rose-600" : "text-slate-500"}`}>
                      {fmt(o.balance)} {o.unit || ""}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
