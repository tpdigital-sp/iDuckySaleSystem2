"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * ออเดอร์กราฟฟิก /admin/graphics — งานของฝ่ายกราฟฟิก 2 มุม (ดีไซน์ "รางเบนโตะกระจก")
 *
 * 1) คิวรอทำแบบ — ใบที่เงินเข้าแล้ว/กำลังยืนยันเงินเข้า = ยังไม่มีใครทำแบบ
 * 2) แบบที่ส่งแล้ว — รูปที่อัปไปแล้ว รอลูกค้าอนุมัติ หรือลูกค้าขอแก้กลับมา
 *
 * (ภาพที่ลูกค้าจัดวางลายเองอยู่คนละเมนู — "ลายจากลูกค้า")
 *
 * ของที่ยกขึ้นมาให้เห็นในแถว: คอมเมนต์ที่ลูกค้าขอแก้ — เป็นสิ่งเดียวที่ตัดสินใจได้ทันที
 * ไม่ต้องเปิดเข้าใบไปอ่าน · แบบที่ค้างอยู่ที่ลูกค้าเกิน 3 วันขึ้นป้ายเตือนให้ทวง
 */

import { useMemo, useState } from "react";
import StatusChip, { chipStyle, STATUS_TONE } from "@/components/admin/StatusChip";
import {
  daysToUseBy,
  graphicTodoItems,
  isSelfDesigned,
  proofsOf,
  proofUnit,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Proof,
} from "@/lib/admin-data";
import {
  Btn,
  Empty,
  FilterCard,
  FChip,
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
import { orderMatches, useGraphicsOrders } from "./data";

const QUEUE: OrderStatus[] = ["ชำระแล้ว", "รอตรวจสอบ"];

type View = "queue" | "sent";
/** ผลตรวจของลูกค้าต่อแบบ 1 รูป */
type SentState = "รอลูกค้าตรวจ" | "ขอแก้ไข";

/** แบบ 1 รูปที่ส่งให้ลูกค้าแล้ว ยังไม่จบเรื่อง */
interface Sent {
  order: Order;
  item: OrderItem;
  proof: Proof;
  /** รูปที่เท่าไหร่ของรายการนั้น (เริ่มที่ 1) */
  no: number;
  state: SentState;
}

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const dayOf = (d: string) => d.split(" ").slice(0, 3).join(" ");

/** ส่งแบบไปกี่วันแล้ว — ใช้บอกว่าควรทวงลูกค้าหรือยัง */
function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.floor((mid(new Date()) - mid(d)) / 86400000);
}

/**
 * แบบที่กราฟฟิกส่งไปแล้วและยัง "ค้างอยู่ที่ลูกค้า"
 * ตัดออก: ลายที่ลูกค้าจัดวางเอง (ไม่ใช่ฝีมือเรา) · รูปที่ลูกค้าอนุมัติแล้ว · ออเดอร์ที่ยกเลิก
 */
function sentProofs(orders: Order[]): Sent[] {
  const rows: Sent[] = [];
  for (const order of orders) {
    if (order.status === "ยกเลิก") continue;
    for (const item of order.items) {
      if (isSelfDesigned(item) || item.proofStatus === "อนุมัติ") continue;
      proofsOf(item).forEach((proof, i) => {
        if (proof.review === "อนุมัติ") return;
        /**
         * รูปที่ลูกค้ากดขอแก้ตรง ๆ = แก้แน่นอน
         * ส่วนรูปที่ยังไม่ได้ตรวจ ถ้าทั้งรายการอยู่สถานะ "ขอแก้ไข" ก็นับว่ารอแก้ด้วย
         */
        const redo = proof.review === "ขอแก้ไข" || item.proofStatus === "ขอแก้ไข";
        rows.push({ order, item, proof, no: i + 1, state: redo ? "ขอแก้ไข" : "รอลูกค้าตรวจ" });
      });
    }
  }
  // ใบใหม่สุดขึ้นก่อน แต่ "ขอแก้ไข" แซงขึ้นบนสุดเสมอ — ลูกค้ารออยู่
  return rows.reverse().sort((a, b) => Number(b.state === "ขอแก้ไข") - Number(a.state === "ขอแก้ไข"));
}

export default function GraphicsOrdersPage() {
  const { orders, demo } = useGraphicsOrders();
  const [view, setView] = useState<View>("queue");
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [sentFilter, setSentFilter] = useState<SentState | "all">("all");
  const [q, setQ] = useState("");

  /** คิวของฝ่ายกราฟฟิก — ใบเก่าขึ้นก่อน ค้างนานสุดต้องรีบสุด */
  const queue = useMemo(
    () => orders.filter((o) => QUEUE.includes(o.status)).sort((a, b) => a.id.localeCompare(b.id)),
    [orders]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: queue.length };
    for (const s of QUEUE) c[s] = queue.filter((o) => o.status === s).length;
    return c;
  }, [queue]);

  /** ลายที่ต้องลงมือทำจริง ๆ (ตัดลายที่ลูกค้าจัดวางเองออก) */
  const todoCount = useMemo(() => queue.reduce((s, o) => s + graphicTodoItems(o).length, 0), [queue]);

  const sent = useMemo(() => sentProofs(orders), [orders]);
  const redoCount = sent.filter((s) => s.state === "ขอแก้ไข").length;
  /** ค้างอยู่ที่ลูกค้านานสุดกี่วัน — ตัวเลขที่บอกว่าถึงเวลาทวงหรือยัง */
  const stalest = useMemo(() => {
    const days = sent.filter((s) => s.state === "รอลูกค้าตรวจ").map((s) => daysSince(s.proof.at) ?? 0);
    return days.length ? Math.max(...days) : 0;
  }, [sent]);

  const shownSent = sent
    .filter((s) => (sentFilter === "all" ? true : s.state === sentFilter))
    .filter((s) => orderMatches(s.order, q));

  const shown = queue.filter((o) => (filter === "all" ? true : o.status === filter)).filter((o) => orderMatches(o, q));

  return (
    <PageShell>
      <PageHead
        group="กราฟฟิก"
        title="ออเดอร์กราฟฟิก"
        count={`${queue.length} ใบ`}
        sub={
          view === "queue"
            ? "เฉพาะใบที่รอทำแบบ — เงินเข้าแล้วหรือกำลังยืนยันเงินเข้า"
            : "แบบที่ส่งให้ลูกค้าแล้ว — รอลูกค้ากดอนุมัติ หรือขอแก้กลับมา"
        }
        live={demo ? { ok: false, text: "ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน" } : { ok: true, text: "ออเดอร์จริง" }}
        tools={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า" />
            <Btn tone="navy" href="/admin/graphics/designs">
              รายงานแบบงาน
            </Btn>
          </>
        }
      />

      <Stats cols={4}>
        <HeroStat
          n={todoCount}
          label="ลายที่ต้องทำ"
          detail={
            redoCount
              ? `ในนี้ลูกค้าขอแก้ ${redoCount} รูป · ลายใหม่ ${Math.max(0, todoCount - redoCount)}`
              : `จาก ${queue.length} ใบที่รอทำแบบ`
          }
          pct={sent.length + todoCount > 0 ? (todoCount / (sent.length + todoCount)) * 100 : 0}
        />
        <Stat label="รอลูกค้าตรวจ" value={sent.length - redoCount} hint="ค้างอยู่ที่ลูกค้า" />
        <Stat
          label="ค้างนานสุด"
          value={stalest}
          hint={stalest >= 3 ? "วัน — ควรทวงแล้ว" : "วัน"}
          tone={stalest >= 3 ? "due" : undefined}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <Tab on={view === "queue"} onClick={() => setView("queue")} label="คิวรอทำแบบ" count={queue.length} />
          <Tab on={view === "sent"} onClick={() => setView("sent")} label="แบบที่ส่งแล้ว" count={sent.length} />
        </TabRow>
        <TabRow divider>
          {view === "sent" ? (
            <>
              <FChip on={sentFilter === "all"} onClick={() => setSentFilter("all")} label="ทั้งหมด" count={sent.length} />
              <FChip
                on={sentFilter === "ขอแก้ไข"}
                onClick={() => setSentFilter("ขอแก้ไข")}
                label="ลูกค้าขอแก้"
                count={redoCount}
                style={chipStyle("แก้ไขแบบ")}
              />
              <FChip
                on={sentFilter === "รอลูกค้าตรวจ"}
                onClick={() => setSentFilter("รอลูกค้าตรวจ")}
                label="รอลูกค้าตรวจ"
                count={sent.length - redoCount}
                style={chipStyle("รอตรวจแบบ")}
              />
            </>
          ) : (
            <>
              <FChip on={filter === "all"} onClick={() => setFilter("all")} label="ทุกสถานะ" count={counts.all} />
              {QUEUE.map((s) => (
                <FChip
                  key={s}
                  on={filter === s}
                  onClick={() => setFilter(s)}
                  label={s}
                  count={counts[s] ?? 0}
                  style={chipStyle(s)}
                />
              ))}
            </>
          )}
        </TabRow>
      </FilterCard>

      {view === "sent" ? (
        <>
          <ListHead title="แบบที่ค้างอยู่ที่ลูกค้า" note="ขอแก้ขึ้นก่อน" />
          {shownSent.length === 0 ? (
            <Empty
              title={q.trim() ? `ไม่พบแบบที่ตรงกับ “${q.trim()}”` : "ไม่มีแบบค้างอยู่ที่ลูกค้า"}
              body={q.trim() ? "ลองค้นด้วยเลขออเดอร์หรือชื่อลูกค้าแทน" : "ลูกค้าตรวจครบหมดแล้ว — ดูคิวรอทำแบบได้ที่แท็บซ้าย"}
            />
          ) : (
            <Rows>
              {shownSent.map((s, i) => (
                <SentRow key={`${s.order.id}-${s.proof.url}-${i}`} sent={s} />
              ))}
            </Rows>
          )}
        </>
      ) : (
        <>
          <ListHead title="คิวลาย" note="ค้างนานสุดขึ้นก่อน" />
          {shown.length === 0 ? (
            <Empty
              title={q.trim() ? `ไม่พบออเดอร์ที่ตรงกับ “${q.trim()}”` : "ไม่มีใบรอทำแบบ"}
              body={q.trim() ? "ลองค้นด้วยเลขออเดอร์หรือชื่อลูกค้าแทน" : "เคลียร์หมดแล้ว — ใบใหม่จะขึ้นเมื่อลูกค้าโอนเงินเข้ามา"}
            />
          ) : (
            <Rows>
              {shown.map((o) => (
                <QueueRow key={o.id} o={o} />
              ))}
            </Rows>
          )}
        </>
      )}
    </PageShell>
  );
}

/** หนึ่งใบในคิวรอทำแบบ */
function QueueRow({ o }: { o: Order }) {
  const todo = graphicTodoItems(o).length;
  const selfMade = o.items.filter(isSelfDesigned).length;
  const done = o.items.filter((it) => !isSelfDesigned(it) && proofsOf(it).length > 0).length;
  const noArt = o.items.some((it) => !it.artworkUrls?.length && !isSelfDesigned(it));
  const left = o.useByDate ? daysToUseBy(o) : null;

  return (
    <Row tone={todo > 0 ? STATUS_TONE[o.status] : "var(--dk-mint)"} href={`/admin/orders/${encodeURIComponent(o.id)}`}>
      <RowMain
        name={o.customer || "ยังไม่ระบุชื่อ"}
        tags={
          <>
            {o.rush && <Tag tone="solid">งานเร่ง</Tag>}
            {o.claimOf && (
              <Tag tone="lilac" title={`งานเคลมจาก ${o.claimOf}${o.claimReason ? ` — ${o.claimReason}` : ""}`}>
                งานเคลม
              </Tag>
            )}
            {o.reorderOf && (
              <Tag tone="sky" title={`สั่งซ้ำจาก ${o.reorderOf}`}>
                สั่งซ้ำ
              </Tag>
            )}
            {o.status === "รอตรวจสอบ" && <Tag tone="yolk" title="เงินยังไม่ยืนยัน — ทำแบบไปก่อนได้แต่ยังไม่เข้าผลิต">รอยืนยันเงินเข้า</Tag>}
            {noArt && <Tag tone="coral" title="มีรายการที่ลูกค้าไม่ได้แนบไฟล์ลายมา">ไม่มีไฟล์ลาย</Tag>}
          </>
        }
        meta={
          <>
            <span className="id">{o.id}</span>
            <span>{dayOf(o.date)}</span>
            {left !== null && (
              <span className={left <= 3 ? "hot" : undefined}>
                {left < 0 ? `เลยกำหนด ${Math.abs(left)} วัน` : left === 0 ? "ใช้งานวันนี้" : `ใช้งานอีก ${left} วัน`}
              </span>
            )}
            <span>{qtyOf(o)} ชิ้น</span>
            {selfMade > 0 && <span title="ลูกค้าจัดวางลายเองมาแล้ว — ไม่ต้องทำแบบ">ลูกค้าทำเอง {selfMade}</span>}
            {done > 0 && <span>ทำแล้ว {done}</span>}
          </>
        }
      />
      <RowSide>
        <StatusChip s={o.status} />
        <span className="dkb-amt" style={todo === 0 ? { color: "var(--dk-mint-ink)" } : undefined}>
          {todo > 0 ? `${todo} ลาย` : "ครบแล้ว"}
        </span>
      </RowSide>
    </Row>
  );
}

/** แบบ 1 รูปที่ส่งไปแล้ว — เห็นรูป ผลตรวจ และคอมเมนต์ที่ลูกค้าขอแก้ในแถวเดียว */
function SentRow({ sent }: { sent: Sent }) {
  const { order, item, proof, no, state } = sent;
  const redo = state === "ขอแก้ไข";
  /** คอมเมนต์รายรูปมาก่อน · ไม่มีค่อยใช้ของทั้งรายการ (บอกให้ชัดว่าไม่ใช่ของรูปนี้รูปเดียว) */
  const note = proof.reviewNote || (redo ? item.proofNote : "");
  const noteWhole = !proof.reviewNote && !!note;
  const waited = daysSince(proof.at);

  return (
    <Row tone={redo ? "var(--dk-coral-deep)" : "var(--dk-lilac)"}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <a
          href={proof.url}
          target="_blank"
          rel="noreferrer"
          title="เปิดรูปเต็ม"
          className="dkb-thumb !h-[62px] w-[62px] shrink-0"
        >
          <img src={proof.url} alt={`แบบรูปที่ ${no} ของ ${order.id}`} loading="lazy" decoding="async" />
        </a>
        <RowMain
          name={item.name}
          href={`/admin/orders/${encodeURIComponent(order.id)}`}
          tags={
            <>
              {redo ? <Tag tone="solid">ลูกค้าขอแก้</Tag> : <Tag tone="lilac">รอลูกค้าตรวจ</Tag>}
              {proof.revisedAt && <Tag tone="mint">แก้ให้แล้ว</Tag>}
              {!redo && waited !== null && waited >= 3 && <Tag tone="yolk">ค้าง {waited} วัน — ควรทวง</Tag>}
            </>
          }
          meta={
            <>
              <span className="id">{order.id}</span>
              <span>{order.customer}</span>
              <span>
                รูปที่ {no}
                {proof.qty ? ` · ${proof.qty} ${proofUnit(proof)}` : ""}
              </span>
              {note && (
                <span className="hot" title={note}>
                  {noteWhole ? "คอมเมนต์ทั้งรายการ: " : ""}
                  {note}
                </span>
              )}
            </>
          }
        />
      </span>
      <RowSide>
        <Btn tone={redo ? "navy" : "ghost"} small href={`/admin/orders/${encodeURIComponent(order.id)}`}>
          {redo ? "แก้แบบใบนี้" : "เปิดออเดอร์"}
        </Btn>
      </RowSide>
    </Row>
  );
}
