"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { forgetOrderLink, orderLinkHref, readOrderLinks, type OrderLink } from "@/lib/my-order-links";
import { LINE_URL } from "@/components/LineButton";

/*
 * 🔎 ตามหาออเดอร์ — ทางเข้าออเดอร์สำหรับลูกค้าที่ "ไม่ได้สมัครสมาชิก" (เจ้าของร้านสั่ง 21 ก.ย. 69)
 *
 * เคสจริง: ลูกค้าสั่ง+แนบสลิปตอนกลางคืน พอปิดเว็บก็กลับเข้าออเดอร์ไม่ได้ จึงไปกดเข้าสู่ระบบ
 * → ขึ้นรหัสผ่านไม่ถูก (เพราะไม่เคยสมัคร) → กดลืมรหัสก็ไม่มีอีเมลมา (ไม่มีบัญชีอีเมลนั้น)
 * สุดท้ายแอดมินต้องส่งลิงก์ให้ทางไลน์เอง
 *
 * หน้านี้ให้ 2 ทาง โดยไม่ต้องใช้อีเมล/รหัสผ่านเลย
 *  ① ออเดอร์ที่เคยเปิดในเครื่องนี้ — จำไว้ให้อัตโนมัติ (lib/my-order-links) กดเข้าได้ทันที
 *  ② ค้นด้วย เบอร์โทรที่สั่ง + เลขออเดอร์ (4 ตัวท้ายก็พอ) — ใช้ได้แม้เปลี่ยนเครื่อง/ล้างประวัติ
 *
 * ชุดดีไซน์เดียวกับหน้าเข้าสู่ระบบ (.auth-* ใน landing.css)
 */

interface Found {
  id: string;
  key: string;
  date: string;
  statusLabel: string;
  total: number;
  customer: string;
}

/** ปิดบังชื่อผู้รับ — ยืนยันว่า "ใบนี้ของเรา" ได้โดยไม่เปิดชื่อเต็มบนจอ */
function maskName(name: string): string {
  const s = name.trim();
  if (s.length <= 2) return s;
  return `${s.slice(0, 2)}${"•".repeat(Math.min(s.length - 2, 6))}`;
}

export default function FindOrderPage() {
  const [mine, setMine] = useState<OrderLink[] | null>(null); // null = ยังอ่านไม่เสร็จ
  const [phone, setPhone] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);

  // localStorage อ่านได้เฉพาะฝั่งเบราว์เซอร์ — อ่านหลัง mount กัน hydration ไม่ตรง
  useEffect(() => setMine(readOrderLinks()), []);

  async function search() {
    setErr("");
    setFound(null);
    if (!phone.trim() || !orderNo.trim()) {
      setErr("กรอกทั้งเบอร์โทรและเลขออเดอร์ก่อนนะครับ");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/orders/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, order: orderNo }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้งครับ");
    const j = (await res.json().catch(() => ({}))) as { orders?: Found[]; error?: string };
    if (!res.ok) return setErr(j.error ?? "ค้นหาไม่สำเร็จ");
    setFound(j.orders ?? []);
  }

  function forget(id: string) {
    forgetOrderLink(id);
    setMine(readOrderLinks());
  }

  return (
    <div className="dl dl-page auth-page">
      <div className="top-stack auth-stack">
        <img className="bg-cloud auth-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud auth-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <div className="auth-wrap">
          <div className="auth-card">
            <img src="/account/duck-reset.svg" alt="" className="auth-art" style={{ maxWidth: 196 }} width={343} height={303} />
            <h1 className="auth-h1">
              ตามหา<em>ออเดอร์ของคุณ</em>
            </h1>
            <p className="auth-sub">เช็คสถานะ · ดูแบบงานที่กราฟฟิกทำ · แนบสลิป — ไม่ต้องสมัครสมาชิก</p>

            {/* ── ① ออเดอร์ที่เคยเปิดในเครื่องนี้ ── */}
            {mine === null ? (
              <p className="auth-hint" style={{ textAlign: "center", marginTop: 18 }}>
                กำลังเปิดดูออเดอร์ในเครื่องนี้…
              </p>
            ) : mine.length > 0 ? (
              <>
                <div className="auth-orders-h">
                  <b>ออเดอร์ในเครื่องนี้</b>
                  <span>กดเพื่อเปิดได้เลย</span>
                </div>
                <div className="auth-orders">
                  {mine.map((l) => (
                    <div key={l.id} style={{ position: "relative" }}>
                      <Link href={orderLinkHref(l)} className="auth-order">
                        <span className="no">{l.id}</span>
                        <span className="meta">
                          {l.name ? `${l.name} · ` : ""}
                          {typeof l.total === "number" && l.total > 0 ? <span className="sum">{formatPrice(l.total)}</span> : "เปิดดูสถานะล่าสุด"}
                        </span>
                        <span className="go" aria-hidden="true">
                          ›
                        </span>
                      </Link>
                      <button type="button" className="auth-forget" onClick={() => forget(l.id)} aria-label={`เอาออเดอร์ ${l.id} ออกจากเครื่องนี้`} title="เอาออกจากเครื่องนี้">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="auth-msg ok" style={{ textAlign: "left" }}>
                เครื่องนี้ยังไม่มีออเดอร์ที่เคยเปิดไว้ — กรอก <b>เบอร์โทรที่ใช้ตอนสั่ง</b> กับ <b>เลขออเดอร์</b> ด้านล่าง เดี๋ยวเราพากลับเข้าออเดอร์ให้ครับ
              </p>
            )}

            {/* ── ② ค้นด้วยเบอร์โทร + เลขออเดอร์ ── */}
            <div className="auth-orders-h">
              <b>ค้นหาออเดอร์</b>
              <span>ใช้ได้ทุกเครื่อง</span>
            </div>
            <div className="auth-form" style={{ marginTop: 10 }}>
              <input
                className="auth-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))}
                inputMode="tel"
                placeholder="เบอร์โทรที่ใช้ตอนสั่ง *"
                aria-label="เบอร์โทรที่ใช้ตอนสั่ง"
              />
              <input
                className="auth-input"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                placeholder="เลขออเดอร์ เช่น OD-260921-1234 *"
                aria-label="เลขออเดอร์"
                onKeyDown={(e) => e.key === "Enter" && !busy && search()}
              />
              <p className="auth-hint">* จำเป็นทั้งคู่ — เลขออเดอร์จำได้แค่ 4 ตัวท้ายก็ใส่ 4 ตัวท้ายได้ครับ</p>
            </div>

            {err && <p className="auth-msg err">{err}</p>}

            <div className="auth-actions">
              <button type="button" onClick={search} disabled={busy} className="btn btn-yolk">
                {busy ? "กำลังค้นหา…" : "ค้นหาออเดอร์"} <span className="dot">→</span>
              </button>
            </div>

            {found && found.length > 0 && (
              <>
                <div className="auth-orders-h">
                  <b>เจอแล้ว {found.length} ใบ</b>
                  <span>กดเพื่อเปิด</span>
                </div>
                <div className="auth-orders">
                  {found.map((o) => (
                    <Link key={o.id} href={orderLinkHref(o)} className="auth-order">
                      <span className="no">{o.id}</span>
                      <span className="meta">
                        {o.date} · {o.statusLabel}
                        {o.customer ? ` · ${maskName(o.customer)}` : ""} · <span className="sum">{formatPrice(o.total)}</span>
                      </span>
                      <span className="go" aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            <div className="auth-or">หาไม่เจอ?</div>
            <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="auth-line">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d="M12 3C6.9 3 2.8 6.4 2.8 10.5c0 3.7 3.2 6.8 7.6 7.4.3.06.7.2.8.45.1.23.06.58.03.81l-.13.77c-.04.23-.18.9.79.49s5.23-3.08 7.13-5.27c1.31-1.44 1.94-2.9 1.94-4.65C20.96 6.4 16.9 3 12 3Z" />
              </svg>
              ทักไลน์ร้าน — ขอลิงก์ออเดอร์
            </a>
            <p className="auth-hint" style={{ textAlign: "center", marginTop: 10 }}>
              เป็นสมาชิกอยู่แล้ว?{" "}
              <Link href="/account/login" className="auth-link">
                เข้าสู่ระบบเพื่อดูประวัติทั้งหมด
              </Link>
            </p>
          </div>

          <Link href="/products" className="auth-back">
            ← เลือกซื้อสินค้าต่อ
          </Link>
        </div>
      </div>
    </div>
  );
}
