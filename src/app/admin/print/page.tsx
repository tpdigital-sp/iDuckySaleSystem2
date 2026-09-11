"use client";

/**
 * คิวปริ้น /admin/print — ใบงานที่พร้อมปริ้นได้แล้ว  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * เอาตั้งแต่ "อนุมัติแบบ" (แบบนิ่งแล้ว ปริ้นไปทำได้) ไปจนถึง "กำลังผลิต"
 * ก่อนหน้านั้นแบบยังเปลี่ยนได้ ปริ้นไปก็ต้องทิ้ง
 * ⚠️ ต้องรวม "กำลังผลิต" ด้วย ไม่งั้นใบที่ถูกดันเข้าไลน์ผลิตก่อนปริ้นจะหายจากคิวทั้งที่ยังไม่ได้ปริ้น
 *
 * 🏭 แยกกอง "ส่งผลิตแล้ว" / "ยังไม่ส่งผลิต" (พนักงานพิมพ์ขอ 11 ก.ย. 69 — คิวเดิมรวมทุกใบที่ลูกค้าอนุมัติแบบ
 *    ปริ้นไปก่อนแล้วต้องมาไล่เช็คย้อนหลัง · งานขายส่งที่ส่งอีกหลายวันมาแย่งหัวคิว)
 *    - "ส่งผลิตแล้ว" = order.productionSent มีค่า — มาจากการโยนโฟลเดอร์งานที่เข้าผลิต (โซนบนสุดของหน้านี้ จับคู่ชื่อโฟลเดอร์
 *      ใน /Volumes/iDuckyShop/1.Order Today/… กับออเดอร์) หรือติ๊กเองในหน้าออเดอร์
 *    - ใบที่ยังไม่ส่ง แยก 2 แท็บตามการ์ดกราฟฟิกบนบอร์ด TP (เจ้าของร้านสั่ง 11 ก.ย. 69): "รอโยนโฟลเดอร์" (✅ อนุมัติ/เคลียร์แล้ว)
 *      กับ "ยังอยู่ที่กราฟฟิก" (จะทำ/กำลังทำ/รออนุมัติ/ยังไม่มีการ์ด/อ่านบอร์ดไม่ได้)
 *    - ในกองส่งผลิตแล้ว แยกอีกชั้น "ถึงคิวแล้ว" กับ "ยังไม่ถึงคิว" ตามวันที่จัดส่ง (เกิน 2 วัน = ยังไม่ถึงคิว)
 *    - สถานะ "กำลังผลิต" ยังตั้งตอนปริ้นใบงานเหมือนเดิม — ไม่เกี่ยวกับกองนี้
 *
 * คนที่ใช้: ฝ่ายผลิตยืนหน้าเครื่อง มือไม่ว่าง — ปุ่มปริ้นจึงอยู่ในแถวเลย ไม่ต้องเปิดเข้าใบก่อน
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import ProductionFolderDrop from "@/components/admin/ProductionFolderDrop";
import { daysToUseBy, orderFullyPaid, proofMissing, withLog, type Order, type OrderStatus } from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdminResult } from "@/lib/order-repo";
import { useActor } from "@/lib/perm-context";
import { shortThaiDay, todayBkkYmd } from "@/lib/ship-date";
import { thaiDateTime } from "@/lib/bangkok-time";
import type { TPGraphicCard } from "@/lib/server/tp-report";
import { usePolling } from "@/lib/use-polling";
import {
  Btn,
  Empty,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Stat,
  Stats,
  Tab,
  TabRow,
  Tag,
} from "@/components/admin/ui";

type TabKey = "sent" | "waitFolder" | "graphic" | "done" | "all";

/** สถานะที่ใบงานเข้าคิวปริ้นได้ — "กำลังผลิต" ต้องอยู่ด้วย เพราะบางใบถูกดันเข้าไลน์ผลิตตั้งแต่ยังไม่ปริ้น */
const PRINT_QUEUE_STATUSES: OrderStatus[] = ["อนุมัติแบบ", "กำลังผลิต"];
/** วันส่งห่างเกินเท่านี้ = ยังไม่ถึงคิว (งานขายส่ง/สั่งล่วงหน้า) ไปอยู่กองล่าง */
const DUE_SOON_DAYS = 2;

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const printCountOf = (o: Order) => o.printCount ?? (o.printedAt ? 1 : 0);
const isSent = (o: Order) => !!o.productionSent;
/** ผลิตอยู่แล้วแต่ยังไม่มีใบงาน — ของร้อนที่สุดในคิว ต้องปริ้นตามให้ทัน */
const inProdUnprinted = (o: Order) => o.status === "กำลังผลิต" && printCountOf(o) === 0;

/** อีกกี่วันถึงวันที่จัดส่ง (shipDate.from) · ไม่มีวันส่ง = null */
function daysToShip(o: Order, today: string): number | null {
  const from = o.shipDate?.from || o.shipDate?.to;
  if (!from) return null;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** ถึงคิวหรือยัง: ผลิตอยู่แล้ว/งานเร่ง/ไม่มีวันส่ง/ส่งภายใน 2 วัน = ถึงคิว · ส่งห่างกว่านั้น = ยังไม่ถึง */
function isDue(o: Order, today: string): boolean {
  if (inProdUnprinted(o) || o.rush) return true;
  const d = daysToShip(o, today);
  return d === null || d <= DUE_SOON_DAYS;
}

/** ยิ่งเร่งยิ่งอยู่บน: ผลิตอยู่แล้วยังไม่ปริ้น → งานเร่ง → ใกล้วันส่ง → ใกล้วันใช้งาน → ออเดอร์เก่ากว่า */
function urgency(o: Order, today: string): number {
  if (inProdUnprinted(o)) return -2000;
  if (o.rush) return -1000;
  const s = daysToShip(o, today);
  if (s !== null) return s;
  const d = daysToUseBy(o);
  return d ?? 999;
}

/** กราฟฟิกจบงานแล้ว (การ์ด ✅ อนุมัติ หรือ 🧹 เคลียร์) = ไฟล์น่าจะอยู่ในโฟลเดอร์ผลิตแล้ว เหลือแค่โยนโฟลเดอร์มาจับคู่ */
const graphicDone = (card: TPGraphicCard | undefined) => !!card && (card.cleared || card.stage === "approved");

/** ป้ายขั้นการ์ดกราฟฟิก (บอร์ด TP) สำหรับใบที่ยังไม่ส่งผลิต */
function graphicStage(card: TPGraphicCard | undefined, cardsOk: boolean | null): { label: string; tone: "yolk" | "quiet" | "mint" | "coral"; title: string } {
  if (cardsOk === null) return { label: "กำลังอ่านบอร์ดกราฟฟิก…", tone: "quiet", title: "" };
  if (cardsOk === false) return { label: "อ่านบอร์ดกราฟฟิกไม่ได้", tone: "quiet", title: "ติดต่อ TP-Leader ไม่ได้ตอนนี้ — ดูขั้นงานบนบอร์ดเอง" };
  if (!card) return { label: "ยังไม่มีการ์ดกราฟฟิก", tone: "coral", title: "บอร์ด WIP กราฟฟิกยังไม่มีการ์ดใบนี้ (ยังไม่ชำระ/ยังไม่ถูกดึงเข้าบอร์ด)" };
  if (card.cleared) return { label: "กราฟฟิกจบงานแล้ว รอโยนโฟลเดอร์", tone: "mint", title: `เคลียร์การ์ดโดย ${card.clearedBy ?? "?"} — ไฟล์น่าจะอยู่ในโฟลเดอร์ผลิตแล้ว โยนโฟลเดอร์มาจับคู่ได้เลย` };
  switch (card.stage) {
    case "approved":
      return { label: "กราฟฟิกอนุมัติแล้ว รอโยนโฟลเดอร์", tone: "mint", title: `อนุมัติโดย ${card.approvedBy ?? "?"} — ไฟล์น่าจะอยู่ในโฟลเดอร์ผลิตแล้ว โยนโฟลเดอร์มาจับคู่ได้เลย` };
    case "awaiting":
      return { label: "รอหัวหน้าอนุมัติแบบ", tone: "yolk", title: `กราฟฟิก ${card.assignee ?? "?"} เซ็ตไฟล์เสร็จ รอตรวจ` };
    case "doing":
      return { label: "กราฟฟิกกำลังทำ", tone: "yolk", title: `กำลังทำโดย ${card.assignee ?? "?"}` };
    case "todo":
      return { label: "กราฟฟิกยังไม่เริ่ม", tone: "yolk", title: "การ์ดอยู่คอลัมน์ “งานที่จะทำ”" };
    default:
      return { label: "รอสร้างโฟลเดอร์กราฟฟิก", tone: "yolk", title: "การ์ดยังไม่เข้าขั้นออกแบบ (รอสร้าง/รอโยนโฟลเดอร์บนบอร์ดกราฟฟิก)" };
  }
}

function PrintQueueInner() {
  const actor = useActor();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("sent");
  const [q, setQ] = useState("");
  /** ใบที่ติ๊กไว้เพื่อปริ้นรวดเดียวหลายใบ — เก็บเป็น id กันหลุดตอนรายการรีเฟรชทุก 20 วิ */
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** การ์ดกราฟฟิกบนบอร์ด TP ของใบในคิว — null = ยังไม่ได้อ่าน · ok=false = อ่านไม่ได้ */
  const [cards, setCards] = useState<Record<string, TPGraphicCard>>({});
  const [cardsOk, setCardsOk] = useState<boolean | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const today = todayBkkYmd();

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    setOrders(r.orders);
    setLoading(false);
    const ids = r.orders.filter((o) => PRINT_QUEUE_STATUSES.includes(o.status) && !o.productionSent).map((o) => o.id);
    if (!ids.length) {
      setCardsOk(true);
      return;
    }
    try {
      const res = await fetch(`/api/admin/orders/graphic-cards?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; cards?: Record<string, TPGraphicCard> };
      setCards(j.cards ?? {});
      setCardsOk(res.ok && j.ok !== false);
    } catch {
      setCardsOk(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { intervalMs: 20000 });

  /** แบบผ่านแล้วจนถึงกำลังผลิต — ก่อนหน้านี้แบบยังไม่นิ่ง ปริ้นไม่ได้ */
  const ready = useMemo(() => orders.filter((o) => PRINT_QUEUE_STATUSES.includes(o.status)), [orders]);

  const counts = useMemo(() => {
    const unprinted = ready.filter((o) => printCountOf(o) === 0);
    const sent = unprinted.filter(isSent);
    return {
      sent: sent.length,
      sentDue: sent.filter((o) => isDue(o, today)).length,
      sentLater: sent.filter((o) => !isDue(o, today)).length,
      waitFolder: unprinted.filter((o) => !isSent(o) && graphicDone(cards[o.id])).length,
      graphic: unprinted.filter((o) => !isSent(o) && !graphicDone(cards[o.id])).length,
      done: ready.filter((o) => printCountOf(o) > 0).length,
      all: ready.length,
      pieces: ready.reduce((s, o) => s + qtyOf(o), 0),
    };
  }, [ready, today, cards]);

  /** ของที่ต้องรีบในกองส่งผลิตแล้ว — ใช้เป็นคำอธิบายใต้ตัวเลขใหญ่ */
  const urgent = useMemo(() => {
    const todo = ready.filter((o) => printCountOf(o) === 0 && isSent(o));
    return {
      rush: todo.filter((o) => o.rush).length,
      inProd: todo.filter((o) => o.status === "กำลังผลิต").length,
      today: todo.filter((o) => {
        const d = daysToShip(o, today) ?? daysToUseBy(o);
        return d !== null && d <= 0;
      }).length,
    };
  }, [ready, today]);

  const kw = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      ready
        .filter((o) =>
          tab === "sent"
            ? printCountOf(o) === 0 && isSent(o)
            : tab === "waitFolder"
              ? printCountOf(o) === 0 && !isSent(o) && graphicDone(cards[o.id])
              : tab === "graphic"
                ? printCountOf(o) === 0 && !isSent(o) && !graphicDone(cards[o.id])
                : tab === "done"
                ? printCountOf(o) > 0
                : true
        )
        .filter((o) => (kw ? o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw) : true))
        .sort((a, b) => urgency(a, today) - urgency(b, today) || a.id.localeCompare(b.id)),
    [ready, tab, kw, today, cards]
  );
  /** กองส่งผลิตแล้ว แบ่งอีกชั้น: ถึงคิวแล้ว / ยังไม่ถึงคิว (ส่งอีกหลายวัน) — แท็บอื่นไม่แบ่ง */
  const shownDue = useMemo(() => (tab === "sent" ? shown.filter((o) => isDue(o, today)) : shown), [shown, tab, today]);
  const shownLater = useMemo(() => (tab === "sent" ? shown.filter((o) => !isDue(o, today)) : []), [shown, tab, today]);

  const toggleSel = useCallback((id: string) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** ติ๊ก/ยกเลิก "ส่งเข้าผลิตแล้ว" จากแถว (ใบที่ไม่มีโฟลเดอร์ให้โยน) — บันทึกผ่าน PATCH (ฝ่ายแพ็ค/กราฟฟิก/แอดมินผ่าน merge ได้ทุกทาง) */
  const markSent = useCallback(
    async (o: Order, sent: boolean) => {
      setMarking(o.id);
      setErr("");
      const next = sent
        ? withLog({ ...o, productionSent: { by: actor, at: new Date().toISOString() } }, actor, "🏭 ติ๊กส่งเข้าผลิตแล้ว", "จากคิวปริ้น — ใบขึ้นกอง “ส่งผลิตแล้ว รอปริ้น”")
        : withLog({ ...o, productionSent: undefined }, actor, "ยกเลิกติ๊กส่งเข้าผลิต", "จากคิวปริ้น");
      const r = await saveOrderAdminResult(next);
      if (!r.ok) setErr(r.error || "บันทึกไม่สำเร็จ");
      else setOrders((cur) => cur.map((x) => (x.id === o.id ? (r.order ?? next) : x)));
      setMarking(null);
    },
    [actor]
  );

  /** ใบที่ติ๊กแล้วยังอยู่ในคิวจริง เรียงงานเร่งขึ้นก่อนเหมือนหน้าจอ — ใบที่หลุดคิวไปแล้วไม่นับ */
  const selected = useMemo(
    () =>
      ready
        .filter((o) => sel.has(o.id))
        .sort((a, b) => urgency(a, today) - urgency(b, today) || a.id.localeCompare(b.id))
        .map((o) => o.id),
    [ready, sel, today]
  );
  const allShownSelected = shownDue.length > 0 && shownDue.every((o) => sel.has(o.id));
  const batchHref =
    selected.length > 0
      ? `/admin/orders/${encodeURIComponent(selected[0])}/print?ids=${selected.map(encodeURIComponent).join(",")}`
      : "";

  const rowProps = (o: Order) => ({
    o,
    checked: sel.has(o.id),
    onToggle: () => toggleSel(o.id),
    card: cards[o.id],
    cardsOk,
    today,
    marking: marking === o.id,
    onMark: (sent: boolean) => void markSent(o, sent),
  });

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="คิวปริ้น"
        count={`${counts.all} ใบ`}
        sub="ออเดอร์ที่อนุมัติแบบแล้วจนถึงที่กำลังผลิต — แยกกองตามที่กราฟฟิกส่งไฟล์เข้าผลิตแล้วหรือยัง"
        tools={<SearchBox value={q} onChange={setQ} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า" />}
      />

      <ProductionFolderDrop onApplied={() => void load()} />

      <Stats cols={4}>
        <HeroStat
          n={counts.sentDue}
          label="ส่งผลิตแล้ว รอปริ้น"
          detail={
            urgent.inProd
              ? `เข้าไลน์ผลิตแล้วแต่ยังไม่ปริ้น ${urgent.inProd} ใบ · งานเร่ง ${urgent.rush} ใบ`
              : urgent.rush || urgent.today
                ? `ในนี้เป็นงานเร่ง ${urgent.rush} ใบ · ถึงกำหนดส่งแล้ว ${urgent.today} ใบ`
                : counts.sentLater
                  ? `ถึงคิวแล้ว · อีก ${counts.sentLater} ใบส่งอีกหลายวัน อยู่กองล่าง`
                  : "ถึงคิวแล้ว ปริ้นได้เลย"
          }
          pct={counts.all > 0 ? (counts.sentDue / counts.all) * 100 : 0}
        />
        <Stat label="ยังไม่ถึงคิว" value={counts.sentLater} hint={`ส่งผลิตแล้ว แต่ส่งเกิน ${DUE_SOON_DAYS} วัน`} onClick={() => setTab("sent")} active={tab === "sent"} />
        <Stat label="รอโยนโฟลเดอร์" value={counts.waitFolder} hint="กราฟฟิกจบแล้ว โยนโฟลเดอร์มาจับคู่" tone={counts.waitFolder ? "due" : undefined} onClick={() => setTab("waitFolder")} active={tab === "waitFolder"} />
        <Stat label="ยังอยู่ที่กราฟฟิก" value={counts.graphic} hint="รออนุมัติ/กำลังทำ" onClick={() => setTab("graphic")} active={tab === "graphic"} />
      </Stats>

      <FilterCard>
        <TabRow>
          <Tab on={tab === "sent"} onClick={() => setTab("sent")} label="🏭 ส่งผลิตแล้ว รอปริ้น" count={counts.sent} />
          <Tab on={tab === "waitFolder"} onClick={() => setTab("waitFolder")} label="📂 รอโยนโฟลเดอร์" count={counts.waitFolder} />
          <Tab on={tab === "graphic"} onClick={() => setTab("graphic")} label="🎨 ยังอยู่ที่กราฟฟิก" count={counts.graphic} />
          <Tab on={tab === "done"} onClick={() => setTab("done")} label="ปริ้นแล้ว" count={counts.done} />
          <Tab on={tab === "all"} onClick={() => setTab("all")} label="ทั้งหมด" count={counts.all} />
        </TabRow>
      </FilterCard>

      {err && (
        <p className="mb-2 px-2 text-[12.5px] font-bold" style={{ color: "var(--dk-coral-deep)" }}>
          ⚠️ {err}
        </p>
      )}

      <ListHead
        title={
          tab === "sent"
            ? "ถึงคิวแล้ว"
            : tab === "waitFolder"
              ? "กราฟฟิกจบงานแล้ว — ไฟล์น่าจะอยู่ในโฟลเดอร์ผลิต รอโยนมาจับคู่"
              : tab === "graphic"
                ? "แบบผ่านแล้ว แต่กราฟฟิกยังทำไฟล์ไม่จบ"
                : "คิวงาน"
        }
        note={
          tab === "sent"
            ? "งานเร่งขึ้นก่อน แล้วตามด้วยงานที่ใกล้วันส่งที่สุด"
            : tab === "waitFolder"
              ? "โยนโฟลเดอร์ของวันด้านบน ใบพวกนี้จะย้ายไปกองรอปริ้นเอง — ถ้าไม่มีโฟลเดอร์ กด “ส่งผลิตแล้ว” ในแถว"
              : tab === "graphic"
                ? "ยังไม่ต้องปริ้น — รอกราฟฟิกเซ็ตไฟล์/หัวหน้าอนุมัติบนบอร์ด TP ก่อน"
                : "งานเร่งขึ้นก่อน แล้วตามด้วยงานที่ใกล้วันส่งที่สุด"
        }
      />

      {!loading && shownDue.length > 0 && tab !== "waitFolder" && tab !== "graphic" && (
        <label className="flex w-fit cursor-pointer items-center gap-2 px-2 pb-2 text-[13px] font-semibold" style={{ color: "var(--dk-quiet)" }}>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={allShownSelected}
            onChange={() =>
              setSel((prev) => {
                const next = new Set(prev);
                // ติ๊กครบอยู่แล้ว = เอาออกทั้งชุด · ยังไม่ครบ = ติ๊กที่เหลือให้ครบ
                if (allShownSelected) shownDue.forEach((o) => next.delete(o.id));
                else shownDue.forEach((o) => next.add(o.id));
                return next;
              })
            }
          />
          เลือกทั้งหมดที่แสดง ({shownDue.length} ใบ) — ปริ้นรวดเดียวได้หลายใบ
        </label>
      )}

      {loading ? (
        <Empty title="กำลังโหลดคิว…" body="ดึงออเดอร์ที่อนุมัติแบบแล้วและที่กำลังผลิตจากเซิร์ฟเวอร์" />
      ) : shownDue.length === 0 && shownLater.length === 0 ? (
        <Empty
          title={
            kw
              ? `ไม่เจอ “${q.trim()}” ในหมวดนี้`
              : tab === "sent"
                ? "ไม่มีใบงานที่ส่งผลิตแล้วรอปริ้น"
                : tab === "waitFolder"
                  ? "ไม่มีใบรอโยนโฟลเดอร์"
                  : tab === "graphic"
                    ? "ไม่มีใบค้างที่กราฟฟิก"
                    : "ไม่มีออเดอร์ในหมวดนี้"
          }
          body={
            kw
              ? "ลองดูแท็บอื่น หรือค้นด้วยชื่อลูกค้าแทน"
              : tab === "sent"
                ? "โยนโฟลเดอร์งานที่เข้าผลิตด้านบน ใบที่จับคู่ได้จะมาต่อคิวตรงนี้"
                : tab === "waitFolder"
                  ? "ใบจะมาอยู่ตรงนี้เมื่อหัวหน้ากราฟฟิกกดอนุมัติบนบอร์ด TP"
                  : "คิวนี้จะขึ้นเมื่อลูกค้ากดอนุมัติแบบเรียบร้อย"
          }
        />
      ) : (
        <>
          {shownDue.length === 0 ? (
            <Empty title="ไม่มีใบถึงคิววันนี้" body={`ที่ส่งผลิตแล้วทั้งหมดกำหนดส่งเกิน ${DUE_SOON_DAYS} วัน อยู่กองด้านล่าง`} />
          ) : (
            <Rows>
              {shownDue.map((o) => (
                <PrintRow key={o.id} {...rowProps(o)} />
              ))}
            </Rows>
          )}
          {shownLater.length > 0 && (
            <>
              <div className="mt-5">
                <ListHead title={`ยังไม่ถึงคิว · ส่งอีกเกิน ${DUE_SOON_DAYS} วัน`} note={`${shownLater.length} ใบ — ไฟล์เข้าผลิตแล้ว แต่ยังไม่ต้องรีบปริ้น (งานขายส่ง/สั่งล่วงหน้า)`} />
              </div>
              <Rows>
                {shownLater.map((o) => (
                  <PrintRow key={o.id} {...rowProps(o)} later />
                ))}
              </Rows>
            </>
          )}
        </>
      )}

      {/* แถบสั่งปริ้นรวม — ลอยติดขอบล่าง มือเดียวเอื้อมถึงบนมือถือ */}
      {selected.length > 0 && (
        <div className="dkb-g sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 shadow-lg">
          <b className="text-[14px]">ติ๊กไว้ {selected.length} ใบ</b>
          <span className="text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
            ปริ้นออกมาใบละหน้า เรียงงานเร่งขึ้นก่อน
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Btn small onClick={() => setSel(new Set())}>
              ล้างที่เลือก
            </Btn>
            <Btn tone="navy" href={batchHref}>
              🖨 ปริ้นที่เลือก {selected.length} ใบ
            </Btn>
          </span>
        </div>
      )}

      <p className="mt-4 px-2 text-center text-[12px]" style={{ color: "var(--dk-faint)" }}>
        กดปริ้นทุกครั้งระบบลงประวัติให้ว่าใครปริ้น ครั้งที่เท่าไร · “ส่งผลิตแล้ว” มาจากการโยนโฟลเดอร์หรือติ๊กเอง ไม่ใช่สถานะออเดอร์
      </p>
    </PageShell>
  );
}

function PrintRow({
  o,
  checked,
  onToggle,
  card,
  cardsOk,
  today,
  marking,
  onMark,
  later,
}: {
  o: Order;
  checked: boolean;
  onToggle: () => void;
  card: TPGraphicCard | undefined;
  cardsOk: boolean | null;
  today: string;
  marking: boolean;
  onMark: (sent: boolean) => void;
  /** อยู่กอง "ยังไม่ถึงคิว" — แถวจางลง */
  later?: boolean;
}) {
  const printed = printCountOf(o);
  const left = daysToUseBy(o);
  const ship = daysToShip(o, today);
  const paid = orderFullyPaid(o);
  const noProof = o.items.some(proofMissing);
  const sent = isSent(o);
  const stage = !sent && printed === 0 ? graphicStage(card, cardsOk) : null;
  /** ยังไม่ปริ้น = งานค้าง (คอรัล) · ยังไม่ส่งผลิต = รอ (เหลือง) · ปริ้นแล้ว = เดินต่อได้ (เงียบ) */
  const tone =
    printed > 0
      ? "var(--dk-quiet)"
      : !sent
        ? "var(--dk-yolk-deep)"
        : inProdUnprinted(o) || o.rush || (ship !== null ? ship <= 0 : left !== null && left <= 0)
          ? "var(--dk-coral-deep)"
          : later
            ? "var(--dk-quiet)"
            : "var(--dk-mint)";

  return (
    <Row tone={tone} done={printed > 0 || later}>
      {/* ติ๊กเลือกเพื่อปริ้นรวดเดียวหลายใบ — พื้นที่กด 44px นิ้วเดียวโดน */}
      <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center self-center" title="เลือกเพื่อปริ้นรวมหลายใบ">
        <input type="checkbox" className="h-5 w-5" checked={checked} onChange={onToggle} />
      </label>
      <RowMain
        name={o.customer || "ยังไม่ระบุชื่อ"}
        href={`/admin/orders/${encodeURIComponent(o.id)}`}
        tags={
          <>
            {inProdUnprinted(o) && (
              <Tag tone="coral" title="ใบนี้ถูกดันเข้าไลน์ผลิตแล้วทั้งที่ยังไม่ได้ปริ้นใบงาน">ผลิตอยู่ ยังไม่ปริ้น</Tag>
            )}
            {o.status === "กำลังผลิต" && printed > 0 && <Tag tone="quiet">กำลังผลิต</Tag>}
            {sent && printed === 0 && (
              <Tag
                tone={later ? "quiet" : "mint"}
                title={`ส่งเข้าผลิตแล้วโดย ${o.productionSent!.by} · ${thaiDateTime(new Date(o.productionSent!.at))}${o.productionSent!.folder ? `\nโฟลเดอร์: ${o.productionSent!.folder}` : "\n(ติ๊กเอง ไม่ได้มาจากโฟลเดอร์)"}`}
              >
                ส่งผลิตแล้ว
              </Tag>
            )}
            {stage && (
              <Tag tone={stage.tone} title={stage.title}>
                {stage.label}
              </Tag>
            )}
            {o.rush && <Tag tone="solid">งานเร่ง</Tag>}
            {ship !== null && (
              <Tag tone={ship < 0 ? "coral" : ship <= DUE_SOON_DAYS ? "yolk" : "quiet"} title={`วันที่จัดส่ง ${o.shipDate?.from}`}>
                {ship < 0 ? `เลยวันส่ง ${-ship} วัน` : ship === 0 ? "ส่งวันนี้" : ship === 1 ? "ส่งพรุ่งนี้" : `ส่ง ${shortThaiDay(o.shipDate!.from || o.shipDate!.to!)} (อีก ${ship} วัน)`}
              </Tag>
            )}
            {ship === null && left !== null && (
              <Tag tone={left < 0 ? "coral" : left <= 3 ? "yolk" : "quiet"} title="วันที่ลูกค้าต้องใช้งาน (ยังไม่ได้กำหนดวันส่ง)">
                {left < 0 ? `เลยกำหนด ${-left} วัน` : left === 0 ? "ใช้วันนี้" : `ใช้อีก ${left} วัน`}
              </Tag>
            )}
            {!paid && <Tag tone="coral" title="ยังเก็บเงินไม่ครบ — ใบงานจะไม่มีใบปะหน้า">ไม่มีใบปะหน้า</Tag>}
            {noProof && <Tag tone="yolk" title="ยังมีรายการที่ไม่มีแบบงาน">มีรายการยังไม่มีแบบ</Tag>}
          </>
        }
        meta={
          <>
            <span className="id">{o.id}</span>
            <span>{o.date}</span>
            <span>
              {o.items.length} รายการ · {qtyOf(o)} ชิ้น
            </span>
            {sent && o.productionSent?.folder && (
              <span title={o.productionSent.folder}>📁 {o.productionSent.folder.replace(/^[-+\s]+/, "").slice(0, 40)}</span>
            )}
            {printed > 0 ? <span>ปริ้นแล้ว {printed} ครั้ง</span> : <span className="warn">ยังไม่ปริ้นใบงาน</span>}
          </>
        }
      />
      <RowSide>
        {printed === 0 && !sent ? (
          <Btn small onClick={() => onMark(true)} disabled={marking} title="ใบที่ไม่มีโฟลเดอร์ให้โยน (สั่งโรงงานตรง/งานพิเศษ) — ติ๊กว่าส่งเข้าผลิตแล้ว ย้ายไปกองรอปริ้น">
            {marking ? "กำลังบันทึก…" : "🏭 ส่งผลิตแล้ว"}
          </Btn>
        ) : null}
        <Btn tone={printed > 0 ? "ghost" : sent ? "navy" : "ghost"} small href={`/admin/orders/${encodeURIComponent(o.id)}/print`}>
          {printed > 0 ? "ปริ้นซ้ำ" : "ปริ้นใบงาน"}
        </Btn>
      </RowSide>
    </Row>
  );
}

export default function AdminPrintQueuePage() {
  return (
    <RequirePerm perm="pack.ship">
      <PrintQueueInner />
    </RequirePerm>
  );
}
