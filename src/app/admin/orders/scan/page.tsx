"use client";

/**
 * สถานีแพ็ค–ส่ง /admin/orders/scan  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * คนที่ใช้: ฝ่ายแพ็คยืนหน้าโต๊ะ มือถือข้างเดียว เครื่องยิงอีกข้าง
 *
 * โครงหน้า (บน → ล่าง):
 *  1. กล่องยิง — อยู่บนสุด "ตลอดเวลา" ไม่ผูกกับแท็บ ยิงได้ไม่ว่ากำลังดูรายการไหน
 *     ข้างในมีขั้นตอน ① เลขออเดอร์ → ② เลขพัสดุ และข้อมูลออเดอร์ที่กำลังรอเลข
 *  2. แถบไปป์ไลน์ 4 ขั้นตามงานจริง: รอแพ็ค (ปริ้นใบงานแล้ว · ใบยังไม่ปริ้นซ่อนไว้ ติ๊กดูได้) → รอของ → พร้อมยิง → ยิงแล้ว
 *     ตัวเลขใหญ่อ่านจากระยะแขน กดเพื่อสลับรายการข้างล่าง
 *  3. รายการของขั้นที่เลือก — แถวที่ยิงไม่ได้บอกเหตุผลตรง ๆ ในแถว ไม่ใช่แค่ปุ่มเทา
 *
 * 📦 "รอของ" = ฝ่ายแพ็คปักว่าของรายการไหน "ยังไม่มา / มาไม่ครบ" (items[].arrival)
 *    ปักได้จากปุ่มในแถว (โมดัล) หรือจากโหมดแพ็คในหน้าออเดอร์ · ใบที่ติดของโผล่ที่ขั้นนี้แทนขั้นรอปริ้น
 *    บอกรายตัวว่ารออะไร มาแล้วกี่ชิ้น รอมากี่วัน คาดว่ามาวันไหน (เลยกำหนด = แดง) · กด "มาครบแล้ว" ทีเดียวจากแถว
 *
 * 📱 บนมือถือ (จอสัมผัส) หน้านี้เป็น "คิวแพ็ค" ไม่ใช่สถานีเครื่องยิง:
 *  - ช่องยิงไม่โฟกัสเอง (คีย์บอร์ดจะเด้งบังจอ) · แตะแถวในขั้น รอแพ็ค หรือ พร้อมยิง = เปิดโหมดแพ็คใบนั้น
 *    พร้อมจำทั้งรายการเป็นคิว (lib/pack-queue) → ยิงเลขพัสดุเสร็จ โหมดแพ็คเด้งไปใบถัดไปเอง ไม่ต้องสแกนกระดาษทีละใบ
 *  - แถบล่าง "▶ เริ่มแพ็ค N ใบ" ไล่ตามลำดับความเร่งด่วน (เฉพาะใบที่ปริ้นใบงานแล้ว) · "📷 สแกนกองใบงาน" ยิง QR ต่อกันรวดเดียว
 *    เก็บเป็นชุดงานตามลำดับที่สแกน แล้วไล่ทำจากชุดนั้น
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { publicOrigin } from "@/lib/shop-info";
import StatusChip, { STATUS_TONE } from "@/components/admin/StatusChip";
import CameraScanner from "@/components/admin/CameraScanner";
import { extractOrderId, looksLikeOrderId } from "@/lib/scan-code";
import { PACK_QUEUE_EVENT, loadPackQueue, packQueueLeft, packQueueNext, shortOrderId, startPackQueue, type PackQueueSource } from "@/lib/pack-queue";
import { PACK_SCAN_PARAM } from "@/lib/permissions";
import {
  Banner,
  Btn,
  Empty,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Tag,
} from "@/components/admin/ui";
import ArrivalPicker, { arrivalSummary, fmtExpected, waitingDays, type ArrivalPatch } from "@/components/admin/ArrivalPicker";
import {
  MOCK_ORDERS,
  applyArrival,
  arrivalOverdue,
  orderNeedsTaxInvoiceInBox,
  orderStatusLabel,
  packGate,
  nextPlannedRound,
  packMissingOf,
  partialShipSummary,
  proofsOf,
  shipmentQty,
  withLog,
  type Order,
  type OrderStatus,
  type PackGate,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin } from "@/lib/order-repo";
import { useActor } from "@/lib/perm-context";
import { usePolling } from "@/lib/use-polling";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;
/** คำตอบจากฝ่ายผลิต (ระบบ TP หน้า "ติดตามของ iDucky") ต่อรายการที่รอของ — key = <เลขออเดอร์>__<ลำดับรายการ> */
type TPReply = { id: string; orderId: string; itemIndex: number; tpStatus?: string; tpNote?: string; tpEta?: string; tpBy?: string; tpAt?: string };
type Tab = "print" | "wait" | "scan" | "done";

/** สถานะที่อยู่ในสายงานแพ็ค–ส่ง (แบบผ่านแล้ว ยังไม่ส่ง) */
const FULFILL: OrderStatus[] = ["อนุมัติแบบ", "กำลังผลิต"];

/** 🧾 ป้ายใบกำกับภาษีบนแถวออเดอร์ — แดง = ยังไม่ใส่กล่อง · เขียว = ใส่แล้ว (ใครติ๊ก) · ใบธรรมดา/ส่งอีเมลไม่ขึ้นป้าย */
function TaxTag({ o }: { o: Order }) {
  if (!orderNeedsTaxInvoiceInBox(o)) return null;
  return o.taxInvoicePacked ? (
    <Tag tone="mint" title={`ยืนยันโดย ${o.taxInvoicePacked.by}`}>
      🧾 ใบกำกับใส่แล้ว · {o.taxInvoicePacked.by}
    </Tag>
  ) : (
    <Tag tone="solid" title="บิล FlowAccount/บิล VAT — พิมพ์ใบกำกับจาก FlowAccount ใส่กล่อง แล้วกดยืนยันในหน้าออเดอร์ (โหมดแพ็ค)">
      🧾 ใบกำกับ ยังไม่ใส่กล่อง
    </Tag>
  );
}

/** 🚚 ใบที่แบ่งส่งไปแล้วบางรอบ (ยังไม่ปิด) — บอกคนแพ็คว่ารูปไหนออกไปแล้ว ไม่ต้องหาของซ้ำ */
function PartialTag({ o }: { o: Order }) {
  if ((o.tracking ?? "").trim()) return null;
  const p = partialShipSummary(o);
  const plan = nextPlannedRound(o);
  return (
    <>
      {plan && (
        <Tag tone="yolk" title={`แอดมินสั่งแบ่งส่ง รอบที่ ${plan.index + 1}: ${plan.round.proofs.map((x) => `${x.itemName ?? ""} รูปที่ ${x.proof + 1}`).join(", ")}${plan.round.dueDate ? ` · ส่งภายใน ${plan.round.dueDate}` : ""}`}>
          📋 แบ่งส่ง รอบ {plan.index + 1} รอแพ็ค{plan.round.dueDate ? ` · ${plan.round.dueDate}` : ""}
        </Tag>
      )}
      {p && (
        <Tag tone="sky" title="ส่งบางส่วนไปแล้ว — รูปที่เหลือแพ็คต่อในโหมดแพ็ค แล้วยิงเลขรอบสุดท้ายที่ช่องเลขพัสดุ">
          🚚 ส่งแล้ว {p.rounds} รอบ · {p.proofsShipped}/{p.proofsTotal} รูป
        </Tag>
      )}
    </>
  );
}

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

/** ใบงานถูกปริ้นแล้ว = ของถึงมือฝ่ายแพ็คแล้ว (ใบที่ยังไม่ปริ้นอยู่ที่คิวปริ้น ไม่ใช่โต๊ะแพ็ค) */
const printedOf = (o: Order) => (o.printCount ?? (o.printedAt ? 1 : 0)) > 0;

/** ลิงก์เปิดโหมดแพ็คของใบนี้ (มือถือ) */
const packHref = (id: string) => `/admin/orders/${encodeURIComponent(id)}?${PACK_SCAN_PARAM}=1`;

/**
 * เรียงตามความเร่งด่วน: มีวันใช้งานของลูกค้าขึ้นก่อน (ใกล้สุดก่อน) · ไม่มีวัน = ใบเก่าก่อน (เลข OD มีวันที่ในตัว)
 * ใช้ทั้งรายการบนจอและลำดับคิวแพ็ค จะได้เห็นตรงกัน
 */
function byUrgency(a: Order, b: Order): number {
  const da = a.useByDate ?? "";
  const db = b.useByDate ?? "";
  if (da && db && da !== db) return da.localeCompare(db);
  if (da && !db) return -1;
  if (!da && db) return 1;
  return a.id.localeCompare(b.id);
}

/** เวลาที่ยิงเลขพัสดุออเดอร์นี้ (ISO) — อ่านจากบรรทัด log ล่าสุดของการบันทึกเลข */
function trackedAt(o: Order): string | undefined {
  for (let i = (o.log?.length ?? 0) - 1; i >= 0; i--) {
    if (o.log![i].action === "บันทึกเลขพัสดุ") return o.log![i].at;
  }
  return undefined;
}

/** เวลาแบบสั้น "09:14" — วันที่ไม่ต้องซ้ำในแถว เพราะอยู่ที่หัวกลุ่มแล้ว */
function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/** หัวกลุ่มวัน: วันนี้ · เมื่อวาน · "31 ก.ค. 69" (พ.ศ. ตามที่ทีมใช้คุยกัน) */
function dayLabel(iso?: string): string {
  if (!iso) return "ไม่ทราบวันยิง";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ไม่ทราบวันยิง";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "วันนี้";
  if (d.toDateString() === yesterday.toDateString()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

export default function ScanTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<Tab>("scan");
  const [target, setTarget] = useState<Order | null>(null); // ออเดอร์ที่รอเลขพัสดุ
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ order: Order; gate: PackGate } | null>(null);
  // 📷 กล้องมือถือแทนเครื่องยิง — "order" = รอเลขออเดอร์ · "tracking" = รอเลขพัสดุของ target
  const [cam, setCam] = useState<null | "order" | "tracking" | "batch">(null);
  const router = useRouter();
  // 📱 จอสัมผัส (มือถือ/แท็บเล็ต) หรือจอแคบระดับมือถือ — รู้หลัง mount · ref ไว้ให้ focusInput อ่านได้โดยไม่ต้องรอ render
  const [coarse, setCoarse] = useState(false);
  const coarseRef = useRef(false);
  useEffect(() => {
    const m = window.matchMedia("(pointer: coarse), (max-width: 640px)");
    const on = () => {
      coarseRef.current = m.matches;
      setCoarse(m.matches);
    };
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  // 📷 สแกนกองใบงาน — ชุดใบที่สแกนสะสม (เรียงตามลำดับที่สแกน) · ปิดกล้องแล้วชุดยังอยู่ กดสแกนต่อได้
  const [batch, setBatch] = useState<string[]>([]);
  const batchRef = useRef<string[]>([]);
  batchRef.current = batch;
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  // 📱 ลิงก์หน้านี้สำหรับมือถือ (ทำเป็น QR บนจอคอม) — ใช้โดเมนจริงเสมอ (เจ้าของร้านสั่ง 11 ก.ย. 69)
  // เปิดผ่าน localhost/IP ในวง ก็ให้ QR ชี้ https://iduckystore.com ไปเลย มือถือฝ่ายแพ็คใช้เว็บจริง ไม่ใช้ dev
  const [mobileUrl, setMobileUrl] = useState("");
  useEffect(() => setMobileUrl(`${publicOrigin()}/admin/orders/scan`), []);
  // คิวที่ค้างอยู่ในเครื่องนี้ (เริ่มไว้แล้วยังไม่ครบ) — โชว์ปุ่ม "ทำต่อ"
  const [pending, setPending] = useState<{ left: number; next: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const q = loadPackQueue();
      const next = q ? packQueueNext(q, "") : null;
      setPending(q && next ? { left: packQueueLeft(q), next } : null);
    };
    read();
    window.addEventListener(PACK_QUEUE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PACK_QUEUE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  const [tpReplies, setTpReplies] = useState<Record<string, TPReply>>({}); // 🏭 คำตอบจาก TP ต่อรายการที่รอของ
  const [arrivalFor, setArrivalFor] = useState<string | null>(null); // โมดัลปักของยังไม่มา — เก็บ id ไว้ อ่านออเดอร์สดจาก orders ทุกครั้ง
  const [savingArrival, setSavingArrival] = useState(false);
  const actor = useActor(); // ชื่อคนที่ล็อกอิน (ลงประวัติว่าใครปักของยังไม่มา)
  const [q, setQ] = useState(""); // ค้นหาในแท็บ "ยิงแล้ว"
  const [taxOnly, setTaxOnly] = useState(false); // 🧾 กรองเฉพาะใบที่ต้องใส่ใบกำกับภาษีลงกล่อง (บิล FlowAccount/บิล VAT)
  const [showUnprinted, setShowUnprinted] = useState(false); // ขั้น "รอแพ็ค" โชว์เฉพาะใบที่ปริ้นใบงานแล้ว (เจ้าของร้านสั่ง 11 ก.ย. 69) — ติ๊กนี้เพื่อดูใบที่ยังไม่ปริ้นด้วย
  const [copied, setCopied] = useState<string | null>(null); // ออเดอร์ที่เพิ่งคัดลอกเลขพัสดุ
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length > 0) {
      setOrders(r.orders);
      setDemo(false);
    } else {
      setOrders(MOCK_ORDERS);
      setDemo(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 🏭 ดึงคำตอบจากฝ่ายผลิต (TP) ของรายการที่ยังรอของ — เงียบถ้าดึงไม่ได้ (ยังไม่ตั้งค่า Firebase / ออฟไลน์) */
  const loadTpReplies = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders/pack-followup", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { replies?: TPReply[] };
      const map: Record<string, TPReply> = {};
      (data.replies ?? []).forEach((r) => {
        map[`${r.orderId}__${r.itemIndex}`] = r;
      });
      setTpReplies(map);
    } catch {
      /* ข้าม */
    }
  }, []);
  useEffect(() => {
    if (demo) return;
    void loadTpReplies();
  }, [demo, loadTpReplies]);

  // อัปเดตลิสต์เงียบ ๆ (ออเดอร์ใหม่ที่แบบผ่าน / ตรวจแพ็คเสร็จ จะโผล่เอง) — ไม่แตะช่องยิง
  const refresh = useCallback(async () => {
    if (busy || target || savingArrival) return; // กำลังยิง/กำลังบันทึกของอยู่ อย่าทับ
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(r.orders) ? cur : r.orders));
    if (r.orders.some((o) => packMissingOf(o).length > 0)) void loadTpReplies(); // มีใบรอของ → ถามฝ่ายผลิตด้วย
  }, [busy, target, savingArrival, loadTpReplies]);
  usePolling(refresh, { enabled: !demo });

  // ช่องยิงโฟกัสตลอด ไม่ว่าดูแท็บไหน — เครื่องยิงทำงานได้เสมอ
  // preventScroll: การคืนโฟกัสห้ามดึงจอเด้งขึ้นบน ระหว่างที่คนกำลังไล่ดูรายการข้างล่าง
  const focusInput = useCallback(() => {
    if (coarseRef.current) return; // มือถือ: โฟกัส = คีย์บอร์ดเด้งบังจอ — ให้แตะช่องเองเมื่ออยากพิมพ์
    inputRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput, target]);

  // ── แยกออเดอร์เป็น 3 กอง ตามผลตรวจแพ็ค ──
  const { toScan, toPrint, unprinted, toWait, waitOverdue } = useMemo(() => {
    const active = orders.filter((o) => FULFILL.includes(o.status) && !o.tracking && (!taxOnly || orderNeedsTaxInvoiceInBox(o)));
    const wait = active.filter((o) => packMissingOf(o).length > 0); // 📦 ของยังไม่มา/ไม่ครบ → รอของ
    // เลยวันที่คาดว่าจะมาก่อน · แล้วใบที่รอมานานสุดก่อน
    wait.sort((a, b) => {
      const ma = packMissingOf(a);
      const mb = packMissingOf(b);
      const oa = ma.some((m) => arrivalOverdue(m.expectedAt)) ? 0 : 1;
      const ob = mb.some((m) => arrivalOverdue(m.expectedAt)) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      const sa = ma.reduce((x, m) => (m.since < x ? m.since : x), "9");
      const sb = mb.reduce((x, m) => (m.since < x ? m.since : x), "9");
      return sa.localeCompare(sb);
    });
    const rest = active.filter((o) => packMissingOf(o).length === 0);
    const notReady = rest.filter((o) => !packGate(o).ready).sort(byUrgency); // ยังตรวจไม่ครบ
    return {
      toScan: rest.filter((o) => packGate(o).ready).sort(byUrgency), // ตรวจครบ → พร้อมยิง
      toPrint: notReady.filter(printedOf), // ปริ้นใบงานแล้ว → ของอยู่โต๊ะแพ็ค รอตรวจ
      unprinted: notReady.filter((o) => !printedOf(o)), // ยังไม่ปริ้น → ยังอยู่คิวปริ้น ไม่ขึ้นรายการแพ็คจนกว่าจะติ๊กดู
      toWait: wait,
      waitOverdue: wait.filter((o) => packMissingOf(o).some((m) => arrivalOverdue(m.expectedAt))).length,
    };
  }, [orders, taxOnly]);

  /** 🧾 ใบที่ยังไม่ยิงเลขและต้องใส่ใบกำกับลงกล่อง — ไว้ขึ้นชิปกรอง (นับจากทั้งหมด ไม่ขึ้นกับตัวกรอง) */
  const taxStats = useMemo(() => {
    const need = orders.filter((o) => FULFILL.includes(o.status) && !o.tracking && orderNeedsTaxInvoiceInBox(o));
    return { n: need.length, pending: need.filter((o) => !o.taxInvoicePacked).length };
  }, [orders]);

  /** ออเดอร์ที่โมดัลปักของเปิดอยู่ — อ่านสดจาก orders จะได้เห็นผลทันทีหลังบันทึก */
  const arrivalOrder = useMemo(() => (arrivalFor ? orders.find((o) => o.id === arrivalFor) ?? null : null), [arrivalFor, orders]);

  /** 📦 ปักสถานะของรายการ (จากโมดัล/ปุ่ม "มาครบแล้ว" ในแถว) — บันทึกทันที ลงประวัติว่าใครปัก */
  const saveArrival = useCallback(
    async (o: Order, itemIndex: number, patch: ArrivalPatch) => {
      const next = applyArrival(o, itemIndex, patch, actor);
      if (next === o) return;
      setSavingArrival(true);
      const ok = demo ? true : await saveOrderAdmin(next);
      setSavingArrival(false);
      if (!ok) {
        setMsg({ kind: "err", text: `บันทึกสถานะของไม่สำเร็จ (${o.id}) — ลองใหม่อีกครั้ง` });
        return;
      }
      setOrders((os) => os.map((x) => (x.id === next.id ? next : x)));
      const it = o.items[itemIndex];
      setMsg({
        kind: patch.status === "มาครบ" ? "ok" : "info",
        text:
          patch.status === "มาครบ"
            ? `📦 ${o.id} · ${it?.name ?? ""} — ของมาครบแล้ว`
            : `📦 ${o.id} · ${it?.name ?? ""} — ปัก “${patch.status}” แล้ว ใบนี้ย้ายไปขั้น “รอของ”`,
      });
    },
    [actor, demo]
  );

  // ── ออเดอร์ที่มีเลขพัสดุในระบบแล้ว — ล่าสุดขึ้นก่อน (เรียงจากเวลาที่ยิงใน log) ──
  // 🚚 รอบแบ่งส่งขึ้นเป็นแถวของตัวเอง (เลขพัสดุคนละเลข) — ใบเดียวมีหลายแถวได้
  const scanned = useMemo(() => {
    const rows: { o: Order; at?: string; tracking: string; round?: number; key: string }[] = [];
    orders.forEach((o) => {
      (o.shipments ?? []).forEach((sh, n) => rows.push({ o, at: sh.at, tracking: sh.tracking, round: n + 1, key: `${o.id}#${n}` }));
      if (o.tracking) rows.push({ o, at: trackedAt(o), tracking: o.tracking, key: o.id });
    });
    return rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [orders]);
  const scannedToday = useMemo(() => scanned.filter((s) => isToday(s.at)).length, [scanned]);

  // ── แท็บ "ยิงแล้ว": กรองตามคำค้น แล้วจัดกลุ่มตามวัน (เรียงล่าสุดอยู่แล้ว → กลุ่มติดกัน) ──
  const shipGroups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = !s
      ? scanned
      : scanned.filter(
          ({ o, tracking }) =>
            o.id.toLowerCase().includes(s) || tracking.toLowerCase().includes(s) || (o.customer ?? "").toLowerCase().includes(s)
        );
    const groups: { key: string; label: string; rows: typeof filtered }[] = [];
    for (const row of filtered) {
      const key = row.at ? new Date(row.at).toDateString() : "unknown";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else groups.push({ key, label: dayLabel(row.at), rows: [row] });
    }
    return groups;
  }, [scanned, q]);
  const shipCount = useMemo(() => shipGroups.reduce((n, g) => n + g.rows.length, 0), [shipGroups]);

  /** คัดลอกเลขพัสดุไปตอบลูกค้า — ติ๊กเขียวบนแถวสักครู่ให้รู้ว่าติดมือแล้ว */
  const copyTracking = useCallback((orderId: string, tracking: string) => {
    const done = () => {
      setCopied(orderId);
      window.setTimeout(() => setCopied((c) => (c === orderId ? null : c)), 1600);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tracking).then(done);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = tracking;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  }, []);

  /** เริ่มไล่แพ็คตามลำดับ — จำคิวไว้ในเครื่องนี้ แล้วเปิดโหมดแพ็คใบแรก (หรือใบที่แตะ) */
  const beginQueue = useCallback(
    (ids: string[], source: PackQueueSource, firstId?: string) => {
      if (!ids.length) return;
      startPackQueue(ids, source);
      router.push(packHref(firstId ?? ids[0]));
    },
    [router]
  );

  /** รายการของแท็บที่เปิดอยู่ซึ่งไล่แพ็คต่อกันได้ (รอแพ็ค · พร้อมยิง) — ลำดับเดียวกับที่เห็นบนจอ */
  const tabQueue = tab === "print" ? toPrint : tab === "scan" ? toScan : [];

  /** 📷 ผลสแกนตอนเก็บกองใบงาน — กล้องไม่ปิด สะสมเป็นชุด · ใบซ้ำ/ใบที่ยิงแล้ว/ไม่พบ บอกแล้วข้าม */
  function onBatchScan(text: string) {
    if (!looksLikeOrderId(text)) {
      setBatchMsg(`ไม่ใช่เลขออเดอร์ (${text.length > 24 ? `${text.slice(0, 24)}…` : text}) — จ่อ QR ใบงานหรือบาร์โค้ดใบปะหน้า`);
      return;
    }
    const id = extractOrderId(text);
    const found = orders.find((o) => o.id.toUpperCase() === id);
    if (!found) {
      setBatchMsg(`ไม่พบ ${id} ในระบบ — ตรวจว่าเป็นใบงานของร้านนี้`);
      return;
    }
    if (found.tracking) {
      setBatchMsg(`${id} ยิงเลขพัสดุไปแล้ว (${found.tracking}) — ข้าม`);
      return;
    }
    if (batchRef.current.includes(id)) {
      setBatchMsg(`${id} สแกนไปแล้ว ไม่นับซ้ำ`);
      return;
    }
    setBatchMsg(null);
    setBatch([...batchRef.current, id]);
  }

  function reset(message?: Msg) {
    setTarget(null);
    setValue("");
    setMsg(message ?? null);
    setTimeout(focusInput, 50);
  }

  /** เลือกออเดอร์มารอยิงเลขพัสดุ (จาก QR หรือกดปุ่มในแถว) — เช็คด่านตรวจแพ็คก่อนเสมอ */
  function pickTarget(o: Order, viaCamera = false) {
    const gate = packGate(o);
    if (!gate.ready) {
      setBlocked({ order: o, gate });
      setMsg(null);
      return;
    }
    setTarget(o);
    setMsg({
      kind: "info",
      text: o.tracking ? `ออเดอร์นี้มีเลขพัสดุแล้ว (${o.tracking}) — ยิงใหม่เพื่อแทนที่` : "ยิงเลขพัสดุต่อได้เลย",
    });
    // มาจากกล้องมือถือ → เปิดกล้องต่อทันทีเพื่อสแกนเลขพัสดุ (ไม่ต้องกดปุ่มซ้ำ ไม่ให้คีย์บอร์ดเด้ง)
    if (viaCamera) setCam("tracking");
    else setTimeout(focusInput, 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await handleValue(value);
  }

  /** ผลจากกล้องมือถือ — ใช้ทางเดินเดียวกับเครื่องยิง (ขั้น 1 เลขออเดอร์ / ขั้น 2 เลขพัสดุ) */
  function onCameraResult(text: string) {
    setCam(null);
    void handleValue(text, true);
  }

  async function handleValue(raw: string, viaCamera = false) {
    const v = raw.trim();
    if (!v || busy) return;
    setValue("");

    // ── ขั้นที่ 1: ยิง QR เลขออเดอร์ ──
    if (!target) {
      const code = extractOrderId(v);
      const found = orders.find((o) => o.id.toLowerCase() === code.toLowerCase());
      if (!found) {
        setMsg({ kind: "err", text: `ไม่พบออเดอร์ “${code}” — ยิง QR บนใบงานอีกครั้ง` });
        if (!viaCamera) setTimeout(focusInput, 50);
        return;
      }
      pickTarget(found, viaCamera);
      return;
    }

    // ── ขั้นที่ 2: ยิง/พิมพ์เลขพัสดุ ──
    setBusy(true);
    const next = withLog(
      { ...target, tracking: v, status: target.status === "เสร็จสิ้น" ? target.status : "จัดส่งแล้ว" },
      "แอดมิน",
      "บันทึกเลขพัสดุ",
      v
    );
    const ok = demo ? true : await saveOrderAdmin(next);
    setBusy(false);

    if (!ok) {
      setMsg({ kind: "err", text: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      setTimeout(focusInput, 50);
      return;
    }
    setOrders((os) => os.map((o) => (o.id === next.id ? next : o)));
    reset({ kind: "ok", text: `บันทึกแล้ว — ${next.id} · ${v}` });
  }

  const waiting = !target;

  const PIPE: { key: Tab; label: string; n: number; hint: string; tone: string }[] = [
    {
      key: "print",
      label: "รอแพ็ค",
      n: toPrint.length,
      hint: unprinted.length ? `ปริ้นแล้ว รอตรวจ · ยังไม่ปริ้น ${unprinted.length}` : "ปริ้นแล้ว รอตรวจ",
      tone: "var(--dk-coral-deep)",
    },
    {
      key: "wait",
      label: "รอของ",
      n: toWait.length,
      hint: toWait.length === 0 ? "ของมาครบทุกใบ" : waitOverdue ? `เลยกำหนด ${waitOverdue} ใบ` : "ยังไม่มา / มาไม่ครบ",
      tone: waitOverdue ? "var(--dk-coral-ink)" : "var(--dk-yolk-deep)",
    },
    { key: "scan", label: "พร้อมยิง", n: toScan.length, hint: "ตรวจครบ รอเลขพัสดุ", tone: "var(--dk-mint)" },
    { key: "done", label: "ยิงแล้ว", n: scanned.length, hint: `วันนี้ ${scannedToday} ใบ`, tone: "var(--dk-quiet)" },
  ];

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="สถานีแพ็ค–ส่ง"
        sub="ปริ้นใบงาน → แพ็ค+ตรวจ → ยิงเลขพัสดุ"
        live={demo ? { ok: false, text: "โหมดตัวอย่าง — การบันทึกจะไม่ถูกเก็บถาวร" } : { ok: true, text: "ออเดอร์จริง" }}
        tools={<Btn href="/admin/orders">คำสั่งซื้อทั้งหมด</Btn>}
      />

      {/* ── กล่องยิง — ใหญ่สุดและอยู่บนสุดตลอด ยิงได้ไม่ว่ากำลังดูรายการไหน ── */}
      <form onSubmit={onSubmit} className="mt-4">
        <div className="dkb-g dkb-scanbox">
          <div className="dkb-scansteps">
            <span className="dkb-scanstep" data-on={waiting ? "1" : undefined} data-done={waiting ? undefined : "1"}>
              <i>{waiting ? "1" : "✓"}</i>เลขออเดอร์
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
            <span className="dkb-scanstep" data-on={waiting ? undefined : "1"}>
              <i>2</i>เลขพัสดุ
            </span>
          </div>

          <label htmlFor="scan" className="big">
            {waiting ? "รอยิง QR เลขออเดอร์" : `รอเลขพัสดุของ ${target.id}`}
          </label>
          <span className="cap">
            {waiting ? "กด 📷 สแกนด้วยกล้องมือถือ · เครื่องยิงจ่อที่ใบงาน · หรือพิมพ์เลขเอง" : "กด 📷 สแกนเลขพัสดุ · หรือยิง/พิมพ์ แล้วกด Enter"}
          </span>
          <div className="dkb-scanline flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => {
                inputRef.current?.blur();
                setCam(waiting ? "order" : "tracking");
              }}
              title="ใช้กล้องมือถือสแกนแทนเครื่องยิง"
              className="-ml-2 my-1.5 shrink-0 rounded-full px-3 text-xl"
              style={{ background: "var(--dk-navy)", color: "#fff" }}
              aria-label={waiting ? "สแกนเลขออเดอร์ด้วยกล้อง" : "สแกนเลขพัสดุด้วยกล้อง"}
            >
              📷
            </button>
            <input
              id="scan"
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                if (!blocked && !cam) setTimeout(focusInput, 120);
              }}
              autoComplete="off"
              placeholder={waiting ? "ยิง QR หรือพิมพ์เลขออเดอร์" : "ยิงเลขพัสดุ"}
            />
          </div>
          <span className="cap mt-2 block">
            {busy ? "กำลังบันทึก…" : coarse ? "บนมือถือ: แตะแถวข้างล่างเพื่อเปิดโหมดแพ็ค · แตะช่องนี้เมื่ออยากพิมพ์เอง" : "ช่องนี้โฟกัสอยู่ตลอด — ยิงได้เลย"}
          </span>

          {/* ออเดอร์ที่กำลังรอเลขพัสดุ — อยู่ในกล่องเดียวกัน จะได้เห็นว่ากำลังยิงให้ใคร */}
          {target && (
            <div className="dkb-scantarget">
              <span className="who">{target.customer || "ยังไม่ระบุชื่อ"}</span>
              {target.phone && <span className="sub">{target.phone}</span>}
              {target.address && <span className="sub w-full">{target.address}</span>}
              <StatusChip s={target.status} label={orderStatusLabel(target)} />
              <Btn small onClick={() => reset({ kind: "info", text: "ยกเลิกแล้ว — ยิง QR ออเดอร์ใหม่ได้เลย" })}>
                ยกเลิก / เปลี่ยนออเดอร์
              </Btn>
            </div>
          )}
        </div>
      </form>

      {/* 📱 QR เปิดคิวแพ็คบนมือถือ — เฉพาะจอคอม (บนมือถือคือหน้านี้เองอยู่แล้ว) · คนแพ็คสแกนทีเดียว ไม่ต้องพิมพ์ลิงก์ */}
      {!coarse && mobileUrl && (
        <div className="dkb-g mt-3 flex items-center gap-4 px-4 py-3">
          <div className="shrink-0 rounded-lg bg-white p-1.5">
            <QRCodeSVG value={mobileUrl} size={76} level="M" marginSize={0} />
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-semibold" style={{ color: "var(--dk-navy)" }}>📱 เปิดคิวแพ็คบนมือถือ — สแกน QR นี้</p>
            <p className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              เปิดด้วยแอปกล้องมือถือแล้วล็อกอิน · แตะใบในรายการเพื่อไล่แพ็คต่อกัน หรือสแกนกองใบงานทีเดียว
            </p>
            <p className="dkb-code mt-0.5 truncate" style={{ color: "var(--dk-faint)" }}>{mobileUrl}</p>
          </div>
        </div>
      )}

      {msg && (
        <div className="mt-3">
          {msg.kind === "err" ? (
            <Banner tone="hot" title={msg.text} />
          ) : msg.kind === "ok" ? (
            <div className="dkb-g px-4 py-3 text-[14px]" style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}>
              {msg.text}
            </div>
          ) : (
            <div className="dkb-g px-4 py-3 text-[14px]" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
              {msg.text}
            </div>
          )}
        </div>
      )}

      {/* ── ไปป์ไลน์ 3 ขั้นตามงานจริง — ตัวเลขใหญ่ กดสลับรายการข้างล่าง ── */}
      <div className="dkb-pipe mt-4">
        {PIPE.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setTab(p.key)}
            aria-pressed={tab === p.key}
            className="dkb-g dkb-pipestep"
            data-alert={p.key === "wait" && waitOverdue > 0 ? "1" : undefined}
            style={{ ["--dk-tone" as string]: p.tone }}
          >
            <span className="lb">{p.label}</span>
            <span className="dkb-num n">{p.n}</span>
            <span className="hint">{p.hint}</span>
          </button>
        ))}
      </div>
      {/* 🧾 ชิปกรองใบที่ต้องแนบใบกำกับ — ขึ้นเมื่อมีจริง หัวหน้าแพ็คกวาดตาก่อนรถขนส่งมา */}
      {(taxStats.n > 0 || taxOnly) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            onClick={() => setTaxOnly((v) => !v)}
            aria-pressed={taxOnly}
            className="min-h-[36px] rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold"
            style={
              taxOnly
                ? { background: "var(--dk-navy)", borderColor: "var(--dk-navy)", color: "#fff" }
                : { background: "#fff", borderColor: "var(--dk-coral-deep)", color: "var(--dk-coral-ink)" }
            }
          >
            🧾 มีใบกำกับ {taxStats.n}
            {taxStats.pending > 0 ? ` · ยังไม่ใส่กล่อง ${taxStats.pending}` : " · ใส่กล่องครบแล้ว"}
          </button>
          {taxOnly && (
            <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
              กำลังกรองเฉพาะใบที่ต้องแนบใบกำกับ — แตะอีกครั้งเพื่อดูทั้งหมด
            </span>
          )}
        </div>
      )}

      {/* 📱 แตะลิงก์ในรายการบนมือถือ = จำรายการทั้งแท็บเป็นคิวก่อนเปิดโหมดแพ็ค (ปุ่มอื่นในแถวไม่เกี่ยว) */}
      <div
        className={coarse ? "pb-28" : undefined}
        onClickCapture={(e) => {
          if (!coarse || !tabQueue.length) return;
          const a = (e.target as HTMLElement).closest?.("a");
          if (a && a.getAttribute("href")?.includes(`${PACK_SCAN_PARAM}=1`)) startPackQueue(tabQueue.map((o) => o.id), "queue");
        }}
      >
      {!loaded ? (
        <div className="mt-5 grid gap-2">
          <div className="dkb-skel h-[64px]" />
          <div className="dkb-skel h-[64px]" />
          <div className="dkb-skel h-[64px]" />
        </div>
      ) : tab === "scan" ? (
        <>
          <ListHead title="ตรวจแพ็คครบแล้ว พร้อมยิงเลข" note={`${toScan.length} ใบ`} />
          {toScan.length === 0 ? (
            <Empty title="ยังไม่มีออเดอร์พร้อมยิง" body="ไปที่ขั้น “รอแพ็ค” แล้วตรวจนับของให้ครบก่อน" />
          ) : (
            <Rows>
              {toScan.map((o) => (
                <Row key={o.id} tone="var(--dk-mint)">
                  <RowMain
                    name={o.customer || "ยังไม่ระบุชื่อ"}
                    href={coarse ? packHref(o.id) : `/admin/orders/${encodeURIComponent(o.id)}`}
                    tags={
                      <>
                        <Tag tone="mint">พร้อมยิง</Tag>
                        <PartialTag o={o} />
                        <TaxTag o={o} />
                      </>
                    }
                    meta={
                      <>
                        <span className="id">{o.id}</span>
                        <span>{qtyOf(o)} ชิ้น</span>
                        <span>ตรวจนับครบ · ถ่ายรูปแล้ว</span>
                      </>
                    }
                  />
                  <RowSide>
                    {coarse ? (
                      <Btn tone="navy" small onClick={() => beginQueue(toScan.map((x) => x.id), "queue", o.id)}>
                        📦 แพ็ค–ยิงใบนี้
                      </Btn>
                    ) : (
                      <Btn tone="navy" small onClick={() => pickTarget(o)}>
                        ยิงเลขใบนี้
                      </Btn>
                    )}
                  </RowSide>
                </Row>
              ))}
            </Rows>
          )}
        </>
      ) : tab === "wait" ? (
        <>
          {/* ── 📦 รอของ: ของยังไม่มา/มาไม่ครบ — บอกรายตัวว่ารออะไร รอมากี่วัน คาดว่ามาวันไหน ── */}
          <ListHead
            title="ของยังไม่มา / มาไม่ครบ — รอของก่อนแพ็ค"
            note={waitOverdue ? `${toWait.length} ใบ · เลยกำหนด ${waitOverdue} ใบ` : `${toWait.length} ใบ`}
          />
          {toWait.length === 0 ? (
            <Empty
              title="ไม่มีออเดอร์ที่รอของ"
              body="ของรายการไหนยังไม่ถึงโต๊ะแพ็ค กด “ของยังไม่มา” ในแถวที่ขั้น “รอแพ็ค” หรือปักจากโหมดแพ็คในหน้าออเดอร์"
            />
          ) : (
            <Rows>
              {toWait.map((o) => {
                const miss = packMissingOf(o);
                const anyNone = miss.some((m) => m.status === "ยังไม่มา");
                const anyOverdue = miss.some((m) => arrivalOverdue(m.expectedAt));
                const longest = Math.max(...miss.map((m) => waitingDays(m.since)));
                const okItems = o.items.length - miss.length;
                return (
                  <Row key={o.id} tone={anyOverdue ? "var(--dk-coral-ink)" : anyNone ? "var(--dk-coral-deep)" : "var(--dk-yolk-deep)"}>
                    <RowMain
                      name={o.customer || "ยังไม่ระบุชื่อ"}
                      href={`/admin/orders/${encodeURIComponent(o.id)}`}
                      tags={
                        <>
                          {anyOverdue ? (
                            <Tag tone="solid">เลยวันที่คาด</Tag>
                          ) : anyNone ? (
                            <Tag tone="coral">ของยังไม่มา</Tag>
                          ) : (
                            <Tag tone="yolk">มาไม่ครบ</Tag>
                          )}
                          <Tag tone="quiet">
                            รอมา {longest} วัน
                          </Tag>
                          <TaxTag o={o} />
                        </>
                      }
                      meta={
                        <>
                          <span className="id">{o.id}</span>
                          <span>{qtyOf(o)} ชิ้น</span>
                          <span>
                            ติดของ {miss.length}/{o.items.length} รายการ
                            {okItems > 0 ? ` · อีก ${okItems} รายการมาแล้ว` : ""}
                          </span>
                          {o.useByDate && (
                            <span className="warn">ลูกค้าใช้งาน {fmtExpected(o.useByDate)}</span>
                          )}
                        </>
                      }
                    />
                    <RowSide>
                      <Btn tone="navy" small onClick={() => setArrivalFor(o.id)}>
                        อัปเดตของ
                      </Btn>
                      <Btn small href={`/admin/orders/${encodeURIComponent(o.id)}`}>
                        เปิดออเดอร์
                      </Btn>
                    </RowSide>
                    {/* รายการที่ติดของ — บรรทัดละรายการ กด "มาครบแล้ว" ได้จากตรงนี้เลย */}
                    <span className="dkb-wait">
                      {miss.map((m) => {
                        const over = arrivalOverdue(m.expectedAt);
                        return (
                          <span key={m.index} className="dkb-waitrow" data-st={m.status === "ยังไม่มา" ? "none" : "part"} data-over={over ? "1" : undefined}>
                            <span className="st">{m.status === "ยังไม่มา" ? "⏳ ยังไม่มา" : `⚠️ ${arrivalSummary(m, m.need)}`}</span>
                            <span className="nm">{m.item}</span>
                            <span className="dt">
                              {m.expectedAt ? (
                                <b className="exp">{over ? `เลยกำหนด ${fmtExpected(m.expectedAt)}` : `คาดว่ามา ${fmtExpected(m.expectedAt)}`}</b>
                              ) : (
                                <b className="exp none">ไม่ได้ระบุวันที่คาด</b>
                              )}
                              {m.note && <span className="note">{m.note}</span>}
                              <span className="by">
                                ปักโดย {m.by} · รอมา {waitingDays(m.since)} วัน
                              </span>
                            </span>
                            {/* 🏭 ฝ่ายผลิตตอบอะไรบ้าง (จากหน้า "ติดตามของ iDucky" ในระบบ TP) — ยังไม่ตอบก็บอกว่าส่งเรื่องไปแล้ว */}
                            {(() => {
                              const r = tpReplies[`${o.id}__${m.index}`];
                              const answered = !!(r && (r.tpStatus || r.tpNote || r.tpEta));
                              return (
                                <span className="tp" data-on={answered ? "1" : undefined}>
                                  {answered ? (
                                    <>
                                      <b>🏭 ฝ่ายผลิต: {r!.tpStatus || "รับเรื่องแล้ว"}</b>
                                      {r!.tpEta && <span>ส่งได้ {fmtExpected(r!.tpEta)}</span>}
                                      {r!.tpNote && <span className="note">{r!.tpNote}</span>}
                                      {r!.tpBy && <span className="by">ตอบโดย {r!.tpBy}</span>}
                                    </>
                                  ) : (
                                    <span className="by">🏭 ส่งเรื่องไประบบ TP (ติดตามของ iDucky) แล้ว — ฝ่ายผลิตยังไม่ตอบ</span>
                                  )}
                                </span>
                              );
                            })()}
                            <button
                              type="button"
                              className="ok"
                              disabled={savingArrival}
                              onClick={() => void saveArrival(o, m.index, { status: "มาครบ" })}
                              title="ของรายการนี้มาครบแล้ว — ปลดออกจากรอของ"
                            >
                              ✓ มาครบแล้ว
                            </button>
                          </span>
                        );
                      })}
                    </span>
                  </Row>
                );
              })}
            </Rows>
          )}
        </>
      ) : tab === "print" ? (
        <>
          <ListHead
            title="ปริ้นใบงานแล้ว รอแพ็ค + ตรวจ"
            note={showUnprinted ? `${toPrint.length + unprinted.length} ใบ (รวมยังไม่ปริ้น ${unprinted.length})` : `${toPrint.length} ใบ`}
          />
          {/* ใบที่ยังไม่ปริ้นยังไม่ถึงโต๊ะแพ็ค — ซ่อนไว้ก่อน ติ๊กดูได้ (ปุ่มปริ้นอยู่ในแถว) */}
          {unprinted.length > 0 && (
            <div className="mb-2.5 px-1">
              <button
                type="button"
                onClick={() => setShowUnprinted((v) => !v)}
                aria-pressed={showUnprinted}
                className="min-h-[36px] rounded-full border-[1.5px] px-3 text-[12.5px] font-semibold"
                style={
                  showUnprinted
                    ? { background: "var(--dk-navy)", borderColor: "var(--dk-navy)", color: "#fff" }
                    : { background: "#fff", borderColor: "var(--dk-quiet)", color: "var(--dk-navy-soft)" }
                }
              >
                🖨 ยังไม่ปริ้นใบงาน {unprinted.length} ใบ · {showUnprinted ? "ซ่อน" : "แสดงด้วย"}
              </button>
            </div>
          )}
          {toPrint.length === 0 && !(showUnprinted && unprinted.length) ? (
            <Empty
              title="ไม่มีใบที่ปริ้นแล้วรอแพ็ค"
              body={unprinted.length ? `มี ${unprinted.length} ใบยังไม่ได้ปริ้นใบงาน — ปริ้นจากคิวปริ้น หรือติ๊ก “แสดงด้วย” ข้างบน` : "ใบใหม่จะขึ้นตรงนี้เมื่อปริ้นใบงานแล้ว"}
            />
          ) : (
            <Rows>
              {(showUnprinted ? [...toPrint, ...unprinted] : toPrint).map((o) => {
                const g = packGate(o);
                const printed = printedOf(o);
                const need = [
                  g.uncounted.length ? `ตรวจนับ ${g.uncounted.length} รูป` : "",
                  g.unread.length ? `อ่านรายละเอียด ${g.unread.length} รายการ` : "",
                  g.unsampled.length ? `ใส่งานตัวอย่าง ${g.unsampled.length} รายการ` : "",
                  g.taxInvoiceUnpacked ? "ใส่ใบกำกับภาษี" : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Row key={o.id} tone={STATUS_TONE[o.status]}>
                    <RowMain
                      name={o.customer || "ยังไม่ระบุชื่อ"}
                      href={coarse ? packHref(o.id) : `/admin/orders/${encodeURIComponent(o.id)}`}
                      tags={
                        <>
                          {printed ? <Tag tone="coral">ยังยิงไม่ได้</Tag> : <Tag tone="quiet">🖨 ยังไม่ปริ้นใบงาน</Tag>}
                          <PartialTag o={o} />
                          <TaxTag o={o} />
                        </>
                      }
                      meta={
                        <>
                          <span className="id">{o.id}</span>
                          <span>{qtyOf(o)} ชิ้น</span>
                          <span className="warn">{need ? `เหลือ ${need}` : "ยังไม่ได้ตรวจแพ็ค"}</span>
                        </>
                      }
                    />
                    <RowSide>
                      {coarse ? (
                        <Btn tone="navy" small onClick={() => beginQueue(toPrint.map((x) => x.id), "queue", o.id)}>
                          📦 แพ็คใบนี้
                        </Btn>
                      ) : (
                        <Btn tone="navy" small href={`/admin/orders/${encodeURIComponent(o.id)}/print?doc=work`}>
                          ปริ้นใบงาน
                        </Btn>
                      )}
                      <Btn small onClick={() => setArrivalFor(o.id)} title="ของรายการไหนยังไม่ถึงโต๊ะแพ็ค ปักไว้ให้ใบนี้ไปรอที่ขั้น “รอของ”">
                        📦 ของยังไม่มา
                      </Btn>
                    </RowSide>
                  </Row>
                );
              })}
            </Rows>
          )}
        </>
      ) : (
        <>
          {/* ── ยิงแล้ว: ตารางเลขพัสดุ จัดกลุ่มตามวัน · เลขกดคัดลอกไปตอบลูกค้าได้เลย ── */}
          <ListHead title="เลขพัสดุที่ยิงเข้าระบบแล้ว" note={`${shipCount} ใบ · วันนี้ ${scannedToday} ใบ`} />
          {scanned.length === 0 ? (
            <Empty title="ยังไม่มีออเดอร์ที่ยิงเลขพัสดุ" body="ยิง QR ออเดอร์แรกที่กล่องข้างบน แล้วจะขึ้นตรงนี้" />
          ) : (
            <>
              <div className="mb-2.5 px-1">
                <SearchBox value={q} onChange={setQ} placeholder="ค้นหา เลขพัสดุ · เลขออเดอร์ · ชื่อลูกค้า" />
              </div>
              {shipCount === 0 ? (
                <Empty title={`ไม่พบ “${q.trim()}”`} body="ลองพิมพ์เลขพัสดุ เลขออเดอร์ หรือชื่อลูกค้าอีกครั้ง" />
              ) : (
                <div className="dkb-g dkb-ship">
                  <div className="dkb-shiphead" aria-hidden>
                    <span className="r">#</span>
                    <span>เลขออเดอร์</span>
                    <span>ลูกค้า</span>
                    <span>เลขพัสดุ · กดคัดลอกได้</span>
                    <span className="r">ชิ้น</span>
                    <span className="r">เวลา</span>
                    <span className="r">สถานะ</span>
                  </div>
                  {shipGroups.map((g) => (
                    <div key={g.key}>
                      <div className="dkb-shipday">
                        {g.label} <small>{g.rows.length} ใบ</small>
                      </div>
                      {g.rows.map(({ o, at, tracking, round, key }, i) => {
                        const odd = !round && o.status !== "จัดส่งแล้ว" && o.status !== "เสร็จสิ้น";
                        const sh = round ? o.shipments?.[round - 1] : undefined;
                        return (
                          <div key={key} className="dkb-shiprow" data-odd={odd ? "1" : undefined}>
                            <span className="dkb-shipidx">{i + 1}</span>
                            <Link
                              href={`/admin/orders/${encodeURIComponent(o.id)}`}
                              className="dkb-shipid underline-offset-4 hover:underline"
                              title="เปิดหน้าออเดอร์"
                            >
                              {o.id}
                            </Link>
                            <span className="dkb-shipwho">{o.customer || "ยังไม่ระบุชื่อ"}</span>
                            <button
                              type="button"
                              className="dkb-shiptrk"
                              data-copied={copied === key ? "1" : undefined}
                              onClick={() => copyTracking(key, tracking)}
                              title="กดเพื่อคัดลอกเลขพัสดุ"
                              aria-label={`คัดลอกเลขพัสดุ ${tracking}`}
                            >
                              {tracking}
                              {copied === key ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                                  <path d="m4.5 12.5 5 5 10-11" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <rect x="8" y="8" width="12" height="12" rx="2.5" />
                                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                                </svg>
                              )}
                            </button>
                            <span className="dkb-shipqty">{sh ? `${shipmentQty(sh) || "?"} ชิ้น` : `${qtyOf(o)} ชิ้น`}</span>
                            <span className="dkb-shiptime">{fmtTime(at)}</span>
                            <span className="dkb-shipst">
                              {round ? (
                                <Tag tone="sky" title={`แบ่งส่ง รอบที่ ${round} · ${sh?.proofs.length ?? 0} รูป${sh?.note ? ` · ${sh.note}` : ""}`}>
                                  🚚 ส่งบางส่วน รอบ {round}
                                </Tag>
                              ) : (
                                <StatusChip s={o.status} label={orderStatusLabel(o)} />
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      </div>

      {/* 📱 แถบล่างมือถือ — เริ่มแพ็คตามคิว / สแกนกองใบงาน / ทำคิวที่ค้างต่อ */}
      {coarse && loaded && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-2.5 shadow-[0_-6px_18px_rgba(23,58,107,0.12)] backdrop-blur">
          {batch.length > 0 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCam("batch")}
                className="min-h-[52px] shrink-0 rounded-2xl border-[1.5px] px-3 text-sm font-bold"
                style={{ borderColor: "var(--dk-navy)", color: "var(--dk-navy)" }}
              >
                📷 สแกนต่อ
              </button>
              <button
                type="button"
                onClick={() => beginQueue(batch, "batch")}
                className="min-h-[52px] flex-1 rounded-2xl text-sm font-extrabold"
                style={{ background: "var(--dk-yolk)", color: "#3a2b00" }}
              >
                ▶ แพ็คชุดที่สแกน {batch.length} ใบ
                <span className="block text-[10.5px] font-normal">เรียงตามลำดับที่สแกน · {batch.map(shortOrderId).join(" · ")}</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setBatchMsg(null);
                  setCam("batch");
                }}
                className="min-h-[52px] shrink-0 rounded-2xl border-[1.5px] px-3 text-sm font-bold"
                style={{ borderColor: "var(--dk-navy)", color: "var(--dk-navy)" }}
                title="ยิง QR ใบงานต่อกันหลายใบ แล้วไล่แพ็คจากชุดนั้น"
              >
                📷 สแกนกองใบงาน
              </button>
              {pending ? (
                <Link
                  href={packHref(pending.next)}
                  className="grid min-h-[52px] flex-1 place-items-center rounded-2xl text-center text-sm font-extrabold text-white"
                  style={{ background: "var(--dk-navy)" }}
                >
                  ▶ ทำคิวต่อ · เหลือ {pending.left} ใบ
                  <span className="block text-[10.5px] font-normal text-slate-200">ใบถัดไป {pending.next}</span>
                </Link>
              ) : tabQueue.length > 0 ? (
                <button
                  type="button"
                  onClick={() => beginQueue(tabQueue.map((o) => o.id), "queue")}
                  className="min-h-[52px] flex-1 rounded-2xl text-sm font-extrabold"
                  style={{ background: "var(--dk-yolk)", color: "#3a2b00" }}
                >
                  ▶ เริ่มแพ็ค {tabQueue.length} ใบ
                  <span className="block text-[10.5px] font-normal">{tab === "print" ? "ปริ้นแล้ว รอแพ็ค" : "พร้อมยิง"} · เรียงตามวันใช้งาน · ใบแรก {tabQueue[0].id}</span>
                </button>
              ) : (
                <div className="grid flex-1 place-items-center rounded-2xl bg-slate-100 text-xs font-bold text-slate-500">
                  {tab === "print" || tab === "scan" ? "ไม่มีใบในขั้นนี้" : "เลือกขั้น รอแพ็ค หรือ พร้อมยิง เพื่อเริ่มคิว"}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ด่านกันพลาด: ตรวจแพ็คไม่ครบ ยิงไม่ได้ ── */}
      {/* 📷 กล้องมือถือแทนเครื่องยิง — ผลลัพธ์วิ่งเข้าทางเดียวกับช่องยิง · โหมด batch เก็บกองใบงาน กล้องไม่ปิด */}
      <CameraScanner
        open={cam !== null}
        title={
          cam === "batch"
            ? `สแกนกองใบงาน${batch.length ? ` · ${batch.length} ใบ` : ""}`
            : cam === "tracking" && target
              ? `สแกนเลขพัสดุของ ${target.id}`
              : "สแกนบาร์โค้ด/QR เลขออเดอร์"
        }
        hint={
          cam === "batch"
            ? "จ่อ QR ใบงานหรือบาร์โค้ดใบปะหน้าทีละใบ ไม่ต้องกดอะไร อ่านได้แล้วสั่น 1 ที"
            : cam === "tracking"
              ? "จ่อบาร์โค้ดเลขพัสดุบนใบส่งของ ปณ./ขนส่ง อ่านได้แล้วบันทึกทันที"
              : "จ่อบาร์โค้ดบนใบปะหน้า หรือ QR บนใบงาน"
        }
        onResult={(text) => (cam === "batch" ? onBatchScan(text) : onCameraResult(text))}
        onClose={() => {
          setCam(null);
          setTimeout(focusInput, 50);
        }}
        footer={
          cam === "batch" ? (
            <div className="bg-slate-950 px-3 pt-3 text-white">
              <div className="flex items-baseline justify-between text-xs text-slate-300">
                <span>
                  ชุดงาน <b className="text-white">{batch.length} ใบ</b>
                  {batch.length > 0 && (
                    <>
                      {" · "}
                      {batch.reduce((n, id) => {
                        const o = orders.find((x) => x.id === id);
                        return n + (o ? qtyOf(o) : 0);
                      }, 0)}{" "}
                      ชิ้น
                    </>
                  )}
                </span>
                {batch.length > 0 && (
                  <button type="button" onClick={() => setBatch([])} className="text-xs text-slate-400 underline underline-offset-2">
                    ล้างชุด
                  </button>
                )}
              </div>
              {batchMsg && <p className="mt-1 text-xs font-bold text-rose-300">{batchMsg}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {batch.length === 0 ? (
                  <span className="text-xs text-slate-500">ใบที่สแกนจะเรียงต่อกันตรงนี้ · ใบซ้ำไม่นับเพิ่ม</span>
                ) : (
                  batch.map((id, i) => (
                    <span
                      key={id}
                      title={id}
                      className={`rounded-lg px-2 py-1 font-mono text-[11px] font-bold ${
                        i === batch.length - 1 ? "bg-emerald-400 text-emerald-950" : "bg-white/10 text-slate-200"
                      }`}
                    >
                      {i === batch.length - 1 ? "✓ " : ""}
                      {shortOrderId(id)}
                    </span>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={batch.length === 0}
                onClick={() => {
                  setCam(null);
                  beginQueue(batch, "batch");
                }}
                className="mt-3 w-full rounded-xl py-3 text-sm font-extrabold disabled:opacity-40"
                style={{ background: "var(--dk-yolk)", color: "#3a2b00" }}
              >
                ▶ เริ่มแพ็ค {batch.length} ใบ
                <span className="block text-[10.5px] font-normal">เรียงตามลำดับที่สแกน · ยังสแกนเพิ่มได้เรื่อย ๆ</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {blocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-title"
          className="fixed inset-0 z-[100] grid place-items-center p-4"
          style={{ background: "rgba(23,58,107,.62)", backdropFilter: "blur(4px)" }}
        >
          <div className="dkb w-full max-w-md rounded-[26px] p-5" style={{ boxShadow: "0 30px 60px rgba(23,58,107,.4)" }}>
            <h2 id="block-title" className="dkb-display text-[1.3rem]">
              ยังยิงเลขพัสดุไม่ได้
            </h2>
            <p className="dkb-code mt-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
              {blocked.order.id}
            </p>
            <p className="text-[14px]">{blocked.order.customer}</p>

            <div
              className="mt-3 rounded-[18px] px-4 py-3"
              style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
            >
              <p className="dkb-h2 text-[13px]">ต้องทำให้ครบก่อน</p>
              <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed">
                {blocked.gate.uncounted.length > 0 && <li>· ยังไม่ได้ตรวจนับของ {blocked.gate.uncounted.length} รูป</li>}
                {blocked.gate.unread.length > 0 && <li>· ยังไม่ได้ยืนยันอ่านรายละเอียด {blocked.gate.unread.length} รายการ</li>}
                {blocked.gate.unsampled.map((name, k) => (
                  <li key={`s-${k}`} className="font-semibold">
                    · ยังไม่ได้ยืนยันใส่งานตัวอย่าง: {name}
                  </li>
                ))}
                {blocked.gate.short.map((s, k) => (
                  <li key={k} className="font-semibold">
                    · ของไม่ครบ: {s.item} — นับได้ {s.got}
                    {s.need ? ` จาก ${s.need}` : ""} ชิ้น
                  </li>
                ))}
                {blocked.gate.missing.map((m) => (
                  <li key={`m-${m.index}`} className="font-semibold">
                    · 📦 {m.status === "ยังไม่มา" ? "ของยังไม่มา" : `ของมาไม่ครบ (${m.got ?? 0}/${m.need})`}: {m.item}
                    {m.expectedAt ? ` — ${arrivalOverdue(m.expectedAt) ? "เลยกำหนด" : "คาดว่ามา"} ${fmtExpected(m.expectedAt)}` : ""}
                  </li>
                ))}
              </ul>
            </div>

            {/* 🚚 ลูกค้าขอส่งบางลายก่อน? ไม่ต้องสร้างใบใหม่ — ติ๊กรูปในโหมดแพ็คแล้วยิงเลขรอบนั้น */}
            {blocked.order.items.reduce((n, it) => n + proofsOf(it).length, 0) > 1 && (
              <p className="mt-2 rounded-[14px] px-3 py-2 text-[12.5px] leading-relaxed" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
                🚚 ต้องส่งบางลายก่อน (แบ่งส่ง)? ให้แอดมินระบุแผนที่หน้าออเดอร์ (ช่องเลขพัสดุ → “ระบุรูปที่ส่งก่อน”) แล้วโหมดแพ็คจะมีปุ่มเหลือง “ส่งบางส่วน” ยิงเลขรอบนั้นได้เลย
                ใบยังค้างที่นี่จนกว่าจะยิงเลขรอบสุดท้าย
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn tone="navy" href={`/admin/orders/${encodeURIComponent(blocked.order.id)}?${PACK_SCAN_PARAM}=1`}>
                📦 เปิดโหมดแพ็คเพื่อตรวจ
              </Btn>
              <Btn
                onClick={() => {
                  setBlocked(null);
                  setValue("");
                  setTimeout(focusInput, 50);
                }}
              >
                ปิด · ยิงออเดอร์อื่น
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 📦 โมดัลปักของยังไม่มา/มาไม่ครบ — ทีละรายการของออเดอร์ บันทึกทันทีที่กด ── */}
      {arrivalOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="arrival-title"
          className="fixed inset-0 z-[100] grid place-items-center p-3"
          style={{ background: "rgba(23,58,107,.62)", backdropFilter: "blur(4px)" }}
          onClick={() => setArrivalFor(null)}
        >
          <div
            className="dkb flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[26px]"
            style={{ boxShadow: "0 30px 60px rgba(23,58,107,.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0">
                <h2 id="arrival-title" className="dkb-display text-[1.25rem]">
                  📦 ของมาถึงโต๊ะแพ็คหรือยัง
                </h2>
                <p className="dkb-code mt-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                  {arrivalOrder.id}
                </p>
                <p className="text-[14px]">{arrivalOrder.customer || "ยังไม่ระบุชื่อ"}</p>
              </div>
              <Btn small onClick={() => setArrivalFor(null)}>
                ปิด
              </Btn>
            </div>
            <p className="px-5 pt-2 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              ปักเฉพาะรายการที่ของ<b>ยังไม่ถึงมือ</b> — รายการที่ของอยู่ตรงหน้าแล้วไม่ต้องกด · กด “มาครบแล้ว” เมื่อของถึง
              ใบนี้จะกลับไปขั้นแพ็คเอง
            </p>
            <div className="mt-3 grid gap-3 overflow-y-auto px-5 pb-5">
              {arrivalOrder.items.map((it, i) => (
                <div key={`${it.productId}-${i}`} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[14px] font-extrabold text-slate-900">{it.name}</p>
                    <span className="shrink-0 text-[15px] font-black tabular-nums text-slate-900">
                      {it.qty} <span className="text-[11px] font-bold text-slate-400">{it.unitYield?.unit || "ชิ้น"}</span>
                    </span>
                  </div>
                  <ArrivalPicker
                    compact
                    arrival={it.arrival}
                    need={it.qty}
                    unit={it.unitYield?.unit || "ชิ้น"}
                    onSave={(patch) => void saveArrival(arrivalOrder, i, patch)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
