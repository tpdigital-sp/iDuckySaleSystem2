"use client";

/*
 * โครงหน้าบัญชี (ใช้ร่วมกันทุกหน้าใน /account)
 * ─ พื้นหลังฟ้า-เมฆลอย + เมนูข้าง + คอลัมน์เนื้อหา ─ หน้าตาเดียวกับหน้าแรกและแดชบอร์ด
 * สไตล์ทั้งหมดอยู่ใน landing.css prefix .acd-  (ห้ามใช้คลาส Tailwind สีน้ำตาล/amber ในหน้าเหล่านี้)
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/lib/customer-auth";
import { clearMyOrders } from "@/lib/my-orders";
import { ORDER_STEPS, STEP_OF, orderBalance, type Order } from "@/lib/admin-data";
import { formatPrice } from "@/lib/products";

/* ───────── ไอคอนเมนู (ไฟล์ภาพจริงที่ public/account/menu) ───────── */
export type IcoName = "home" | "orders" | "proof" | "files" | "profile" | "address" | "howto" | "production" | "receipt" | "claim" | "review" | "bell";
const ICO_ALT: Record<IcoName, string> = {
  home: "บัญชีของฉัน",
  orders: "ประวัติการสั่งซื้อ",
  proof: "อนุมัติแบบ",
  files: "ไฟล์งานของฉัน",
  profile: "ข้อมูลส่วนตัว",
  address: "ที่อยู่จัดส่ง",
  howto: "วิธีสั่งซื้อ",
  production: "ติดตามสถานะการผลิต",
  receipt: "ใบเสร็จ",
  claim: "แจ้งปัญหา",
  review: "รีวิว",
  bell: "แจ้งเตือน",
};
export function MenuIco({ name }: { name: IcoName }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/account/menu/${name}.webp`} alt="" title={ICO_ALT[name]} loading="lazy" />;
}
/** ไอคอนในเมนูข้าง — วงกลมพื้นฟ้าครอบภาพ */
export function NavIco({ name }: { name: IcoName }) {
  return (
    <span className="ico">
      <MenuIco name={name} />
    </span>
  );
}

/* ───────── เมนูข้าง ───────── */
export type AccountTab = "home" | "orders" | "proof" | "files" | "profile" | "address" | "howto";

export function AccountSideNav({
  active,
  proofHref = "/account/orders",
  proofCount = 0,
  onFiles,
  onLogout,
}: {
  active: AccountTab;
  proofHref?: string;
  proofCount?: number;
  onFiles?: () => void;
  onLogout: () => void;
}) {
  /** แถวที่เป็นหน้าปัจจุบัน = ป้ายนิ่ง (ไม่ใช่ลิงก์) ให้รู้ว่าอยู่ตรงไหน */
  const row = (key: AccountTab, ico: IcoName, label: ReactNode, href: string) =>
    active === key ? (
      <span key={key} className="on" aria-current="page">
        <NavIco name={ico} /> {label}
      </span>
    ) : (
      <Link key={key} href={href}>
        <NavIco name={ico} /> {label}
      </Link>
    );

  return (
    <aside className="acd-side">
      <nav className="acd-sidenav" aria-label="เมนูบัญชี">
        {row("home", "home", "บัญชีของฉัน", "/account")}
        {row("orders", "orders", "ประวัติการสั่งซื้อ", "/account/orders")}
        {row(
          "proof",
          "proof",
          <>
            อนุมัติแบบ {proofCount > 0 && <span className="acd-sidedot" />}
          </>,
          proofHref,
        )}
        {onFiles ? (
          <button type="button" onClick={onFiles}>
            <NavIco name="files" /> ไฟล์งานของฉัน
          </button>
        ) : (
          row("files", "files", "ไฟล์งานของฉัน", "/account/orders")
        )}
        {row("profile", "profile", "ข้อมูลส่วนตัว", "/account/profile")}
        {row("address", "address", "ที่อยู่จัดส่ง", "/account/profile")}
        {row("howto", "howto", "วิธีสั่งซื้อ", "/how-to-order")}
        <hr />
        <button type="button" className="logout" onClick={onLogout}>
          ออกจากระบบ
        </button>
      </nav>
    </aside>
  );
}

/* ───────── โครงหน้า ───────── */
export function AccountShell({
  active,
  proofHref,
  proofCount,
  onFiles,
  children,
}: {
  active: AccountTab;
  proofHref?: string;
  proofCount?: number;
  onFiles?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [logoutAsk, setLogoutAsk] = useState(false);

  async function logout() {
    clearMyOrders();
    await signOut();
    router.replace("/");
  }

  return (
    <div className="dl dl-page acd-page">
      <div className="top-stack acd-stack">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud acd-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud acd-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg-cloud acd-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <div className="acd-wrap acd-dash">
          <div className="acd-grid">
            <AccountSideNav active={active} proofHref={proofHref} proofCount={proofCount} onFiles={onFiles} onLogout={() => setLogoutAsk(true)} />
            <div className="acd-content">{children}</div>
          </div>
        </div>
      </div>

      {logoutAsk && (
        <div className="acd-modal" onClick={(e) => e.target === e.currentTarget && setLogoutAsk(false)}>
          <div className="acd-modal-box" role="dialog" aria-modal="true" aria-labelledby="acd-logout-h">
            <button type="button" className="acd-modal-close" aria-label="ปิด" onClick={() => setLogoutAsk(false)}>
              ✕
            </button>
            <div className="acd-confirm-icon">🚪</div>
            <h3 id="acd-logout-h">ออกจากระบบ?</h3>
            <p className="acd-modal-sub">คุณต้องเข้าสู่ระบบใหม่อีกครั้งเพื่อดูข้อมูลบัญชีและออเดอร์ของคุณ</p>
            <div className="acd-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setLogoutAsk(false)} autoFocus>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary" onClick={logout}>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── หัวเรื่องของหน้า ───────── */
export function AccountHead({ ico, title, sub, back = true }: { ico: IcoName; title: string; sub?: ReactNode; back?: boolean }) {
  return (
    <div className="acd-head">
      {back && (
        <Link href="/account" className="acd-head-back">
          ← บัญชีของฉัน
        </Link>
      )}
      <div className="acd-head-row">
        <span className="acd-head-ico">
          <MenuIco name={ico} />
        </span>
        <div className="acd-head-txt">
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ───────── แถบขั้นตอนออเดอร์ (ใช้ทั้งแดชบอร์ดและหน้าประวัติ) ───────── */
export const STEP_ICONS = ["✓", "💳", "🖼️", "🏭", "🚚"];

/** ไอคอนหน้าป้ายสถานะ */
export function statusIcon(o: Order): string {
  if (o.status === "รอชำระเงิน" || o.status === "รอตรวจสอบ") return "⏳";
  if (o.status === "ยกเลิก") return "✕";
  return STEP_ICONS[Math.min(STEP_OF[o.status], 4)];
}

/** ป้ายขั้นตอนตามสถานะจริง (ขั้นที่กำลังทำเปลี่ยนคำให้ตรงกับที่ค้างอยู่) */
export function stepLabel(i: number, o: Order): string {
  const cur = STEP_OF[o.status];
  if (i === 0) return "สั่งซื้อสำเร็จ";
  if (i === 1) return cur > 1 ? "ชำระเงินแล้ว" : o.status === "รอตรวจสอบ" ? "รอตรวจสลิป" : "รอชำระเงิน";
  if (i === 2) return cur > 2 ? "อนุมัติแบบแล้ว" : o.status === "แก้ไขแบบ" ? "กำลังแก้แบบ" : o.status === "รอตรวจแบบ" ? "รอคุณตรวจแบบ" : "ทำแบบงาน";
  if (i === 3) return cur > 3 ? "ผลิตเสร็จ" : "กำลังผลิต";
  return o.status === "เสร็จสิ้น" ? "จัดส่งสำเร็จ" : o.status === "จัดส่งแล้ว" ? "จัดส่งแล้ว" : "จัดส่ง";
}

export function stepTime(i: number, o: Order): string {
  const cur = STEP_OF[o.status];
  if (i === 0) return o.date;
  if (i === 1 && cur === 1) return orderBalance(o) > 0 ? `ค้างชำระ ${formatPrice(orderBalance(o))}` : "รอตรวจสอบ";
  if (i === 4 && o.tracking) return `พัสดุ ${o.tracking}`;
  if (i < cur) return "เรียบร้อย";
  return "—";
}

/** แถบขั้นตอน 5 จุด · compact = ซ่อนบรรทัดเวลา ใช้ในการ์ดรายการ */
export function OrderTracker({ order, compact = false }: { order: Order; compact?: boolean }) {
  const cur = STEP_OF[order.status];
  return (
    <div className={`acd-tracker${compact ? " compact" : ""}`}>
      {ORDER_STEPS.map((_, i) => {
        const cls = i < cur ? " done" : i === cur ? " current" : "";
        return (
          <div key={i} className={`acd-tstep${cls}`}>
            <span className="tline" />
            <div className="tdot">{STEP_ICONS[i]}</div>
            <div className="tlabel">{stepLabel(i, order)}</div>
            {!compact && <div className="ttime">{stepTime(i, order)}</div>}
          </div>
        );
      })}
    </div>
  );
}
