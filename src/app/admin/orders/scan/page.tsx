"use client";

/**
 * สถานีแพ็ค–ส่ง /admin/orders/scan  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * คนที่ใช้: ฝ่ายแพ็คยืนหน้าโต๊ะ มือถือข้างเดียว เครื่องยิงอีกข้าง
 *
 * โครงหน้า (บน → ล่าง):
 *  1. กล่องยิง — อยู่บนสุด "ตลอดเวลา" ไม่ผูกกับแท็บ ยิงได้ไม่ว่ากำลังดูรายการไหน
 *     ข้างในมีขั้นตอน ① เลขออเดอร์ → ② เลขพัสดุ และข้อมูลออเดอร์ที่กำลังรอเลข
 *  2. แถบไปป์ไลน์ 3 ขั้นตามงานจริง: รอปริ้น/แพ็ค → พร้อมยิง → ยิงแล้ว
 *     ตัวเลขใหญ่อ่านจากระยะแขน กดเพื่อสลับรายการข้างล่าง
 *  3. รายการของขั้นที่เลือก — แถวที่ยิงไม่ได้บอกเหตุผลตรง ๆ ในแถว ไม่ใช่แค่ปุ่มเทา
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import StatusChip, { STATUS_TONE } from "@/components/admin/StatusChip";
import {
  Banner,
  Btn,
  Empty,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Tag,
} from "@/components/admin/ui";
import {
  MOCK_ORDERS,
  orderStatusLabel,
  packGate,
  withLog,
  type Order,
  type OrderStatus,
  type PackGate,
} from "@/lib/admin-data";
import { fetchOrdersAdmin, saveOrderAdmin } from "@/lib/order-repo";
import { usePolling } from "@/lib/use-polling";

type Msg = { kind: "ok" | "err" | "info"; text: string } | null;
type Tab = "print" | "scan" | "done";

/** สถานะที่อยู่ในสายงานแพ็ค–ส่ง (แบบผ่านแล้ว ยังไม่ส่ง) */
const FULFILL: OrderStatus[] = ["อนุมัติแบบ", "กำลังผลิต"];

const qtyOf = (o: Order) => o.items.reduce((s, i) => s + i.qty, 0);

/**
 * ดึงเลขออเดอร์ออกจากสิ่งที่ยิงเข้ามา
 * รองรับทั้งโค้ดล้วน (OD-260722-8143) และลิงก์เต็ม (กรณียิงโดน QR ของมือถือ)
 */
function extractOrderId(raw: string): string {
  const v = raw.trim();
  const m = v.match(/OD-\d{6}-\d{4}/i);
  if (m) return m[0].toUpperCase();
  if (/^https?:\/\//i.test(v)) {
    const tail = v.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (tail) return decodeURIComponent(tail);
  }
  return v;
}

/** เวลาที่ยิงเลขพัสดุออเดอร์นี้ (ISO) — อ่านจากบรรทัด log ล่าสุดของการบันทึกเลข */
function trackedAt(o: Order): string | undefined {
  for (let i = (o.log?.length ?? 0) - 1; i >= 0; i--) {
    if (o.log![i].action === "บันทึกเลขพัสดุ") return o.log![i].at;
  }
  return undefined;
}

/** เวลาแบบสั้น "09:14" — วันที่ไม่ต้องซ้ำในแถว เพราะอยู่ที่หัวกลุ่มแล้ว */
function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/** หัวกลุ่มวัน: วันนี้ · เมื่อวาน · "31 ก.ค. 69" (พ.ศ. ตามที่ทีมใช้คุยกัน) */
function dayLabel(iso?: string): string {
  if (!iso) return "ไม่ทราบวันยิง";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "ไม่ทราบวันยิง";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "วันนี้";
  if (d.toDateString() === yesterday.toDateString()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

export default function ScanTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<Tab>("scan");
  const [target, setTarget] = useState<Order | null>(null); // ออเดอร์ที่รอเลขพัสดุ
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ order: Order; gate: PackGate } | null>(null);
  const [q, setQ] = useState(""); // ค้นหาในแท็บ "ยิงแล้ว"
  const [copied, setCopied] = useState<string | null>(null); // ออเดอร์ที่เพิ่งคัดลอกเลขพัสดุ
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetchOrdersAdmin();
    if (r.orders.length > 0) {
      setOrders(r.orders);
      setDemo(false);
    } else {
      setOrders(MOCK_ORDERS);
      setDemo(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // อัปเดตลิสต์เงียบ ๆ (ออเดอร์ใหม่ที่แบบผ่าน / ตรวจแพ็คเสร็จ จะโผล่เอง) — ไม่แตะช่องยิง
  const refresh = useCallback(async () => {
    if (busy || target) return; // กำลังยิงอยู่ อย่าทับ
    const r = await fetchOrdersAdmin();
    if (r.orders.length === 0) return;
    setOrders((cur) => (JSON.stringify(cur) === JSON.stringify(r.orders) ? cur : r.orders));
  }, [busy, target]);
  usePolling(refresh, { enabled: !demo });

  // ช่องยิงโฟกัสตลอด ไม่ว่าดูแท็บไหน — เครื่องยิงทำงานได้เสมอ
  // preventScroll: การคืนโฟกัสห้ามดึงจอเด้งขึ้นบน ระหว่างที่คนกำลังไล่ดูรายการข้างล่าง
  const focusInput = useCallback(() => inputRef.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput, target]);

  // ── แยกออเดอร์เป็น 2 กอง ตามผลตรวจแพ็ค ──
  const { toScan, toPrint } = useMemo(() => {
    const active = orders.filter((o) => FULFILL.includes(o.status) && !o.tracking);
    return {
      toScan: active.filter((o) => packGate(o).ready), // ตรวจครบ → พร้อมยิง
      toPrint: active.filter((o) => !packGate(o).ready), // ยังไม่ครบ → รอปริ้น/แพ็ค
    };
  }, [orders]);

  // ── ออเดอร์ที่มีเลขพัสดุในระบบแล้ว — ล่าสุดขึ้นก่อน (เรียงจากเวลาที่ยิงใน log) ──
  const scanned = useMemo(
    () =>
      orders
        .filter((o) => !!o.tracking)
        .map((o) => ({ o, at: trackedAt(o) }))
        .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")),
    [orders]
  );
  const scannedToday = useMemo(() => scanned.filter((s) => isToday(s.at)).length, [scanned]);

  // ── แท็บ "ยิงแล้ว": กรองตามคำค้น แล้วจัดกลุ่มตามวัน (เรียงล่าสุดอยู่แล้ว → กลุ่มติดกัน) ──
  const shipGroups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filtered = !s
      ? scanned
      : scanned.filter(
          ({ o }) =>
            o.id.toLowerCase().includes(s) ||
            (o.tracking ?? "").toLowerCase().includes(s) ||
            (o.customer ?? "").toLowerCase().includes(s)
        );
    const groups: { key: string; label: string; rows: typeof filtered }[] = [];
    for (const row of filtered) {
      const key = row.at ? new Date(row.at).toDateString() : "unknown";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else groups.push({ key, label: dayLabel(row.at), rows: [row] });
    }
    return groups;
  }, [scanned, q]);
  const shipCount = useMemo(() => shipGroups.reduce((n, g) => n + g.rows.length, 0), [shipGroups]);

  /** คัดลอกเลขพัสดุไปตอบลูกค้า — ติ๊กเขียวบนแถวสักครู่ให้รู้ว่าติดมือแล้ว */
  const copyTracking = useCallback((orderId: string, tracking: string) => {
    const done = () => {
      setCopied(orderId);
      window.setTimeout(() => setCopied((c) => (c === orderId ? null : c)), 1600);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(tracking).then(done);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = tracking;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    done();
  }, []);

  function reset(message?: Msg) {
    setTarget(null);
    setValue("");
    setMsg(message ?? null);
    setTimeout(focusInput, 50);
  }

  /** เลือกออเดอร์มารอยิงเลขพัสดุ (จาก QR หรือกดปุ่มในแถว) — เช็คด่านตรวจแพ็คก่อนเสมอ */
  function pickTarget(o: Order) {
    const gate = packGate(o);
    if (!gate.ready) {
      setBlocked({ order: o, gate });
      setMsg(null);
      return;
    }
    setTarget(o);
    setMsg({
      kind: "info",
      text: o.tracking ? `ออเดอร์นี้มีเลขพัสดุแล้ว (${o.tracking}) — ยิงใหม่เพื่อแทนที่` : "ยิงเลขพัสดุต่อได้เลย",
    });
    setTimeout(focusInput, 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v || busy) return;
    setValue("");

    // ── ขั้นที่ 1: ยิง QR เลขออเดอร์ ──
    if (!target) {
      const code = extractOrderId(v);
      const found = orders.find((o) => o.id.toLowerCase() === code.toLowerCase());
      if (!found) {
        setMsg({ kind: "err", text: `ไม่พบออเดอร์ “${code}” — ยิง QR บนใบงานอีกครั้ง` });
        setTimeout(focusInput, 50);
        return;
      }
      pickTarget(found);
      return;
    }

    // ── ขั้นที่ 2: ยิง/พิมพ์เลขพัสดุ ──
    setBusy(true);
    const next = withLog(
      { ...target, tracking: v, status: target.status === "เสร็จสิ้น" ? target.status : "จัดส่งแล้ว" },
      "แอดมิน",
      "บันทึกเลขพัสดุ",
      v
    );
    const ok = demo ? true : await saveOrderAdmin(next);
    setBusy(false);

    if (!ok) {
      setMsg({ kind: "err", text: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      setTimeout(focusInput, 50);
      return;
    }
    setOrders((os) => os.map((o) => (o.id === next.id ? next : o)));
    reset({ kind: "ok", text: `บันทึกแล้ว — ${next.id} · ${v}` });
  }

  const waiting = !target;

  const PIPE: { key: Tab; label: string; n: number; hint: string; tone: string }[] = [
    { key: "print", label: "รอปริ้น/แพ็ค", n: toPrint.length, hint: "ตรวจแพ็คยังไม่ครบ", tone: "var(--dk-coral-deep)" },
    { key: "scan", label: "พร้อมยิง", n: toScan.length, hint: "ตรวจครบ รอเลขพัสดุ", tone: "var(--dk-mint)" },
    { key: "done", label: "ยิงแล้ว", n: scanned.length, hint: `วันนี้ ${scannedToday} ใบ`, tone: "var(--dk-quiet)" },
  ];

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="สถานีแพ็ค–ส่ง"
        sub="ปริ้นใบงาน → แพ็ค+ตรวจ → ยิงเลขพัสดุ"
        live={demo ? { ok: false, text: "โหมดตัวอย่าง — การบันทึกจะไม่ถูกเก็บถาวร" } : { ok: true, text: "ออเดอร์จริง" }}
        tools={<Btn href="/admin/orders">คำสั่งซื้อทั้งหมด</Btn>}
      />

      {/* ── กล่องยิง — ใหญ่สุดและอยู่บนสุดตลอด ยิงได้ไม่ว่ากำลังดูรายการไหน ── */}
      <form onSubmit={onSubmit} className="mt-4">
        <div className="dkb-g dkb-scanbox">
          <div className="dkb-scansteps">
            <span className="dkb-scanstep" data-on={waiting ? "1" : undefined} data-done={waiting ? undefined : "1"}>
              <i>{waiting ? "1" : "✓"}</i>เลขออเดอร์
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
            <span className="dkb-scanstep" data-on={waiting ? undefined : "1"}>
              <i>2</i>เลขพัสดุ
            </span>
          </div>

          <label htmlFor="scan" className="big">
            {waiting ? "รอยิง QR เลขออเดอร์" : `รอเลขพัสดุของ ${target.id}`}
          </label>
          <span className="cap">
            {waiting ? "เอาเครื่องยิงจ่อที่ใบงาน หรือพิมพ์เลขเองก็ได้" : "ยิงเลขพัสดุ แล้วกด Enter"}
          </span>
          <div className="dkb-scanline">
            <input
              id="scan"
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                if (!blocked) setTimeout(focusInput, 120);
              }}
              autoComplete="off"
              autoFocus
              placeholder={waiting ? "ยิง QR หรือพิมพ์เลขออเดอร์" : "ยิงเลขพัสดุ"}
            />
          </div>
          <span className="cap mt-2 block">{busy ? "กำลังบันทึก…" : "ช่องนี้โฟกัสอยู่ตลอด — ยิงได้เลย"}</span>

          {/* ออเดอร์ที่กำลังรอเลขพัสดุ — อยู่ในกล่องเดียวกัน จะได้เห็นว่ากำลังยิงให้ใคร */}
          {target && (
            <div className="dkb-scantarget">
              <span className="who">{target.customer || "ยังไม่ระบุชื่อ"}</span>
              {target.phone && <span className="sub">{target.phone}</span>}
              {target.address && <span className="sub w-full">{target.address}</span>}
              <StatusChip s={target.status} label={orderStatusLabel(target)} />
              <Btn small onClick={() => reset({ kind: "info", text: "ยกเลิกแล้ว — ยิง QR ออเดอร์ใหม่ได้เลย" })}>
                ยกเลิก / เปลี่ยนออเดอร์
              </Btn>
            </div>
          )}
        </div>
      </form>

      {msg && (
        <div className="mt-3">
          {msg.kind === "err" ? (
            <Banner tone="hot" title={msg.text} />
          ) : msg.kind === "ok" ? (
            <div className="dkb-g px-4 py-3 text-[14px]" style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}>
              {msg.text}
            </div>
          ) : (
            <div className="dkb-g px-4 py-3 text-[14px]" style={{ background: "var(--dk-sky)", color: "var(--dk-blue-deep)" }}>
              {msg.text}
            </div>
          )}
        </div>
      )}

      {/* ── ไปป์ไลน์ 3 ขั้นตามงานจริง — ตัวเลขใหญ่ กดสลับรายการข้างล่าง ── */}
      <div className="dkb-pipe mt-4">
        {PIPE.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setTab(p.key)}
            aria-pressed={tab === p.key}
            className="dkb-g dkb-pipestep"
            style={{ ["--dk-tone" as string]: p.tone }}
          >
            <span className="lb">{p.label}</span>
            <span className="dkb-num n">{p.n}</span>
            <span className="hint">{p.hint}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="mt-5 grid gap-2">
          <div className="dkb-skel h-[64px]" />
          <div className="dkb-skel h-[64px]" />
          <div className="dkb-skel h-[64px]" />
        </div>
      ) : tab === "scan" ? (
        <>
          <ListHead title="ตรวจแพ็คครบแล้ว พร้อมยิงเลข" note={`${toScan.length} ใบ`} />
          {toScan.length === 0 ? (
            <Empty title="ยังไม่มีออเดอร์พร้อมยิง" body="ไปที่ขั้น “รอปริ้น/แพ็ค” แล้วตรวจนับของให้ครบก่อน" />
          ) : (
            <Rows>
              {toScan.map((o) => (
                <Row key={o.id} tone="var(--dk-mint)">
                  <RowMain
                    name={o.customer || "ยังไม่ระบุชื่อ"}
                    href={`/admin/orders/${encodeURIComponent(o.id)}`}
                    tags={<Tag tone="mint">พร้อมยิง</Tag>}
                    meta={
                      <>
                        <span className="id">{o.id}</span>
                        <span>{qtyOf(o)} ชิ้น</span>
                        <span>ตรวจนับครบ · ถ่ายรูปแล้ว</span>
                      </>
                    }
                  />
                  <RowSide>
                    <Btn tone="navy" small onClick={() => pickTarget(o)}>
                      ยิงเลขใบนี้
                    </Btn>
                  </RowSide>
                </Row>
              ))}
            </Rows>
          )}
        </>
      ) : tab === "print" ? (
        <>
          <ListHead title="แบบผ่านแล้ว รอปริ้นใบงาน + แพ็ค" note={`${toPrint.length} ใบ`} />
          {toPrint.length === 0 ? (
            <Empty title="ไม่มีออเดอร์รอปริ้น" body="ใบใหม่จะขึ้นตรงนี้เมื่อลูกค้ากดอนุมัติแบบ" />
          ) : (
            <Rows>
              {toPrint.map((o) => {
                const g = packGate(o);
                const need = [
                  g.uncounted.length ? `ตรวจนับ ${g.uncounted.length} รูป` : "",
                  g.unread.length ? `อ่านรายละเอียด ${g.unread.length} รายการ` : "",
                  g.unsampled.length ? `ใส่งานตัวอย่าง ${g.unsampled.length} รายการ` : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Row key={o.id} tone={STATUS_TONE[o.status]}>
                    <RowMain
                      name={o.customer || "ยังไม่ระบุชื่อ"}
                      href={`/admin/orders/${encodeURIComponent(o.id)}`}
                      tags={<Tag tone="coral">ยังยิงไม่ได้</Tag>}
                      meta={
                        <>
                          <span className="id">{o.id}</span>
                          <span>{qtyOf(o)} ชิ้น</span>
                          <span className="warn">{need ? `เหลือ ${need}` : "ยังไม่ได้ตรวจแพ็ค"}</span>
                        </>
                      }
                    />
                    <RowSide>
                      <Btn tone="navy" small href={`/admin/orders/${encodeURIComponent(o.id)}/print?doc=work`}>
                        ปริ้นใบงาน
                      </Btn>
                    </RowSide>
                  </Row>
                );
              })}
            </Rows>
          )}
        </>
      ) : (
        <>
          {/* ── ยิงแล้ว: ตารางเลขพัสดุ จัดกลุ่มตามวัน · เลขกดคัดลอกไปตอบลูกค้าได้เลย ── */}
          <ListHead title="เลขพัสดุที่ยิงเข้าระบบแล้ว" note={`${shipCount} ใบ · วันนี้ ${scannedToday} ใบ`} />
          {scanned.length === 0 ? (
            <Empty title="ยังไม่มีออเดอร์ที่ยิงเลขพัสดุ" body="ยิง QR ออเดอร์แรกที่กล่องข้างบน แล้วจะขึ้นตรงนี้" />
          ) : (
            <>
              <div className="mb-2.5 px-1">
                <SearchBox value={q} onChange={setQ} placeholder="ค้นหา เลขพัสดุ · เลขออเดอร์ · ชื่อลูกค้า" />
              </div>
              {shipCount === 0 ? (
                <Empty title={`ไม่พบ “${q.trim()}”`} body="ลองพิมพ์เลขพัสดุ เลขออเดอร์ หรือชื่อลูกค้าอีกครั้ง" />
              ) : (
                <div className="dkb-g dkb-ship">
                  <div className="dkb-shiphead" aria-hidden>
                    <span className="r">#</span>
                    <span>เลขออเดอร์</span>
                    <span>ลูกค้า</span>
                    <span>เลขพัสดุ · กดคัดลอกได้</span>
                    <span className="r">ชิ้น</span>
                    <span className="r">เวลา</span>
                    <span className="r">สถานะ</span>
                  </div>
                  {shipGroups.map((g) => (
                    <div key={g.key}>
                      <div className="dkb-shipday">
                        {g.label} <small>{g.rows.length} ใบ</small>
                      </div>
                      {g.rows.map(({ o, at }, i) => {
                        const odd = o.status !== "จัดส่งแล้ว" && o.status !== "เสร็จสิ้น";
                        return (
                          <div key={o.id} className="dkb-shiprow" data-odd={odd ? "1" : undefined}>
                            <span className="dkb-shipidx">{i + 1}</span>
                            <Link
                              href={`/admin/orders/${encodeURIComponent(o.id)}`}
                              className="dkb-shipid underline-offset-4 hover:underline"
                              title="เปิดหน้าออเดอร์"
                            >
                              {o.id}
                            </Link>
                            <span className="dkb-shipwho">{o.customer || "ยังไม่ระบุชื่อ"}</span>
                            <button
                              type="button"
                              className="dkb-shiptrk"
                              data-copied={copied === o.id ? "1" : undefined}
                              onClick={() => copyTracking(o.id, o.tracking!)}
                              title="กดเพื่อคัดลอกเลขพัสดุ"
                              aria-label={`คัดลอกเลขพัสดุ ${o.tracking}`}
                            >
                              {o.tracking}
                              {copied === o.id ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
                                  <path d="m4.5 12.5 5 5 10-11" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                  <rect x="8" y="8" width="12" height="12" rx="2.5" />
                                  <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                                </svg>
                              )}
                            </button>
                            <span className="dkb-shipqty">{qtyOf(o)} ชิ้น</span>
                            <span className="dkb-shiptime">{fmtTime(at)}</span>
                            <span className="dkb-shipst">
                              <StatusChip s={o.status} label={orderStatusLabel(o)} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── ด่านกันพลาด: ตรวจแพ็คไม่ครบ ยิงไม่ได้ ── */}
      {blocked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-title"
          className="fixed inset-0 z-[100] grid place-items-center p-4"
          style={{ background: "rgba(23,58,107,.62)", backdropFilter: "blur(4px)" }}
        >
          <div className="dkb w-full max-w-md rounded-[26px] p-5" style={{ boxShadow: "0 30px 60px rgba(23,58,107,.4)" }}>
            <h2 id="block-title" className="dkb-display text-[1.3rem]">
              ยังยิงเลขพัสดุไม่ได้
            </h2>
            <p className="dkb-code mt-1 text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
              {blocked.order.id}
            </p>
            <p className="text-[14px]">{blocked.order.customer}</p>

            <div
              className="mt-3 rounded-[18px] px-4 py-3"
              style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}
            >
              <p className="dkb-h2 text-[13px]">ต้องทำให้ครบก่อน</p>
              <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed">
                {blocked.gate.uncounted.length > 0 && <li>· ยังไม่ได้ตรวจนับของ {blocked.gate.uncounted.length} รูป</li>}
                {blocked.gate.unread.length > 0 && <li>· ยังไม่ได้ยืนยันอ่านรายละเอียด {blocked.gate.unread.length} รายการ</li>}
                {blocked.gate.unsampled.map((name, k) => (
                  <li key={`s-${k}`} className="font-semibold">
                    · ยังไม่ได้ยืนยันใส่งานตัวอย่าง: {name}
                  </li>
                ))}
                {blocked.gate.short.map((s, k) => (
                  <li key={k} className="font-semibold">
                    · ของไม่ครบ: {s.item} — นับได้ {s.got}
                    {s.need ? ` จาก ${s.need}` : ""} ชิ้น
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Btn tone="navy" href={`/admin/orders/${encodeURIComponent(blocked.order.id)}`}>
                เปิดหน้าออเดอร์เพื่อตรวจ
              </Btn>
              <Btn
                onClick={() => {
                  setBlocked(null);
                  setValue("");
                  setTimeout(focusInput, 50);
                }}
              >
                ปิด · ยิงออเดอร์อื่น
              </Btn>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
