"use client";

/**
 * 💸 โอนแล้ว รอของเข้า /admin/stock-buy — เมนูกลุ่มงานขาย (เจ้าของร้านขอ 18 ก.ย. 69)
 *
 * ใบที่ติ๊ก "รอของเข้า / ต้องสั่งของ" และลูกค้าโอนเงินมาแล้ว แต่ของยังไม่เข้าร้าน
 * = เงินเข้าแล้วงานยังไม่เดิน ฝ่ายขายต้องสั่งของ/ตามของ — ตัวเลขข้างเมนู (AdminShell) นับกองนี้
 * ข้อมูลชุดเดียวกับ /admin/stock-wait (กลุ่มกราฟฟิก) ที่เน้นกอง "ของเข้าแล้ว รอส่งเข้าผลิต"
 *
 * ปุ่ม "✓ ของเข้าแล้ว" = แอดมิน/ฝ่ายแพ็ค-ผลิต (คนรับของ) — ตรงกับหน้าออเดอร์
 */

import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip from "@/components/admin/StatusChip";
import { usePolling } from "@/lib/use-polling";
import { Banner, Btn, Empty, FChip, FilterCard, HeroStat, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import type { StockWaitRow } from "@/app/api/admin/orders/stock-wait/route";

type Tab = "paid" | "unpaid";

const thTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** รอมากี่วันแล้ว — นับจากเวลาที่เงินเข้า (ไม่มี = วันที่ติ๊ก) · ใบที่โอนแล้วรอนานคือใบที่ลูกค้าเริ่มทักถาม */
function waitedDays(r: StockWaitRow): number {
  const ms = Date.now() - new Date(r.paidAlertAt ?? r.at).getTime();
  return isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

function StockBuyInner() {
  const can = useCan();
  const mayArrive = can("orders.edit") || can("pack.check") || can("pack.ship");
  const [rows, setRows] = useState<StockWaitRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<Tab>("paid");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/orders/stock-wait", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { rows?: StockWaitRow[]; reason?: string } | null;
      setRows(j?.rows ?? []);
      setReason(j?.reason ?? "");
    } catch {
      setRows((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, { intervalMs: 60_000 });

  const by = useMemo(() => {
    const waiting = (rows ?? []).filter((r) => r.group === "waiting");
    // รอนานสุดขึ้นก่อน · งานเร่งนำ
    const sort = (a: StockWaitRow, b: StockWaitRow) => Number(!!b.rush) - Number(!!a.rush) || (a.paidAlertAt ?? a.at).localeCompare(b.paidAlertAt ?? b.at);
    return { paid: waiting.filter((r) => r.paid).sort(sort), unpaid: waiting.filter((r) => !r.paid).sort(sort) };
  }, [rows]);
  const shown = by[tab];
  const paidSum = by.paid.reduce((s, r) => s + r.total, 0);
  const longest = by.paid.reduce((m, r) => Math.max(m, waitedDays(r)), 0);

  async function arrived(id: string) {
    if (busy) return;
    setBusy(id);
    setErr("");
    try {
      const r = await fetch("/api/admin/orders/stock-wait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await r.json().catch(() => ({}))) as { row?: StockWaitRow; error?: string };
      if (!r.ok || !j.row) {
        setErr(j.error ?? "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
        return;
      }
      const u = j.row;
      setRows((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs);
      // ป้ายข้างเมนูนับใหม่ทันที (AdminShell ฟังอีเวนต์นี้)
      window.dispatchEvent(new Event("iducky:stock-wait-changed"));
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงใบที่โอนแล้วและรอของเข้าจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="โอนแล้ว รอของเข้า"
        count={`${by.paid.length} ใบ`}
        sub="ใบที่ติ๊กว่าต้องสั่งของ และลูกค้าโอนเงินมาแล้ว แต่ของยังไม่เข้าร้าน — สั่งของ/ตามของให้ครบ ของเข้าแล้วกด “✓ ของเข้าแล้ว” ใบจะไปต่อที่กราฟฟิก"
      />

      {reason && (
        <div className="mt-4">
          <Banner tone="warm" title="ดึงรายการไม่สำเร็จ" detail={reason} />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={by.paid.length}
          label="โอนแล้ว ต้องสั่งของ"
          detail={by.paid.length ? "เงินเข้าแล้ว งานยังไม่เดิน" : "ไม่มีใบค้างสั่งของ"}
          pct={by.paid.length + by.unpaid.length ? (by.paid.length / (by.paid.length + by.unpaid.length)) * 100 : 0}
        />
        <Stat label="ยอดเงินที่รับมาแล้ว" value={by.paid.length ? baht(paidSum) : "—"} hint="ยอดรวมของใบที่รอของ" />
        <Stat label="รอนานสุด" value={by.paid.length ? `${longest} วัน` : "—"} hint="นับจากวันที่เงินเข้า" tone={longest >= 7 ? "due" : undefined} />
        <Stat label="รอลูกค้าโอนก่อน" value={by.unpaid.length} hint="ยังไม่ต้องสั่งของ" />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={tab === "paid"} onClick={() => setTab("paid")} label="โอนแล้ว ต้องสั่งของ" count={by.paid.length} />
          <FChip on={tab === "unpaid"} onClick={() => setTab("unpaid")} label="รอลูกค้าโอนก่อน" count={by.unpaid.length} />
        </TabRow>
      </FilterCard>

      <ListHead title={tab === "paid" ? "ลูกค้าโอนแล้ว — ของยังไม่เข้า" : "ติ๊กรอของไว้ แต่ลูกค้ายังไม่โอน"} note="งานเร่งขึ้นก่อน · รอนานสุดขึ้นก่อน" />

      {err && (
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          title={tab === "paid" ? "ไม่มีใบที่โอนแล้วรอของเข้า" : "ไม่มีใบที่รอลูกค้าโอน"}
          body={
            tab === "paid"
              ? "ใบที่ติ๊ก “รอของเข้า / ต้องสั่งของ” พอลูกค้าโอนเงินแล้วจะขึ้นตรงนี้ พร้อมตัวเลขข้างเมนู"
              : "ใบที่ติ๊ก “รอของเข้า” แต่ลูกค้ายังไม่ชำระเงินจะขึ้นตรงนี้"
          }
        />
      ) : (
        <Rows>
          {shown.map((r) => {
            const days = waitedDays(r);
            return (
              <Row key={r.id} tone={r.paid ? "var(--dk-coral-ink)" : "var(--dk-faint)"}>
                <RowMain
                  name={r.customer || "ยังไม่ระบุชื่อ"}
                  href={`/admin/orders/${encodeURIComponent(r.id)}`}
                  tags={
                    <>
                      <StatusChip s={r.status} />
                      {r.rush && <Tag tone="solid">งานเร่ง</Tag>}
                      {r.paid ? <Tag tone="coral">โอนแล้ว {baht(r.total)}</Tag> : <Tag tone="quiet">ยังไม่โอน {baht(r.total)}</Tag>}
                      {r.paid && days >= 3 && <Tag tone="yolk">รอมา {days} วัน</Tag>}
                      {r.productionSent && <Tag tone="yolk">ส่งเข้าผลิตไปแล้วทั้งที่ของยังไม่เข้า</Tag>}
                    </>
                  }
                  meta={
                    <>
                      <span className="id">{r.id}</span>
                      {r.useByDate && <span className="hot">ใช้งาน {r.useByDate}</span>}
                      {r.note && (
                        <span title={r.note}>
                          <b>ต้องสั่ง:</b> {r.note}
                        </span>
                      )}
                      {r.items.slice(0, 3).map((t, i) => (
                        <span key={i}>{t}</span>
                      ))}
                      {r.items.length > 3 && <span>+ อีก {r.items.length - 3} รายการ</span>}
                      {r.paidAlertAt && <span>เงินเข้า {thTime(r.paidAlertAt)}</span>}
                      <span>
                        ติ๊กโดย {r.by} · {thTime(r.at)}
                      </span>
                    </>
                  }
                />
                <RowSide>
                  <Btn small href={`/admin/orders/${encodeURIComponent(r.id)}`}>
                    เปิดออเดอร์
                  </Btn>
                  {mayArrive && (
                    <Btn small tone={r.paid ? "navy" : undefined} disabled={busy === r.id} onClick={() => void arrived(r.id)} title="ของเข้าร้านแล้ว — ใบจะย้ายไปกองส่งเข้าผลิตได้ และแจ้งลูกค้าทางไลน์">
                      {busy === r.id ? "กำลังบันทึก…" : "✓ ของเข้าแล้ว"}
                    </Btn>
                  )}
                </RowSide>
              </Row>
            );
          })}
        </Rows>
      )}
    </PageShell>
  );
}

export default function StockBuyPage() {
  return (
    <RequirePerm perm="orders.view">
      <StockBuyInner />
    </RequirePerm>
  );
}
