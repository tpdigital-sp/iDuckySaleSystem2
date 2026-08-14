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

export default function MyCoupons() {
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

  return (
    <section>
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
