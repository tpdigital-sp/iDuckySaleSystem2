"use client";

/**
 * 🛒 รอของเข้า /admin/stock-wait — เมนูกลุ่มกราฟฟิก (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 * ใบที่แอดมินติ๊ก "รอของเข้า / ต้องสั่งของ" รวมไว้ที่เดียว — กราฟฟิกไม่ต้องไล่หาแถบแดงในคิว
 * ตัวเลขข้างเมนู (AdminShell) = กอง "ของเข้าแล้ว รอส่งเข้าผลิต" → งานที่กราฟฟิกต้องลงมือ
 * ป้ายหายเองเมื่อใบถูกติ๊ก 🏭 ส่งเข้าผลิต หรือสถานะไปถึงกำลังผลิต
 *
 * ปุ่ม "✓ ของเข้าแล้ว" = แอดมิน/ฝ่ายแพ็ค-ผลิต (คนรับของ) · กราฟฟิกเห็นอย่างเดียว — ตรงกับหน้าออเดอร์
 */

import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip from "@/components/admin/StatusChip";
import { usePolling } from "@/lib/use-polling";
import { Banner, Btn, Empty, FChip, FilterCard, HeroStat, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import type { StockWaitRow } from "@/app/api/admin/orders/stock-wait/route";

type Group = StockWaitRow["group"];

const thTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

/** รอมากี่วันแล้ว — ใบที่รอของนานคือใบที่ลูกค้าเริ่มทักถาม */
function waitedDays(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

const TONE: Record<Group, string> = { ready: "var(--dk-mint)", waiting: "var(--dk-coral-ink)", done: "var(--dk-faint)" };

function StockWaitInner() {
  const can = useCan();
  const mayArrive = can("orders.edit") || can("pack.check") || can("pack.ship");
  const [rows, setRows] = useState<StockWaitRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<Group | null>(null);
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

  const all = useMemo(() => rows ?? [], [rows]);
  const by = useMemo(() => {
    const g: Record<Group, StockWaitRow[]> = { ready: [], waiting: [], done: [] };
    for (const r of all) g[r.group].push(r);
    // ของเข้าล่าสุดขึ้นก่อน · กองรอของ = รอนานสุดขึ้นก่อน (ใบที่ลูกค้าโอนแล้วนำ)
    g.ready.sort((a, b) => (b.arrivedAt ?? "").localeCompare(a.arrivedAt ?? ""));
    g.waiting.sort((a, b) => Number(b.paid) - Number(a.paid) || a.at.localeCompare(b.at));
    return g;
  }, [all]);
  // ยังไม่เลือกแท็บเอง → เปิดกองที่ต้องลงมือก่อน: มีของเข้า = ของเข้าแล้ว · ไม่มี = ยังรอของ
  const active: Group = tab ?? (by.ready.length ? "ready" : "waiting");
  const shown = by[active];
  const paidWaiting = by.waiting.filter((r) => r.paid).length;
  const longest = by.waiting.reduce((m, r) => Math.max(m, waitedDays(r.at)), 0);

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
        <Empty title="กำลังโหลด…" body="ดึงใบที่รอของเข้าจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="กราฟฟิก"
        title="รอของเข้า"
        count={`${by.ready.length + by.waiting.length} ใบ`}
        sub="ใบที่แอดมินติ๊กว่าต้องสั่งของและรอของเข้าก่อนผลิต — ของเข้าแล้วจะย้ายขึ้นกองแรก ให้กราฟฟิกส่งเข้าผลิตได้เลย"
      />

      {reason && (
        <div className="mt-4">
          <Banner tone="warm" title="ดึงรายการไม่สำเร็จ" detail={reason} />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={by.ready.length}
          label="ของเข้าแล้ว รอส่งเข้าผลิต"
          detail={by.ready.length ? "เปิดใบ → ส่งไฟล์เข้าผลิตได้เลย" : "ยังไม่มีของเข้าใหม่"}
          pct={by.ready.length + by.waiting.length ? (by.ready.length / (by.ready.length + by.waiting.length)) * 100 : 0}
        />
        <Stat label="ยังรอของเข้า" value={by.waiting.length} hint={paidWaiting ? `ลูกค้าโอนแล้ว ต้องสั่งของ ${paidWaiting} ใบ` : "ยังไม่มีใบที่โอนแล้ว"} tone={paidWaiting ? "due" : undefined} />
        <Stat label="รอนานสุด" value={by.waiting.length ? `${longest} วัน` : "—"} hint="นับจากวันที่ติ๊ก" tone={longest >= 7 ? "due" : undefined} />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={active === "ready"} onClick={() => setTab("ready")} label="ของเข้าแล้ว รอส่งผลิต" count={by.ready.length} />
          <FChip on={active === "waiting"} onClick={() => setTab("waiting")} label="ยังรอของเข้า" count={by.waiting.length} />
          <FChip on={active === "done"} onClick={() => setTab("done")} label="เข้าผลิตแล้ว" count={by.done.length} />
        </TabRow>
      </FilterCard>

      <ListHead
        title={active === "ready" ? "ของเข้าแล้ว — ส่งเข้าผลิตได้" : active === "waiting" ? "ยังรอของเข้า — ห้ามส่งเข้าผลิต" : "เข้าผลิตไปแล้ว"}
        note={active === "ready" ? "ของเข้าล่าสุดขึ้นก่อน" : active === "waiting" ? "ลูกค้าโอนแล้วขึ้นก่อน · รอนานสุดขึ้นก่อน" : "ดูย้อนหลัง"}
      />

      {err && (
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          title={active === "ready" ? "ยังไม่มีของเข้าใหม่" : active === "waiting" ? "ไม่มีใบที่รอของเข้า" : "ยังไม่มีใบที่ผ่านขั้นนี้"}
          body={
            active === "ready"
              ? "พอแอดมินหรือฝ่ายแพ็คกด “ของเข้าแล้ว” ใบจะขึ้นตรงนี้ พร้อมตัวเลขข้างเมนู"
              : active === "waiting"
                ? "แอดมินติ๊ก “รอของเข้า” ตอนสร้างคำสั่งซื้อ หรือในหน้าออเดอร์ ใบจะขึ้นตรงนี้"
                : "ใบที่ของเข้าแล้วและส่งเข้าผลิตจะย้ายมาที่นี่"
          }
        />
      ) : (
        <Rows>
          {shown.map((r) => {
            const days = waitedDays(r.at);
            return (
              <Row key={r.id} tone={TONE[r.group]} done={r.group === "done"}>
                <RowMain
                  name={r.customer || "ยังไม่ระบุชื่อ"}
                  href={`/admin/orders/${encodeURIComponent(r.id)}`}
                  tags={
                    <>
                      <StatusChip s={r.status} />
                      {r.rush && <Tag tone="solid">งานเร่ง</Tag>}
                      {r.group === "ready" && (
                        <Tag tone="mint" title={`${r.arrivedBy ?? ""} · ${thTime(r.arrivedAt)}`}>
                          ✓ ของเข้าแล้ว {thTime(r.arrivedAt)}
                        </Tag>
                      )}
                      {r.group === "waiting" && (r.paid ? <Tag tone="coral">ลูกค้าโอนแล้ว ต้องสั่งของ</Tag> : <Tag tone="quiet">รอลูกค้าโอนก่อนสั่งของ</Tag>)}
                      {r.group === "waiting" && days >= 3 && <Tag tone="yolk">รอมา {days} วัน</Tag>}
                      {r.group === "done" && <Tag tone="quiet">{r.arrivedAt ? `ของเข้า ${thTime(r.arrivedAt)}` : "ส่งผลิตทั้งที่ของยังไม่เข้า"}</Tag>}
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
                      <span>
                        ติ๊กโดย {r.by} · {thTime(r.at)}
                      </span>
                    </>
                  }
                />
                <RowSide>
                  <Btn small tone={r.group === "ready" ? "navy" : undefined} href={`/admin/orders/${encodeURIComponent(r.id)}`}>
                    {r.group === "ready" ? "เปิดใบ → ส่งเข้าผลิต" : "เปิดออเดอร์"}
                  </Btn>
                  {r.group === "waiting" && mayArrive && (
                    <Btn small disabled={busy === r.id} onClick={() => void arrived(r.id)} title="ของเข้าร้านแล้ว — ใบจะย้ายไปกองส่งเข้าผลิตได้ และแจ้งลูกค้าทางไลน์">
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

export default function StockWaitPage() {
  return (
    <RequirePerm perm="admin.access">
      <StockWaitInner />
    </RequirePerm>
  );
}
