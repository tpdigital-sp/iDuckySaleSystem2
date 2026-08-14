"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { orderBalance, orderTotal, STATUS_STYLES, type Order } from "@/lib/admin-data";
import { fetchShopPayment, tiersConfigOf } from "@/lib/shop-settings";
import { nextTier, paidSpend, tierColor, tierForSpend, type Tier } from "@/lib/tiers";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken, signOut } from "@/lib/customer-auth";
import MyCoupons from "@/components/MyCoupons";

/** ลิงก์เปิดหน้าเช็คออเดอร์ (ต้องมี key ถึงเปิดได้) */
const orderHref = (o: Order) => `/order/${encodeURIComponent(o.id)}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading } = useCustomer();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tierList, setTierList] = useState<Tier[] | null>(null);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const token = await getAccessToken();
      const [res, sett] = await Promise.all([
        fetch("/api/orders/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetchShopPayment(),
      ]);
      setOrders(res.orders ?? []);
      setTierList(tiersConfigOf(sett));
    })();
  }, [customer]);

  if (loading || !customer) {
    return (
      <div className="dl">
        <div className="acc-loading">กำลังโหลด…</div>
      </div>
    );
  }

  async function logout() {
    await signOut();
    router.push("/products");
  }

  const latest = orders?.[0];
  const displayName = customer.name || "สมาชิก";

  // ── ระดับสมาชิก ──
  const spend = orders ? paidSpend(orders) : 0;
  const tier = orders && tierList ? tierForSpend(spend, tierList) : null;
  const next = orders && tierList ? nextTier(spend, tierList) : null;
  const progressPct = next && next.minSpend > 0 ? Math.min(100, Math.round((spend / next.minSpend) * 100)) : 100;

  return (
    <div className="dl dl-page">
      {/* ── แถบฟ้าหัวหน้า (ผืนเดียวกับหน้าแรก): โปรไฟล์ + สรุป ── */}
      <div className="top-stack">
        <section className="acc-top">
          <div className="acc-wrap">
            <div className="acc-hero">
              <span className="acc-ava">{(customer.name || customer.email).slice(0, 1).toUpperCase()}</span>
              <div>
                <h1>{displayName}</h1>
                <p className="acc-mail">{customer.email}</p>
              </div>
            </div>

            <div className="acc-grid">
              {/* ระดับสมาชิก — สีเฉพาะตามระดับ (อิงโลหะ/อัญมณี) */}
              {tier &&
                (() => {
                  const { gradient, pill } = tierColor(tier, tierList?.findIndex((t) => t.id === tier.id) ?? 0);
                  return (
                    <div className="acc-tier" style={{ background: gradient }}>
                      <div className="acc-tier-row">
                        <div>
                          <p className="acc-eyebrow">ระดับสมาชิก</p>
                          <p className="acc-tier-name">
                            {tier.icon} {tier.name}
                            {tier.discountPct > 0 && (
                              <span className="acc-tier-pill" style={{ color: pill }}>
                                ลด {tier.discountPct}%
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="acc-spend">
                          ยอดสะสม
                          <b>{formatPrice(spend)}</b>
                        </p>
                      </div>
                      {next ? (
                        <>
                          <div className="acc-bar">
                            <i style={{ width: `${progressPct}%` }} />
                          </div>
                          <p className="acc-next">
                            อีก <b>{formatPrice(Math.max(0, next.minSpend - spend))}</b> ขึ้นระดับ {next.icon} {next.name} (ลด {next.discountPct}%)
                          </p>
                        </>
                      ) : (
                        <p className="acc-next">🎉 คุณอยู่ระดับสูงสุดแล้ว!</p>
                      )}
                    </div>
                  );
                })()}

              {/* ออเดอร์ล่าสุด (ไฮไลต์) */}
              {orders === null ? (
                <div className="acc-card acc-empty">
                  <p>กำลังโหลด…</p>
                </div>
              ) : latest ? (
                <Link href={orderHref(latest)} className="acc-card">
                  <p className="acc-eyebrow">ออเดอร์ล่าสุด</p>
                  <div className="acc-order-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="acc-order-id">{latest.id}</p>
                      <p className="acc-order-sub">
                        {latest.date} · {latest.items.length} รายการ
                      </p>
                    </div>
                    <span className={`acc-badge ring-1 ${STATUS_STYLES[latest.status]}`}>{latest.status}</span>
                  </div>
                  <div className="acc-order-foot">
                    <span className="acc-order-hint">{latest.tracking ? `พัสดุ: ${latest.tracking}` : "แตะเพื่อดู/อนุมัติแบบ"}</span>
                    {orderBalance(latest) > 0 ? (
                      <span className="acc-due">ค้างชำระ {formatPrice(orderBalance(latest))}</span>
                    ) : (
                      <span className="acc-price">{formatPrice(orderTotal(latest))}</span>
                    )}
                  </div>
                </Link>
              ) : (
                <div className="acc-card acc-empty">
                  <span style={{ fontSize: "1.9rem" }}>🧾</span>
                  <p>ยังไม่มีคำสั่งซื้อ</p>
                  <Link className="btn btn-yolk" href="/products">
                    ไปเลือกสินค้า <span className="dot">→</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ── คูปอง + เมนู + ออกจากระบบ ── */}
      <div className="acc-wrap acc-body">
        <MyCoupons />

        <div>
          <div className="acc-sec-title">
            <b>⚙️ เมนูบัญชี</b>
          </div>
          <div className="acc-menu">
            <div className="acct-list">
              <MenuRow href="/account/orders" icon="🧾" label="ประวัติการสั่งซื้อ" hint={orders ? `${orders.length} ออเดอร์` : ""} />
              <MenuRow href="/account/profile" icon="👤" label="ข้อมูลส่วนตัว" hint="ชื่อ · เบอร์ · ที่อยู่" />
              <MenuRow href="/how-to-order" icon="❓" label="วิธีสั่งซื้อ" />
            </div>
          </div>
        </div>

        <button type="button" onClick={logout} className="acc-out">
          🚪 ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

/** แถวเมนู — หน้าตา/สไตล์ชุดเดียวกับดรอปดาวน์บัญชีบนแถบเมนู (.acct-item ใน landing.css) */
function MenuRow({ href, icon, label, hint }: { href: string; icon: string; label: string; hint?: string }) {
  return (
    <Link href={href} className="acct-item">
      <span className="acct-ico">{icon}</span>
      <span className="acct-txt">
        <span className="acct-lb">{label}</span>
        {hint && <span className="acct-hint">{hint}</span>}
      </span>
      <svg className="acct-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </Link>
  );
}
