"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "@/components/Barcode";
import { formatPrice } from "@/lib/products";
import { MOCK_ORDERS, noteHasText, orderTotal, proofsOf, type Order } from "@/lib/admin-data";

/** yyyy-mm-dd → dd/mm/yyyy พ.ศ. (เช่น 2025-09-03 → 03/09/2568) */
function fmtThaiDate(d?: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${Number(y) + 543}`;
}
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { publicOrigin, SHOP } from "@/lib/shop-info";
import { useCan } from "@/lib/perm-context";

/** work = ใบงาน+ใบปะหน้าพัสดุ (ใบเดียวจบ) · receipt = ใบเสร็จให้ลูกค้า */
type DocKey = "work" | "receipt";

/** ตัดลิงก์ไฟล์ลาย/อีเมล (URL) ออกจากตัวเลือก — ไม่จำเป็นบนใบงานกระดาษ */
function cleanSelections(sel?: string): string {
  if (!sel) return "";
  return sel
    .split(" · ")
    .filter((seg) => !/https?:\/\/|ลิงก์ไฟล์|อีเมล/i.test(seg))
    .join(" · ");
}

export default function PrintOrderPage() {
  const params = useParams<{ id: string }>();
  const orderId = decodeURIComponent(String(params?.id ?? ""));

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Record<DocKey, boolean>>({ work: true, receipt: false });
  const [withProofs, setWithProofs] = useState(true);
  const [origin, setOrigin] = useState(""); // สำหรับ QR มือถือ (ต้องอ่านฝั่งเบราว์เซอร์)
  const seesMoney = useCan()("orders.money"); // ฝ่ายแพ็คไม่เห็นใบเสร็จ (มีราคา)

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    const list = r.orders.length > 0 ? r.orders : MOCK_ORDERS;
    setOrder(list.find((o) => o.id === orderId) ?? null);
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    // ?doc=work|receipt (รองรับลิงก์เก่า job/label → work)
    setOrigin(publicOrigin()); // ต้องเป็นโดเมนจริง มือถือถึงสแกนแล้วเปิดได้
    const only = new URLSearchParams(window.location.search).get("doc");
    if (only === "receipt") setDocs({ work: false, receipt: true });
    else if (only) setDocs({ work: true, receipt: false });
    void load();
  }, [load]);

  if (loading) return <p className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</p>;
  if (!order) {
    return (
      <div className="p-10 text-center">
        <p className="font-semibold text-slate-600">ไม่พบออเดอร์ {orderId}</p>
        <Link href="/admin/orders" className="mt-3 inline-block text-sm font-semibold text-amber-600 hover:underline">
          ← กลับหน้าคำสั่งซื้อ
        </Link>
      </div>
    );
  }

  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  // จำกัดจำนวนแถวให้พอดี A4 1 หน้า — ถ้าเกินให้ดูต่อผ่านมือถือ (มีรูปแบบงาน = แถวสูง เลยได้น้อยกว่า)
  const PRINT_ROW_LIMIT = withProofs ? 4 : 12;
  const shownItems = order.items.slice(0, PRINT_ROW_LIMIT);
  const overflowCount = order.items.length - shownItems.length;
  const printedAt = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const chosen = (Object.keys(docs) as DocKey[]).filter((k) => docs[k]);
  /** ลิงก์เต็มสำหรับ QR มือถือ — เปิดหน้าออเดอร์เพื่อเช็คของตามภาพ */
  const orderUrl = origin ? `${origin}/admin/orders/${encodeURIComponent(order.id)}` : "";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          /* ให้สีหมายเหตุพิมพ์ออกตรงตามที่เลือก */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .sheet { break-after: page; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
          .sheet:last-child { break-after: auto; }
          tr, .keep { break-inside: avoid; }
        }
      `}</style>

      {/* ── แถบเครื่องมือ (ไม่พิมพ์ออกมา) ── */}
      <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← กลับหน้าออเดอร์
        </Link>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {(([
            ["work", "ใบงาน + ใบปะหน้า"],
            // ใบเสร็จมีราคา — เฉพาะคนที่เห็นข้อมูลเงินได้
            ...(seesMoney ? [["receipt", "ใบเสร็จ"]] : []),
          ] as [DocKey, string][])).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={docs[k]}
                onChange={(e) => setDocs((d) => ({ ...d, [k]: e.target.checked }))}
                className="h-4 w-4 accent-amber-500"
              />
              {label}
            </label>
          ))}
          <span className="text-slate-300">|</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={withProofs}
              onChange={(e) => setWithProofs(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            แนบรูปแบบงาน
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            // ปริ้นใบงาน (มีที่อยู่/ใบปะหน้า) = ล็อกที่อยู่ฝั่งลูกค้า — ตั้ง printedAt ครั้งแรก
            if (docs.work && order && !order.printedAt) {
              fetch("/api/admin/orders/printed", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: order.id }),
              }).catch(() => {});
              setOrder((o) => (o ? { ...o, printedAt: new Date().toISOString() } : o));
            }
            window.print();
          }}
          disabled={chosen.length === 0}
          className="ml-auto rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-40"
        >
          🖨️ พิมพ์
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] space-y-6 px-4 pb-16 text-slate-900">
        {chosen.length === 0 && (
          <p className="no-print rounded-xl bg-amber-50 p-6 text-center text-sm text-amber-800 ring-1 ring-amber-200">
            เลือกเอกสารที่ต้องการพิมพ์อย่างน้อย 1 อย่างด้านบน
          </p>
        )}

        {/* ═══════════ ใบงาน + ใบปะหน้าพัสดุ (ใบเดียวจบ) ═══════════ */}
        {docs.work && (
          <section className="sheet rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            {/* แถวบน: ผู้ส่ง | วิธีจัดส่ง + บาร์โค้ด (เลขออเดอร์อยู่ในบาร์โค้ด + กล่องใบงานด้านล่างแล้ว) */}
            <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ผู้ส่ง / From</p>
                <p className="mt-0.5 text-sm font-bold">{SHOP.legalName}</p>
                <p className="text-xs leading-snug text-slate-600">{SHOP.addressLines.join(" ")}</p>
                <p className="text-xs tabular-nums text-slate-600">โทร. {SHOP.phone}</p>
              </div>
              {/* วิธีจัดส่งตัวใหญ่เหนือบาร์โค้ด (สไตล์ป้ายขนส่ง) · บาร์โค้ด = เลขออเดอร์ล้วน สำหรับเครื่องยิงที่คอม */}
              <div className="flex shrink-0 flex-col items-end">
                <p className="text-3xl font-extrabold uppercase leading-none tracking-tight">{order.shipping}</p>
                <div className="mt-1.5">
                  <Barcode value={order.id} displayValue={false} height={30} width={1.2} />
                </div>
                <p className="mt-0.5 text-[9px] leading-tight text-slate-500">สแกนด้วยเครื่องยิง → ผูกเลขพัสดุ</p>
              </div>
            </div>

            {/* ผู้รับ — ส่วนนี้ขึ้นไปคือ "ป้ายติดกล่อง" ตัดตามเส้นประด้านล่าง */}
            <div className="keep mt-4 rounded border border-slate-300 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ผู้รับ / To</p>
              <p className="mt-1 text-2xl font-extrabold leading-tight">{order.customer}</p>
              <p className="mt-1 whitespace-pre-line text-lg leading-snug">{order.address}</p>
              <p className="mt-2 text-xl font-bold tabular-nums">โทร. {order.phone}</p>
            </div>

            {/* เส้นประสำหรับตัด — ส่วนบนเอาไปติดหน้ากล่อง ส่วนล่างเก็บไว้เป็นใบงาน */}
            <div className="relative my-6" aria-hidden>
              <div className="border-t-2 border-dashed border-slate-400" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[10px] font-bold tracking-wide text-slate-400">
                ✂ ตัดตามเส้นนี้ — ส่วนบนติดหน้ากล่อง · ส่วนล่างเก็บเป็นใบงาน
              </span>
            </div>

            {/* หัวใบงาน + QR มือถือ — พนักงานแพ็คสแกนเพื่อเปิดหน้าออเดอร์ เช็คของตามภาพจริง */}
            <div className="keep flex items-center justify-between gap-4 rounded border border-slate-300 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ใบงาน / Packing list</p>
                <p className="mt-0.5 font-mono text-lg font-extrabold tracking-tight">{order.id}</p>
                <p className="text-xs text-slate-600">
                  {order.customer} · {totalQty} ชิ้น · {order.items.length} รายการ
                </p>
                {(order.shipDate?.from || order.shipDate?.to) && (
                  <p className="mt-1.5 inline-block rounded bg-white px-2 py-1 text-base font-bold ring-1 ring-slate-300">
                    📅 วันที่จัดส่ง: {fmtThaiDate(order.shipDate?.from)}
                    {order.shipDate?.to && order.shipDate.to !== order.shipDate.from ? ` – ${fmtThaiDate(order.shipDate.to)}` : ""}
                  </p>
                )}
              </div>
              {orderUrl && (
                <div className="shrink-0 text-center">
                  <QRCodeSVG value={orderUrl} size={82} level="M" marginSize={0} />
                  <p className="mt-1 text-[9px] font-bold leading-tight text-slate-600">📱 มือถือ</p>
                  <p className="text-[9px] leading-tight text-slate-500">เปิดหน้าออเดอร์ · เช็คของ</p>
                </div>
              )}
            </div>

            {/* ตารางงาน */}
            <table className="mt-5 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <th className="w-8 py-2 pl-2">#</th>
                  <th className="w-96 py-2">แบบงาน</th>
                  <th className="py-2">รายการ / ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {shownItems.map((it, i) => {
                  const proofs = proofsOf(it);
                  return (
                    <tr key={`${it.productId}-${i}`} className="border-b border-slate-200 align-top">
                      <td className="py-3 pl-2 tabular-nums">{i + 1}</td>
                      <td className="py-3 pr-4">
                        {!withProofs ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : proofs.length > 0 ? (
                          /* โชว์รูปแบบงานครบทุกรูป — เรียงต่อกัน (ขึ้นบรรทัดใหม่อัตโนมัติ) */
                          <div className="flex flex-wrap gap-1.5">
                            {proofs.map((p, j) => (
                              <div key={`${p.url}-${j}`} className="w-20">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={p.url}
                                  alt={`แบบงาน ${it.name} รูปที่ ${j + 1}`}
                                  className="h-20 w-20 rounded border border-slate-300 object-contain"
                                />
                                <p className="mt-0.5 text-[9px] leading-tight text-slate-600">
                                  {p.qty ? <strong>{p.qty} ชิ้น</strong> : null}
                                  {p.qty && p.note ? " · " : null}
                                  {p.note}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-rose-600">⚠️ ยังไม่มีแบบงาน</p>
                        )}
                      </td>
                      <td className="py-3">
                        <p className="font-bold">{it.name}</p>
                        {cleanSelections(it.selections) && (
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{cleanSelections(it.selections)}</p>
                        )}
                        {noteHasText(it.adminNote) && (
                          <p
                            className="mt-1 leading-snug text-slate-900"
                            dangerouslySetInnerHTML={{ __html: `📝 ${it.adminNote}` }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-300">
                  <td colSpan={3} className="py-2 pl-2 text-xs text-slate-500">
                    รวม {order.items.length} รายการ · {totalQty} ชิ้น · สถานะ: {order.status}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* รายการเกิน A4 → ให้ดูต่อผ่านมือถือ (สแกน QR ด้านบน) ตัวใหญ่ ๆ */}
            {overflowCount > 0 && (
              <div className="keep mt-4 rounded-lg border-2 border-slate-900 bg-slate-50 p-4 text-center">
                <p className="text-xl font-extrabold text-slate-900">
                  📱 ยังมีอีก {overflowCount} รายการ — ดูทั้งหมดผ่านมือถือ
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  สแกน QR ด้านบนเพื่อเปิดหน้าออเดอร์ · เช็ครายการ + แบบงานครบทุกชิ้น
                </p>
              </div>
            )}

            {order.note && (
              <p className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm">
                <strong>หมายเหตุลูกค้า:</strong> {order.note}
              </p>
            )}

            {noteHasText(order.billNote) && (
              <p
                className="mt-3 rounded border border-slate-300 p-3 leading-snug text-slate-900"
                dangerouslySetInnerHTML={{ __html: order.billNote! }}
              />
            )}

            <div className="mt-5 flex flex-wrap gap-8 text-xs text-slate-500">
              <p>ผู้ผลิต ............................. วันที่ ..............</p>
              <p>ผู้ตรวจ ............................. วันที่ ..............</p>
              <p>ผู้แพ็ค ............................. วันที่ ..............</p>
            </div>
            <p className="mt-3 text-right text-[10px] text-slate-400">พิมพ์เมื่อ {printedAt}</p>
          </section>
        )}

        {/* ═══════════ ใบเสร็จ ═══════════ */}
        {docs.receipt && seesMoney && (
          <section className="sheet rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
              <div>
                <p className="text-lg font-extrabold">{SHOP.legalName}</p>
                <p className="text-xs leading-snug text-slate-600">{SHOP.addressLines.join(" ")}</p>
                <p className="text-xs text-slate-600">โทร. {SHOP.phone}</p>
                {SHOP.taxId && <p className="text-xs text-slate-600">เลขประจำตัวผู้เสียภาษี {SHOP.taxId}</p>}
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold">ใบเสร็จรับเงิน</p>
                <p className="font-mono text-sm font-bold">{order.id}</p>
                <p className="text-xs text-slate-500">{order.date}</p>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <p className="text-slate-500">ลูกค้า</p>
              <p className="font-bold">
                {order.customer} · {order.phone}
              </p>
              <p className="leading-snug">{order.address}</p>
            </div>

            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <th className="w-8 py-2 pl-2">#</th>
                  <th className="py-2">รายการ</th>
                  <th className="w-24 py-2 text-right">ราคา/หน่วย</th>
                  <th className="w-16 py-2 text-center">จำนวน</th>
                  <th className="w-24 py-2 pr-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={`${it.productId}-${i}`} className="border-b border-slate-200 align-top">
                    <td className="py-2 pl-2 tabular-nums">{i + 1}</td>
                    <td className="py-2">
                      <p className="font-semibold">{it.name}</p>
                      {it.selections && <p className="text-xs text-slate-500">{it.selections}</p>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(it.unitPrice)}</td>
                    <td className="py-2 text-center tabular-nums">{it.qty}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatPrice(it.qty * it.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto mt-3 w-64 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">รวมสินค้า</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">ค่าจัดส่ง</span>
                <span className="tabular-nums">{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
              </div>
              {order.discount && order.discount.amount > 0 && (
                <div className="flex justify-between py-1 text-emerald-600">
                  <span>{order.discount.label}</span>
                  <span className="tabular-nums">−{formatPrice(order.discount.amount)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t-2 border-slate-900 py-1.5 text-base font-extrabold">
                <span>ยอดรวมทั้งสิ้น</span>
                <span className="tabular-nums">{formatPrice(orderTotal(order))}</span>
              </div>
            </div>

            <p className="mt-3 text-sm">
              <span className="text-slate-500">ชำระโดย:</span> {order.payment}
              {order.slipUrl && <span className="ml-2 font-semibold text-emerald-700">· ลูกค้าแจ้งโอนแล้ว</span>}
            </p>

            <div className="mt-10 flex justify-end">
              <div className="text-center text-xs text-slate-500">
                <p>.................................................</p>
                <p className="mt-1">ผู้รับเงิน</p>
              </div>
            </div>
            <p className="mt-4 text-right text-[10px] text-slate-400">พิมพ์เมื่อ {printedAt}</p>
          </section>
        )}
      </div>
    </>
  );
}
