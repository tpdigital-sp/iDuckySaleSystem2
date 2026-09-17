"use client";

/**
 * 🏪 ลูกค้าที่มารับเอง /admin/pickup — เมนูกลุ่มงานขาย (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 * ลูกค้าเดินมาหน้าร้านแล้วบอกชื่อ/เบอร์/เลขออเดอร์ → หาใบเจอในช่องค้นหาทันที ไม่ต้องไล่ลิสต์คำสั่งซื้อทั้งร้าน
 * ตัวเลขข้างเมนู (AdminShell) = กอง "แพ็คเสร็จ รอมารับ" → ของที่วางรออยู่หน้าร้าน
 * ปุ่ม "✓ ลูกค้ารับของแล้ว" = จดคนส่งมอบ/เวลา + ปิดงานเป็นเสร็จสิ้น (ใบค้างยอดกดไม่ได้ ต้องเก็บเงินในหน้าออเดอร์ก่อน)
 */

import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip from "@/components/admin/StatusChip";
import { ORDER_STATUSES } from "@/lib/admin-data";
import { usePolling } from "@/lib/use-polling";
import { Banner, Btn, Empty, FChip, FilterCard, HeroStat, ListHead, PageHead, PageShell, Row, RowMain, RowSide, Rows, SearchBox, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import type { PickupRow } from "@/app/api/admin/orders/pickup/route";

type Group = PickupRow["group"];

const thTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** ของวางรอมากี่วันแล้ว — ใบที่ค้างนานคือใบที่ต้องทักตามลูกค้า */
function waitedDays(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/** ค้างหน้าร้านเกินเท่านี้ = ควรทักตามลูกค้า */
const FOLLOW_UP_DAYS = 3;

const TONE: Record<Group, string> = { ready: "var(--dk-mint)", working: "var(--dk-yolk)", done: "var(--dk-faint)" };
const digits = (s: string) => s.replace(/\D/g, "");

function PickupInner() {
  const can = useCan();
  const mayHandOver = can("orders.edit") || can("pack.ship");
  const [rows, setRows] = useState<PickupRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<Group | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/orders/pickup", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { rows?: PickupRow[]; reason?: string } | null;
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
    const g: Record<Group, PickupRow[]> = { ready: [], working: [], done: [] };
    for (const r of all) g[r.group].push(r);
    // รอมารับ = วางรอนานสุดขึ้นก่อน (ต้องทักตาม) · รับไปแล้ว = ล่าสุดขึ้นก่อน
    g.ready.sort((a, b) => (a.packedAt ?? a.date).localeCompare(b.packedAt ?? b.date));
    // กำลังทำ = ใกล้เสร็จขึ้นก่อน (กำลังผลิต → … → รอชำระเงิน) — ใบที่ลูกค้าจะมาถามถึงก่อนอยู่บนสุด
    g.working.sort((a, b) => ORDER_STATUSES.indexOf(b.status) - ORDER_STATUSES.indexOf(a.status));
    g.done.sort((a, b) => (b.pickedUpAt ?? "").localeCompare(a.pickedUpAt ?? ""));
    return g;
  }, [all]);

  // ค้นหา = ลูกค้ายืนอยู่ตรงหน้า → หาทุกกองพร้อมกัน ไม่ต้องเดาว่าใบอยู่แท็บไหน
  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;
  const found = useMemo(() => {
    if (!searching) return [];
    const nd = digits(needle);
    const rank: Record<Group, number> = { ready: 0, working: 1, done: 2 };
    return all
      .filter((r) => r.customer.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle) || (nd.length >= 3 && (digits(r.phone ?? "").includes(nd) || digits(r.id).includes(nd))))
      .sort((a, b) => rank[a.group] - rank[b.group]);
  }, [all, needle, searching]);

  // ยังไม่เลือกแท็บเอง → เปิดกองที่ต้องลงมือก่อน: มีของรอรับ = รอมารับ · ไม่มี = กำลังทำ
  const active: Group = tab ?? (by.ready.length || !by.working.length ? "ready" : "working");
  const shown = searching ? found : by[active];
  const longest = by.ready.reduce((m, r) => Math.max(m, waitedDays(r.packedAt)), 0);
  const stale = by.ready.filter((r) => waitedDays(r.packedAt) >= FOLLOW_UP_DAYS).length;
  const readyDue = by.ready.filter((r) => r.due > 0);
  const readyDueSum = readyDue.reduce((s, r) => s + r.due, 0);
  const open = by.ready.length + by.working.length;

  async function handOver(r: PickupRow) {
    if (busy) return;
    if (!window.confirm(`ลูกค้ารับของออเดอร์ ${r.id} (${r.customer || "ไม่ระบุชื่อ"}) ไปแล้วใช่ไหม?\nกดแล้วใบนี้ปิดงานเป็น “เสร็จสิ้น”`)) return;
    setBusy(r.id);
    setErr("");
    try {
      const res = await fetch("/api/admin/orders/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { row?: PickupRow; error?: string };
      if (!res.ok || !j.row) {
        setErr(j.error ?? "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง");
        return;
      }
      const u = j.row;
      setRows((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs);
      // ป้ายข้างเมนูนับใหม่ทันที (AdminShell ฟังอีเวนต์นี้)
      window.dispatchEvent(new Event("iducky:pickup-changed"));
    } finally {
      setBusy(null);
    }
  }

  if (rows === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงออเดอร์ที่ลูกค้ามารับเองจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="ลูกค้าที่มารับเอง"
        count={`${open} ใบ`}
        sub="ออเดอร์ที่เลือกวิธีส่ง “มารับเอง” ทั้งหมด — ลูกค้ามาถึงร้าน ค้นชื่อ เบอร์ หรือเลขออเดอร์ แล้วกดส่งมอบได้จากหน้านี้"
        tools={<SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อ / เบอร์โทร / เลขออเดอร์" />}
      />

      {reason && (
        <div className="mt-4">
          <Banner tone="warm" title="ดึงรายการไม่สำเร็จ" detail={reason} />
        </div>
      )}

      <Stats>
        <HeroStat
          n={by.ready.length}
          label="แพ็คเสร็จ รอลูกค้ามารับ"
          detail={by.ready.length ? "ของวางรออยู่หน้าร้าน" : "ยังไม่มีของรอรับ"}
          pct={open ? (by.ready.length / open) * 100 : 0}
        />
        <Stat label="กำลังทำ / ยังไม่โอน" value={by.working.length} hint="ยังไม่พร้อมให้รับ" />
        <Stat label="วางรอนานสุด" value={by.ready.length ? `${longest} วัน` : "—"} hint={stale ? `เกิน ${FOLLOW_UP_DAYS} วัน ${stale} ใบ ควรทักตาม` : "นับจากวันที่แพ็คเสร็จ"} tone={stale ? "due" : undefined} />
        <Stat wide label="ต้องเก็บเงินตอนมารับ" value={readyDue.length ? baht(readyDueSum) : "—"} hint={readyDue.length ? `${readyDue.length} ใบ ยังค้างยอด` : "ใบที่รอรับจ่ายครบแล้ว"} tone={readyDue.length ? "due" : undefined} />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={!searching && active === "ready"} onClick={() => (setQ(""), setTab("ready"))} label="แพ็คเสร็จ รอมารับ" count={by.ready.length} />
          <FChip on={!searching && active === "working"} onClick={() => (setQ(""), setTab("working"))} label="กำลังทำ / ยังไม่โอน" count={by.working.length} />
          <FChip on={!searching && active === "done"} onClick={() => (setQ(""), setTab("done"))} label="รับไปแล้ว" count={by.done.length} />
        </TabRow>
      </FilterCard>

      <ListHead
        title={searching ? `ผลค้นหา “${q.trim()}”` : active === "ready" ? "แพ็คเสร็จ — รอลูกค้ามารับ" : active === "working" ? "ยังไม่พร้อมให้รับ" : "ลูกค้ารับไปแล้ว"}
        note={searching ? `${found.length} ใบ · หาจากทุกกอง` : active === "ready" ? "วางรอนานสุดขึ้นก่อน" : active === "working" ? "ใกล้เสร็จขึ้นก่อน · ลูกค้ามาถามก็ตอบได้ว่าถึงขั้นไหน" : `ดูย้อนหลัง ${by.done.length} ใบล่าสุด`}
      />

      {err && (
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      {shown.length === 0 ? (
        <Empty
          title={searching ? "ไม่เจอใบที่ตรงกับคำค้น" : active === "ready" ? "ไม่มีของรอลูกค้ามารับ" : active === "working" ? "ไม่มีใบมารับเองที่กำลังทำ" : "ยังไม่มีใบที่ลูกค้ารับไปแล้ว"}
          body={
            searching
              ? "หน้านี้มีเฉพาะใบที่วิธีส่งเป็น “มารับเอง” — ถ้าลูกค้าเลือกส่งพัสดุไว้ ให้หาในเมนูคำสั่งซื้อ แล้วเปลี่ยนวิธีส่งในหน้าออเดอร์"
              : active === "ready"
                ? "พอฝ่ายแพ็คกด “แพ็คเสร็จ” ในหน้าออเดอร์ ใบจะขึ้นตรงนี้ พร้อมตัวเลขข้างเมนู"
                : active === "working"
                  ? "ออเดอร์ที่ลูกค้าเลือก “มารับเอง” ตอนสั่ง จะขึ้นตรงนี้จนกว่าจะแพ็คเสร็จ"
                  : "กด “ลูกค้ารับของแล้ว” ในกองรอมารับ ใบจะย้ายมาที่นี่"
          }
        />
      ) : (
        <Rows>
          {shown.map((r) => {
            const days = waitedDays(r.packedAt);
            const href = `/admin/orders/${encodeURIComponent(r.id)}`;
            return (
              <Row key={r.id} tone={TONE[r.group]} done={r.group === "done"}>
                <RowMain
                  name={r.customer || "ยังไม่ระบุชื่อ"}
                  href={href}
                  tags={
                    <>
                      <StatusChip s={r.status} label={r.label} />
                      {r.rush && <Tag tone="solid">งานเร่ง</Tag>}
                      {r.due > 0 && <Tag tone="coral">{r.group === "ready" ? `เก็บเงินก่อนส่งมอบ ${baht(r.due)}` : `ยังค้าง ${baht(r.due)}`}</Tag>}
                      {r.group === "ready" && days >= FOLLOW_UP_DAYS && <Tag tone="yolk">วางรอมา {days} วัน — ทักตาม</Tag>}
                      {r.group === "done" && r.pickedUpAt && (
                        <Tag tone="quiet" title={r.pickedUpBy}>
                          รับของ {thTime(r.pickedUpAt)}
                        </Tag>
                      )}
                    </>
                  }
                  meta={
                    <>
                      <span className="id">{r.id}</span>
                      {r.phone && (
                        <a href={`tel:${digits(r.phone)}`} className="id" title="โทรหาลูกค้า">
                          ☎ {r.phone}
                        </a>
                      )}
                      {r.useByDate && r.group !== "done" && <span className="hot">ใช้งาน {r.useByDate}</span>}
                      {r.items.slice(0, 3).map((t, i) => (
                        <span key={i}>{t}</span>
                      ))}
                      {r.items.length > 3 && <span>+ อีก {r.items.length - 3} รายการ</span>}
                      {r.packedAt && r.group === "ready" && (
                        <span>
                          แพ็คเสร็จ {thTime(r.packedAt)} · {r.packedBy}
                        </span>
                      )}
                      {r.group === "done" && r.pickedUpBy && <span>ส่งมอบโดย {r.pickedUpBy}</span>}
                    </>
                  }
                />
                <RowSide>
                  {r.group === "ready" && mayHandOver && r.due <= 0 ? (
                    <Btn small tone="navy" disabled={busy === r.id} onClick={() => void handOver(r)} title="จดคนส่งมอบ/เวลา แล้วปิดงานเป็นเสร็จสิ้น">
                      {busy === r.id ? "กำลังบันทึก…" : "✓ ลูกค้ารับของแล้ว"}
                    </Btn>
                  ) : null}
                  <Btn small tone={r.group === "ready" && r.due > 0 ? "navy" : undefined} href={href}>
                    {r.group === "ready" && r.due > 0 ? "เปิดใบ → เก็บเงิน" : "เปิดออเดอร์"}
                  </Btn>
                </RowSide>
              </Row>
            );
          })}
        </Rows>
      )}
    </PageShell>
  );
}

export default function PickupPage() {
  return (
    <RequirePerm perm="orders.view">
      <PickupInner />
    </RequirePerm>
  );
}
