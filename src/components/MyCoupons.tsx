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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-amber-500">🎟️ คูปองของฉัน</h2>
        {usableCount > 0 && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
            ใช้ได้ {usableCount} ใบ
          </span>
        )}
      </div>

      {coupons.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-amber-200 bg-amber-50/40 p-5 text-center">
          <span className="text-2xl">🎫</span>
          <p className="mt-1 text-xs text-stone-500">ยังไม่มีคูปอง — สั่งซื้อและติดตามโปรโมชั่นเพื่อรับคูปองนะ</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {coupons.map((c) => {
            const exp = expiryText(c.expiresAt);
            const badge = STATUS_BADGE[c.status];
            const dim = !c.usable;
            return (
              <div
                key={c.code}
                className={`relative flex overflow-hidden rounded-2xl ring-1 ${
                  dim ? "bg-stone-50 ring-stone-200" : "bg-white ring-amber-200"
                }`}
              >
                {/* แถบซ้าย = มูลค่าส่วนลด (ดีไซน์ตั๋ว) */}
                <div
                  className={`flex w-24 shrink-0 flex-col items-center justify-center px-2 py-3 text-center ${
                    dim ? "bg-stone-100 text-stone-400" : "bg-gradient-to-br from-amber-400 to-amber-500 text-white"
                  }`}
                >
                  <span className="text-2xl font-extrabold leading-none">
                    {c.type === "percent" ? `${c.value}%` : `฿${c.value}`}
                  </span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-90">ส่วนลด</span>
                </div>

                {/* เส้นประรอยฉีกตั๋ว */}
                <div className={`w-px border-l border-dashed ${dim ? "border-stone-300" : "border-amber-300"}`} />

                {/* รายละเอียด */}
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className={`truncate font-mono text-sm font-bold ${dim ? "text-stone-400" : "text-amber-950"}`}>
                      {c.code}
                    </code>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.text}</span>
                  </div>

                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-stone-500">
                    {c.minSpend ? <li>• ยอดขั้นต่ำ {formatPrice(c.minSpend)}</li> : <li>• ไม่มียอดขั้นต่ำ</li>}
                    {c.type === "percent" && c.maxDiscount ? <li>• ลดสูงสุด {formatPrice(c.maxDiscount)}</li> : null}
                    {exp && <li className={exp.soon ? "font-semibold text-rose-500" : ""}>• {exp.text}</li>}
                  </ul>

                  {c.usable && (
                    <button
                      type="button"
                      onClick={() => copyCode(c.code)}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 transition hover:bg-amber-100"
                    >
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
