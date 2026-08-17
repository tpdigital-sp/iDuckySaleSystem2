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

/** สั้น ๆ: ภาพของขวัญ + เป็ด (SVG ตามไฟล์ต้นแบบหน้าบัญชี) */
const GiftSvg = () => (
  <svg className="acd-gift" viewBox="0 0 60 60" aria-hidden="true">
    <rect x="12" y="24" width="36" height="28" rx="4" fill="#fff" />
    <rect x="12" y="24" width="36" height="10" fill="#FFD447" />
    <rect x="27" y="24" width="6" height="28" fill="#57B6E8" />
    <path d="M30 24 Q20 8 12 18 Q14 26 30 24Z" fill="#57B6E8" />
    <path d="M30 24 Q40 8 48 18 Q46 26 30 24Z" fill="#57B6E8" />
  </svg>
);
const DuckSvg = () => (
  <svg className="acd-duck-side" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="55" r="34" fill="#FFD447" />
    <circle cx="66" cy="40" r="9" fill="#FFD447" />
    <path d="M70 38 Q80 35 78 44 Q73 44 70 42Z" fill="#FF9E4A" />
    <circle cx="69" cy="38" r="2.6" fill="#173A6B" />
    <circle cx="36" cy="68" r="5" fill="#FFC7D6" />
    <rect x="60" y="60" width="16" height="12" rx="3" fill="#2C81C4" />
    <text x="68" y="69" fontFamily="Mitr" fontSize="9" fill="#fff" textAnchor="middle">
      %
    </text>
  </svg>
);

/**
 * คูปองของฉัน
 * variant "dash" = หน้าบัญชีแบบแดชบอร์ด (แบนเนอร์เหลืองตามไฟล์ต้นแบบ · สไตล์ .acd-coupon ใน landing.css)
 */
export default function MyCoupons({ variant }: { variant?: "dash" } = {}) {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) return setCoupons([]);
      const res = await fetch("/api/coupons/mine", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      setCoupons(data.coupons ?? []);
    })();
  }, []);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      /* คลิปบอร์ดไม่พร้อม — ข้าม */
    }
  }

  // ยังโหลดอยู่ → ไม่แสดงอะไร (กันกระพริบ)
  if (coupons === null) return null;

  const usableCount = coupons.filter((c) => c.usable).length;

  if (variant === "dash" && coupons.length === 0) {
    return (
      <div className="acd-coupon">
        <span className="acd-star" style={{ left: "6%", top: "20%", fontSize: "1.1rem" }}>
          ✦
        </span>
        <span className="acd-star" style={{ left: "15%", top: "64%", fontSize: ".8rem", animationDelay: "-1.2s" }}>
          ✦
        </span>
        <GiftSvg />
        <div className="acd-coupon-txt">
          <h3>ยังไม่มีคูปอง</h3>
          <p>สั่งซื้อและติดตามโปรโมชั่นเพื่อรับคูปองนะ</p>
        </div>
        <DuckSvg />
      </div>
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
