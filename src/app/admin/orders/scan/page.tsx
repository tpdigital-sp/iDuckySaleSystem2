"use client";

/**
 * สถานีแพ็ค–ส่ง /admin/orders/scan  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * คนที่ใช้: ฝ่ายแพ็คยืนหน้าโต๊ะ มือถือข้างเดียว เครื่องยิงอีกข้าง
 * ช่องยิงจึงใหญ่เต็มความกว้างและอยู่บนสุด · ใบที่ยังยิงไม่ได้บอกเหตุผลตรง ๆ ในแถว
 * ไม่ใช่แค่ปุ่มเทา — จะได้รู้ว่าต้องไปทำอะไรก่อน
 *
 *  • ยิงเลขพัสดุ: ยิง QR เลขออเดอร์ → ยิงเลขพัสดุ + ลิสต์ออเดอร์ที่ตรวจแพ็คครบ
 *  • รอปริ้น/แพ็ค: ออเดอร์ที่แบบผ่านแล้ว ยังตรวจแพ็คไม่ครบ
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
  Tab,
  TabRow,
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
type Tab = "scan" | "print";

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

/**
 * สถานีแพ็ค–ส่ง — 2 แท็บ
 *  • ยิงเลขพัสดุ: ยิง QR เลขออเดอร์ → ยิงเลขพัสดุ + ลิสต์ออเดอร์ที่ตรวจแพ็คครบ พร้อมยิง
 *  • รอปริ้น/แพ็ค: ออเดอร์ที่แบบผ่านแล้ว ยังตรวจแพ็คไม่ครบ — ปริ้นใบงานไปทำ/แพ็ค
 */
export default function ScanTrackingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<Tab>("scan");
  const [target, setTarget] = useState<Order | null>(null); // ออเดอร์ที่รอเลขพัสดุ
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<{ id: string; tracking: string; at: string }[]>([]);
  const [blocked, setBlocked] = useState<{ order: Order; gate: PackGate } | null>(null);
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

  const focusInput = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (tab !== "scan") return;
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, [focusInput, target, tab]);

  // ── แยกออเดอร์เป็น 2 กอง ตามผลตรวจแพ็ค ──
  const { toScan, toPrint } = useMemo(() => {
    const active = orders.filter((o) => FULFILL.includes(o.status) && !o.tracking);
    return {
      toScan: active.filter((o) => packGate(o).ready), // ตรวจครบ → พร้อมยิง
      toPrint: active.filter((o) => !packGate(o).ready), // ยังไม่ครบ → รอปริ้น/แพ็ค
    };
  }, [orders]);

  function reset(message?: Msg) {
    setTarget(null);
    setValue("");
    setMsg(message ?? null);
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
      // ── ด่านกันพลาด: ต้องตรวจแพ็คครบก่อนถึงยิงเลขพัสดุได้ ──
      const gate = packGate(found);
      if (!gate.ready) {
        setBlocked({ order: found, gate });
        setMsg(null);
        return;
      }
      setTarget(found);
      setMsg({
        kind: "info",
        text: found.tracking ? `ออเดอร์นี้มีเลขพัสดุแล้ว (${found.tracking}) — ยิงใหม่เพื่อแทนที่` : "ยิงเลขพัสดุต่อได้เลย",
      });
      setTimeout(focusInput, 50);
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
    setHistory((h) =>
      [{ id: next.id, tracking: v, at: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) }, ...h].slice(0, 12)
    );
    reset({ kind: "ok", text: `บันทึกแล้ว — ${next.id} · ${v}` });
  }


  const waiting = !target;

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="สถานีแพ็ค–ส่ง"
        sub="ปริ้นใบงาน → แพ็ค+ตรวจ → ยิงเลขพัสดุ"
        live={demo ? { ok: false, text: "โหมดตัวอย่าง — การบันทึกจะไม่ถูกเก็บถาวร" } : { ok: true, text: "ออเดอร์จริง" }}
        tools={<Btn href="/admin/orders">คำสั่งซื้อทั้งหมด</Btn>}
      />

      <div className="mt-4">
        <div className="dkb-g px-3 py-3">
          <TabRow>
            <Tab on={tab === "scan"} onClick={() => setTab("scan")} label="ยิงเลขพัสดุ" count={toScan.length} />
            <Tab on={tab === "print"} onClick={() => setTab("print")} label="รอปริ้น/แพ็ค" count={toPrint.length} />
          </TabRow>
        </div>
      </div>

      {tab === "scan" ? (
        <>
          {/* ── ช่องรับการยิง — ใหญ่ที่สุดในหน้า เพราะเป็นสิ่งเดียวที่ต้องใช้ ── */}
          <form onSubmit={onSubmit} className="mt-4">
            <div className="dkb-g dkb-scanbox">
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

          {/* ── ออเดอร์ที่กำลังรอเลขพัสดุ ── */}
          {target && (
            <div className="dkb-g mt-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="dkb-code text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                    {target.id}
                  </p>
                  <p className="dkb-display text-[1.05rem]">{target.customer}</p>
                  <p className="text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
                    {target.phone}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--dk-faint)" }}>
                    {target.address}
                  </p>
                </div>
                <StatusChip s={target.status} label={orderStatusLabel(target)} />
              </div>
              <div className="mt-3">
                <Btn small onClick={() => reset({ kind: "info", text: "ยกเลิกแล้ว — ยิง QR ออเดอร์ใหม่ได้เลย" })}>
                  ยกเลิก / เปลี่ยนออเดอร์
                </Btn>
              </div>
            </div>
          )}

          <ListHead title="ตรวจแพ็คครบแล้ว พร้อมยิงเลข" note={`${toScan.length} ใบ`} />
          {toScan.length === 0 ? (
            <Empty title="ยังไม่มีออเดอร์พร้อมยิง" body="ไปที่แท็บ “รอปริ้น/แพ็ค” แล้วตรวจนับของให้ครบก่อน" />
          ) : (
            <Rows>
              {toScan.map((o) => (
                <Row key={o.id} tone="var(--dk-mint)" href={`/admin/orders/${encodeURIComponent(o.id)}`}>
                  <RowMain
                    name={o.customer || "ยังไม่ระบุชื่อ"}
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
                    <StatusChip s={o.status} label={orderStatusLabel(o)} />
                  </RowSide>
                </Row>
              ))}
            </Rows>
          )}

          {history.length > 0 && (
            <>
              <ListHead title="บันทึกแล้วรอบนี้" note={`${history.length} ใบ`} />
              <Rows>
                {history.map((h, i) => (
                  <Row key={`${h.id}-${i}`} tone="var(--dk-quiet)" done>
                    <RowMain
                      name={h.id}
                      href={`/admin/orders/${encodeURIComponent(h.id)}`}
                      meta={
                        <>
                          <span className="id">{h.tracking}</span>
                          <span>ยิงเมื่อ {h.at}</span>
                        </>
                      }
                    />
                    <RowSide>
                      <Tag tone="quiet">จัดส่งแล้ว</Tag>
                    </RowSide>
                  </Row>
                ))}
              </Rows>
            </>
          )}
        </>
      ) : (
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
