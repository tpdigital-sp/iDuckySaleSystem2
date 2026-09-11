"use client";

/**
 * ✏️ คำขอแก้ไขออเดอร์ /admin/edit-requests — ลูกค้ากด "ขอแก้ไขออเดอร์นี้" จากหน้าออเดอร์ของตัวเอง
 *
 * เจ้าของร้านสั่ง 11 ก.ย. 69: เดิมคำขอซ่อนอยู่ในป้ายเล็ก ๆ ในลิสต์ + แบนเนอร์ในหน้าออเดอร์ ต้องไล่เปิดเอง
 * → เมนูแยก + ตัวเลขข้างเมนู (AdminShell) นับเฉพาะที่ "ยังไม่ได้จัดการ"
 *
 * ลูกค้าแก้ยอดเองไม่ได้ (กันบิลไม่ตรงสลิป) — แอดมินเปิดออเดอร์ แก้รายการ/ราคาให้ แล้วกลับมากด "จัดการแล้ว"
 * ปุ่มนี้ทำงานเดียวกับปุ่มในแบนเนอร์ของหน้าออเดอร์ (เขียน editRequest.doneAt ฝั่งเซิร์ฟเวอร์ + ลง log)
 */

import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip, { STATUS_TONE } from "@/components/admin/StatusChip";
import { usePolling } from "@/lib/use-polling";
import {
  Banner,
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
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";
import type { EditRequestRow } from "@/app/api/admin/orders/edit-requests/route";

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime())
    ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;

/** ส่งมานานแค่ไหนแล้ว — คำขอที่เงียบไปคือลูกค้าที่รอคำตอบอยู่ */
function ageLabel(iso: string): { text: string; hot: boolean } {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return { text: "", hot: false };
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return { text: `${Math.max(1, Math.floor(ms / 60_000))} นาที`, hot: false };
  if (h < 24) return { text: `${h} ชม.`, hot: h >= 3 };
  return { text: `${Math.floor(h / 24)} วัน`, hot: true };
}

function EditRequestsInner() {
  const can = useCan();
  const mayResolve = can("orders.edit");
  const [rows, setRows] = useState<EditRequestRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState<"open" | "done">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/orders/edit-requests?all=1", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { requests?: EditRequestRow[]; reason?: string } | null;
      setRows(j?.requests ?? []);
      setReason(j?.reason ?? "");
    } catch {
      setRows((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // คำขอใหม่เข้ามาระหว่างเปิดหน้าค้าง → โผล่เองไม่ต้องรีเฟรช
  usePolling(load, { intervalMs: 60_000 });

  const all = rows ?? [];
  const open = useMemo(() => all.filter((r) => !r.doneAt && r.status !== "ยกเลิก"), [all]);
  const done = useMemo(() => all.filter((r) => r.doneAt || r.status === "ยกเลิก"), [all]);
  const shown = filter === "open" ? open : done;
  const oldest = open.length ? ageLabel(open[open.length - 1].at) : null;

  async function resolve(id: string) {
    if (busy) return;
    setBusy(id);
    setErr("");
    try {
      const r = await fetch("/api/admin/orders/edit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await r.json().catch(() => ({}))) as { request?: EditRequestRow; error?: string };
      if (!r.ok || !j.request) {
        setErr(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      const u = j.request;
      setRows((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs);
      // ป้ายข้างเมนูนับใหม่ทันที (AdminShell ฟังอีเวนต์นี้)
      window.dispatchEvent(new Event("iducky:edit-requests-changed"));
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงคำขอแก้ไขจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="คำขอแก้ไขออเดอร์"
        count={`${open.length} รายการ`}
        sub="ลูกค้ากด “ขอแก้ไขออเดอร์นี้” จากหน้าออเดอร์ของตัวเอง — เปิดออเดอร์ แก้รายการ/ราคาให้ แจ้งยอดใหม่กับลูกค้า แล้วกด “จัดการแล้ว”"
      />

      {reason && (
        <div className="mt-4">
          <Banner tone="warm" title="ดึงคำขอไม่สำเร็จ" detail={reason} />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={open.length}
          label="ยังไม่ได้จัดการ"
          detail={oldest?.text ? `ค้างนานสุด ${oldest.text} · จัดการแล้ว ${done.length} รายการ` : "เคลียร์หมดแล้ว"}
          pct={all.length ? (open.length / all.length) * 100 : 0}
        />
        <Stat label="จัดการแล้ว" value={done.length} hint="รวมใบที่ยกเลิกไปแล้ว" />
        <Stat
          label="ค้างนานสุด"
          value={oldest?.text || "—"}
          hint={oldest?.hot ? "ลูกค้ารอคำตอบอยู่" : "ยังไม่มีค้าง"}
          tone={oldest?.hot ? "due" : undefined}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={filter === "open"} onClick={() => setFilter("open")} label="ยังไม่ได้จัดการ" count={open.length} />
          <FChip on={filter === "done"} onClick={() => setFilter("done")} label="จัดการแล้ว" count={done.length} />
        </TabRow>
      </FilterCard>

      <ListHead title="คำขอจากลูกค้า" note="ใหม่สุดขึ้นก่อน" />

      {err && (
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          title={filter === "open" ? "ไม่มีคำขอค้างอยู่" : "ยังไม่มีคำขอที่จัดการแล้ว"}
          body={
            filter === "open"
              ? "เคลียร์หมดแล้ว — คำขอใหม่จะขึ้นตรงนี้ทันทีที่ลูกค้าส่งเข้ามา"
              : "กด “จัดการแล้ว” ในแท็บแรก รายการจะย้ายมาที่นี่"
          }
        />
      ) : (
        <Rows>
          {shown.map((r) => {
            const isOpen = !r.doneAt && r.status !== "ยกเลิก";
            const age = ageLabel(r.at);
            return (
              <Row key={r.id} tone={isOpen ? "var(--dk-lilac)" : STATUS_TONE[r.status]} done={!isOpen}>
                <RowMain
                  name={r.customer}
                  href={`/admin/orders/${encodeURIComponent(r.id)}`}
                  tags={
                    <>
                      <StatusChip s={r.status} />
                      {isOpen && age.hot && <Tag tone="solid">ค้าง {age.text}</Tag>}
                      {isOpen && !age.hot && age.text && <Tag tone="lilac">ส่งมา {age.text}</Tag>}
                      {r.doneAt && (
                        <Tag tone="quiet" title={thTime(r.doneAt)}>
                          จัดการแล้ว{r.doneBy ? ` · ${r.doneBy}` : ""}
                        </Tag>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <span className="id">{r.id}</span>
                      <span>{baht(r.total)}</span>
                      <span>ส่งเมื่อ {thTime(r.at)}</span>
                      <span className={isOpen ? "hot" : undefined} title={r.text}>
                        “{r.text}”
                      </span>
                    </>
                  }
                />
                <RowSide>
                  <Btn small href={`/admin/orders/${encodeURIComponent(r.id)}`} title="เปิดออเดอร์เพื่อแก้รายการ/ราคาให้ลูกค้า">
                    เปิดออเดอร์
                  </Btn>
                  {isOpen && mayResolve && (
                    <Btn tone="navy" small disabled={busy === r.id} onClick={() => void resolve(r.id)}>
                      {busy === r.id ? "กำลังบันทึก…" : "✓ จัดการแล้ว"}
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

export default function EditRequestsPage() {
  return (
    <RequirePerm perm="orders.view">
      <EditRequestsInner />
    </RequirePerm>
  );
}
