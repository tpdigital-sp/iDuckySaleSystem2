"use client";

/**
 * คิวปริ้น /admin/print — ใบงานที่พร้อมปริ้นได้แล้ว  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * เอาเฉพาะสถานะ "อนุมัติแบบ" เท่านั้น (ลูกค้าตรวจแบบผ่านแล้ว = แบบนิ่ง ปริ้นไปทำได้)
 * ก่อนหน้านั้นแบบยังเปลี่ยนได้ ปริ้นไปก็ต้องทิ้ง
 *
 * คนที่ใช้: ฝ่ายผลิตยืนหน้าเครื่อง มือไม่ว่าง — ปุ่มปริ้นจึงอยู่ในแถวเลย ไม่ต้องเปิดเข้าใบก่อน
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import RequirePerm from "@/components/RequirePerm";
import { daysToUseBy, orderFullyPaid, proofsOf, type Order } from "@/lib/admin-data";
import { fetchOrdersAdmin } from "@/lib/order-repo";
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

type TabKey = "todo" | "done" | "all";

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);
const printCountOf = (o: Order) => o.printCount ?? (o.printedAt ? 1 : 0);

/** ยิ่งเร่งยิ่งอยู่บน: งานเร่ง → ใกล้วันใช้งาน → ออเดอร์เก่ากว่า */
function urgency(o: Order): number {
  if (o.rush) return -1000;
  const d = daysToUseBy(o);
  return d ?? 999;
}

function PrintQueueInner() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("todo");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    setOrders(r.orders);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { intervalMs: 20000 });

  /** เฉพาะที่แบบผ่านแล้ว — ที่เหลือยังปริ้นไม่ได้ */
  const ready = useMemo(() => orders.filter((o) => o.status === "อนุมัติแบบ"), [orders]);

  const counts = useMemo(
    () => ({
      todo: ready.filter((o) => printCountOf(o) === 0).length,
      done: ready.filter((o) => printCountOf(o) > 0).length,
      all: ready.length,
    }),
    [ready]
  );

  /** ของที่ต้องรีบในคิว — ใช้เป็นคำอธิบายใต้ตัวเลขใหญ่ */
  const urgent = useMemo(() => {
    const todo = ready.filter((o) => printCountOf(o) === 0);
    return {
      rush: todo.filter((o) => o.rush).length,
      today: todo.filter((o) => {
        const d = daysToUseBy(o);
        return d !== null && d <= 0;
      }).length,
      pieces: ready.reduce((s, o) => s + qtyOf(o), 0),
    };
  }, [ready]);

  const kw = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      ready
        .filter((o) => (tab === "todo" ? printCountOf(o) === 0 : tab === "done" ? printCountOf(o) > 0 : true))
        .filter((o) => (kw ? o.id.toLowerCase().includes(kw) || o.customer.toLowerCase().includes(kw) : true))
        .sort((a, b) => urgency(a) - urgency(b) || a.id.localeCompare(b.id)),
    [ready, tab, kw]
  );

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="คิวปริ้น"
        count={`${counts.all} ใบ`}
        sub="เฉพาะออเดอร์ที่ลูกค้าอนุมัติแบบแล้ว — แบบนิ่งแล้ว ปริ้นใบงานไปทำได้เลย"
        tools={<SearchBox value={q} onChange={setQ} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า" />}
      />

      <Stats cols={4}>
        <HeroStat
          n={counts.todo}
          label="ยังไม่ปริ้น"
          detail={
            urgent.rush || urgent.today
              ? `ในนี้เป็นงานเร่ง ${urgent.rush} ใบ · ถึงกำหนดใช้แล้ว ${urgent.today} ใบ`
              : "ไม่มีงานเร่งในคิวตอนนี้"
          }
          pct={counts.all > 0 ? (counts.todo / counts.all) * 100 : 0}
        />
        <Stat label="ปริ้นแล้ว" value={counts.done} hint="รอเข้าเครื่อง" />
        <Stat label="ชิ้นงานรวม" value={urgent.pieces.toLocaleString("th-TH")} hint="ทุกใบในคิว" />
      </Stats>

      <FilterCard>
        <TabRow>
          <Tab on={tab === "todo"} onClick={() => setTab("todo")} label="ยังไม่ปริ้น" count={counts.todo} />
          <Tab on={tab === "done"} onClick={() => setTab("done")} label="ปริ้นแล้ว" count={counts.done} />
          <Tab on={tab === "all"} onClick={() => setTab("all")} label="ทั้งหมด" count={counts.all} />
        </TabRow>
      </FilterCard>

      <ListHead title="คิวงาน" note="งานเร่งขึ้นก่อน แล้วตามด้วยงานที่ใกล้วันใช้งานที่สุด" />

      {loading ? (
        <Empty title="กำลังโหลดคิว…" body="ดึงออเดอร์ที่อนุมัติแบบแล้วจากเซิร์ฟเวอร์" />
      ) : shown.length === 0 ? (
        <Empty
          title={kw ? `ไม่เจอ “${q.trim()}” ในหมวดนี้` : tab === "todo" ? "ไม่มีใบงานรอปริ้น" : "ไม่มีออเดอร์ในหมวดนี้"}
          body={kw ? "ลองดูแท็บอื่น หรือค้นด้วยชื่อลูกค้าแทน" : "คิวนี้จะขึ้นเมื่อลูกค้ากดอนุมัติแบบเรียบร้อย"}
        />
      ) : (
        <Rows>
          {shown.map((o) => (
            <PrintRow key={o.id} o={o} />
          ))}
        </Rows>
      )}

      <p className="mt-4 px-2 text-center text-[12px]" style={{ color: "var(--dk-faint)" }}>
        กดปริ้นทุกครั้งระบบลงประวัติให้ว่าใครปริ้น ครั้งที่เท่าไร
      </p>
    </PageShell>
  );
}

function PrintRow({ o }: { o: Order }) {
  const printed = printCountOf(o);
  const left = daysToUseBy(o);
  const paid = orderFullyPaid(o);
  const noProof = o.items.some((it) => proofsOf(it).length === 0);
  /** ยังไม่ปริ้น = งานค้าง (คอรัล) · ปริ้นแล้ว = เดินต่อได้ (เงียบ) */
  const tone = printed > 0 ? "var(--dk-quiet)" : o.rush || (left !== null && left <= 0) ? "var(--dk-coral-deep)" : "var(--dk-mint)";

  return (
    <Row tone={tone} done={printed > 0}>
      <RowMain
        name={o.customer || "ยังไม่ระบุชื่อ"}
        href={`/admin/orders/${encodeURIComponent(o.id)}`}
        tags={
          <>
            {o.rush && <Tag tone="solid">งานเร่ง</Tag>}
            {left !== null && (
              <Tag tone={left < 0 ? "coral" : left <= 3 ? "yolk" : "quiet"} title="วันที่ลูกค้าต้องใช้งาน">
                {left < 0 ? `เลยกำหนด ${-left} วัน` : left === 0 ? "ใช้วันนี้" : `อีก ${left} วัน`}
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
            {printed > 0 ? <span>ปริ้นแล้ว {printed} ครั้ง</span> : <span className="warn">ยังไม่ปริ้นใบงาน</span>}
          </>
        }
      />
      <RowSide>
        <Btn tone={printed > 0 ? "ghost" : "navy"} small href={`/admin/orders/${encodeURIComponent(o.id)}/print`}>
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
