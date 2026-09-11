"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { giftLinesOf, giftArtLabel } from "@/lib/gifts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "@/components/Barcode";
import ThaiPostTimeline, { type ThpEventView } from "@/components/ThaiPostTimeline";
import { artQtyOf, formatPrice } from "@/lib/products";
import { adminDiscountAmount, MOCK_ORDERS, nextPlannedRound, noteHasText, orderEarlyPayAmount, orderFullyPaid, orderItemDiscounts, orderNeedsTaxInvoiceInBox, orderNetTransfer, orderTotal, orderVatAmount, orderWhtAmount, proofsOf, proofUnit, taxInvoiceDocOf, type Order } from "@/lib/admin-data";

/** yyyy-mm-dd → dd/mm/yyyy พ.ศ. (เช่น 2025-09-03 → 03/09/2568) */
function fmtThaiDate(d?: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${Number(y) + 543}`;
}
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { publicOrigin } from "@/lib/shop-info";
import { fetchShopPayment, shippingOf, shopInfoOf, type ShippingMethod, type ShopInfo } from "@/lib/shop-settings";
import { resolveShipLabel } from "@/lib/ship-label";
import { useCan } from "@/lib/perm-context";
import { PACK_SCAN_PARAM } from "@/lib/permissions";
import { parsePrintFrame, PLACEMENT_LABEL, PLACEMENT_SPEC_LABEL, sheetsFor } from "@/lib/design-templates";
import { SpecLines } from "@/components/SpecLines";
import { paginateRows, printedRowsOf, type PageRange } from "@/lib/print-paginate";

/**
 * ข้อความสั้นบนป้ายแปะกล่อง — เอาเฉพาะตัวเลือกสินค้า (ขนาด/สี/รุ่น)
 * ตัดพวกพิกัด/ลิงก์/สรุปการวางลายออก เพราะป้ายต้องอ่านจากไกลได้ในบรรทัดเดียวสองบรรทัด
 */
function boxSummary(it: Order["items"][number]): string {
  const opts = optionText(it);
  if (opts) return opts;
  // ออเดอร์เก่าที่ไม่มีตัวเลือกแบบ key-value — ตัดให้สั้นพอติดกล่อง
  const t = cleanSelections(it.selections);
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/** หัวข้อที่ไม่ต้องขึ้นใบงาน — พิกัด/ลิงก์/สรุปการวางลาย (ทีมผลิตดูจากไฟล์ .ai) */
const PRINT_SKIP = ["ภาพลายที่แนบ", "ภาพลายที่แนบ (ด้านหลัง)", "รอเช็คสต๊อก", "ลิงก์ไฟล์ลาย/อีเมล", PLACEMENT_SPEC_LABEL, PLACEMENT_LABEL];

/** ตัวเลือกสินค้าล้วน ๆ (ขนาด/สี/รุ่น) — ตัดพิกัด/ลิงก์/สรุปการวางลายออก */
function optionText(it: Order["items"][number]): string {
  return Object.entries(it.sel ?? {})
    .filter(([k, v]) => v && !PRINT_SKIP.includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

/**
 * งานที่ลูกค้าวางลายเอง — ใบงานเอาแค่ "ตัวเลือก + ลายที่เท่าไหร่ กี่ชิ้น" บรรทัดละลาย
 * (พิกัด/DPI/ขนาดกรอบยาวเป็นพรืด อ่านบนกระดาษไม่ไหว · ตัวเลขจริงดูจากไฟล์ .ai ที่โหลดไป)
 * คืนอาเรย์ว่าง = ไม่ใช่งานวางลายเอง ให้แสดงตัวเลือกแบบเดิม
 */
function designLines(it: Order["items"][number]): string[] {
  if (!it.sel?.[PLACEMENT_SPEC_LABEL]) return [];
  const proofs = proofsOf(it);
  if (!proofs.length) return [];
  const opts = optionText(it);
  return proofs.map((p, i) =>
    [opts, `ลายที่ ${i + 1}${p.qty ? ` × ${p.qty} ${proofUnit(p)}` : ""}`].filter(Boolean).join(" · "),
  );
}

/** work = ใบงาน+ใบปะหน้าพัสดุ (ใบเดียวจบ) · receipt = ใบเสร็จให้ลูกค้า · box = ใบแปะหน้ากล่อง */
type DocKey = "work" | "receipt" | "box";

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

  /** ออเดอร์ที่จะปริ้น — ปกติใบเดียวตาม [id] · มากับ ?ids= จากคิวปริ้นได้หลายใบรวดเดียว */
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<Record<DocKey, boolean>>({ work: true, receipt: false, box: false });
  /** 🚚 ?doc=label — พิมพ์เฉพาะส่วน "ใบปะหน้าพัสดุ" (ผู้ส่ง/ผู้รับ/บาร์โค้ด) ไม่เอาใบงานด้านล่าง · ใช้กับกล่องรอบถัดไปของใบแบ่งส่ง */
  const [labelOnly, setLabelOnly] = useState(false);
  const [withProofs, setWithProofs] = useState(true);
  const [origin, setOrigin] = useState(""); // สำหรับ QR มือถือ (ต้องอ่านฝั่งเบราว์เซอร์)
  const [shop, setShop] = useState<ShopInfo>(shopInfoOf(null)); // ข้อมูลร้าน (แอดมินแก้ได้ที่ตั้งค่าระบบ)
  const [shipMethods, setShipMethods] = useState<ShippingMethod[]>([]); // วิธีส่งที่ร้านตั้ง — ไว้แปลงป้าย "ค่าส่ง"/ป้ายว่างเป็นชื่อวิธีส่งจริงตามราคา
  const seesMoney = useCan()("orders.money"); // ฝ่ายแพ็คไม่เห็นใบเสร็จ (มีราคา)

  const load = useCallback(async (wanted: string[]) => {
    const r = await fetchOrdersAdmin();
    const list = r.orders.length > 0 ? r.orders : MOCK_ORDERS;
    // คงลำดับตามที่เลือกมาจากคิว — ใบที่หาไม่เจอข้ามไป
    setOrders(wanted.map((id) => list.find((o) => o.id === id)).filter((o): o is Order => Boolean(o)));
    setLoading(false);
  }, []);

  useEffect(() => {
    // ?doc=work|receipt (รองรับลิงก์เก่า job/label → work)
    setOrigin(publicOrigin()); // ต้องเป็นโดเมนจริง มือถือถึงสแกนแล้วเปิดได้
    const sp = new URLSearchParams(window.location.search);
    const only = sp.get("doc");
    if (only === "receipt") setDocs({ work: false, receipt: true, box: false });
    else if (only === "box") setDocs({ work: false, receipt: false, box: true });
    else if (only) setDocs({ work: true, receipt: false, box: false });
    setLabelOnly(only === "label");
    void fetchShopPayment().then((p) => {
      setShop(shopInfoOf(p));
      setShipMethods(shippingOf(p));
    });
    // ?ids=A,B,C = ติ๊กเลือกจากคิวปริ้นมาหลายใบ — ไม่มีก็ปริ้นใบเดียวตาม [id]
    const multi = (sp.get("ids") ?? "")
      .split(",")
      .map((s) => decodeURIComponent(s.trim()))
      .filter(Boolean);
    void load(multi.length > 0 ? Array.from(new Set(multi)) : [orderId]);
  }, [load, orderId]);

  if (loading) return <p className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</p>;
  if (orders.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="font-semibold text-slate-600">ไม่พบออเดอร์ {orderId}</p>
        <Link href="/admin/orders" className="mt-3 inline-block text-sm font-semibold text-amber-600 hover:underline">
          ← กลับหน้าคำสั่งซื้อ
        </Link>
      </div>
    );
  }

  const batch = orders.length > 1;
  // 🔒 เงินครบเป็นเรื่องรายใบ — ปริ้นรวมจึงดูทั้ง "ครบทุกใบ" (ป้ายเตือน) และ "ครบอย่างน้อยหนึ่งใบ" (เปิดใบเสร็จได้)
  const allPaid = orders.every((o) => orderFullyPaid(o));
  const anyPaid = orders.some((o) => orderFullyPaid(o));
  const unpaidCount = orders.filter((o) => !orderFullyPaid(o)).length;
  // ใบเสร็จติ๊กได้ก็ต่อเมื่อมีใบที่เก็บเงินครบอย่างน้อยหนึ่งใบ (ใบที่ไม่ครบจะไม่ออกใบเสร็จอยู่แล้ว)
  const chosen = (Object.keys(docs) as DocKey[]).filter((k) => docs[k] && !(k === "receipt" && !anyPaid));

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          /* ให้สีหมายเหตุพิมพ์ออกตรงตามที่เลือก */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .print-wrap { padding: 0 !important; }
          /* 1 ออเดอร์ = 1 หน้า A4 เป๊ะ (277mm = A4 หัก margin) — ส่วนเกินถูกตัด (ดูต่อผ่านมือถือ) */
          .sheet { break-after: page; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; height: 277mm; overflow: hidden; display: flex; flex-direction: column; }
          .sheet:last-child { break-after: auto; }
          /* โซนตารางงาน = ยืดเต็มที่เหลือ แล้วตัดส่วนเกิน (หัว+ท้ายไม่โดนตัด) */
          .sheet-body { flex: 1 1 auto; min-height: 0; overflow: hidden; }
          .keep { break-inside: avoid; }
        }
      `}</style>

      {/* ── แถบเครื่องมือ (ไม่พิมพ์ออกมา) ── */}
      <div className="no-print sticky top-0 z-10 mb-6 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
        <Link
          href={batch ? "/admin/print" : `/admin/orders/${encodeURIComponent(orders[0].id)}`}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          {batch ? "← กลับคิวปริ้น" : "← กลับหน้าออเดอร์"}
        </Link>

        {batch && (
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
            🖨 ปริ้นรวม {orders.length} ใบ — ใบละหน้า เรียงตามที่เลือกจากคิว
          </span>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {(([
            // ยังเก็บเงินไม่ครบ = ใบปะหน้า (ที่อยู่จัดส่ง) ไม่ออก — ป้ายต้องบอกตรง ๆ ว่าจะได้แค่ใบงาน
            ["work", allPaid ? "ใบงาน + ใบปะหน้าพัสดุ" : "ใบงาน"],
            // ป้ายแปะหน้ากล่อง — ตัวใหญ่ อ่านจากไกล ไม่มีราคา ฝ่ายแพ็คใช้ได้
            ["box", "🏷 ใบแปะหน้ากล่อง"],
            // ใบเสร็จมีราคา — เฉพาะคนที่เห็นข้อมูลเงินได้
            ...(seesMoney ? [["receipt", "ใบเสร็จ"]] : []),
          ] as [DocKey, string][])).map(([k, label]) => (
            <label key={k} className={`flex items-center gap-1.5 ${k === "receipt" && !anyPaid ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked={docs[k] && !(k === "receipt" && !anyPaid)}
                disabled={k === "receipt" && !anyPaid}
                onChange={(e) => setDocs((d) => ({ ...d, [k]: e.target.checked }))}
                className="h-4 w-4 accent-amber-500"
              />
              {label}
              {k === "work" && !allPaid && (
                <span className="text-xs font-semibold text-rose-500">
                  · {batch ? `ใบปะหน้ายังไม่ออก ${unpaidCount} ใบ 🔒` : "ใบปะหน้ายังไม่ออก 🔒"}
                </span>
              )}
              {k === "receipt" && !anyPaid ? " 🔒" : ""}
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

        {!allPaid && (
          <span className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-rose-200">
            {batch
              ? `🔒 มี ${unpaidCount} ใบยังเก็บเงินไม่ครบ 100% — ใบนั้นออกได้เฉพาะ “ใบงาน”`
              : "🔒 ยังเก็บเงินไม่ครบ 100% — พิมพ์ได้เฉพาะ “ใบงาน” · ใบปะหน้าพัสดุและใบเสร็จยังออกไม่ได้"}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            // บันทึกทุกครั้งที่กดพิมพ์ รวมปริ้นซ้ำ — ประวัติจะเห็นว่าใครปริ้น เอกสารอะไร ครั้งที่เท่าไร
            // (ครั้งแรกที่พิมพ์ใบปะหน้าจริง = ล็อกที่อยู่ฝั่งลูกค้าด้วย)
            if (chosen.length > 0) {
              const now = new Date().toISOString();
              // บันทึกไม่สำเร็จต้องบอกคนปริ้น — เดิมกลืนเงียบ สถานะฝั่งเซิร์ฟเวอร์ไม่เลื่อนแต่หน้าจอโชว์ว่าเลื่อนแล้ว
              const fails: string[] = [];
              const jobs: Promise<void>[] = [];
              for (const o of orders) {
                // ใบที่ยังไม่จ่ายครบไม่ออกใบเสร็จ — ประวัติต้องไม่บันทึกเกินจริง
                const docsFor = chosen.filter((k) => k !== "receipt" || orderFullyPaid(o));
                if (docsFor.length === 0) continue;
                jobs.push(
                  fetch("/api/admin/orders/printed", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ orderId: o.id, docs: docsFor }),
                  })
                    .then(async (r) => {
                      if (r.ok) return;
                      const j = (await r.json().catch(() => ({}))) as { error?: string };
                      fails.push(`${o.id}: ${j.error ?? `HTTP ${r.status}`}`);
                    })
                    .catch(() => {
                      fails.push(`${o.id}: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้`);
                    })
                );
              }
              void Promise.all(jobs).then(() => {
                if (fails.length)
                  window.alert(`⚠️ บันทึก "ปริ้นแล้ว" ไม่สำเร็จ — สถานะออเดอร์ยังไม่เลื่อนเป็นกำลังผลิต\n${fails.join("\n")}`);
              });
              setOrders((list) =>
                list.map((o) => {
                  // ปริ้นใบงาน/ใบปะหน้า (เก็บเงินครบแล้ว) = งานเข้าไลน์ผลิต → เลื่อนสถานะให้ตรงกับฝั่งเซิร์ฟเวอร์
                  const toProduction =
                    chosen.includes("work") &&
                    orderFullyPaid(o) &&
                    ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"].includes(o.status);
                  return {
                    ...o,
                    printedAt: o.printedAt ?? now,
                    printCount: (o.printCount ?? (o.printedAt ? 1 : 0)) + 1,
                    lastPrintedAt: now,
                    ...(toProduction ? { status: "กำลังผลิต" as const } : {}),
                  };
                })
              );
            }
            window.print();
          }}
          disabled={chosen.length === 0 || (!anyPaid && !docs.work)}
          title={anyPaid || docs.work ? undefined : "ใบเสร็จพิมพ์ได้เมื่อรับเงินครบ 100%"}
          className="ml-auto rounded-xl bg-amber-500 px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-40"
        >
          {batch ? `🖨️ พิมพ์ทั้ง ${orders.length} ใบ` : "🖨️ พิมพ์"}
        </button>
      </div>

      <div className="print-wrap mx-auto max-w-[210mm] space-y-6 px-4 pb-16 text-slate-900">
        {chosen.length === 0 && (
          <p className="no-print rounded-xl bg-amber-50 p-6 text-center text-sm text-amber-800 ring-1 ring-amber-200">
            เลือกเอกสารที่ต้องการพิมพ์อย่างน้อย 1 อย่างด้านบน
          </p>
        )}

        {orders.map((o) => (
          <OrderDocs key={o.id} order={o} docs={docs} labelOnly={labelOnly} withProofs={withProofs} shop={shop} shipMethods={shipMethods} origin={origin} seesMoney={seesMoney} />
        ))}
      </div>
    </>
  );
}

/**
 * เอกสารครบชุดของออเดอร์เดียว (ใบงาน/ใบแปะกล่อง/ใบเสร็จ) —
 * แยกเป็นคอมโพเนนต์เพราะหน้านี้ปริ้นได้ทีละหลายใบ state ต่อใบ (ใบแปะกล่อง/สถานะ ปณ./วัดล้นหน้า) ต้องแยกกัน
 */
function OrderDocs({
  order,
  docs,
  labelOnly = false,
  withProofs,
  shop,
  shipMethods,
  origin,
  seesMoney,
}: {
  order: Order;
  docs: Record<DocKey, boolean>;
  /** 🚚 พิมพ์เฉพาะใบปะหน้าพัสดุ (ไม่เอาใบงาน) — กล่องรอบถัดไปของใบแบ่งส่ง */
  labelOnly?: boolean;
  withProofs: boolean;
  shop: ShopInfo;
  shipMethods: ShippingMethod[];
  origin: string;
  seesMoney: boolean;
}) {
  /**
   * 🏷 ใบแปะกล่อง — งานขายส่งแพ็คแยกลาย (กล่องละลาย กล่องละ N ชิ้น)
   * เลยให้ตั้งได้ต่อ "ลาย" ว่าพิมพ์กี่ใบ และหนึ่งกล่องใส่กี่ชิ้น
   * คีย์ = "ลำดับรายการ-ลำดับลาย" · ชิ้น/กล่องเว้นว่าง = เว้นช่องให้คนแพ็คเขียนเอง
   */
  const [boxCopies, setBoxCopies] = useState<Record<string, number>>({});
  const [boxPerBox, setBoxPerBox] = useState<Record<string, string>>({});

  // 📮 สถานะพัสดุ ปณ. ณ เวลาพิมพ์ — โชว์บนใบงานเมื่อมีเลขรูปแบบไปรษณีย์ไทย
  const [thpEvents, setThpEvents] = useState<ThpEventView[] | null>(null);
  useEffect(() => {
    const n = (order.tracking ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}\d{9}TH$/.test(n)) return;
    let live = true;
    fetch(`/api/orders/track?number=${encodeURIComponent(n)}`)
      .then((r) => r.json())
      .then((j) => live && j?.events?.length && setThpEvents(j.events))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [order.tracking]);

  // ── 📄 ใบงานไม่เกิน 3 หน้า (เจ้าของร้านสั่ง 11 ก.ย. 69) ──
  // เดิมตัดแถวที่ 12 (มีรูป = 4) แล้วบอก "ดูมือถือ" → ออเดอร์ใหญ่ทุกใบต้องสแกนทีละใบ
  // ตอนนี้: วัดความสูงจริงของทุกแถวที่ความกว้าง A4 แล้วแบ่งลงหน้า 1–3 ไม่ตัดกลางแถว
  // หน้า 2–3 มีหัวใบซ้ำ + QR ตัวเล็ก + เลขหน้า · เกิน 3 หน้า = พิมพ์เท่าที่พอดี แล้วขึ้นกรอบเตือนบนหน้า 1 และท้ายหน้าสุดท้าย
  // ท้ายบิล (หมายเหตุ/ของแถม/ภาพก่อนปิดกล่อง) ตรึงอยู่หน้า 1 เสมอ ฝ่ายแพ็คเห็นตั้งแต่แผ่นแรก
  const PAGE_PX = 1047; // A4 หัก margin 10mm ที่ 96dpi (ตรงกับ .sheet height 277mm)
  const MAX_WORK_PAGES = 3;
  const CUT_TOP_PX = 92; // กรอบเตือนใต้หัวใบงานหน้า 1
  const CUT_END_PX = 110; // กรอบเตือนท้ายหน้าสุดท้าย + บรรทัดรวม
  const workRef = useRef<HTMLElement>(null);
  /** ช่วงแถวต่อหน้า · null = โหมดวัด (วาดทุกแถวในแผ่นเดียวก่อน แล้ววัด) */
  const [pages, setPages] = useState<PageRange[] | null>(null);
  useEffect(() => {
    setPages(null); // ข้อมูล/ตัวเลือกพิมพ์เปลี่ยน → วัดใหม่
  }, [order, withProofs, docs.work, labelOnly]);
  useEffect(() => {
    if (pages !== null || labelOnly || !docs.work) return;
    const el = workRef.current;
    if (!el) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const prevW = el.style.width;
      el.style.width = "794px"; // ความกว้าง A4 — บนจอชีทกว้างตามหน้าต่าง ต้องวัดที่ความกว้างจริงตอนพิมพ์
      const table = el.querySelector<HTMLElement>("[data-ptable]");
      const thead = el.querySelector<HTMLElement>("[data-pthead]");
      const tfoot = el.querySelector<HTMLElement>("[data-ptfoot]");
      const cont = el.querySelector<HTMLElement>("[data-pconthead]");
      const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-prow]"));
      if (!table) {
        el.style.width = prevW;
        return;
      }
      const sec = el.getBoundingClientRect();
      const t = table.getBoundingClientRect();
      const pad = 32; // p-8 บนจอ (ตอนพิมพ์ padding 0)
      const headH = t.top - (sec.top + pad) + (thead?.offsetHeight ?? 0); // ใบปะหน้า+หัวใบงาน+หัวตาราง
      const tfootH = tfoot?.offsetHeight ?? 0;
      const tailH = sec.bottom - pad - t.bottom; // ท้ายบิลทั้งหมดหลังตาราง (อยู่หน้า 1)
      // หน้าต่อ: หัวใบซ้ำ + ระยะห่างตาราง (mt-4) + หัวตาราง + บรรทัดรวม + บรรทัด "หน้า n/N" (mt-2 + 15px)
      const contH = (cont?.offsetHeight ?? 64) + 16 + (thead?.offsetHeight ?? 0) + tfootH + 24;
      const heights = rows.map((r) => r.offsetHeight);
      el.style.width = prevW;
      setPages(
        paginateRows(heights, {
          cap1: PAGE_PX - headH - tfootH - tailH,
          capN: PAGE_PX - contH,
          maxPages: MAX_WORK_PAGES,
          cutTopPx: CUT_TOP_PX,
          cutEndPx: CUT_END_PX,
        })
      );
    };
    // รอฟอนต์โหลดก่อน (ความสูงบรรทัดเปลี่ยนตามฟอนต์) · รูปมีขนาดตายตัวอยู่แล้ว
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    Promise.all([fonts, new Promise((r) => setTimeout(r, 400))]).then(measure);
    return () => {
      cancelled = true;
    };
  }, [pages, order, withProofs, docs.work, labelOnly]);

  const subtotal = order.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  const workPages: PageRange[] = pages ?? [{ start: 0, end: order.items.length }];
  const printedRows = printedRowsOf(workPages);
  const cutRows = order.items.slice(printedRows); // แถวที่กระดาษ 3 หน้าไม่พอ → ดูมือถือ
  const cutQty = cutRows.reduce((s, i) => s + i.qty, 0);
  const rowsOf = (pg: PageRange) => order.items.slice(pg.start, pg.end).map((it, k) => [it, pg.start + k] as const);
  const totalProofs = order.items.reduce((s, it) => s + proofsOf(it).length, 0); // แบบงานทั้งหมดกี่รูป

  /** แถวรายการหนึ่งแถว — ใช้ทั้งหน้า 1 และหน้าต่อ · i = ลำดับจริงในออเดอร์ (เลขหน้าตารางต้องต่อเนื่องข้ามหน้า) */
  const renderRow = (it: Order["items"][number], i: number) => {
                  const proofs = proofsOf(it);
                  return (
                    <tr key={`${it.productId}-${i}`} data-prow className="border-b border-slate-200 align-top">
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
                                {/* ใต้รูปเขียนแค่จำนวน (เจ้าของร้านสั่ง 11 ก.ย. 69) — ชื่อไฟล์/หมายเหตุแบบยาวรกกระดาษ คนแพ็คนับจากตัวเลขอย่างเดียว */}
                                {p.qty ? (
                                  <p className="mt-0.5 text-[10px] font-bold leading-tight text-slate-700">
                                    {p.qty} {proofUnit(p)}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : it.noProof ? (
                          <p className="text-xs font-semibold text-slate-500">— ไม่ต้องทำแบบ (ยอดเพิ่ม/ค่าบริการ)</p>
                        ) : (
                          <p className="text-xs font-semibold text-rose-600">⚠️ ยังไม่มีแบบงาน</p>
                        )}
                      </td>
                      <td className="py-3">
                        <p className="font-bold">{it.name}</p>
                        {/* ♻️ ป้ายใช้ไฟล์เก่า และ 🎨 ภาพลายจากลูกค้า ไม่ขึ้นใบงานแล้ว (เจ้าของร้านสั่ง 11 ก.ย. 69) —
                            รูปแบบงานคอลัมน์ซ้ายคือของที่ต้องเช็ค · บรรทัด "ใช้ไฟล์เก่า:" ยังอยู่ในสเปคตามเดิม */}
                        {it.sampleRequired && (
                          <p className="mt-1 inline-block rounded border-2 border-red-600 px-2 py-0.5 text-sm font-extrabold" style={{ color: "#dc2626" }}>
                            🎁 มีงานตัวอย่าง — แนบใส่กล่องให้ลูกค้าด้วย
                          </p>
                        )}
                        {designLines(it).length > 0 ? (
                          <div className="mt-0.5 text-xs leading-relaxed text-slate-600">
                            {designLines(it).map((line, k) => (
                              <p key={k}>{line}</p>
                            ))}
                            {/* งานรวมแผ่น (เช่น สติกเกอร์ 4 ดวง/แผ่น) — บอกทีมผลิตไปเลยว่าต้องพิมพ์กี่แผ่น */}
                            {(() => {
                              const per = parsePrintFrame(it.sel?.[PLACEMENT_SPEC_LABEL])?.perSheet;
                              const sheets = sheetsFor(it.qty, per);
                              return sheets ? (
                                <p className="mt-1 inline-block rounded border border-slate-300 px-2 py-0.5 font-bold text-slate-900">
                                  📄 รวม {it.qty} ชิ้น = {sheets} แผ่น ({per} ชิ้น/แผ่น)
                                </p>
                              ) : null;
                            })()}
                          </div>
                        ) : (
                          <SpecLines
                            sel={it.sel}
                            text={cleanSelections(it.selections)}
                            hide={PRINT_SKIP}
                            stripLinks
                            labelClassName="text-slate-900"
                            className="mt-0.5 text-xs leading-relaxed text-slate-600"
                          />
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
  };

  const printedAt = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  // 🔒 ยังไม่ได้รับเงินครบ (รวมออเดอร์มัดจำที่ค้างยอดหลัง) → พิมพ์เอกสารไม่ได้
  const fullyPaid = orderFullyPaid(order);
  // ชื่อวิธีจัดส่งที่ลูกค้าเลือกจริง (เช่น "EMS (50)") — order.shipping เก็บได้แค่ 2 ค่าเก่า ธรรมดา/ด่วน จึงเพี้ยนเวลาร้านตั้งวิธีส่งเอง
  // ป้ายกลาง ๆ "ค่าส่ง" (ใบจาก FlowAccount) หรือป้ายว่าง (ใบเสนอราคาที่กรอกตัวเลขเอง) → จับคู่ราคากับวิธีส่งของร้าน (10 ก.ย. 69)
  const shipName = resolveShipLabel(order, shipMethods)
    // ตัดราคาที่ติดมากับชื่อวิธีส่งออก — ใบปะหน้าโชว์แค่วิธีส่ง ("EMS (50)" → "EMS") ราคาอยู่ในตารางยอดเงินแล้ว
    .replace(/[\s(\[]*(?:฿|บาท)?\s*\d[\d,.]*\s*(?:฿|บาท|.-)?\s*[)\]]*\s*$/u, "")
    .replace(/[\s·—–-]+$/u, "")
    .trim();
  // ป้ายตัวใหญ่บนใบปะหน้า — ชื่อยาวต้องย่อลง ไม่งั้นทับบาร์โค้ด
  const shipNameSize = shipName.length > 18 ? "text-lg" : shipName.length > 13 ? "text-xl" : shipName.length > 9 ? "text-2xl" : "text-3xl";
  // สีป้ายวิธีส่ง — คนแพ็คของแยกกองด้วยสีตั้งแต่ยังไม่อ่านตัวหนังสือ (พิมพ์สีออกจริง มี print-color-adjust: exact อยู่แล้ว)
  const shipColor = /ems|ด่วน/i.test(shipName)
    ? "#1d4ed8" // EMS/ส่งด่วน — น้ำเงิน
    : /รับเอง|มารับ|pick\s*-?up/i.test(shipName)
      ? "#15803d" // มารับเอง — เขียว
      : /ลงทะเบียน|ธรรมดา/i.test(shipName)
        ? "#dc2626" // ลงทะเบียน/ส่งธรรมดา — แดง
        : "#0f172a"; // วิธีอื่น — ดำเหมือนเดิม
  /**
   * แตกออเดอร์เป็น "ลาย" — งานขายส่งแพ็คแยกลาย ใบแปะกล่องจึงต้องออกทีละลาย
   * ใช้แบบที่อนุมัติแล้วเป็นหลัก (มีจำนวนต่อลายติดมาด้วย) ไม่มีก็ใช้ลายที่ลูกค้าแนบ
   */
  const boxUnits = order.items.flatMap((it, i) => {
    const proofs = proofsOf(it);
    const list =
      proofs.length > 0
        ? proofs.map((pf, k) => ({ url: pf.url, qty: pf.qty, unit: proofUnit(pf), no: k + 1 }))
        : (it.artworkUrls ?? []).length > 0
          ? // 🔢 ลูกค้าระบุจำนวนต่อลายไว้ตอนแนบ → ใบแปะกล่องได้เลขทันที ไม่ต้องรอแบบ
            (it.artworkUrls ?? []).map((u, k) => ({ url: u, qty: artQtyOf(it, u, k), unit: "ชิ้น", no: k + 1 }))
          : [{ url: undefined as string | undefined, qty: it.qty, unit: "ชิ้น", no: 1 }];
    return list.map((d) => ({ ...d, i, it, total: list.length, key: `${i}-${d.no}` }));
  });
  /**
   * ลิงก์เต็มสำหรับ QR มือถือ — เปิดหน้าออเดอร์เพื่อเช็คของตามภาพ
   * ?pack=1 = เข้ามาจาก QR ใบงาน → พนักงานที่ล็อกอินอยู่ (สิทธิ์ไหนก็ได้) ทำงานแพ็คใบนี้ได้เลย
   */
  const orderUrl = origin
    ? `${origin}/admin/orders/${encodeURIComponent(order.id)}?${PACK_SCAN_PARAM}=1`
    : "";

  return (
    <div className="space-y-6">
      {/* หัวคั่นต่อใบ (ไม่พิมพ์) — ปริ้นรวมหลายใบต้องรู้ว่าชุดไหนของใคร + เคยปริ้นไปแล้วกี่ครั้ง */}
      <div className="no-print flex flex-wrap items-center gap-2 px-1 pt-2">
        <span className="font-mono text-sm font-extrabold text-slate-700">{order.id}</span>
        <span className="text-sm text-slate-500">{order.customer}</span>
        {/* เคยปริ้นแล้ว — เตือนก่อนกดซ้ำ กันของออกสองรอบ */}
        {(order.printCount ?? 0) > 0 && (
          <span
            className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200"
            title={order.lastPrintedAt ? `ล่าสุด ${new Date(order.lastPrintedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}` : undefined}
          >
            🖨 ใบนี้ปริ้นไปแล้ว {order.printCount} ครั้ง
            {order.lastPrintedAt && ` · ล่าสุด ${new Date(order.lastPrintedAt).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            {" — กดพิมพ์อีกจะบันทึกเป็นปริ้นซ้ำ"}
          </span>
        )}
      </div>

      {docs.box && (
        <div className="no-print w-full rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-700">
            🏷 ตั้งค่าใบแปะกล่อง {order.id} — งานขายส่งแพ็คแยกลาย ตั้งได้ทีละลาย
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            “จำนวนใบ” = พิมพ์กี่แผ่น A4 (กล่องละแผ่น) · “ชิ้น/กล่อง” ใส่ตัวเลขไว้ก็ได้
            หรือเว้นว่างให้คนแพ็คเขียนเองหน้างาน
          </p>
          <div className="mt-2 grid gap-1.5">
            {boxUnits.map((u) => {
              const copies = boxCopies[u.key] ?? 1;
              return (
                <div key={u.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200">
                  {u.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.url} alt="" className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-slate-200" />
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-slate-100 text-[10px] text-slate-400">—</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">
                    {order.items.length > 1 ? `รายการ ${u.i + 1} · ` : ""}
                    {u.total > 1 ? `ลายที่ ${u.no}` : u.it.name}
                    {u.qty ? (
                      <span className="ml-1 font-normal text-slate-400">
                        ({u.qty} {u.unit})
                      </span>
                    ) : null}
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-slate-600">
                    ชิ้น/กล่อง
                    <input
                      value={boxPerBox[u.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "");
                        setBoxPerBox((c) => ({ ...c, [u.key]: v }));
                        // ใส่ชิ้น/กล่องแล้ว คำนวณจำนวนใบให้เลย (แก้ทับได้)
                        const per = Number(v);
                        if (per > 0 && u.qty) setBoxCopies((c) => ({ ...c, [u.key]: Math.max(1, Math.ceil(u.qty! / per)) }));
                      }}
                      inputMode="numeric"
                      placeholder="เขียนเอง"
                      className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-center text-[11px]"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-slate-600">
                    จำนวนใบ
                    <button
                      type="button"
                      onClick={() => setBoxCopies((c) => ({ ...c, [u.key]: Math.max(0, copies - 1) }))}
                      className="h-6 w-6 rounded border border-slate-300 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      −
                    </button>
                    <input
                      value={copies}
                      onChange={(e) => setBoxCopies((c) => ({ ...c, [u.key]: Math.min(99, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)) }))}
                      inputMode="numeric"
                      className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center text-[11px] font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => setBoxCopies((c) => ({ ...c, [u.key]: Math.min(99, copies + 1) }))}
                      className="h-6 w-6 rounded border border-slate-300 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
                    >
                      +
                    </button>
                  </label>
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-slate-600">
            รวมพิมพ์ {boxUnits.reduce((n, u) => n + (boxCopies[u.key] ?? 1), 0)} แผ่น
          </p>
        </div>
      )}

        {/* ═══════════ ใบงาน + ใบปะหน้าพัสดุ (ใบเดียวจบ) ═══════════ */}
        {docs.work && (
          <section ref={workRef} className="sheet relative rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            {workPages.length > 1 && <WorkPageNo n={1} total={workPages.length} />}
            {/* หัวใบซ้ำของหน้าต่อ — วาดซ่อนไว้ตรงนี้เพื่อวัดความสูงตอนแบ่งหน้า (absolute ไม่กินที่) */}
            {!labelOnly && pages === null && (
              <div data-pconthead aria-hidden className="pointer-events-none absolute left-8 right-8 top-0 invisible">
                <WorkContHead order={order} n={2} total={2} orderUrl={orderUrl} />
              </div>
            )}
            {/* 🔒 ยังไม่จ่ายครบ → พิมพ์ได้เฉพาะส่วนใบงาน · ใบปะหน้า (ที่อยู่จัดส่ง) ถูกกันไว้ */}
            {!fullyPaid && (
              <div className="keep mb-4 rounded-lg border-2 border-dashed border-rose-300 bg-rose-50 p-4 text-center">
                <p className="text-sm font-extrabold" style={{ color: "#dc2626" }}>
                  🔒 ใบปะหน้าพัสดุยังไม่พิมพ์ — ลูกค้าชำระยังไม่ครบ 100%
                  {order.deposit && !order.deposit.settledAt
                    ? ` (ค้างยอดคงเหลือ ${formatPrice(Math.max(0, orderTotal(order) - (order.paidTotal ?? 0)))})`
                    : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">เก็บเงินครบแล้วพิมพ์ใบงานใหม่ ใบปะหน้า/ที่อยู่จัดส่งจะแสดงอัตโนมัติ</p>
              </div>
            )}
            {fullyPaid && (<>
            {/* แถวบน: ผู้ส่ง | วิธีจัดส่ง + บาร์โค้ด (เลขออเดอร์อยู่ในบาร์โค้ด + กล่องใบงานด้านล่างแล้ว) */}
            <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ผู้ส่ง / From</p>
                <p className="mt-0.5 text-sm font-bold">{shop.legalName}</p>
                <p className="text-xs leading-snug text-slate-600">{shop.address.replace(/\n+/g, " ")}</p>
                <p className="text-xs tabular-nums text-slate-600">โทร. {shop.phone}</p>
              </div>
              {/* วิธีจัดส่งตัวใหญ่เหนือบาร์โค้ด (สไตล์ป้ายขนส่ง) · บาร์โค้ด = เลขออเดอร์ล้วน สำหรับเครื่องยิงที่คอม */}
              <div className="flex shrink-0 flex-col items-end">
                <p
                  className={`${shipNameSize} max-w-[16rem] break-words text-right font-extrabold uppercase leading-none tracking-tight`}
                  style={{ color: shipColor }}
                >
                  {shipName}
                </p>
                <div className="mt-1.5">
                  <Barcode value={order.id} displayValue={false} height={30} width={1.2} />
                </div>
                <p className="mt-0.5 text-[9px] leading-tight text-slate-500">สแกนด้วยเครื่องยิง → ผูกเลขพัสดุ</p>
                {/* 🧾 บิล FlowAccount/บิล VAT ต้องมีใบกำกับตัวจริงในกล่อง — ตราบนส่วนที่ติดกล่อง คนแพ็คเห็นโดยไม่ต้องเปิดจอ (10 ก.ย. 69) */}
                {orderNeedsTaxInvoiceInBox(order) && (
                  <p
                    className="keep mt-1.5 inline-block rounded border-[2.5px] border-red-600 bg-white px-2.5 py-1 text-sm font-extrabold leading-none"
                    style={{ color: "#dc2626", transform: "rotate(-1.5deg)" }}
                  >
                    🧾 แนบใบกำกับภาษี
                  </p>
                )}
              </div>
            </div>

            {/* ผู้รับ — ส่วนนี้ขึ้นไปคือ "ป้ายติดกล่อง" ตัดตามเส้นประด้านล่าง */}
            <div className="keep mt-4 rounded border border-slate-300 p-5">
              {/* 🚚 กล่องรอบถัดไปของใบแบ่งส่ง — ตราให้คนแพ็ค/ขนส่งรู้ว่านี่กล่องที่เท่าไร */}
              {(order.shipments?.length ?? 0) > 0 && !(order.tracking ?? "").trim() && (
                <p className="mb-2 inline-block rounded border-2 border-slate-900 px-2 py-0.5 text-sm font-extrabold">
                  🚚 แบ่งส่ง — กล่องรอบที่ {(order.shipments?.length ?? 0) + 1}
                  {order.shipPlan?.length && nextPlannedRound(order) ? "" : " (รอบสุดท้าย)"}
                  <span className="ml-2 font-normal text-slate-500">ส่งไปแล้ว {order.shipments!.length} รอบ: {order.shipments!.map((x) => x.tracking).join(", ")}</span>
                </p>
              )}
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ผู้รับ / To</p>
              <p className="mt-1 text-2xl font-extrabold leading-tight">{order.customer}</p>
              <p className="mt-1 whitespace-pre-line text-lg leading-snug">{order.address}</p>
              <p className="mt-2 text-xl font-bold tabular-nums">โทร. {order.phone}</p>
            </div>

            {/* เส้นประสำหรับตัด — ส่วนบนเอาไปติดหน้ากล่อง ส่วนล่างเก็บไว้เป็นใบงาน */}
            {!labelOnly && (
            <div className="relative my-6" aria-hidden>
              <div className="border-t-2 border-dashed border-slate-400" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-[10px] font-bold tracking-wide text-slate-400">
                ✂ ตัดตามเส้นนี้ — ส่วนบนติดหน้ากล่อง · ส่วนล่างเก็บเป็นใบงาน
              </span>
            </div>
            )}
            </>)}

            {/* ?doc=label = เอาแค่ใบปะหน้า ใบงานด้านล่างไม่พิมพ์ (ใบงานเดิมยังใช้ต่อได้) */}
            {!labelOnly && (<>
            {/* หัวใบงาน + QR มือถือ — พนักงานแพ็คสแกนเพื่อเปิดหน้าออเดอร์ เช็คของตามภาพจริง */}
            <div className="keep flex items-center justify-between gap-4 rounded border border-slate-300 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">ใบงาน / Packing list</p>
                <p className="mt-0.5 font-mono text-lg font-extrabold tracking-tight">{order.id}</p>
                <p className="text-xs text-slate-600">
                  {order.customer} · {totalQty} ชิ้น · {order.items.length} รายการ
                </p>
                {(order.tracking ?? "").trim() && (
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-800">📮 เลขพัสดุ{order.shipments?.length ? " (รอบสุดท้าย)" : ""}: {order.tracking}</p>
                )}
                {/* 📋 แผนแบ่งส่งจากแอดมิน — บอกคนแพ็คตั้งแต่ใบงานว่ารูปไหนต้องออกก่อน */}
                {!(order.tracking ?? "").trim() &&
                  (order.shipPlan ?? []).map((r, n) =>
                    order.shipments?.[n] ? null : (
                      <p key={`plan-${n}`} className="mt-0.5 text-[11px] font-bold text-amber-800">
                        📋 แบ่งส่ง รอบที่ {n + 1} ส่งก่อน: {r.proofs.map((p) => `${p.itemName ?? order.items[p.item]?.name ?? ""} รูปที่ ${p.proof + 1}${p.qty ? ` ×${p.qty}` : ""}`).join(", ")}
                        {r.dueDate ? ` — ส่งภายใน ${r.dueDate}` : ""}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    )
                  )}
                {/* 🚚 รอบแบ่งส่งที่ออกไปแล้ว — คนหยิบของจะได้รู้ว่ารูปไหนไม่ต้องแพ็คซ้ำ */}
                {(order.shipments ?? []).map((sh, n) => (
                  <p key={`${sh.tracking}-${n}`} className="mt-0.5 text-[11px] font-bold text-sky-800">
                    🚚 แบ่งส่งแล้ว รอบที่ {n + 1}: <span className="font-mono">{sh.tracking}</span> —{" "}
                    {sh.proofs.map((p) => `${p.itemName ?? order.items[p.item]?.name ?? ""} รูปที่ ${p.proof + 1}${p.qty ? ` ×${p.qty}` : ""}`).join(", ")}
                  </p>
                ))}
                {order.useByDate && (
                  <p className="mt-1.5 block w-fit rounded border-2 border-red-600 bg-white px-2 py-1 text-base font-extrabold" style={{ color: "#dc2626" }}>
                    🔥 ต้องใช้งาน: {fmtThaiDate(order.useByDate)}
                    {order.rush ? " · งานเร่ง!" : ""}
                  </p>
                )}
                {(order.shipDate?.from || order.shipDate?.to) && (
                  <p className="mt-1.5 inline-block rounded bg-white px-2 py-1 text-base font-bold ring-1 ring-slate-300">
                    📅 วันที่จัดส่ง: {fmtThaiDate(order.shipDate?.from)}
                    {order.shipDate?.to && order.shipDate.to !== order.shipDate.from ? ` – ${fmtThaiDate(order.shipDate.to)}` : ""}
                  </p>
                )}
                {order.items.some((it) => it.sampleRequired) && (
                  <p className="mt-1.5 block w-fit rounded border-2 border-red-600 bg-white px-2 py-1 text-base font-extrabold" style={{ color: "#dc2626" }}>
                    🎁 ออเดอร์นี้มีงานตัวอย่าง {order.items.filter((it) => it.sampleRequired).length} รายการ — ต้องแนบไปด้วย!
                  </p>
                )}
                {/* 🧾 ใบกำกับภาษีต้องใส่กล่อง — บอกเลขเอกสารให้ไปพิมพ์จาก FlowAccount ได้ทันที */}
                {orderNeedsTaxInvoiceInBox(order) &&
                  (() => {
                    const doc = taxInvoiceDocOf(order);
                    return (
                      <p className="mt-1.5 block w-fit rounded border-2 border-red-600 bg-white px-2 py-1 text-base font-extrabold" style={{ color: "#dc2626" }}>
                        🧾 ต้องใส่ใบกำกับภาษีลงกล่อง{doc.docNo ? ` — อ้างอิง ${doc.label} ${doc.docNo}` : ""}
                        {order.flowAccount || doc.url ? " (พิมพ์จาก FlowAccount)" : ""}
                        {doc.company ? ` · ${doc.company}` : ""}
                      </p>
                    );
                  })()}
              </div>
              {/* ใบงานใช้ QR อย่างเดียว — บาร์โค้ดสำหรับเครื่องยิงอยู่บนใบปะหน้า ไม่ต้องมีซ้ำตรงนี้ */}
              {orderUrl && (
                <div className="shrink-0 text-center">
                  <QRCodeSVG value={orderUrl} size={82} level="M" marginSize={0} />
                  <p className="mt-1 text-[9px] font-bold leading-tight text-slate-600">📱 สแกนแล้วแพ็คได้เลย</p>
                  {/* บอกทางไปคิวแพ็คบนกระดาษ — สแกนใบเดียวแล้วไล่ใบอื่นต่อจากมือถือ ไม่ต้องสแกนทุกใบ */}
                  <p className="text-[8.5px] leading-tight text-slate-500">กด “📋 คิวแพ็ค” ในจอ</p>
                  <p className="text-[8.5px] leading-tight text-slate-500">ไล่ใบถัดไปไม่ต้องสแกนซ้ำ</p>
                </div>
              )}
            </div>

            {/* ⚠️ กระดาษ 3 หน้าไม่พอ — บอกตั้งแต่แผ่นแรก จะได้ไม่คิดว่ารายการมีแค่นี้ */}
            {cutRows.length > 0 && (
              <WorkCutNote order={order} printedRows={printedRows} cutRows={cutRows.length} cutQty={cutQty} totalProofs={totalProofs} top />
            )}

            {/* ตารางงาน — หน้า 1 ได้เฉพาะแถวที่วัดแล้วว่าพอ (โหมดวัด = ทุกแถว) · ส่วนเกินตัดด้วย overflow กันหลุดหน้า */}
            <div className="sheet-body">
            <table data-ptable className="mt-5 w-full border-collapse text-sm">
              <thead data-pthead>
                <tr className="border-y border-slate-300 bg-slate-50 text-left">
                  <th className="w-8 py-2 pl-2">#</th>
                  <th className="w-96 py-2">แบบงาน</th>
                  <th className="py-2">รายการ / ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {rowsOf(workPages[0]).map(([it, i]) => renderRow(it, i))}
              </tbody>
              <tfoot data-ptfoot>
                <tr className="border-t border-slate-300">
                  <td colSpan={3} className="py-2 pl-2 text-xs text-slate-500">
                    {workPages.length > 1
                      ? workPages[0].end === 0
                        ? `รายการทั้งหมด ${printedRows} รายการอยู่หน้าถัดไป (หน้านี้มีแต่ใบปะหน้า/หัวใบงาน/ท้ายบิล) · รวมทั้งใบ ${order.items.length} รายการ ${totalQty} ชิ้น`
                        : `รายการที่ ${workPages[0].end + 1}–${printedRows} อยู่หน้าถัดไป · รวมทั้งใบ ${order.items.length} รายการ ${totalQty} ชิ้น`
                      : `รวม ${order.items.length} รายการ · ${totalQty} ชิ้น · สถานะ: ${order.status}`}
                  </td>
                </tr>
              </tfoot>
            </table>
            </div>
            {/* /sheet-body */}

            {/* 📮 สถานะพัสดุไปรษณีย์ไทย — snapshot ณ เวลาพิมพ์ */}
            {thpEvents && (
              <div className="keep mt-3 rounded border border-slate-300 p-3">
                <p className="text-xs font-bold text-slate-700">
                  📮 สถานะพัสดุไปรษณีย์ไทย <span className="font-normal text-slate-400">· ณ เวลาพิมพ์ {printedAt}</span>
                </p>
                <div className="mt-2">
                  <ThaiPostTimeline events={thpEvents} />
                </div>
              </div>
            )}

            {/* 📸 ภาพที่ฝ่ายแพ็คถ่ายก่อนปิดกล่อง — หลักฐานว่าแพ็คอะไรลงกล่องไปบ้าง */}
            {(order.packPhotos?.length ?? 0) > 0 && (
              <div className="keep mt-3 rounded border border-slate-300 p-3">
                <p className="text-xs font-bold text-slate-700">
                  📸 ภาพของในกล่องก่อนปิด ({order.packPhotos!.length} รูป) — ถ่ายโดยฝ่ายแพ็ค
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(order.packPhotos ?? []).map((p, i) => (
                    <div key={`${p.url}-${i}`} className="w-24">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={`ภาพก่อนปิดกล่อง ${i + 1}`}
                        className="h-24 w-24 rounded border border-slate-300 object-cover"
                      />
                      <p className="mt-0.5 text-[9px] leading-tight text-slate-600">
                        {p.by} ·{" "}
                        {new Date(p.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 🎁 ของแถมฟรีที่ต้องใส่กล่อง — ตีกรอบหนาให้ฝ่ายแพ็คเห็นชัด ไม่งั้นของแถมตกหล่น */}
            {(order.gifts?.length ?? 0) > 0 && (
              <div className="keep mt-3 rounded border-2 border-slate-900 p-3">
                <p className="text-sm font-extrabold">🎁 ของแถมที่ต้องใส่กล่อง</p>
                <ul className="mt-1 space-y-1 text-sm font-bold">
                  {(order.gifts ?? []).map((g) => (
                    <li key={g.promoId}>
                      {giftLinesOf(g).map((ln, k) => (
                        <span key={k} className="block">
                          ☐ {ln.label} × {ln.qty}
                        </span>
                      ))}
                      {/* 🎨 ของแถมที่ต้องพิมพ์ลาย (เช่น รองหลัง) — กราฟฟิกต้องรู้ว่าใช้ลายไหน ไม่งั้นพิมพ์ผิด */}
                      {giftArtLabel(g) && (
                        <span className="mt-0.5 block pl-4 text-xs font-semibold text-slate-600">
                          🎨 {giftArtLabel(g)}
                        </span>
                      )}
                      {(g.artworkUrls?.length ?? 0) > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1 pl-4">
                          {(g.artworkUrls ?? []).slice(0, 4).map((u, k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={u} src={u} alt={`ลายของแถม ${k + 1}`} className="h-14 w-14 rounded border border-slate-300 object-cover" />
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
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

            <p className="mt-4 text-right text-[10px] text-slate-400">พิมพ์เมื่อ {printedAt}</p>
            </>)}
          </section>
        )}

        {/* ── 📄 ใบงานหน้า 2–3: หัวใบซ้ำ + QR ตัวเล็ก + แถวที่เหลือ · หน้าสุดท้ายมีบรรทัดรวม และกรอบเตือนถ้าพิมพ์ไม่ครบ ── */}
        {docs.work &&
          !labelOnly &&
          workPages.slice(1).map((pg, k) => {
            const n = k + 2;
            const last = n === workPages.length;
            return (
              <section key={`work-p${n}`} className="sheet relative rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
                <WorkPageNo n={n} total={workPages.length} />
                <WorkContHead order={order} n={n} total={workPages.length} orderUrl={orderUrl} />
                <div className="sheet-body">
                  <table className="mt-4 w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-y border-slate-300 bg-slate-50 text-left">
                        <th className="w-8 py-2 pl-2">#</th>
                        <th className="w-96 py-2">แบบงาน</th>
                        <th className="py-2">รายการ / ตัวเลือก</th>
                      </tr>
                    </thead>
                    <tbody>{rowsOf(pg).map(([it, i]) => renderRow(it, i))}</tbody>
                    <tfoot>
                      <tr className="border-t border-slate-300">
                        <td colSpan={3} className="py-2 pl-2 text-xs text-slate-500">
                          {last
                            ? `รวมทั้งใบ ${order.items.length} รายการ · ${totalQty} ชิ้น · สถานะ: ${order.status}`
                            : `รายการที่ ${pg.end + 1}–${printedRows} อยู่หน้าถัดไป`}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {last && cutRows.length > 0 && (
                  <WorkCutNote order={order} printedRows={printedRows} cutRows={cutRows.length} cutQty={cutQty} totalProofs={totalProofs} />
                )}
                <p className="mt-2 text-right text-[10px] text-slate-400">
                  {order.id} · หน้า {n}/{workPages.length} · พิมพ์เมื่อ {printedAt}
                </p>
              </section>
            );
          })}

        {/* ═══════════ ใบเสร็จ ═══════════ */}
        {/*
          ── 🏷 ใบแปะหน้ากล่อง — หนึ่งแผ่นต่อหนึ่งกล่อง ──
          งานขายส่งแพ็คแยกลาย (กล่องละลาย) จึงออกทีละลาย และพิมพ์ซ้ำได้ตามจำนวนกล่อง
          ช่อง "จำนวน" ใส่เลขไว้ก่อนก็ได้ หรือเว้นเส้นให้คนแพ็คเขียนหน้างาน
        */}
        {docs.box &&
          boxUnits.flatMap((u) => {
            const copies = boxCopies[u.key] ?? 1;
            const per = (boxPerBox[u.key] ?? "").trim();
            return Array.from({ length: copies }, (_, c) => (
              <section
                key={`box-${u.key}-${c}`}
                className="sheet flex flex-col rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
              >
                <div className="flex flex-1 flex-col rounded-2xl border-4 border-slate-900 p-6">
                  {/* หัว: สินค้า/ตัวเลือกซ้าย · เลขออเดอร์ตัวโตขวา */}
                  <div className="flex items-start justify-between gap-6 border-b-4 border-slate-900 pb-4">
                    <div className="min-w-0">
                      <p className="text-2xl font-extrabold leading-tight">{u.it.name}</p>
                      <p className="mt-1 text-xl font-semibold leading-snug text-slate-700">{boxSummary(u.it)}</p>
                      {u.total > 1 && (
                        <p className="mt-1 text-3xl font-extrabold text-slate-900">ลายที่ {u.no}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-4xl font-extrabold tracking-tight">{order.id}</p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {order.items.length > 1 ? `รายการที่ ${u.i + 1} / ${order.items.length} · ` : ""}
                        กล่องที่ {c + 1} / {copies}
                      </p>
                    </div>
                  </div>

                  {/* กลาง: รูปลายใหญ่ ๆ + ชื่อผู้รับ */}
                  <div className="flex flex-1 items-center gap-6 py-6">
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                      {u.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.url} alt="" className="max-h-64 max-w-full rounded-xl border-2 border-slate-300 object-contain" />
                      ) : (
                        <span className="grid h-48 w-48 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-400">
                          ไม่มีรูปงาน
                        </span>
                      )}
                    </div>
                    <div className="w-2/5 shrink-0 text-right">
                      <p className="text-base font-bold uppercase tracking-widest text-slate-400">ผู้รับ</p>
                      <p className="break-words text-4xl font-extrabold leading-tight text-sky-700">{order.customer}</p>
                      {order.rush && <p className="mt-2 text-3xl font-extrabold text-rose-600">🔥 งานเร่ง</p>}
                    </div>
                  </div>

                  {/* ล่าง: จำนวนในกล่องนี้ — ใส่เลขมาแล้ว หรือเว้นเส้นให้เขียนเอง */}
                  <div className="flex items-end justify-between gap-6 border-t-4 border-slate-900 pt-4">
                    <p className="text-sm text-slate-500">
                      {order.date} · <span className="font-bold" style={{ color: shipColor }}>{shipName}</span>
                      {(order.tracking ?? "").trim() ? ` · ${order.tracking}` : ""}
                      {u.qty ? ` · ลายนี้รวม ${u.qty.toLocaleString("th-TH")} ${u.unit}` : ""}
                    </p>
                    <p className="flex items-end gap-3 text-5xl font-extrabold tabular-nums">
                      จำนวน
                      {per ? (
                        <span>{Number(per).toLocaleString("th-TH")}</span>
                      ) : (
                        <span className="inline-block w-40 border-b-4 border-slate-900" />
                      )}
                      ชิ้น
                    </p>
                  </div>
                </div>
              </section>
            ));
          })}

        {docs.receipt && seesMoney && fullyPaid && (
          <section className="sheet rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
              <div>
                <p className="text-lg font-extrabold">{shop.legalName}</p>
                <p className="text-xs leading-snug text-slate-600">{shop.address.replace(/\n+/g, " ")}</p>
                <p className="text-xs text-slate-600">โทร. {shop.phone}</p>
                {shop.taxId && <p className="text-xs text-slate-600">เลขประจำตัวผู้เสียภาษี {shop.taxId}</p>}
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
                      <SpecLines
                        sel={it.sel}
                        text={it.selections}
                        hide={PRINT_SKIP}
                        stripLinks
                        labelClassName="text-slate-700"
                        className="text-xs text-slate-500"
                      />
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
                <span className="text-slate-500">ค่าจัดส่ง ({shipName})</span>
                <span className="tabular-nums">{order.shippingCost === 0 ? "ฟรี" : formatPrice(order.shippingCost)}</span>
              </div>
              {(order.gifts ?? []).flatMap((g) =>
                giftLinesOf(g).map((ln, k) => (
                  <div key={`${g.promoId}-${k}`} className="flex justify-between py-1 font-bold">
                    <span>🎁 ของแถม — {ln.label}</span>
                    <span className="tabular-nums">×{ln.qty}</span>
                  </div>
                ))
              )}
              {order.discount && order.discount.amount > 0 && (
                <div className="flex justify-between py-1 text-emerald-600">
                  <span>{order.discount.label}</span>
                  <span className="tabular-nums">−{formatPrice(order.discount.amount)}</span>
                </div>
              )}
              {orderEarlyPayAmount(order) > 0 && (
                <div className="flex justify-between py-1 text-emerald-600">
                  <span>{order.earlyPay!.label}</span>
                  <span className="tabular-nums">−{formatPrice(orderEarlyPayAmount(order))}</span>
                </div>
              )}
              {orderItemDiscounts(order) > 0 && (
                <div className="flex justify-between py-1 text-emerald-600">
                  <span>ส่วนลดรายการสินค้า</span>
                  <span className="tabular-nums">−{formatPrice(orderItemDiscounts(order))}</span>
                </div>
              )}
              {adminDiscountAmount(order) > 0 && (
                <div className="flex justify-between py-1 text-emerald-600">
                  <span>{order.adminDiscount?.label?.trim() || "ส่วนลดพิเศษ"}{(order.adminDiscount?.pct ?? 0) > 0 ? ` (${order.adminDiscount!.pct}%)` : ""}</span>
                  <span className="tabular-nums">−{formatPrice(adminDiscountAmount(order))}</span>
                </div>
              )}
              {orderVatAmount(order) > 0 && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">ภาษีมูลค่าเพิ่ม {order.vat!.rate}%</span>
                  <span className="tabular-nums">{formatPrice(orderVatAmount(order))}</span>
                </div>
              )}
              {/* 🧾 ค่าบริการเพิ่มที่เก็บทีหลัง (ค่าตัดภาพ/ค่าส่งเพิ่ม …) — บรรทัดแยก ให้รู้ว่ายอดโตเพราะอะไร */}
              {(order.charges ?? []).map((c) => (
                <div key={c.id} className="flex justify-between py-1">
                  <span className="text-slate-500">🧾 {c.label}</span>
                  <span className="tabular-nums">{formatPrice(c.amount)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t-2 border-slate-900 py-1.5 text-base font-extrabold">
                <span>ยอดรวมทั้งสิ้น</span>
                <span className="tabular-nums">{formatPrice(orderTotal(order))}</span>
              </div>
              {orderWhtAmount(order) > 0 && (
                <>
                  <div className="flex justify-between py-1 text-slate-600">
                    <span>หักภาษี ณ ที่จ่าย {order.wht!.rate}%</span>
                    <span className="tabular-nums">−{formatPrice(orderWhtAmount(order))}</span>
                  </div>
                  <div className="flex justify-between py-1 text-base font-extrabold">
                    <span>ยอดชำระ</span>
                    <span className="tabular-nums">{formatPrice(orderNetTransfer(order))}</span>
                  </div>
                </>
              )}
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
  );
}

/** เลขหน้าใบงานมุมขวาบน — ขึ้นเฉพาะใบที่มีหลายหน้า กันกระดาษพลัดกัน */
function WorkPageNo({ n, total }: { n: number; total: number }) {
  return (
    <span className="absolute right-3 top-2 text-[10px] font-bold tracking-wide text-slate-400 print:right-0 print:top-0">
      ใบงาน {n}/{total}
    </span>
  );
}

/** หัวใบซ้ำบนหน้า 2–3 — เลขออเดอร์ ชื่อลูกค้า วันส่ง + QR ตัวเล็ก (แผ่นหลุดจากกันยังสแกนเปิดได้) */
function WorkContHead({ order, n, total, orderUrl }: { order: Order; n: number; total: number; orderUrl: string }) {
  return (
    <div className="keep flex items-center justify-between gap-4 border-b-2 border-slate-900 pb-2 pt-3">
      <div className="min-w-0">
        <p className="font-mono text-xl font-extrabold tracking-tight">{order.id}</p>
        <p className="text-xs text-slate-600">
          {order.customer} · ใบงานต่อจากหน้า {n - 1} (หน้า {n}/{total})
          {order.useByDate ? ` · 🔥 ใช้งาน ${fmtThaiDate(order.useByDate)}` : ""}
          {order.shipDate?.from ? ` · 📅 ส่ง ${fmtThaiDate(order.shipDate.from)}` : ""}
        </p>
      </div>
      {orderUrl && (
        <div className="shrink-0 text-center">
          <QRCodeSVG value={orderUrl} size={56} level="M" marginSize={0} />
          <p className="mt-0.5 text-[8px] leading-tight text-slate-500">📱 โหมดแพ็ค</p>
        </div>
      )}
    </div>
  );
}

/** ⚠️ กระดาษ 3 หน้าไม่พอ — บอกว่าพิมพ์ถึงรายการไหน ที่เหลือกี่รายการกี่ชิ้น ให้ไปตรวจต่อบนมือถือ (โหมดแพ็คบังคับติ๊กครบก่อนยิงเลขพัสดุ) */
function WorkCutNote({
  order,
  printedRows,
  cutRows,
  cutQty,
  totalProofs,
  top,
}: {
  order: Order;
  printedRows: number;
  cutRows: number;
  cutQty: number;
  totalProofs: number;
  /** วางใต้หัวใบงานหน้า 1 (ตัวเตี้ยกว่า) */
  top?: boolean;
}) {
  const from = printedRows + 1;
  const to = order.items.length;
  return (
    <div className={`keep rounded-lg border-2 border-red-600 bg-red-50 px-3 ${top ? "mt-3 py-2" : "mt-3 py-3"}`}>
      <p className="font-extrabold leading-tight" style={{ color: "#dc2626", fontSize: top ? 15 : 18 }}>
        ⚠️ กระดาษพิมพ์ได้ถึงรายการที่ {printedRows} จาก {to} — รายการที่ {from}–{to} (อีก {cutRows} รายการ {cutQty.toLocaleString("th-TH")} ชิ้น) ไม่ได้พิมพ์
      </p>
      <p className="mt-0.5 text-xs font-bold text-slate-800">
        📱 สแกน QR แล้วตรวจครบทุกรายการบนมือถือ · แบบงานทั้งใบ {totalProofs} รูป · ระบบบังคับติ๊กครบก่อนยิงเลขพัสดุ
      </p>
    </div>
  );
}
