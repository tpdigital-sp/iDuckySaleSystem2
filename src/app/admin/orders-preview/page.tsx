"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /admin/orders-preview — หน้าตัวอย่างของ "คำสั่งซื้อ" (ยังไม่แทนหน้าจริง)
 * ═══════════════════════════════════════════════════════════════════════════
 *  หน้าจริงที่ /admin/orders ไม่ถูกแตะเลย — ไฟล์นี้อ่านข้อมูลชุดเดียวกัน
 *  (fetchOrdersAdmin → /api/admin/orders) และเคารพสิทธิ์ชุดเดียวกัน
 *
 *  ทำไมถึงเป็นตาราง ไม่ใช่การ์ดกระจกเหมือนหน้าอื่น:
 *  แอดมินเปิดหน้านี้ค้างทั้งวัน สลับกับ LINE OA งานหลักคือ "กวาดตาหาใบงาน"
 *  แถวสูงราว 46px เห็นได้ 18–20 ใบต่อจอ (ของเดิมเห็นราว 8 ใบ) หัวตารางติดบนสุด
 *  ตอนเลื่อน และคอลัมน์หลักเรียงลำดับได้
 *
 *  ของเดิมที่ยกมาครบ ไม่ตัดทิ้ง:
 *   แท็บแผนก · ตัวกรองสถานะ · กรองค้างเก็บเงิน · ยอดขายวันนี้ · ป้ายทุกใบ
 *   (เร่ง · เคลม · สั่งซ้ำ · มัดจำ · LINE · SlipOK · รอเช็คสต๊อก · ออเดอร์ซ้ำเบอร์)
 *   · ปุ่มสร้างออเดอร์งานพิเศษ · ยิงเลขพัสดุ · deep link ?order= · ?status=
 *
 *  ของใหม่: การ์ดสรุปกดกรองได้ · กรองการชำระเงิน/ช่วงวันที่ · เรียงลำดับ
 *   · แบ่งหน้า · จำตัวกรองไว้ใน URL (กด Back กลับมาที่เดิม) · โครงกระดูกตอนโหลด
 *
 *  ⚠️ ไม่มีปุ่มเปลี่ยนสถานะ/ยกเลิกในตารางโดยตั้งใจ — สองอย่างนั้นมีด่านตรวจ
 *     (packGate · ล็อกมัดจำ · แจ้งเตือน LINE) ที่อยู่ในหน้าใบงาน ถ้ายิงจากตาราง
 *     จะข้ามด่าน ต้องตกลงกันก่อนว่าให้ข้ามได้แค่ไหน
 *  ⚠️ ห้ามเขียน hex ในไฟล์นี้ — อ้าง var(--op-*) จาก orders-preview.css
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/products";
import {
  amountDueNow,
  daysToUseBy,
  lineChatOf,
  lineUserOf,
  MOCK_ORDERS,
  ORDER_STATUSES,
  ORDER_STEPS,
  orderBalance,
  orderTotal,
  proofsOf,
  STEP_OF,
  type Order,
  type OrderStatus,
} from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";
import { useCan } from "@/lib/perm-context";
import { PACKING_QUEUE_STATUSES } from "@/lib/permissions";
import "./orders-preview.css";

/* ═══ กติกาเดิมของระบบ (ยกมาจาก /admin/orders ตรง ๆ) ═══════════════════ */

const DEPARTMENTS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "all", label: "ทุกแผนก", statuses: [...ORDER_STATUSES] },
  { key: "sales", label: "แผนกคำสั่งซื้อ", statuses: ["รอชำระเงิน", "รอตรวจสอบ", "ชำระแล้ว", "ยกเลิก"] },
  { key: "design", label: "แผนกทำแบบ", statuses: ["รอตรวจแบบ", "แก้ไขแบบ", "อนุมัติแบบ"] },
  { key: "pack", label: "แผนกแพ็คของ", statuses: ["กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น"] },
];

/** ฝ่ายแพ็คเห็นเฉพาะออเดอร์ที่ถึงคิวแพ็คแล้ว */
const visibleTo = (list: Order[], seesAll: boolean) =>
  seesAll ? list : list.filter((o) => PACKING_QUEUE_STATUSES.includes(o.status));

/** งานที่ต้องให้ทีมงานลงมือตอนนี้ (ไม่ใช่รอลูกค้า) */
const NEEDS_US: OrderStatus[] = ["รอตรวจสอบ", "ชำระแล้ว", "แก้ไขแบบ", "อนุมัติแบบ"];
/** รอฝั่งลูกค้า */
const WAIT_THEM: OrderStatus[] = ["รอชำระเงิน", "รอตรวจแบบ"];
/** จบแล้ว — แถวต้องเงียบกว่าใบที่ยังค้าง */
const DONE: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น", "ยกเลิก"];

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const openProofs = (o: Order) => o.items.filter((i) => !proofsOf(i).length || i.proofStatus === "ขอแก้ไข").length;
const isDue = (o: Order) => !!o.deposit && !o.deposit.settledAt && o.status !== "ยกเลิก";

/* ═══ สีสถานะของหน้านี้ (โทนทึบ อ่านออกกลางแดด) ═══════════════════════ */

const TONE: Record<OrderStatus, string> = {
  รอชำระเงิน: "var(--op-amber)",
  รอตรวจสอบ: "var(--op-rose)",
  ชำระแล้ว: "var(--op-green)",
  รอตรวจแบบ: "var(--op-violet)",
  แก้ไขแบบ: "var(--op-rose)",
  อนุมัติแบบ: "var(--op-green)",
  กำลังผลิต: "var(--op-blue)",
  จัดส่งแล้ว: "var(--op-off)",
  เสร็จสิ้น: "var(--op-off)",
  ยกเลิก: "var(--op-off)",
};
const BADGE_BG: Record<OrderStatus, string> = {
  รอชำระเงิน: "var(--op-amber-bg)",
  รอตรวจสอบ: "var(--op-rose-bg)",
  ชำระแล้ว: "var(--op-green-bg)",
  รอตรวจแบบ: "var(--op-violet-bg)",
  แก้ไขแบบ: "var(--op-rose-bg)",
  อนุมัติแบบ: "var(--op-green-bg)",
  กำลังผลิต: "var(--op-blue-bg)",
  จัดส่งแล้ว: "var(--op-off-bg)",
  เสร็จสิ้น: "var(--op-off-bg)",
  ยกเลิก: "var(--op-off-bg)",
};
const badgeVars = (s: OrderStatus) =>
  ({ ["--op-b-fg"]: TONE[s], ["--op-b-bg"]: BADGE_BG[s] }) as React.CSSProperties;

/* ═══ การชำระเงิน — อนุมานจากข้อมูลจริงในออเดอร์ ═══════════════════════
 *  ระบบนี้ไม่มีสถานะ "คืนเงิน (refunded)" ในฐานข้อมูล จึงไม่มีตัวเลือกนั้น
 *  (งานที่ทำใหม่ให้ลูกค้าใช้ "งานเคลม" แทน — ดูป้ายเคลมในคอลัมน์ออเดอร์)
 */
type Pay = "paid" | "checking" | "unpaid" | "partial" | "void";
const PAY_LABEL: Record<Pay, string> = {
  paid: "ชำระแล้ว",
  checking: "รอตรวจสลิป",
  unpaid: "ยังไม่ชำระ",
  partial: "ค้างชำระ",
  void: "ยกเลิก",
};
const PAY_TONE: Record<Pay, [string, string]> = {
  paid: ["var(--op-green)", "var(--op-green-bg)"],
  checking: ["var(--op-amber)", "var(--op-amber-bg)"],
  unpaid: ["var(--op-slate)", "var(--op-slate-bg)"],
  partial: ["var(--op-rose)", "var(--op-rose-bg)"],
  void: ["var(--op-off)", "var(--op-off-bg)"],
};

function payOf(o: Order): Pay {
  if (o.status === "ยกเลิก") return "void";
  if (isDue(o)) return o.deposit?.firstPaidAt ? "partial" : "unpaid";
  if (o.status === "รอชำระเงิน") return "unpaid";
  if (o.status === "รอตรวจสอบ") return "checking";
  // สั่งเพิ่มในออเดอร์เดิมหลังโอนแล้ว → ยอดที่โอนมาไม่ครบ
  if (o.paidTotal != null && orderBalance(o) > 0) return "partial";
  return "paid";
}

/* ═══ วันที่: ออเดอร์เก็บเป็นข้อความไทย ("23 ส.ค. 2569 10:05") ═══════════
 *  รายการที่ API ส่งมาไม่มีค่า ISO จึงต้องแปลงกลับเพื่อกรองช่วงวัน
 *  แปลงไม่ได้ → ใช้เวลาบรรทัดแรกในประวัติงานแทน
 */
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function orderDate(o: Order): Date | null {
  const m = /^\s*(\d{1,2})\s+(\S+)\s+(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(o.date ?? "");
  if (m) {
    const mi = TH_MONTH.indexOf(m[2]);
    if (mi >= 0) {
      const y = +m[3] > 2400 ? +m[3] - 543 : +m[3];
      return new Date(y, mi, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    }
  }
  const iso = o.log?.[0]?.at;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** วันเดียวกันไหม (ใช้เทียบยอดขายวันนี้/เมื่อวาน) */
const sameDay = (a: Date | null, b: Date) => !!a && startOfDay(a).getTime() === startOfDay(b).getTime();

type Range = "all" | "today" | "yest" | "7d" | "30d" | "custom";
const RANGE_LABEL: Record<Range, string> = {
  all: "ทุกช่วงเวลา",
  today: "วันนี้",
  yest: "เมื่อวาน",
  "7d": "7 วันล่าสุด",
  "30d": "30 วันล่าสุด",
  custom: "เลือกช่วงเอง",
};

/* ═══ สิ่งที่ต้องให้คนตรวจ (⚠) ═══════════════════════════════════════ */
function attentionOf(o: Order, dupPhone: boolean): string[] {
  if (DONE.includes(o.status)) return [];
  const r: string[] = [];
  const d = daysToUseBy(o);
  if (d !== null && d < 0) r.push(`เลยวันใช้งาน ${Math.abs(d)} วัน`);
  else if (d === 0) r.push("ลูกค้าใช้งานวันนี้");
  if (o.slipVerify?.status === "fail" && o.status === "รอตรวจสอบ") r.push("SlipOK ตรวจไม่ผ่าน");
  if (o.status === "แก้ไขแบบ") r.push("ลูกค้าขอแก้แบบ");
  if (o.deposit?.firstPaidAt && !o.deposit.settledAt) r.push("ค้างมัดจำครึ่งหลัง");
  if (o.items.some((i) => i.needStockCheck)) r.push("รอเช็คสต๊อก");
  if (dupPhone) r.push("มีออเดอร์ค้างซ้ำเบอร์เดียวกัน");
  return r;
}

/* ═══ การ์ดสรุป — กดเพื่อกรอง ═══════════════════════════════════════ */
type Bucket = "all" | "todo" | "making" | "wait" | "done" | "attn";
const BUCKETS: { key: Bucket; label: string; tone: string; hint: string }[] = [
  { key: "all", label: "ทั้งหมด", tone: "var(--op-slate)", hint: "ใบในระบบ" },
  { key: "todo", label: "ต้องทำตอนนี้", tone: "var(--op-amber)", hint: "รอเราลงมือ" },
  { key: "making", label: "กำลังผลิต", tone: "var(--op-blue)", hint: "เดินอยู่ในโรงพิมพ์" },
  { key: "wait", label: "รอลูกค้า", tone: "var(--op-violet)", hint: "รอชำระ / รอตรวจแบบ" },
  { key: "done", label: "จบแล้ว", tone: "var(--op-green)", hint: "ส่งของ + ปิดงาน" },
  { key: "attn", label: "ต้องตรวจสอบ", tone: "var(--op-rose)", hint: "เลยกำหนด · สลิป · ขอแก้แบบ" },
];

type SortKey = "date" | "id" | "customer" | "total" | "status";

const PER_CHOICES = [25, 50, 100];

export default function OrdersPreviewPage() {
  const router = useRouter();
  const can = useCan();
  const seesAll = can("orders.viewAll");
  const seesMoney = can("orders.money");

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [toast, setToast] = useState("");

  /* ── ตัวกรอง (ทั้งชุดจำไว้ใน URL — เปิดใบงานแล้วกด Back กลับมาที่เดิม) ── */
  const [bucket, setBucket] = useState<Bucket>("all");
  const [dept, setDept] = useState("all");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [pay, setPay] = useState<Pay | "all">("all");
  const [range, setRange] = useState<Range>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [ready, setReady] = useState(false); // อ่านค่าจาก URL เสร็จแล้วค่อยเขียนกลับ

  const searchRef = useRef<HTMLInputElement>(null);

  /* ── โหลดครั้งแรก + อ่านตัวกรองจาก URL ── */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const deepLink = p.get("order");
    if (deepLink) {
      router.replace(`/admin/orders/${encodeURIComponent(deepLink)}`);
      return;
    }
    const st = p.get("st") as OrderStatus | null;
    if (st && ORDER_STATUSES.includes(st)) setStatus(st);
    // มาจากช่องขั้นงานในหน้าภาพรวม (?status=) — รองรับแบบเดียวกับหน้าจริง
    const fromDash = p.get("status") as OrderStatus | null;
    if (fromDash && ORDER_STATUSES.includes(fromDash)) setStatus(fromDash);
    const b = p.get("b") as Bucket | null;
    if (b && BUCKETS.some((x) => x.key === b)) setBucket(b);
    const dp = p.get("dept");
    if (dp && DEPARTMENTS.some((d) => d.key === dp)) setDept(dp);
    const pv = p.get("pay") as Pay | null;
    if (pv && pv in PAY_LABEL) setPay(pv);
    const r = p.get("r") as Range | null;
    if (r && r in RANGE_LABEL) setRange(r);
    if (p.get("f")) setFrom(p.get("f")!);
    if (p.get("t")) setTo(p.get("t")!);
    if (p.get("due") === "1") setOnlyDue(true);
    if (p.get("q")) setQ(p.get("q")!);
    const sk = p.get("sort") as SortKey | null;
    if (sk && ["date", "id", "customer", "total", "status"].includes(sk)) setSort(sk);
    if (p.get("dir") === "asc") setDir("asc");
    const pr = p.get("per");
    if (pr && PER_CHOICES.includes(+pr)) setPer(+pr);
    if (p.get("page")) setPage(Math.max(1, +p.get("page")! || 1));
    setReady(true);

    fetchOrdersAdmin().then((res) => {
      if (res.orders.length > 0) setOrders(visibleTo(res.orders, seesAll));
      else {
        setOrders(visibleTo(MOCK_ORDERS, seesAll));
        setDemo(true);
      }
      setLoading(false);
    });
  }, [router, seesAll]);

  /* ── เขียนตัวกรองกลับลง URL (ไม่ทำให้หน้าโหลดใหม่) ── */
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    if (bucket !== "all") p.set("b", bucket);
    if (dept !== "all") p.set("dept", dept);
    if (status !== "all") p.set("st", status);
    if (pay !== "all") p.set("pay", pay);
    if (range !== "all") p.set("r", range);
    if (range === "custom" && from) p.set("f", from);
    if (range === "custom" && to) p.set("t", to);
    if (onlyDue) p.set("due", "1");
    if (q.trim()) p.set("q", q.trim());
    if (sort !== "date") p.set("sort", sort);
    if (dir !== "desc") p.set("dir", dir);
    if (per !== 50) p.set("per", String(per));
    if (page > 1) p.set("page", String(page));
    const s2 = p.toString();
    window.history.replaceState(null, "", s2 ? `?${s2}` : window.location.pathname);
  }, [ready, bucket, dept, status, pay, range, from, to, onlyDue, q, sort, dir, per, page]);

  /* ── ดึงข้อมูลซ้ำเป็นระยะ (เหมือนหน้าจริง) ── */
  const refresh = useCallback(async () => {
    const res = await fetchOrdersAdmin();
    if (res.orders.length === 0) return;
    const next = visibleTo(res.orders, seesAll);
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, [seesAll]);
  usePolling(refresh, { enabled: !demo && !loading });

  /* ── คีย์ลัด: "/" โฟกัสช่องค้นหา · Esc ล้างคำค้น ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && typing && el === searchRef.current) setQ("");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── เบอร์ไหนมีออเดอร์ค้างมากกว่า 1 ใบ (อาจต้องรวมส่ง) ── */
  const openByPhone = useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "เสร็จสิ้น" || o.status === "ยกเลิก") continue;
      const k = (o.phone ?? "").replace(/\D/g, "");
      // 0000000000 / 9999999999 = เบอร์ที่ยังไม่ได้กรอกจริง — ไม่ใช่ลูกค้าคนเดียวกัน
      if (k.length >= 8 && !/^(\d)\1+$/.test(k)) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [orders]);

  const dupOf = useCallback((o: Order) => (openByPhone[(o.phone ?? "").replace(/\D/g, "")] ?? 0) > 1, [openByPhone]);

  /* ── ตัวเลขบนการ์ด ── */
  const counts = useMemo(
    () =>
      ({
        all: orders.length,
        todo: orders.filter((o) => NEEDS_US.includes(o.status)).length,
        making: orders.filter((o) => o.status === "กำลังผลิต").length,
        wait: orders.filter((o) => WAIT_THEM.includes(o.status)).length,
        done: orders.filter((o) => o.status === "จัดส่งแล้ว" || o.status === "เสร็จสิ้น").length,
        attn: orders.filter((o) => attentionOf(o, dupOf(o)).length > 0).length,
      }) as Record<Bucket, number>,
    [orders, dupOf]
  );

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s2 of ORDER_STATUSES) c[s2] = orders.filter((o) => o.status === s2).length;
    return c;
  }, [orders]);

  /* ── เงิน: ยอดวันนี้เทียบเมื่อวาน + ยอดค้างเก็บ ── */
  const money = useMemo(() => {
    const now = new Date();
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const active = orders.filter((o) => o.status !== "ยกเลิก");
    const sum = (day: Date) => active.filter((o) => sameDay(orderDate(o), day)).reduce((s2, o) => s2 + orderTotal(o), 0);
    const today = sum(now);
    const prev = sum(yest);
    const due = active.filter(isDue);
    return {
      today,
      prev,
      diff: prev > 0 ? Math.round(((today - prev) / prev) * 100) : null,
      dueCount: due.length,
      dueAmount: due.reduce((s2, o) => s2 + amountDueNow(o), 0),
    };
  }, [orders]);

  /* ── กรอง ── */
  const activeDept = DEPARTMENTS.find((d) => d.key === dept) ?? DEPARTMENTS[0];
  const kw = q.trim().toLowerCase();
  const digits = kw.replace(/\D/g, "");

  const filtered = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const cutoff = (days: number) => new Date(dayStart.getTime() - (days - 1) * 86400000);
    const cFrom = range === "custom" && from ? new Date(from + "T00:00:00") : null;
    const cTo = range === "custom" && to ? new Date(to + "T23:59:59") : null;

    return orders.filter((o) => {
      if (onlyDue && !isDue(o)) return false;
      if (!activeDept.statuses.includes(o.status)) return false;

      if (bucket === "todo" && !NEEDS_US.includes(o.status)) return false;
      if (bucket === "making" && o.status !== "กำลังผลิต") return false;
      if (bucket === "wait" && !WAIT_THEM.includes(o.status)) return false;
      if (bucket === "done" && !(o.status === "จัดส่งแล้ว" || o.status === "เสร็จสิ้น")) return false;
      if (bucket === "attn" && attentionOf(o, dupOf(o)).length === 0) return false;

      if (status !== "all" && o.status !== status) return false;
      if (pay !== "all" && payOf(o) !== pay) return false;

      if (range !== "all") {
        const d = orderDate(o);
        if (!d) return false;
        if (range === "today" && !sameDay(d, now)) return false;
        if (range === "yest" && !sameDay(d, new Date(dayStart.getTime() - 86400000))) return false;
        if (range === "7d" && d < cutoff(7)) return false;
        if (range === "30d" && d < cutoff(30)) return false;
        if (range === "custom") {
          if (cFrom && d < cFrom) return false;
          if (cTo && d > cTo) return false;
        }
      }

      if (!kw) return true;
      if (o.id.toLowerCase().includes(kw)) return true;
      if (o.customer?.toLowerCase().includes(kw)) return true;
      if (o.email?.toLowerCase().includes(kw)) return true;
      if (o.tracking?.toLowerCase().includes(kw)) return true;
      if (o.items.some((i) => i.name.toLowerCase().includes(kw))) return true;
      return digits.length >= 4 && (o.phone ?? "").replace(/\D/g, "").includes(digits);
    });
  }, [orders, onlyDue, activeDept, bucket, status, pay, range, from, to, kw, digits, dupOf]);

  /* ── เรียงลำดับ ── */
  const sorted = useMemo(() => {
    const arr = filtered.map((o, i) => ({ o, i }));
    const s2 = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let v = 0;
      if (sort === "date") v = (orderDate(a.o)?.getTime() ?? 0) - (orderDate(b.o)?.getTime() ?? 0);
      else if (sort === "id") v = a.o.id.localeCompare(b.o.id, "th");
      else if (sort === "customer") v = (a.o.customer ?? "").localeCompare(b.o.customer ?? "", "th");
      else if (sort === "total") v = orderTotal(a.o) - orderTotal(b.o);
      else if (sort === "status") v = ORDER_STATUSES.indexOf(a.o.status) - ORDER_STATUSES.indexOf(b.o.status);
      return v !== 0 ? v * s2 : a.i - b.i;
    });
    return arr.map((x) => x.o);
  }, [filtered, sort, dir]);

  /* ── แบ่งหน้า ── */
  const pages = Math.max(1, Math.ceil(sorted.length / per));
  const curPage = Math.min(page, pages);
  const slice = sorted.slice((curPage - 1) * per, curPage * per);
  const firstRow = sorted.length === 0 ? 0 : (curPage - 1) * per + 1;
  const lastRow = Math.min(curPage * per, sorted.length);

  // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 เสมอ
  useEffect(() => {
    setPage(1);
  }, [bucket, dept, status, pay, range, from, to, onlyDue, q, per]);

  const hasFilter =
    bucket !== "all" || dept !== "all" || status !== "all" || pay !== "all" || range !== "all" || onlyDue || !!kw;

  function clearAll() {
    setBucket("all");
    setDept("all");
    setStatus("all");
    setPay("all");
    setRange("all");
    setFrom("");
    setTo("");
    setOnlyDue(false);
    setQ("");
  }

  function toggleSort(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "customer" || k === "id" ? "asc" : "desc");
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`คัดลอก${what}แล้ว · ${text}`);
    } catch {
      setToast("คัดลอกไม่ได้ — เบราว์เซอร์ไม่อนุญาต");
    }
  }

  const cols = seesMoney ? 8 : 7;

  return (
    <div className="opv -mx-4 -my-6 min-h-[calc(100vh-1px)] px-4 py-5 md:-mx-8 md:-my-8 md:px-7 md:py-7">
      <div className="mx-auto max-w-[1440px]">
        {/* ── หัวหน้า ── */}
        <div className="opv-head">
          <div className="min-w-0">
            <p className="opv-eyebrow">งานขาย</p>
            <h1 className="opv-title">
              คำสั่งซื้อ<span>{counts.all} ใบ</span>
            </h1>
            <p className="opv-live" data-demo={demo ? "1" : undefined}>
              <i />
              {demo ? "ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน" : "ออเดอร์จริง · อัปเดตอัตโนมัติ"}
              {seesMoney && (
                <>
                  <span style={{ color: "var(--op-line)" }}>|</span>
                  <span className="opv-num">
                    ขายวันนี้ {formatPrice(money.today)}
                    {money.diff !== null && (
                      <b style={{ marginLeft: 5, fontWeight: 600, color: money.diff >= 0 ? "var(--op-green)" : "var(--op-rose)" }}>
                        {money.diff >= 0 ? "▲" : "▼"} {Math.abs(money.diff)}%
                      </b>
                    )}
                    <span style={{ color: "var(--op-faint)" }}> · เมื่อวาน {formatPrice(money.prev)}</span>
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {seesMoney && money.dueCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyDue((v) => !v)}
                aria-pressed={onlyDue}
                className="opv-btn"
                title="ออเดอร์มัดจำที่ยังเก็บเงินไม่ครบ — ห้ามส่งของจนเก็บครบ 100%"
                style={
                  onlyDue
                    ? { borderColor: "var(--op-rose)", background: "var(--op-rose-bg)", color: "var(--op-rose)" }
                    : { color: "var(--op-rose)" }
                }
              >
                ค้างเก็บเงิน {formatPrice(money.dueAmount)}
                <b className="opv-num" style={{ fontWeight: 600, color: "var(--op-faint)" }}>
                  {money.dueCount} ใบ
                </b>
              </button>
            )}
            {can("orders.edit") && <NewOrderButton onCreated={(id) => router.push(`/admin/orders/${id}`)} />}
            <Link href="/admin/orders/scan" className="opv-btn opv-btn-primary">
              {icon.truck}
              ยิงเลขพัสดุ
            </Link>
          </div>
        </div>

        {/* ── แถบบอกว่านี่คือหน้าตัวอย่าง + วิธีสั่งแทนลูกค้า (ยกมาจากหน้าเดิม) ── */}
        <div className="opv-note">
          <b>หน้าตัวอย่าง</b>
          <span>ดีไซน์ใหม่ที่ยังไม่ได้ใช้จริง — หน้าที่ทีมใช้ทำงานอยู่คือ</span>
          <Link href="/admin/orders">/admin/orders</Link>
          {can("orders.edit") && (
            <span>
              · สั่งแทนลูกค้า: สินค้ามีบนเว็บ → <Link href="/">ไปหน้าร้าน</Link> หยิบใส่ตะกร้าแล้วติ๊ก “สั่งแทนลูกค้า” · งานสั่งทำที่ไม่มีบนเว็บ → กด
              “สร้างออเดอร์งานพิเศษ” แล้วเพิ่มรายการจาก <Link href="/admin/special-products">รูปแบบสินค้าสั่งพิเศษ</Link>
            </span>
          )}
        </div>

        {/* ── การ์ดสรุป: กดเพื่อกรอง ── */}
        <div className="opv-cards">
          {BUCKETS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket((cur) => (cur === b.key ? "all" : b.key))}
              aria-pressed={bucket === b.key}
              className={`opv-card${b.key === "attn" ? " opv-card-attn" : ""}`}
              style={{ ["--op-tone" as string]: b.tone }}
            >
              <span className="lb">{b.label}</span>
              <span className="v">{loading ? "–" : counts[b.key].toLocaleString("th-TH")}</span>
              <span className="hint">
                {b.key === "all" || counts.all === 0 || loading
                  ? b.hint
                  : `${Math.round((counts[b.key] / counts.all) * 100)}% ของทั้งหมด · ${b.hint}`}
              </span>
            </button>
          ))}
        </div>

        {/* ── แถบค้นหา + ตัวกรอง ── */}
        <div className="opv-bar">
          <label className="opv-search">
            {icon.search}
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นเลขออเดอร์ · ชื่อลูกค้า · เบอร์โทร · อีเมล · ชื่อสินค้า · เลขพัสดุ"
              aria-label="ค้นหาออเดอร์"
            />
            {q ? (
              <button type="button" className="opv-x" onClick={() => setQ("")} aria-label="ล้างคำค้น">
                {icon.x}
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>

          <Select value={dept} onChange={setDept} on={dept !== "all"} label="แผนก">
            {DEPARTMENTS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(v) => setStatus(v as OrderStatus | "all")} on={status !== "all"} label="สถานะ">
            <option value="all">ทุกสถานะ</option>
            {activeDept.statuses.map((s2) => (
              <option key={s2} value={s2}>
                {s2} ({statusCounts[s2] ?? 0})
              </option>
            ))}
          </Select>

          {seesMoney && (
            <Select value={pay} onChange={(v) => setPay(v as Pay | "all")} on={pay !== "all"} label="การชำระเงิน">
              <option value="all">การชำระเงินทั้งหมด</option>
              {(Object.keys(PAY_LABEL) as Pay[]).map((p) => (
                <option key={p} value={p}>
                  {PAY_LABEL[p]}
                </option>
              ))}
            </Select>
          )}

          <Select value={range} onChange={(v) => setRange(v as Range)} on={range !== "all"} label="ช่วงเวลา">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <option key={r} value={r}>
                {RANGE_LABEL[r]}
              </option>
            ))}
          </Select>

          {range === "custom" && (
            <>
              <input type="date" className="opv-date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="ตั้งแต่วันที่" />
              <span style={{ color: "var(--op-faint)" }}>–</span>
              <input type="date" className="opv-date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="ถึงวันที่" />
            </>
          )}

          <span className="opv-num ml-auto" style={{ fontSize: 12.5, color: "var(--op-faint)" }}>
            {loading ? "กำลังโหลด…" : `พบ ${sorted.length.toLocaleString("th-TH")} ใบ`}
          </span>
        </div>

        {/* ── ตัวกรองที่ใช้อยู่ ── */}
        {hasFilter && (
          <div className="opv-chips">
            {kw && <Chip label="ค้นหา" value={q} onRemove={() => setQ("")} />}
            {bucket !== "all" && <Chip label="กลุ่ม" value={BUCKETS.find((b) => b.key === bucket)!.label} onRemove={() => setBucket("all")} />}
            {dept !== "all" && <Chip label="แผนก" value={activeDept.label} onRemove={() => setDept("all")} />}
            {status !== "all" && <Chip label="สถานะ" value={status} onRemove={() => setStatus("all")} />}
            {pay !== "all" && <Chip label="ชำระเงิน" value={PAY_LABEL[pay]} onRemove={() => setPay("all")} />}
            {range !== "all" && (
              <Chip
                label="ช่วงเวลา"
                value={range === "custom" ? `${from || "…"} – ${to || "…"}` : RANGE_LABEL[range]}
                onRemove={() => setRange("all")}
              />
            )}
            {onlyDue && <Chip label="เฉพาะ" value="ค้างเก็บเงิน" onRemove={() => setOnlyDue(false)} />}
            <button type="button" className="opv-clear" onClick={clearAll}>
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}

        {/* ── ตาราง ── */}
        <div className="opv-tablewrap">
          <table className="opv-table">
            <thead>
              <tr>
                <Th k="id" sort={sort} dir={dir} onSort={toggleSort}>
                  ออเดอร์
                </Th>
                <Th k="customer" sort={sort} dir={dir} onSort={toggleSort}>
                  ลูกค้า
                </Th>
                <th>
                  <span className="opv-th">รายการ</span>
                </th>
                {seesMoney && (
                  <th>
                    <span className="opv-th">ชำระเงิน</span>
                  </th>
                )}
                <Th k="status" sort={sort} dir={dir} onSort={toggleSort}>
                  สถานะงาน
                </Th>
                <Th k="total" sort={sort} dir={dir} onSort={toggleSort} right>
                  {seesMoney ? "ยอด" : "จำนวน"}
                </Th>
                <Th k="date" sort={sort} dir={dir} onSort={toggleSort}>
                  วันที่สั่ง
                </Th>
                <th>
                  <span className="opv-th r">จัดการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: cols }).map((__, j) => (
                      <td key={j}>
                        <span className="opv-skel" style={{ display: "block", width: j === 0 ? "72%" : "55%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : slice.length === 0 ? (
                <tr>
                  <td colSpan={cols}>
                    <div className="opv-empty">
                      <b>{hasFilter ? "ไม่มีออเดอร์ที่ตรงกับตัวกรองนี้" : "ยังไม่มีออเดอร์"}</b>
                      <p>
                        {hasFilter
                          ? "ลองล้างตัวกรอง หรือค้นด้วยเลขออเดอร์ / เบอร์โทรแทน"
                          : "เคลียร์หมดแล้ว — ใบใหม่จะโผล่ตรงนี้ทันทีที่ลูกค้าสั่ง"}
                      </p>
                      {hasFilter && (
                        <button type="button" className="opv-btn" onClick={clearAll}>
                          ล้างตัวกรองทั้งหมด
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                slice.map((o) => (
                  <Row
                    key={o.id}
                    o={o}
                    orders={orders}
                    dup={dupOf(o)}
                    seesMoney={seesMoney}
                    canEdit={can("orders.edit")}
                    canShip={can("pack.ship")}
                    onCopy={copy}
                  />
                ))
              )}
            </tbody>
          </table>

          {/* ── แบ่งหน้า ── */}
          <div className="opv-page">
            <span className="opv-num">
              {sorted.length === 0
                ? "0 ใบ"
                : `${firstRow.toLocaleString("th-TH")}–${lastRow.toLocaleString("th-TH")} จาก ${sorted.length.toLocaleString("th-TH")} ใบ`}
              {sorted.length !== orders.length && (
                <span style={{ color: "var(--op-faint)" }}> (ทั้งระบบ {orders.length.toLocaleString("th-TH")} ใบ)</span>
              )}
            </span>

            <div className="grp">
              <label className="flex items-center gap-1.5">
                <span>ต่อหน้า</span>
                <span className="opv-sel-wrap">
                  <select
                    className="opv-select opv-num"
                    style={{ minHeight: 30, paddingRight: 24 }}
                    value={per}
                    onChange={(e) => setPer(+e.target.value)}
                    aria-label="จำนวนแถวต่อหน้า"
                  >
                    {PER_CHOICES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  {icon.chevron}
                </span>
              </label>
              <button type="button" className="opv-pbtn" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                ก่อนหน้า
              </button>
              {pageList(curPage, pages).map((n, i) =>
                n === 0 ? (
                  <span key={`d${i}`} className="dots">
                    …
                  </span>
                ) : (
                  <button key={n} type="button" className="opv-pbtn" aria-current={n === curPage ? "page" : undefined} onClick={() => setPage(n)}>
                    {n}
                  </button>
                )
              )}
              <button type="button" className="opv-pbtn" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                ถัดไป
              </button>
            </div>
          </div>
        </div>

        {toast && (
          <div
            role="status"
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[13px] text-white shadow-lg"
            style={{ background: "var(--op-ink)" }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ แถวออเดอร์ ═══════════════════════════════════════════════════ */

function Row({
  o,
  orders,
  dup,
  seesMoney,
  canEdit,
  canShip,
  onCopy,
}: {
  o: Order;
  orders: Order[];
  dup: boolean;
  seesMoney: boolean;
  canEdit: boolean;
  canShip: boolean;
  onCopy: (text: string, what: string) => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const href = `/admin/orders/${encodeURIComponent(o.id)}`;
  const done = DONE.includes(o.status);
  const step = STEP_OF[o.status];
  const days = o.useByDate && !done ? daysToUseBy(o) : null;
  const attn = attentionOf(o, dup);
  const pay = payOf(o);
  const open = openProofs(o);
  const line = lineUserOf(o, orders);
  const chat = lineChatOf(o, orders);
  const qty = qtyOf(o);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menu]);

  /* คลิกที่ไหนก็ได้ในแถว = เปิดใบงาน — ยกเว้นตรงปุ่ม/ลิงก์ข้างใน */
  function openRow(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button,a,input,select")) return;
    router.push(href);
  }

  const first = o.items[0];

  return (
    <tr
      className="opv-row"
      data-done={done ? "1" : undefined}
      style={{ ["--op-tone" as string]: TONE[o.status] }}
      onClick={openRow}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
      tabIndex={0}
      aria-label={`ออเดอร์ ${o.id} ${o.customer}`}
    >
      {/* ── ออเดอร์ ── */}
      <td className="opv-c1">
        <span className="opv-id">
          <b>{o.id}</b>
          {(o.rush || o.claimOf || o.reorderOf || o.quoteOf || attn.length > 0) && (
            <span className="opv-tags">
              {o.rush && <span className="opv-tag opv-tag-hot">งานเร่ง</span>}
              {o.claimOf && (
                <span className="opv-tag opv-tag-soft" title={`งานเคลมจาก ${o.claimOf}${o.claimReason ? ` — ${o.claimReason}` : ""}`}>
                  งานเคลม
                </span>
              )}
              {o.reorderOf && (
                <span className="opv-tag opv-tag-cool" title={`สั่งซ้ำจาก ${o.reorderOf}`}>
                  สั่งซ้ำ
                </span>
              )}
              {o.quoteOf && (
                <span className="opv-tag" title={`มาจากใบเสนอราคา ${o.quoteOf}`}>
                  ใบเสนอราคา
                </span>
              )}
              {attn.length > 0 && (
                <span className="opv-attn" title={attn.join(" · ")}>
                  {icon.warn}
                  {attn[0]}
                  {attn.length > 1 && ` +${attn.length - 1}`}
                </span>
              )}
            </span>
          )}
        </span>
      </td>

      {/* ── ลูกค้า ── */}
      <td data-lb="ลูกค้า">
        <span className="opv-cust">
          <b>{o.customer || "ยังไม่ระบุชื่อ"}</b>
          <span className="opv-num" title={[o.phone, o.email].filter(Boolean).join(" · ")}>
            {o.phone || o.email || "—"}
            {!done && !line && (
              <b style={{ marginLeft: 6, fontWeight: 600, color: chat ? "var(--op-amber)" : "var(--op-rose)" }}>
                {chat ? "LINE แค่ลิงก์แชท" : "ยังไม่ผูก LINE"}
              </b>
            )}
          </span>
        </span>
      </td>

      {/* ── รายการ ── */}
      <td data-lb="รายการ">
        <span className="opv-items" title={o.items.map((i) => `${i.name} × ${i.qty}`).join("\n")}>
          <b>{first ? `${first.name} × ${first.qty}` : "ยังไม่มีรายการ"}</b>
          <span>
            {o.items.length > 1 ? `+ อีก ${o.items.length - 1} รายการ · ` : ""}
            รวม {qty} ชิ้น
            {open > 0 && ` · แบบรอทำ ${open}`}
          </span>
        </span>
      </td>

      {/* ── ชำระเงิน ── */}
      {seesMoney && (
        <td data-lb="ชำระเงิน">
          <span className="opv-badge" style={{ ["--op-b-fg"]: PAY_TONE[pay][0], ["--op-b-bg"]: PAY_TONE[pay][1] } as React.CSSProperties}>
            <i />
            {PAY_LABEL[pay]}
          </span>
          {(o.slipVerify || o.slipUrl) && (
            <span className="opv-step">
              {o.slipVerify?.status === "pass"
                ? "SlipOK ตรวจผ่าน"
                : o.slipVerify?.status === "fail"
                  ? "SlipOK ไม่ผ่าน — ตรวจเอง"
                  : "แนบสลิปแล้ว"}
            </span>
          )}
        </td>
      )}

      {/* ── สถานะงาน ── */}
      <td data-lb="สถานะ">
        <span className="opv-badge" data-quiet={done ? "1" : undefined} style={badgeVars(o.status)}>
          <i />
          {o.status}
        </span>
        <span className="opv-step">
          {step < 0
            ? "ยกเลิกแล้ว"
            : `${step >= ORDER_STEPS.length ? "จบงานแล้ว" : ORDER_STEPS[step]} · ${Math.min(step + 1, ORDER_STEPS.length)}/${ORDER_STEPS.length}`}
        </span>
      </td>

      {/* ── ยอด ── */}
      <td data-lb={seesMoney ? "ยอด" : "จำนวน"}>
        <span className="opv-amt">
          {seesMoney ? formatPrice(orderTotal(o)) : `${qty} ชิ้น`}
          {seesMoney && isDue(o) && (
            <small style={{ color: o.deposit?.firstPaidAt ? "var(--op-rose)" : "var(--op-violet)" }}>
              {o.deposit?.firstPaidAt ? "ค้าง" : "มัดจำ"} {formatPrice(amountDueNow(o))}
            </small>
          )}
        </span>
      </td>

      {/* ── วันที่ ── */}
      <td data-lb="วันที่">
        <span className="opv-when">
          {o.date || "—"}
          {days !== null && (
            <span className={days <= 3 ? "hot" : undefined}>
              {days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? "ใช้งานวันนี้" : `ใช้งานอีก ${days} วัน`}
            </span>
          )}
          {o.tracking && <span className="opv-mono">{o.tracking}</span>}
        </span>
      </td>

      {/* ── จัดการ ── */}
      <td>
        <span className="opv-act">
          <Link href={href} className="opv-btn opv-btn-sm">
            เปิด
          </Link>
          <div className="opv-menu-wrap" ref={wrap}>
            <button
              type="button"
              className="opv-btn opv-btn-icon"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={`ตัวเลือกเพิ่มเติมของ ${o.id}`}
              onClick={() => setMenu((v) => !v)}
            >
              {icon.dots}
            </button>
            {menu && (
              <div className="opv-menu" role="menu">
                <p className="sub">เปิด</p>
                <Link href={href} role="menuitem">
                  {icon.open}
                  เปิดใบสั่งซื้อ
                </Link>
                {canEdit && (
                  <Link href={`${href}/print`} target="_blank" role="menuitem">
                    {icon.print}
                    พิมพ์ใบงาน
                  </Link>
                )}
                {canShip && (
                  <Link href="/admin/orders/scan" role="menuitem">
                    {icon.truck}
                    ยิงเลขพัสดุ
                  </Link>
                )}
                <hr />
                <p className="sub">คัดลอก / ติดต่อ</p>
                <button type="button" role="menuitem" onClick={() => onCopy(o.id, "เลขออเดอร์")}>
                  {icon.copy}
                  คัดลอกเลขออเดอร์
                </button>
                {o.tracking && (
                  <button type="button" role="menuitem" onClick={() => onCopy(o.tracking!, "เลขพัสดุ")}>
                    {icon.copy}
                    คัดลอกเลขพัสดุ
                  </button>
                )}
                {o.phone && (
                  <a href={`tel:${o.phone.replace(/\s/g, "")}`} role="menuitem">
                    {icon.phone}
                    โทรหาลูกค้า
                  </a>
                )}
                {chat && (
                  <a href={chat.url} target="_blank" rel="noreferrer" role="menuitem">
                    {icon.chat}
                    เปิดห้องแชท LINE{chat.source === "prev" ? " (จากใบเก่า)" : ""}
                  </a>
                )}
              </div>
            )}
          </div>
        </span>
      </td>
    </tr>
  );
}

/* ═══ ชิ้นส่วนเล็ก ═══════════════════════════════════════════════════ */

function Th({
  k,
  sort,
  dir,
  onSort,
  right,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
  children: React.ReactNode;
}) {
  const on = sort === k;
  return (
    <th aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`opv-th${right ? " r" : ""}`} data-sort={on ? dir : undefined} onClick={() => onSort(k)}>
        {children}
        <i>{on ? (dir === "asc" ? "▲" : "▼") : "↕"}</i>
      </button>
    </th>
  );
}

function Select({
  value,
  onChange,
  on,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  on: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="opv-sel-wrap">
      <select className="opv-select" data-on={on ? "1" : undefined} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {children}
      </select>
      {icon.chevron}
    </span>
  );
}

function Chip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="opv-chip">
      {label}: <b>{value}</b>
      <button type="button" className="rm" onClick={onRemove} aria-label={`เอาตัวกรอง ${label} ออก`}>
        {icon.x}
      </button>
    </span>
  );
}

/** เลขหน้าแบบย่อ: 1 … 4 5 6 … 20 (0 = จุดไข่ปลา) */
function pageList(cur: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const nums = [...new Set([1, total, cur, cur - 1, cur + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const res: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) res.push(0);
    res.push(nums[i]);
  }
  return res;
}

/** ปุ่มสร้างออเดอร์ใหม่ — ตัวเดียวกับหน้าจริง (เรียก POST /api/admin/orders) */
function NewOrderButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function create() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return alert(j.error ?? "สร้างออเดอร์ไม่สำเร็จ");
    onCreated(j.id);
  }
  return (
    <button type="button" onClick={create} disabled={busy} className="opv-btn">
      {icon.plus}
      {busy ? "กำลังสร้าง…" : "สร้างออเดอร์งานพิเศษ"}
    </button>
  );
}

/* ═══ ไอคอน (เส้นเดียวกันทั้งหน้า) ═══════════════════════════════════ */
const st = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const icon = {
  search: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  ),
  print: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l2-4.4a8.4 8.4 0 0 1-.9-3.9 8.4 8.4 0 0 1 8.4-8.4h.5a8.4 8.4 0 0 1 8 8v.2Z" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M1 3h13v13H1zM14 8h4l3 3v5h-7" />
      <circle cx="5.5" cy="18.5" r="2" />
      <circle cx="17.5" cy="18.5" r="2" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...st} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
};
