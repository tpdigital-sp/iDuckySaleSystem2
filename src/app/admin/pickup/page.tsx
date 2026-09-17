"use client";

/**
 * 🏪 ลูกค้าที่มารับเอง /admin/pickup — เมนูกลุ่มงานขาย (เจ้าของร้านสั่ง 17 ก.ย. 69)
 *
 * ลูกค้าเดินมาหน้าร้านแล้วบอกชื่อ/เบอร์/เลขออเดอร์ → หาใบเจอในช่องค้นหาทันที ไม่ต้องไล่ลิสต์คำสั่งซื้อทั้งร้าน
 * 📅 จัดวางรอบ 2 (เจ้าของร้านสั่ง "ให้วันที่มารับเด่น"): ทุกแถวมีบล็อกวันนัดรับตัวใหญ่ซ้ายสุด และรายการเรียงเป็นกลุ่มตามวัน
 *    วันนี้ → เลยวันนัด → พรุ่งนี้ → ถัดไป → ยังไม่ระบุวัน · วันนัดรับ = Order.shipDate (ช่อง "วันที่จัดส่ง" ในหน้าออเดอร์)
 * ใบที่ยังไม่โอน (รอชำระเงิน) ไม่เข้าหน้านี้ — API ตัดออกให้แล้ว
 * ตัวเลขข้างเมนู (AdminShell) = ใบ "แพ็คเสร็จ รอมารับ" → ของที่วางรออยู่หน้าร้าน
 * ปุ่ม "✓ ลูกค้ารับของแล้ว" = จดคนส่งมอบ/เวลา + ปิดงานเป็นเสร็จสิ้น (ใบค้างยอดกดไม่ได้ ต้องเก็บเงินในหน้าออเดอร์ก่อน)
 */

import RequirePerm from "@/components/RequirePerm";
import { useCan } from "@/lib/perm-context";
import { useCallback, useEffect, useMemo, useState } from "react";
import StatusChip from "@/components/admin/StatusChip";
import { usePolling } from "@/lib/use-polling";
import { addDays, shortThaiDay, todayBkkYmd } from "@/lib/ship-date";
import { bkkParts } from "@/lib/bangkok-time";
import { Banner, Btn, Empty, FChip, FilterCard, HeroStat, ListHead, PageHead, PageShell, Row, RowDate, RowMain, RowSide, Rows, SearchBox, Stat, Stats, TabRow, Tag } from "@/components/admin/ui";
import type { PickupRow } from "@/app/api/admin/orders/pickup/route";

type View = "open" | "ready" | "working" | "done";
/** กลุ่มตามวันนัดรับ — ลำดับนี้คือลำดับที่โชว์บนจอ (ลูกค้าที่ยืนอยู่หน้าร้านส่วนใหญ่คือนัดวันนี้) */
type Bucket = "today" | "late" | "tomorrow" | "later" | "none";
const BUCKETS: Bucket[] = ["today", "late", "tomorrow", "later", "none"];

const thTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};
const baht = (n: number) => `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const digits = (s: string) => s.replace(/\D/g, "");

/** เวลา ISO → วันที่ตามเวลาไทย YYYY-MM-DD */
function isoToBkkDay(iso: string): string {
  const p = bkkParts(new Date(iso));
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** ห่างกันกี่วัน (b − a) ของ YYYY-MM-DD สองค่า */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** ชิ้นส่วนของวันที่สำหรับบล็อกวันที่: "ศ." · "18" · "ก.ย." */
function dateParts(ymd: string): { wd: string; day: string; mon: string } {
  const d = new Date(`${ymd}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("th-TH", { timeZone: "UTC", ...o });
  return { wd: f({ weekday: "short" }), day: String(d.getUTCDate()), mon: f({ month: "short" }) };
}

/** ของวางรอมากี่วันแล้ว — ใบที่ค้างนานคือใบที่ต้องทักตามลูกค้า */
function waitedDays(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return isFinite(ms) && ms > 0 ? Math.floor(ms / 86_400_000) : 0;
}

/** ใบนี้อยู่กลุ่มวันไหน — นัดเป็นช่วงวัน: ยังอยู่ในช่วง = วันนี้ · เลยวันสุดท้ายของช่วง = เลยนัด */
function bucketOf(r: PickupRow, today: string): Bucket {
  if (!r.pickupDate) return "none";
  const last = r.pickupTo ?? r.pickupDate;
  if (last < today) return "late";
  if (r.pickupDate <= today) return "today";
  return r.pickupDate === addDays(today, 1) ? "tomorrow" : "later";
}

function PickupInner() {
  const can = useCan();
  const mayHandOver = can("orders.edit") || can("pack.ship");
  const [rows, setRows] = useState<PickupRow[] | null>(null);
  const [reason, setReason] = useState("");
  const [view, setView] = useState<View>("open");
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

  const today = todayBkkYmd();
  const all = useMemo(() => rows ?? [], [rows]);
  const open = useMemo(() => all.filter((r) => r.group !== "done"), [all]);
  const ready = useMemo(() => open.filter((r) => r.group === "ready"), [open]);
  const working = useMemo(() => open.filter((r) => r.group === "working"), [open]);
  const done = useMemo(() => all.filter((r) => r.group === "done").sort((a, b) => (b.pickedUpAt ?? "").localeCompare(a.pickedUpAt ?? "")), [all]);

  // ค้นหา = ลูกค้ายืนอยู่ตรงหน้า → หาทุกกองพร้อมกัน ไม่ต้องเดาว่าใบอยู่แท็บไหน
  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;
  const found = useMemo(() => {
    if (!searching) return [];
    const nd = digits(needle);
    const rank = { ready: 0, working: 1, done: 2 } as const;
    return all
      .filter((r) => r.customer.toLowerCase().includes(needle) || r.id.toLowerCase().includes(needle) || (nd.length >= 3 && (digits(r.phone ?? "").includes(nd) || digits(r.id).includes(nd))))
      .sort((a, b) => rank[a.group] - rank[b.group]);
  }, [all, needle, searching]);

  /** แบ่งกลุ่มตามวันนัดรับ — ในกลุ่มเดียวกัน: วันใกล้สุดก่อน แล้วใบที่ยังไม่เสร็จขึ้นก่อน (คือใบที่ต้องเร่ง) */
  const sections = useMemo(() => {
    const src = view === "ready" ? ready : view === "working" ? working : open;
    const g: Record<Bucket, PickupRow[]> = { today: [], late: [], tomorrow: [], later: [], none: [] };
    for (const r of src) g[bucketOf(r, today)].push(r);
    for (const k of BUCKETS)
      g[k].sort((a, b) => (a.pickupDate ?? "").localeCompare(b.pickupDate ?? "") || Number(a.group === "ready") - Number(b.group === "ready") || a.id.localeCompare(b.id));
    return g;
  }, [view, open, ready, working, today]);

  const inBucket = (k: Bucket) => open.filter((r) => bucketOf(r, today) === k);
  const dueToday = inBucket("today");
  const dueTodayReady = dueToday.filter((r) => r.group === "ready").length;
  const late = inBucket("late");
  const lateNotReady = late.filter((r) => r.group === "working").length;
  const tomorrow = inBucket("tomorrow");
  const readyDue = ready.filter((r) => r.due > 0);
  const readyDueSum = readyDue.reduce((s, r) => s + r.due, 0);

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

  /** บล็อกวันที่ซ้ายสุดของแถว — ใบที่รับไปแล้วโชว์วันที่รับจริง */
  function dateBlock(r: PickupRow) {
    if (r.group === "done") {
      const ymd = r.pickedUpAt ? isoToBkkDay(r.pickedUpAt) : r.pickupDate;
      return ymd ? <RowDate {...dateParts(ymd)} note="รับแล้ว" tone="done" title={r.pickedUpAt ? `รับของ ${thTime(r.pickedUpAt)}` : undefined} /> : <RowDate note="รับแล้ว" tone="done" />;
    }
    if (!r.pickupDate) return <RowDate note="ยังไม่นัดวัน" tone="none" title="ยังไม่ได้ระบุวันนัดรับ — กรอกช่อง “วันที่จัดส่ง” ในหน้าออเดอร์" />;
    const b = bucketOf(r, today);
    const p = dateParts(r.pickupDate);
    const n = dayDiff(today, r.pickupDate);
    const note = b === "today" ? "วันนี้" : b === "tomorrow" ? "พรุ่งนี้" : b === "late" ? `เลย ${dayDiff(r.pickupTo ?? r.pickupDate, today)} วัน` : `อีก ${n} วัน`;
    return (
      <RowDate
        wd={p.wd}
        day={p.day}
        mon={r.pickupTo ? `ถึง ${shortThaiDay(r.pickupTo).replace(/^\S+\s/, "")}` : p.mon}
        note={note}
        tone={b === "today" ? "today" : b === "late" ? "late" : b === "tomorrow" ? "soon" : "later"}
        title={`นัดรับ ${shortThaiDay(r.pickupDate)}${r.pickupTo ? ` – ${shortThaiDay(r.pickupTo)}` : ""}`}
      />
    );
  }

  function rowOf(r: PickupRow) {
    const b = r.group === "done" ? null : bucketOf(r, today);
    const days = waitedDays(r.packedAt);
    const href = `/admin/orders/${encodeURIComponent(r.id)}`;
    // นัดถึงแล้ว/เลยนัด แต่ของยังไม่เสร็จ = ใบที่ร้านต้องเร่ง → แถบซ้ายคอรัล
    const behind = r.group === "working" && (b === "today" || b === "late");
    const tone = r.group === "done" ? "var(--dk-faint)" : behind ? "var(--dk-coral-deep)" : r.group === "ready" ? "var(--dk-mint)" : "var(--dk-yolk)";
    return (
      <Row key={r.id} tone={tone} done={r.group === "done"}>
        {dateBlock(r)}
        <RowMain
          name={r.customer || "ยังไม่ระบุชื่อ"}
          href={href}
          tags={
            <>
              <StatusChip s={r.status} label={r.label} />
              {r.rush && <Tag tone="solid">งานเร่ง</Tag>}
              {behind && <Tag tone="coral">{b === "today" ? "นัดรับวันนี้ ของยังไม่เสร็จ" : "เลยวันนัด ของยังไม่เสร็จ"}</Tag>}
              {r.group === "ready" && b === "late" && <Tag tone="yolk">เลยวันนัด ยังไม่มารับ — ทักตาม</Tag>}
              {r.due > 0 && <Tag tone="coral">{r.group === "ready" ? `เก็บเงินก่อนส่งมอบ ${baht(r.due)}` : `ยังค้าง ${baht(r.due)}`}</Tag>}
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
              {r.useByDate && r.group !== "done" && <span className={r.useByDate <= today ? "hot" : undefined}>ใช้งาน {shortThaiDay(r.useByDate)}</span>}
              {r.items.slice(0, 3).map((t, i) => (
                <span key={i}>{t}</span>
              ))}
              {r.items.length > 3 && <span>+ อีก {r.items.length - 3} รายการ</span>}
              {r.packedAt && r.group === "ready" && (
                <span>
                  แพ็คเสร็จ {thTime(r.packedAt)} · {r.packedBy}
                  {days >= 1 ? ` · วางรอมา ${days} วัน` : ""}
                </span>
              )}
              {r.group === "done" && r.pickedUpAt && (
                <span>
                  รับของ {thTime(r.pickedUpAt)} · ส่งมอบโดย {r.pickedUpBy}
                </span>
              )}
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
  }

  if (rows === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงออเดอร์ที่ลูกค้ามารับเองจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  const SECTION: Record<Bucket, { title: string; note: string }> = {
    today: { title: `นัดรับวันนี้ · ${shortThaiDay(today)}`, note: "" },
    late: { title: "เลยวันนัดแล้ว ยังไม่ได้รับ", note: "ทักตามลูกค้า" },
    tomorrow: { title: `นัดรับพรุ่งนี้ · ${shortThaiDay(addDays(today, 1))}`, note: "" },
    later: { title: "นัดรับวันถัดไป", note: "" },
    none: { title: "ยังไม่ได้ระบุวันนัดรับ", note: "กรอกวันที่จัดส่งในหน้าออเดอร์" },
  };
  const flat = searching ? found : view === "done" ? done : null;
  const sectionTotal = BUCKETS.reduce((n, k) => n + sections[k].length, 0);
  const pick = (v: View) => (setQ(""), setView(v));

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="ลูกค้าที่มารับเอง"
        count={`${open.length} ใบ`}
        sub="ออเดอร์ “มารับเอง” ที่โอนแล้ว เรียงตามวันนัดรับ — ลูกค้ามาถึงร้าน ค้นชื่อ เบอร์ หรือเลขออเดอร์ แล้วกดส่งมอบได้จากหน้านี้"
        tools={<SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อ / เบอร์โทร / เลขออเดอร์" />}
      />

      {reason && (
        <div className="mt-4">
          <Banner tone="warm" title="ดึงรายการไม่สำเร็จ" detail={reason} />
        </div>
      )}

      <Stats>
        <HeroStat
          n={dueToday.length}
          label={`นัดรับวันนี้ · ${shortThaiDay(today)}`}
          detail={dueToday.length ? `แพ็คเสร็จแล้ว ${dueTodayReady} · ยังไม่เสร็จ ${dueToday.length - dueTodayReady}` : "วันนี้ไม่มีนัดรับ"}
          pct={dueToday.length ? (dueTodayReady / dueToday.length) * 100 : 0}
        />
        <Stat label="เลยวันนัด" value={late.length} hint={late.length ? (lateNotReady ? `ของยังไม่เสร็จ ${lateNotReady} ใบ` : "ของพร้อมแล้ว ทักตามลูกค้า") : "ไม่มีใบค้างนัด"} tone={late.length ? "due" : undefined} />
        <Stat label="นัดรับพรุ่งนี้" value={tomorrow.length} hint={tomorrow.length ? `แพ็คเสร็จแล้ว ${tomorrow.filter((r) => r.group === "ready").length} ใบ` : "ยังไม่มีนัด"} />
        <Stat
          wide
          label="แพ็คเสร็จ รอมารับ"
          value={ready.length}
          hint={readyDue.length ? `ต้องเก็บเงินตอนรับ ${baht(readyDueSum)} (${readyDue.length} ใบ)` : ready.length ? "จ่ายครบทุกใบ ส่งมอบได้เลย" : "ยังไม่มีของวางรอ"}
          tone={readyDue.length ? "due" : undefined}
        />
      </Stats>

      <FilterCard>
        <TabRow>
          <FChip on={!searching && view === "open"} onClick={() => pick("open")} label="ยังไม่ได้รับ ทั้งหมด" count={open.length} />
          <FChip on={!searching && view === "ready"} onClick={() => pick("ready")} label="แพ็คเสร็จ รอมารับ" count={ready.length} />
          <FChip on={!searching && view === "working"} onClick={() => pick("working")} label="กำลังทำ" count={working.length} />
          <FChip on={!searching && view === "done"} onClick={() => pick("done")} label="รับไปแล้ว" count={done.length} />
        </TabRow>
      </FilterCard>

      {err && (
        <p className="mt-3 text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      {flat ? (
        <>
          <ListHead title={searching ? `ผลค้นหา “${q.trim()}”` : "ลูกค้ารับไปแล้ว"} note={searching ? `${found.length} ใบ · หาจากทุกกอง` : `ดูย้อนหลัง ${done.length} ใบล่าสุด`} />
          {flat.length === 0 ? (
            <Empty
              title={searching ? "ไม่เจอใบที่ตรงกับคำค้น" : "ยังไม่มีใบที่ลูกค้ารับไปแล้ว"}
              body={
                searching
                  ? "หน้านี้มีเฉพาะใบ “มารับเอง” ที่โอนแล้ว — ถ้าลูกค้ายังไม่โอน หรือเลือกส่งพัสดุไว้ ให้หาในเมนูคำสั่งซื้อ"
                  : "กด “ลูกค้ารับของแล้ว” ในแถวที่แพ็คเสร็จ ใบจะย้ายมาที่นี่"
              }
            />
          ) : (
            <Rows>{flat.map(rowOf)}</Rows>
          )}
        </>
      ) : sectionTotal === 0 ? (
        <div className="mt-5">
          <Empty
            title={view === "ready" ? "ไม่มีของรอลูกค้ามารับ" : view === "working" ? "ไม่มีใบมารับเองที่กำลังทำ" : "ไม่มีออเดอร์มารับเองที่ค้างอยู่"}
            body={view === "ready" ? "พอฝ่ายแพ็คกด “แพ็คเสร็จ” ในหน้าออเดอร์ ใบจะขึ้นตรงนี้ พร้อมตัวเลขข้างเมนู" : "ออเดอร์ที่ลูกค้าเลือก “มารับเอง” และโอนแล้ว จะขึ้นตรงนี้จนกว่าจะมารับของ"}
          />
        </div>
      ) : (
        BUCKETS.filter((k) => sections[k].length).map((k) => (
          <section key={k}>
            <ListHead title={SECTION[k].title} note={`${sections[k].length} ใบ${SECTION[k].note ? ` · ${SECTION[k].note}` : ""}`} />
            <Rows>{sections[k].map(rowOf)}</Rows>
          </section>
        ))
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
