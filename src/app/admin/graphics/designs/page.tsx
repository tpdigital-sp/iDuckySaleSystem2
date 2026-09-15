"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import Link from "next/link";
import StatusChip from "@/components/admin/StatusChip";
import {
  Btn,
  Empty,
  FChip,
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
  TabRow,
  Tag,
} from "@/components/admin/ui";
import {
  isSelfDesigned,
  orderStatusLabel,
  proofBy,
  proofsOf,
  proofUnit,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Proof,
} from "@/lib/admin-data";
import { dayOf, orderMatches, staffTally, useGraphicStaff, useGraphicsOrders, useWorkSizes } from "../data";
import { itemQtyText } from "@/lib/item-yield";
import UseBy from "../UseBy";

/**
 * 📋 รายงานแบบงาน — ตารางสรุปว่า "แบบของออเดอร์ไหนค้างอยู่ตรงไหน"
 *
 * ไม่ใช่หน้าทำงาน แต่เป็นหน้ารายงานให้กวาดตาดูรวดเดียวว่าใบไหนลูกค้าขอแก้
 * ใบไหนส่งไปแล้วลูกค้ายังไม่กดยืนยัน และใบไหนจบแล้ว — 1 บรรทัด = 1 ลาย
 * (หน้าทำงานจริงอยู่ที่ "ออเดอร์กราฟฟิก")
 *
 * 🗄️ ใบที่ลูกค้ายืนยันแบบครบทุกลาย "และส่งของออกไปแล้ว" ย้ายไปกอง "จัดเก็บแล้ว"
 * ลูกค้าเจ้าประจำที่สั่งซ้ำบ่อยจะได้ไม่ต้องเลื่อนผ่านงานเก่าเพื่อหาใบใหม่
 * (เจ้าของร้านสั่ง 15 ก.ย. 69) — ของเก่ายังเปิดดูได้จากชิป "จัดเก็บแล้ว"
 */

/** ผลยืนยันแบบของลูกค้า ต่อ 1 ลาย */
type State = "ขอแก้ไข" | "ยังไม่ยืนยัน" | "อนุมัติแล้ว";

/** ลำดับความสำคัญในตาราง — ที่ค้างอยู่ที่เราขึ้นก่อน */
const ORDER_OF: Record<State, number> = { ขอแก้ไข: 0, ยังไม่ยืนยัน: 1, อนุมัติแล้ว: 2 };

/** สีแถบซ้ายของแถว + โทนป้าย ตามผลยืนยันของลูกค้า */
const STATE_TONE: Record<State, string> = {
  ขอแก้ไข: "var(--dk-coral-deep)",
  ยังไม่ยืนยัน: "var(--dk-lilac)",
  อนุมัติแล้ว: "var(--dk-quiet)",
};
const STATE_TAG: Record<State, "coral" | "lilac" | "mint"> = {
  ขอแก้ไข: "coral",
  ยังไม่ยืนยัน: "lilac",
  อนุมัติแล้ว: "mint",
};

/** ของออกจากร้านไปแล้ว — ไม่มีอะไรให้กราฟฟิกทำต่อกับใบนี้ */
const SHIPPED_OUT: OrderStatus[] = ["จัดส่งแล้ว", "เสร็จสิ้น"];

/** ความละเอียดที่พิมพ์แล้วคม — ต่ำกว่านี้ควรทักลูกค้าก่อนพิมพ์ */
const DPI_WARN = 150;

/** 1 บรรทัดในรายงาน = แบบ 1 ลาย */
interface Row {
  order: Order;
  item: OrderItem;
  proof: Proof;
  /** ลายที่เท่าไหร่ของรายการนั้น (เริ่มที่ 1) */
  no: number;
  /** ลูกค้าจัดวางลายเองบนเทมเพลต (ไม่ใช่แบบที่กราฟฟิกทำ) */
  self: boolean;
  /** กราฟฟิกที่ทำแบบลายนี้ — ว่าง = ลูกค้าจัดวางเอง หรือแบบเก่าที่ไม่ได้บันทึกชื่อไว้ */
  by: string;
  state: State;
  /** คอมเมนต์ที่ลูกค้าเขียนตอนขอแก้ */
  note: string;
  /** คอมเมนต์นี้เป็นของทั้งรายการ ไม่ใช่ของลายนี้ลายเดียว */
  noteWhole: boolean;
  dpi: number | null;
  /** ทั้งใบยืนยันแบบครบ + ส่งของไปแล้ว = เก็บเข้ากรุ ไม่ปนกับงานที่ยังเดินอยู่ */
  archived: boolean;
}

/** อ่านค่า DPI ที่จอวางลายคำนวณไว้ให้ จากบรรทัดพิกัดของทีมผลิต */
function dpiOf(item: OrderItem, no: number): number | null {
  const specs = (item.sel?.["ตำแหน่งลาย (ทีมผลิต)"] ?? "").split(" | ");
  const line = specs.length > 1 ? specs[no - 1] : specs[0];
  const m = line?.match(/(\d+)\s*DPI/);
  return m ? Number(m[1]) : null;
}

function buildRows(orders: Order[]): Row[] {
  const rows: Row[] = [];
  for (const order of orders) {
    if (order.status === "ยกเลิก") continue;
    /** ลายของใบนี้ — ต้องรู้ครบทั้งใบก่อน ถึงจะตัดสินได้ว่าใบนี้ปิดกองได้หรือยัง */
    const mine: Row[] = [];
    for (const item of order.items) {
      const self = isSelfDesigned(item);
      proofsOf(item).forEach((proof, i) => {
        const state: State =
          proof.review === "อนุมัติ" || item.proofStatus === "อนุมัติ"
            ? "อนุมัติแล้ว"
            : proof.review === "ขอแก้ไข" || item.proofStatus === "ขอแก้ไข"
              ? "ขอแก้ไข"
              : "ยังไม่ยืนยัน";
        const note = proof.reviewNote || (state === "ขอแก้ไข" ? (item.proofNote ?? "") : "");
        mine.push({
          order,
          item,
          proof,
          no: i + 1,
          self,
          by: self ? "" : (proofBy(order, proof) ?? ""),
          state,
          note,
          noteWhole: !proof.reviewNote && !!note,
          dpi: self ? dpiOf(item, i + 1) : null,
          archived: false,
        });
      });
    }
    // ยืนยันครบทุกลาย + ของออกไปแล้ว → ทั้งใบเข้ากอง "จัดเก็บแล้ว" (ไม่แยกครึ่งใบ)
    const filed = SHIPPED_OUT.includes(order.status) && mine.length > 0 && mine.every((r) => r.state === "อนุมัติแล้ว");
    for (const r of mine) r.archived = filed;
    rows.push(...mine);
  }
  // ที่ค้างอยู่ที่เราขึ้นก่อน · ในกลุ่มเดียวกันเอาใบใหม่สุดขึ้นก่อน
  return rows.reverse().sort((a, b) => ORDER_OF[a.state] - ORDER_OF[b.state]);
}

/** "open" = ยังไม่จบเรื่อง (ขอแก้ไข + ยังไม่ยืนยัน) */
type Filter = State | "all" | "open" | "self" | "lowdpi" | "archived";

/** ลายที่ยังไม่จบเรื่อง — ลูกค้ายังไม่กดอนุมัติ */
const isOpen = (r: Row) => r.state !== "อนุมัติแล้ว";

export default function DesignReportPage() {
  const { orders, demo } = useGraphicsOrders();
  const workSizes = useWorkSizes();
  /** รายชื่อพนักงานแผนกกราฟฟิกใน employees2 — เป็นตัวตั้งของชิป "คนทำแบบ" */
  const roster = useGraphicStaff();
  /** เปิดหน้ามาเจอ "ยังไม่จบเรื่อง" ก่อน — งานที่ต้องตามอยู่ตรงหน้าทันที (เจ้าของร้านสั่ง 15 ก.ย. 69) */
  const [filter, setFilter] = useState<Filter>("open");
  /** กรองตามกราฟฟิกที่ทำแบบ — "all" = ทุกคน · "" = แบบเก่าที่ไม่ได้บันทึกชื่อคนทำ */
  const [staff, setStaff] = useState<string | "all">("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => buildRows(orders), [orders]);
  /** กองที่ยังเดินอยู่ = ทุกตัวเลขบนหน้านี้ · กองที่ปิดแล้วเก็บไว้ดูย้อนหลังอย่างเดียว */
  const live = useMemo(() => rows.filter((r) => !r.archived), [rows]);
  const filed = useMemo(() => rows.filter((r) => r.archived), [rows]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: live.length,
      open: 0,
      ขอแก้ไข: 0,
      ยังไม่ยืนยัน: 0,
      อนุมัติแล้ว: 0,
      self: 0,
      lowdpi: 0,
      archived: filed.length,
    };
    for (const r of live) {
      c[r.state]++;
      if (isOpen(r)) c.open++;
      if (r.self) c.self++;
      if (r.dpi !== null && r.dpi < DPI_WARN) c.lowdpi++;
    }
    return c;
  }, [live, filed]);

  /** กองที่กำลังเปิดดู — ชิป "จัดเก็บแล้ว" สลับไปดูของเก่าทั้งกอง */
  const pool = filter === "archived" ? filed : live;

  /** รายชื่อกราฟฟิกในชิปกรอง — เฉพาะลายที่เราทำเอง (ลายที่ลูกค้าจัดวางเองไม่มีคนทำ) */
  const staffList = useMemo(() => staffTally(pool.filter((r) => !r.self).map((r) => r.by), roster), [pool, roster]);

  const shown = pool
    .filter((r) => (staff === "all" ? true : !r.self && r.by === staff))
    .filter((r) =>
      filter === "all" || filter === "archived"
        ? true
        : filter === "open"
          ? isOpen(r)
          : filter === "self"
            ? r.self
            : filter === "lowdpi"
              ? r.dpi !== null && r.dpi < DPI_WARN
              : r.state === filter
    )
    .filter((r) => orderMatches(r.order, q));

  /** ค้นแล้วไม่เจอในกองที่เดินอยู่ — บอกว่าของเก่าที่ตรงคำค้นไปอยู่ในกรุแล้วกี่ลาย */
  const filedHits = q.trim() ? filed.filter((r) => orderMatches(r.order, q)).length : 0;

  /** จับกลุ่มตามออเดอร์ — ลายของใบเดียวกันอยู่ติดกัน ไม่ต้องอ่านเลขออเดอร์ซ้ำทุกบรรทัด */
  const groups = useMemo(() => {
    const m = new Map<string, { order: Order; rows: Row[] }>();
    for (const r of shown) {
      const g = m.get(r.order.id) ?? { order: r.order, rows: [] };
      g.rows.push(r);
      m.set(r.order.id, g);
    }
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <PageShell>
      <PageHead
        group="กราฟฟิก"
        title="รายงานแบบงาน"
        count={`${counts.all} ลาย`}
        sub="สรุปว่าแบบของออเดอร์ไหนค้างอยู่ตรงไหน — ลูกค้าขอแก้ · ส่งไปแล้วยังไม่ยืนยัน · อนุมัติแล้ว (ใบที่ส่งของไปแล้วย้ายเข้ากอง “จัดเก็บแล้ว”)"
        live={demo ? { ok: false, text: "ยังไม่มีออเดอร์จริง — แสดงตัวอย่างไว้ก่อน" } : { ok: true, text: "ออเดอร์จริง" }}
        tools={
          <>
            <SearchBox value={q} onChange={setQ} placeholder="ค้นเลขออเดอร์ / ชื่อลูกค้า / ชื่อสินค้า" />
            <Btn tone="navy" href="/admin/graphics">
              ออเดอร์กราฟฟิก
            </Btn>
          </>
        }
      />

      <Stats cols={4}>
        <HeroStat
          n={counts.open}
          label="ยังไม่จบเรื่อง"
          detail={`ลูกค้าขอแก้ ${counts["ขอแก้ไข"]} · ส่งไปแล้วยังไม่ยืนยัน ${counts["ยังไม่ยืนยัน"]}`}
          pct={counts.all ? (counts.open / counts.all) * 100 : 0}
          onClick={() => setFilter(filter === "open" ? "all" : "open")}
          active={filter === "open"}
        />
        <Stat label="อนุมัติแล้ว" value={counts["อนุมัติแล้ว"]} hint="จบเรื่องแล้ว · ยังไม่ได้ส่งของ" />
        <Stat
          label="ความละเอียดต่ำ"
          value={counts.lowdpi}
          hint={counts.lowdpi ? `ต่ำกว่า ${DPI_WARN} DPI — ควรทักลูกค้า` : `เกิน ${DPI_WARN} DPI ทุกลาย`}
          tone={counts.lowdpi ? "due" : undefined}
        />
        <Stat
          label="จัดเก็บแล้ว"
          value={counts.archived}
          hint="ยืนยันแบบครบ + ส่งของแล้ว"
          onClick={() => setFilter(filter === "archived" ? "all" : "archived")}
          active={filter === "archived"}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
          <FChip
            on={filter === "open"}
            onClick={() => setFilter("open")}
            label="ยังไม่จบเรื่อง"
            count={counts.open}
            style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}
          />
          <FChip
            on={filter === "ขอแก้ไข"}
            onClick={() => setFilter("ขอแก้ไข")}
            label="ขอแก้ไข"
            count={counts["ขอแก้ไข"]}
            style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
          />
          <FChip
            on={filter === "ยังไม่ยืนยัน"}
            onClick={() => setFilter("ยังไม่ยืนยัน")}
            label="ยังไม่ยืนยัน"
            count={counts["ยังไม่ยืนยัน"]}
            style={{ background: "var(--dk-lilac-wash)", color: "var(--dk-lilac-ink)" }}
          />
          <FChip on={filter === "อนุมัติแล้ว"} onClick={() => setFilter("อนุมัติแล้ว")} label="อนุมัติแล้ว" count={counts["อนุมัติแล้ว"]} />
        </TabRow>
        <TabRow divider>
          <FChip
            on={filter === "archived"}
            onClick={() => setFilter(filter === "archived" ? "all" : "archived")}
            label="จัดเก็บแล้ว"
            count={counts.archived}
          />
          <FChip on={filter === "self"} onClick={() => setFilter("self")} label="ลูกค้าจัดวางเอง" count={counts.self} />
          <FChip
            on={filter === "lowdpi"}
            onClick={() => setFilter("lowdpi")}
            label="ความละเอียดต่ำ"
            count={counts.lowdpi}
            style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
          />
        </TabRow>
        {/* ใครเป็นคนทำแบบ — ขึ้นเมื่อมีกราฟฟิกทำแบบมากกว่า 1 คน */}
        {staffList.length > 1 && (
          <TabRow divider>
            <span className="flex-none self-center pr-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
              คนทำแบบ
            </span>
            <FChip on={staff === "all"} onClick={() => setStaff("all")} label="ทุกคน" count={pool.length} />
            {staffList.map((p) => (
              <FChip
                key={p.name || "unknown"}
                on={staff === p.name}
                onClick={() => setStaff(staff === p.name ? "all" : p.name)}
                label={p.name || "ไม่ระบุคนทำ"}
                count={p.n}
              />
            ))}
          </TabRow>
        )}
      </FilterCard>

      <ListHead
        title="ลาย"
        note={filter === "archived" ? "ใบเก่าที่ปิดกองแล้ว · ใบใหม่สุดขึ้นก่อน" : "จัดกลุ่มตามออเดอร์ · ที่ค้างอยู่ที่เราขึ้นก่อน"}
      />

      {groups.length === 0 ? (
        <Empty
          title={
            q.trim()
              ? `ไม่พบแบบที่ตรงกับ “${q.trim()}”`
              : filter === "archived"
                ? "ยังไม่มีงานที่จัดเก็บ"
                : "ไม่มีข้อมูลในกลุ่มนี้"
          }
          body={
            q.trim()
              ? filedHits > 0
                ? `เจออีก ${filedHits} ลายในกอง “จัดเก็บแล้ว” — กดปุ่มจัดเก็บแล้วด้านบนเพื่อดูงานเก่า`
                : "ลองค้นด้วยเลขออเดอร์ ชื่อลูกค้า หรือชื่อสินค้าแทน"
              : filter === "archived"
                ? "ใบที่ลูกค้ายืนยันแบบครบทุกลายและส่งของไปแล้ว จะย้ายมากองนี้เอง"
                : "ลองดูกลุ่มอื่นจากปุ่มด้านบน"
          }
        />
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => {
            const redo = g.rows.filter((r) => r.state === "ขอแก้ไข").length;
            const wait = g.rows.filter((r) => r.state === "ยังไม่ยืนยัน").length;
            return (
              <section key={g.order.id}>
                {/* หัวกลุ่ม = 1 ออเดอร์ */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2 pb-2">
                  <Link
                    href={`/admin/orders/${encodeURIComponent(g.order.id)}`}
                    className="dkb-code text-[12.5px] underline-offset-4 hover:underline"
                    style={{ color: "var(--dk-navy-soft)" }}
                  >
                    {g.order.id}
                  </Link>
                  <StatusChip s={g.order.status} label={orderStatusLabel(g.order)} />
                  <span className="truncate text-[13px]" style={{ color: "var(--dk-navy)" }} title={g.order.customer}>
                    {g.order.customer}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                    {dayOf(g.order.date)}
                  </span>
                  {/* วันใช้งานที่ลูกค้าแจ้ง — ใบไหนใกล้วันใช้งานให้เห็นตั้งแต่หัวกลุ่ม */}
                  <UseBy o={g.order} />
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {redo > 0 && <Tag tone="solid">ขอแก้ {redo}</Tag>}
                    {wait > 0 && <Tag tone="lilac">ยังไม่ยืนยัน {wait}</Tag>}
                    <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                      {g.rows.length} ลาย
                    </span>
                  </span>
                </div>

                <Rows>
                  {g.rows.map((r, i) => {
                    const low = r.dpi !== null && r.dpi < DPI_WARN;
                    return (
                      <Row key={`${r.proof.url}-${i}`} tone={STATE_TONE[r.state]} done={r.state === "อนุมัติแล้ว"}>
                        <span className="flex min-w-0 flex-1 items-center gap-3">
                          <a
                            href={r.proof.url}
                            target="_blank"
                            rel="noreferrer"
                            title="เปิดรูปเต็ม"
                            className="dkb-thumb !h-[52px] w-[52px] shrink-0"
                          >
                            <img src={r.proof.url} alt={`ลายที่ ${r.no}`} loading="lazy" decoding="async" />
                          </a>
                          <RowMain
                            name={r.item.name}
                            href={`/admin/orders/${encodeURIComponent(r.order.id)}`}
                            tags={
                              <>
                                <Tag tone={STATE_TAG[r.state]}>{r.state}</Tag>
                                {r.proof.revisedAt && <Tag tone="mint">แก้ให้แล้ว</Tag>}
                                {r.self ? (
                                  <Tag tone="sky">ลูกค้าจัดวางเอง</Tag>
                                ) : (
                                  <Tag tone="quiet" title={r.by ? `${r.by} เป็นคนทำแบบลายนี้` : undefined}>
                                    {r.by ? `ทำโดย ${r.by}` : "กราฟฟิกทำ"}
                                  </Tag>
                                )}
                                {low && (
                                  <Tag tone="solid" title={`ต่ำกว่า ${DPI_WARN} DPI — พิมพ์แล้วอาจไม่คม`}>
                                    {r.dpi} DPI
                                  </Tag>
                                )}
                              </>
                            }
                            meta={
                              <>
                                <span>
                                  ลายที่ {r.no}
                                  {r.proof.qty ? ` · ${r.proof.qty} ${proofUnit(r.proof)}` : ""}
                                </span>
                                {/* จำนวนทั้งรายการ + ขนาดงานตายตัว — เทียบกับเลขบนลายได้โดยไม่ต้องเปิดใบ */}
                                <span>ทั้งรายการ {itemQtyText(r.item)}</span>
                                {workSizes[r.item.productId] && !/ขนาด/.test(Object.keys(r.item.sel ?? {}).join("")) && (
                                  <span>ขนาด {workSizes[r.item.productId]}</span>
                                )}
                                {r.dpi !== null && !low && <span>{r.dpi} DPI</span>}
                                {r.note && (
                                  <span className="hot" title={r.note}>
                                    {r.noteWhole ? "(ของทั้งรายการ) " : ""}
                                    {r.note}
                                  </span>
                                )}
                              </>
                            }
                          />
                        </span>
                        <RowSide>
                          <Btn small href={`/admin/orders/${encodeURIComponent(r.order.id)}`}>
                            เปิดออเดอร์
                          </Btn>
                        </RowSide>
                      </Row>
                    );
                  })}
                </Rows>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
