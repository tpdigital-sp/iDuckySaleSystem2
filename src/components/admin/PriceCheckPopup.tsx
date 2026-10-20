"use client";

/**
 * 🧮 ป๊อปอัป "ตรวจราคาอีกรอบ" (Order.priceCheck) — เจ้าของร้านสั่ง 20 ต.ค. 69 หลัง OD-260910-5776
 *
 * รายการเข้าใบทีหลัง (ลูกค้าสั่งเพิ่ม · แอดมินหยิบจากหน้าร้าน · แก้ตัวเลือก) → ขั้นราคาทั้งล็อตขยับ
 * → เด้งเต็มจอเฉพาะคนที่แก้ออเดอร์ได้ · ปิดได้ทางเดียวคือกด "ตรวจราคาแล้ว" (ลงชื่อในประวัติ)
 * เทียบราคา/หน่วยทุกบรรทัดกับตาราง (คิดทั้งใบเป็นล็อตเดียวเหมือนตะกร้า) — ไม่ตรง = เตือนเฉย ๆ ให้แอดมินไปแก้เอง
 */

import { useState } from "react";
import { priceCheckPending, type Order } from "@/lib/admin-data";
import { thaiDateTime } from "@/lib/bangkok-time";
import { tableUnitPrices } from "@/lib/order-lot-reprice";
import { formatPrice, type Product } from "@/lib/products";

type CheckResult = { priceCheck: Order["priceCheck"] | null; savedAt?: string; log?: Order["log"] };

/** บรรทัดที่เข้าใบในรอบนี้ — addedAt ตั้งแต่ priceCheck.at (เผื่อเวลาเครื่อง/ประตูเขียนประทับต่างกันเล็กน้อย 1 นาที) */
function isNewLine(addedAt: string | undefined, since: string): boolean {
  if (!addedAt) return false;
  return Date.parse(addedAt) >= Date.parse(since) - 60_000;
}

export function PriceCheckPopup({
  order,
  canCheck,
  productOf,
  productsReady,
  onChecked,
}: {
  order: Order;
  /** คนที่แก้ออเดอร์ได้เท่านั้นที่เห็น */
  canCheck: boolean;
  productOf: (id: string) => Product | undefined;
  /** ข้อมูลสินค้าโหลดครบหรือยัง (ยังไม่ครบ = ช่องเทียบตารางขึ้น "กำลังโหลด") */
  productsReady: boolean;
  onChecked: (r: CheckResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!canCheck || !priceCheckPending(order)) return null;
  const c = order.priceCheck!;
  const table = tableUnitPrices(order.items, productOf);

  const rows = order.items.map((it, i) => {
    const want = table.get(i);
    const loaded = !!productOf(it.productId);
    const state: "fee" | "self" | "wait" | "none" | "ok" | "off" =
      want === undefined
        ? "fee"
        : it.quoteNote
          ? "self"
          : !loaded
            ? productsReady
              ? "none"
              : "wait"
            : !(want > 0)
              ? "none"
              : Math.round(want) === Math.round(it.unitPrice)
                ? "ok"
                : "off";
    return { it, i, want: Math.round(want ?? 0), state, fresh: isNewLine(it.addedAt, c.at) };
  });
  const off = rows.filter((r) => r.state === "off");
  const waiting = rows.some((r) => r.state === "wait");
  // รวมจำนวนต่อสินค้า — เห็นว่าล็อตทั้งใบกี่ชิ้น (ขั้นราคาคิดจากยอดนี้)
  const lots = new Map<string, { name: string; qty: number }>();
  for (const r of rows) {
    if (r.state === "fee") continue;
    const l = lots.get(r.it.productId) ?? { name: r.it.name, qty: 0 };
    l.qty += r.it.qty;
    lots.set(r.it.productId, l);
  }
  const subtotal = order.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  async function confirm() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/price-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, lastAt: c.lastAt ?? c.at }),
      });
      const j = (await res.json().catch(() => ({}))) as CheckResult & { error?: string };
      if (!res.ok) {
        if (j.priceCheck) onChecked({ priceCheck: j.priceCheck });
        throw new Error(j.error || `บันทึกไม่สำเร็จ (${res.status})`);
      }
      onChecked(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[69] flex items-end justify-center bg-slate-900/75 p-0 print:hidden sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="rounded-t-3xl bg-sky-700 px-5 py-4 text-white">
          <p className="text-lg font-extrabold">🔎 มีรายการเข้าใบ — ตรวจราคาอีกรอบ</p>
          <p className="mt-0.5 text-sm font-semibold text-sky-100">
            <span className="font-mono">{order.id}</span> · {c.what} · {thaiDateTime(new Date(c.lastAt ?? c.at))}
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="grid grid-cols-[minmax(0,1fr)_56px_92px] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
              <span>รายการ</span>
              <span className="text-right">จำนวน</span>
              <span className="text-right">ราคา/หน่วย</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.i}
                className={`grid grid-cols-[minmax(0,1fr)_56px_92px] items-start gap-2 border-t border-slate-100 px-3 py-2 text-sm tabular-nums ${r.state === "off" ? "bg-rose-50" : ""}`}
              >
                <span className="min-w-0">
                  <span className="font-bold text-slate-800">{r.it.name}</span>
                  {r.fresh && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-800">ใหม่</span>}
                  {r.it.sel && Object.keys(r.it.sel).length > 0 && (
                    <span className="block truncate text-[11px] text-slate-500">
                      {Object.entries(r.it.sel)
                        .filter(([k, v]) => v && !/^ลาย|ไฟล์|หมายเหตุ/.test(k) && String(v).length < 40)
                        .slice(0, 3)
                        .map(([, v]) => v)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <span className="text-right text-slate-700">{r.it.qty.toLocaleString("th-TH")}</span>
                <span className="text-right">
                  <span className={`font-bold ${r.state === "off" ? "text-rose-700" : "text-slate-900"}`}>{formatPrice(r.it.unitPrice)}</span>
                  <span
                    className={`block text-[11px] font-semibold ${
                      r.state === "off" ? "text-rose-700" : r.state === "ok" ? "text-emerald-700" : "text-slate-400"
                    }`}
                  >
                    {r.state === "ok"
                      ? "✓ ตรงตาราง"
                      : r.state === "off"
                        ? `ตาราง ${formatPrice(r.want)}`
                        : r.state === "self"
                          ? "ตีราคาเอง"
                          : r.state === "wait"
                            ? "กำลังโหลด…"
                            : r.state === "none"
                              ? "ไม่มีในตาราง"
                              : r.it.productId.includes("#")
                                ? "ค่าบริการ"
                                : "รายการพิเศษ"}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1 rounded-2xl bg-slate-50 p-3 text-sm tabular-nums">
            {[...lots.values()].map((l) => (
              <div key={l.name} className="flex justify-between gap-3">
                <span className="text-slate-500">รวมทั้งใบ · {l.name}</span>
                <span className="shrink-0 font-semibold text-slate-800">{l.qty.toLocaleString("th-TH")} ชิ้น</span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-1.5 font-extrabold text-slate-900">
              <span>ยอดสินค้า</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
          </div>

          {c.note && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
              ระบบลดราคาบรรทัดเดิมให้เท่ากันทั้งบิลแล้ว: {c.note}
            </p>
          )}
          {off.length > 0 ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 ring-2 ring-rose-300">
              ⚠️ ราคาไม่ตรงตาราง {off.length} บรรทัด — ตรวจแล้วแก้ราคาเองในหน้าออเดอร์
              <span className="block text-xs font-semibold">ใบที่ลูกค้าโอนแล้วแก้ราคาเองไม่ได้ (ระบบล็อก) — แจ้งเจ้าของร้าน</span>
            </p>
          ) : (
            !waiting && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
                ✓ ราคาที่คิดจากตารางตรงทุกบรรทัด
              </p>
            )
          )}
          <p className="text-[11px] leading-snug text-slate-500">เด้งทุกครั้งที่เปิดใบนี้ จนกว่าจะมีคนกด “ตรวจราคาแล้ว” — ระบบลงชื่อคนกดในประวัติ</p>
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">{err}</p>}
        </div>

        <div className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="min-h-[48px] w-full rounded-xl bg-slate-900 px-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "กำลังบันทึก…" : "✓ ตรวจราคาแล้ว"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 🗑🧮 ตารางตรวจราคาในกล่องยืนยัน "ลบรายการ" — เห็นก่อนกดว่ารายการที่เหลือราคาเปลี่ยนไหม (เจ้าของร้านสั่ง 20 ต.ค. 69)
 * ราคาใหม่มาจาก relotAfterShrink (ล็อตหด → คืนราคาขั้นที่ล็อตเหลือจริง) · เทียบตารางแบบเดียวกับป๊อปอัปตรวจราคา
 */
export function RemovePriceCheck({
  before,
  removedIdx,
  after,
  productOf,
  productsReady,
}: {
  before: Order["items"];
  removedIdx: number;
  /** รายการหลังลบ (ราคาที่ปรับแล้ว) */
  after: Order["items"];
  productOf: (id: string) => Product | undefined;
  productsReady: boolean;
}) {
  const prevIndex = before.map((_, i) => i).filter((i) => i !== removedIdx);
  const table = tableUnitPrices(after, productOf);
  const removed = before[removedIdx];
  const sum = (items: Order["items"]) => items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const oldSub = sum(before);
  const lost = removed ? removed.qty * removed.unitPrice : 0;
  const newSub = sum(after);
  const bump = newSub - (oldSub - lost);
  const rows = after.map((it, j) => {
    const was = before[prevIndex[j]]?.unitPrice ?? it.unitPrice;
    const want = table.get(j);
    const off = want !== undefined && want > 0 && !it.quoteNote && !!productOf(it.productId) && Math.round(want) !== Math.round(it.unitPrice);
    return { it, j, was, want: Math.round(want ?? 0), off };
  });
  const offN = rows.filter((r) => r.off).length;

  return (
    <div className="space-y-2 text-left">
      {bump !== 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 ring-1 ring-amber-300">
          🔎 ตรวจราคาอีกรอบ — ล็อตที่เหลือไม่ถึงขั้นราคาเดิม ระบบปรับราคา/หน่วยให้ตามตาราง
        </p>
      ) : offN > 0 ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 ring-1 ring-rose-300">
          ⚠️ ราคาไม่ตรงตาราง {offN} บรรทัด — ตรวจแล้วแก้ราคาเองหลังลบ
        </p>
      ) : productsReady ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200">✓ ราคาที่เหลือตรงตารางทุกบรรทัด</p>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
          ยังโหลดตารางราคาไม่ครบ — ตรวจราคาเองหลังลบ
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
          <div className="grid grid-cols-[minmax(0,1fr)_48px_96px] gap-2 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
            <span>รายการที่เหลือ</span>
            <span className="text-right">จำนวน</span>
            <span className="text-right">ราคา/หน่วย</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.j}
              className={`grid grid-cols-[minmax(0,1fr)_48px_96px] items-start gap-2 border-t border-slate-100 px-3 py-1.5 text-xs tabular-nums ${r.off ? "bg-rose-50" : ""}`}
            >
              <span className="min-w-0 truncate font-semibold text-slate-800">{r.it.name}</span>
              <span className="text-right text-slate-700">{r.it.qty.toLocaleString("th-TH")}</span>
              <span className="text-right">
                {r.was !== r.it.unitPrice && <s className="mr-1 text-slate-400">{formatPrice(r.was)}</s>}
                <span className={`font-bold ${r.was !== r.it.unitPrice ? "text-rose-700" : "text-slate-900"}`}>{formatPrice(r.it.unitPrice)}</span>
                {r.off && <span className="block text-[11px] font-semibold text-rose-700">ตาราง {formatPrice(r.want)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-0.5 rounded-xl bg-slate-50 px-3 py-2 text-xs tabular-nums">
        <div className="flex justify-between">
          <span className="text-slate-500">ยอดสินค้าเดิม</span>
          <span>{formatPrice(oldSub)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">ลบรายการนี้</span>
          <span>−{formatPrice(lost)}</span>
        </div>
        {bump !== 0 && (
          <div className="flex justify-between font-bold text-rose-700">
            <span>ปรับราคาตามล็อตที่เหลือ</span>
            <span>+{formatPrice(bump)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-extrabold text-slate-900">
          <span>ยอดสินค้าใหม่</span>
          <span>{formatPrice(newSub)}</span>
        </div>
      </div>
    </div>
  );
}
