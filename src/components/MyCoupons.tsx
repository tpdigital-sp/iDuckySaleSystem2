"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/products";
import { getAccessToken } from "@/lib/customer-auth";

interface MyCoupon {
  code: string;
  type: "percent" | "fixed";
  value: number;
  label: string;
  minSpend: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  status: "active" | "redeemed" | "void";
  usable: boolean;
  note: string | null;
}

/** วันหมดอายุแบบสั้น + จำนวนวันที่เหลือ */
function expiryText(iso: string | null): { text: string; soon: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return null;
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  const d = new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  if (days < 0) return { text: `หมดอายุ ${d}`, soon: false };
  if (days === 0) return { text: "หมดอายุวันนี้", soon: true };
  if (days <= 7) return { text: `เหลืออีก ${days} วัน (${d})`, soon: true };
  return { text: `ใช้ได้ถึง ${d}`, soon: false };
}

const STATUS_BADGE: Record<MyCoupon["status"], { text: string; cls: string }> = {
  active: { text: "ใช้ได้", cls: "bg-emerald-100 text-emerald-700" },
  redeemed: { text: "ใช้แล้ว", cls: "bg-stone-200 text-stone-500" },
  void: { text: "ยกเลิก", cls: "bg-stone-200 text-stone-500" },
};

/** ชุดสีของคูปองแต่ละใบ (วนตามลำดับ) — ใช้ย้อมแบนเนอร์ตอนเลือกคูปองไว้ใช้ */
const CP_COLORS = [
  { badge: "#C6E8FB", deep: "#2C81C4", soft: "#E2F3FE", mid: "#F2FAFF", border: "rgba(44,129,196,.35)", shadow: "rgba(44,129,196,.18)", strong: "rgba(44,129,196,.32)" },
  { badge: "#CFF0E3", deep: "#137A5C", soft: "#EAF6EC", mid: "#F4FBF5", border: "rgba(19,122,92,.32)", shadow: "rgba(19,122,92,.16)", strong: "rgba(19,122,92,.28)" },
  { badge: "#FFD3DC", deep: "#F2456B", soft: "#FFE9ED", mid: "#FFF4F6", border: "rgba(242,69,107,.32)", shadow: "rgba(242,69,107,.16)", strong: "rgba(242,69,107,.28)" },
];

/** เงื่อนไขย่อของคูปอง 1 บรรทัด (ใช้ในโมดัล/ใต้หัวข้อแบนเนอร์) */
function condText(c: MyCoupon): string {
  const parts = [c.minSpend ? `ยอดขั้นต่ำ ${formatPrice(c.minSpend)}` : "ไม่มียอดขั้นต่ำ"];
  if (c.type === "percent" && c.maxDiscount) parts.push(`ลดสูงสุด ${formatPrice(c.maxDiscount)}`);
  const exp = expiryText(c.expiresAt);
  if (exp) parts.push(exp.text);
  return parts.join(" · ");
}

/**
 * คูปองของฉัน
 * variant "dash" = หน้าบัญชีแบบแดชบอร์ด (แบนเนอร์ตั๋วตามต้นแบบ USER PROFILE UPDATE_02 · สไตล์ .acd-coupon ใน landing.css)
 *   แตะแบนเนอร์ = เลือกคูปอง 1 ใบไว้ใช้ออเดอร์ถัดไป → เก็บโค้ดลง localStorage "ducky_coupon" ให้หน้าชำระเงินหยิบไปใช้ต่อ
 */
export default function MyCoupons({ variant }: { variant?: "dash" } = {}) {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null); // ที่เลือกอยู่ในโมดัล
  const [applied, setApplied] = useState<string | null>(null); // ที่เลือกไว้ใช้จริง
  const [popped, setPopped] = useState(false); // ภาพของขวัญ/เป็ดเด้งเข้ามาแล้ว

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return setCoupons([]);
      const res = await fetch("/api/coupons/mine", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const list: MyCoupon[] = data.coupons ?? [];
      setCoupons(list);
      // เคยเลือกคูปองไว้แล้ว (หน้าชำระเงินอ่านคีย์เดียวกัน) — ยังใช้ได้ก็โชว์ต่อ
      const saved = localStorage.getItem("ducky_coupon");
      if (saved && list.some((c) => c.code === saved && c.usable)) setApplied(saved);
    })();
  }, []);

  // ภาพของขวัญ/เป็ดเด้งเข้ามาตอนเลื่อนถึงโซนคูปอง
  useEffect(() => {
    if (variant !== "dash") return;
    const t = setTimeout(() => setPopped(true), 250);
    return () => clearTimeout(t);
  }, [variant]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      /* คลิปบอร์ดไม่พร้อม — ข้าม */
    }
  }

  function applyPicked() {
    if (!picked) return;
    localStorage.setItem("ducky_coupon", picked);
    setApplied(picked);
    setPickOpen(false);
  }
  function clearApplied() {
    localStorage.removeItem("ducky_coupon");
    setApplied(null);
    setPicked(null);
  }

  // ยังโหลดอยู่ → ไม่แสดงอะไร (กันกระพริบ)
  if (coupons === null) return null;

  const usableCount = coupons.filter((c) => c.usable).length;

  if (variant === "dash") {
    const usable = coupons.filter((c) => c.usable);
    const appliedCp = usable.find((c) => c.code === applied) ?? null;
    const color = appliedCp ? CP_COLORS[usable.indexOf(appliedCp) % CP_COLORS.length] : null;
    const cpVars = color
      ? ({
          "--cp-soft": color.soft,
          "--cp-mid": color.mid,
          "--cp-border": color.border,
          "--cp-deep": color.deep,
          "--cp-shadow": color.shadow,
          "--cp-shadow-strong": color.strong,
        } as React.CSSProperties)
      : undefined;
    const clickable = usable.length > 0;

    return (
      <>
        <div
          className={`acd-coupon${clickable ? " clickable" : ""}`}
          style={cpVars}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={() => {
            if (!clickable) return;
            setPicked(applied);
            setPickOpen(true);
          }}
          onKeyDown={(e) => {
            if (!clickable) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPicked(applied);
              setPickOpen(true);
            }
          }}
        >
          <div className="acd-gift-spacer" />
          <div className="acd-gift-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`acd-gift${popped ? " pop-in" : ""}`} src="/account/coupon-gift.webp" alt="" aria-hidden="true" />
          </div>
          <div className="acd-coupon-txt">
            {appliedCp ? (
              <>
                <h3>
                  {appliedCp.label}
                  <span className="acd-applied-tag">พร้อมใช้ ✓</span>
                </h3>
                <p>{condText(appliedCp)} · แตะเพื่อเปลี่ยนคูปอง</p>
              </>
            ) : clickable ? (
              <>
                <h3>มีคูปองให้เลือกใช้</h3>
                <p>แตะเพื่อเลือกคูปองที่อยากใช้จากทั้งหมดที่มี</p>
              </>
            ) : (
              <>
                <h3>ยังไม่มีคูปอง</h3>
                <p>สั่งซื้อและติดตามโปรโมชั่นเพื่อรับคูปองนะ</p>
              </>
            )}
          </div>
          <div className="acd-duck-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`acd-duck-side${popped ? " pop-in" : ""}`} src="/account/coupon-duck.webp" alt="" aria-hidden="true" />
          </div>
          {clickable && <div className="acd-cp-chev">›</div>}
          {appliedCp ? (
            <button
              type="button"
              className="acd-cp-badge is-remove"
              aria-label="เอาคูปองออก"
              title="เอาคูปองออก"
              onClick={(e) => {
                e.stopPropagation();
                clearApplied();
              }}
            >
              ✕
            </button>
          ) : (
            clickable && <span className="acd-cp-badge">{usable.length}</span>
          )}
        </div>

        {/* โมดัลเลือกคูปอง — เลือกได้ใบเดียว ระบบจำไว้ให้ตอนไปหน้าชำระเงิน */}
        {pickOpen && (
          <div className="acd-modal" onClick={(e) => e.target === e.currentTarget && setPickOpen(false)}>
            <div className="acd-modal-box wide" role="dialog" aria-modal="true" aria-labelledby="cpn-pick-h">
              <button type="button" className="acd-modal-close" aria-label="ปิด" onClick={() => setPickOpen(false)}>
                ✕
              </button>
              <h3 id="cpn-pick-h">เลือกคูปองของคุณ</h3>
              <div className="acd-modal-sub">แตะเพื่อเลือกคูปอง 1 ใบสำหรับใช้ในออเดอร์ถัดไป</div>
              <div className="acd-modal-list">
                {usable.map((c, i) => {
                  const col = CP_COLORS[i % CP_COLORS.length];
                  const on = picked === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className={`acd-cp-opt${on ? " selected" : ""}`}
                      style={on ? { borderColor: col.deep, background: col.soft, boxShadow: `0 0 0 3px ${col.border}` } : undefined}
                      onClick={() => setPicked(c.code)}
                    >
                      <div className="co-badge" style={{ background: col.badge }}>
                        <b>{c.type === "percent" ? `${c.value}%` : `฿${c.value}`}</b>
                        <span>ส่วนลด</span>
                      </div>
                      <div className="co-info">
                        <h4>{c.label}</h4>
                        <p>{condText(c)}</p>
                      </div>
                      <div className="co-radio" style={on ? { borderColor: col.deep, background: col.deep } : undefined}>
                        {on ? "✓" : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="acd-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPickOpen(false)}>
                  ยกเลิก
                </button>
                <button type="button" className="btn btn-primary" onClick={applyPicked} disabled={!picked}>
                  ใช้คูปองนี้
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <section className={variant === "dash" ? "acd-coupon-sec" : undefined}>
      {/* สไตล์ .cpn-* / .acc-sec-title อยู่ใน (shop)/landing.css — ใช้ในหน้า /account (ครอบด้วย .dl) */}
      <div className="acc-sec-title">
        <b>🎟️ คูปองของฉัน</b>
        {usableCount > 0 && <span className="cpn-count">ใช้ได้ {usableCount} ใบ</span>}
      </div>

      {coupons.length === 0 ? (
        <div className="cpn-empty">
          <span style={{ fontSize: "1.6rem" }}>🎫</span>
          <p>ยังไม่มีคูปอง — สั่งซื้อและติดตามโปรโมชั่นเพื่อรับคูปองนะ</p>
        </div>
      ) : (
        <div className="cpn-grid">
          {coupons.map((c) => {
            const exp = expiryText(c.expiresAt);
            const badge = STATUS_BADGE[c.status];
            const dim = !c.usable;
            return (
              <div key={c.code} className={`cpn${dim ? " dim" : ""}`}>
                {/* แถบซ้าย = มูลค่าส่วนลด (ดีไซน์ตั๋ว) */}
                <div className="cpn-stub">
                  <b>{c.type === "percent" ? `${c.value}%` : `฿${c.value}`}</b>
                  <small>ส่วนลด</small>
                </div>

                {/* เส้นประรอยฉีกตั๋ว */}
                <div className="cpn-tear" />

                {/* รายละเอียด */}
                <div className="cpn-body">
                  <div className="cpn-code-row">
                    <code className="cpn-code">{c.code}</code>
                    <span className={`cpn-badge ${badge.cls}`}>{badge.text}</span>
                  </div>

                  <ul className="cpn-cond">
                    {c.minSpend ? <li>ยอดขั้นต่ำ {formatPrice(c.minSpend)}</li> : <li>ไม่มียอดขั้นต่ำ</li>}
                    {c.type === "percent" && c.maxDiscount ? <li>ลดสูงสุด {formatPrice(c.maxDiscount)}</li> : null}
                    {exp && <li className={exp.soon ? "soon" : ""}>{exp.text}</li>}
                  </ul>

                  {c.usable && (
                    <button type="button" onClick={() => copyCode(c.code)} className="cpn-copy">
                      {copied === c.code ? "✓ คัดลอกแล้ว" : "📋 คัดลอกโค้ด"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
