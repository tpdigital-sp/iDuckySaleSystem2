"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { graphicWaitingItems, orderBalance, orderTotal, ORDER_STEPS, STEP_OF, type Order } from "@/lib/admin-data";
import { fetchShopPayment, tiersConfigOf } from "@/lib/shop-settings";
import { nextTier, paidSpend, tierForSpend, tiersOf, type Tier } from "@/lib/tiers";
import { useCustomer } from "@/lib/customer-context";
import { signOut, updateProfile } from "@/lib/customer-auth";
import { clearMyOrders, fetchMyOrders } from "@/lib/my-orders";
import { uploadAvatar } from "@/lib/avatar-upload";
import { LINE_URL } from "@/components/LineButton";
import MyCoupons from "@/components/MyCoupons";

/*
 * หน้า "บัญชีของฉัน" — พอร์ตจากไฟล์ต้นแบบ USER PROFILE UPDATE_03.html
 * โครง: เมนูข้าง (ซ้าย) + เนื้อหา (โปรไฟล์ → การ์ดระดับ/ออเดอร์ล่าสุด → ติดตามสถานะ (พับได้) → คูปอง → เมนูลิสต์)
 * สไตล์ทั้งหมดอยู่ใน landing.css ใต้หัวข้อ "หน้าบัญชี (แดชบอร์ด)" prefix .acd-
 */

/** ลิงก์เปิดหน้าเช็คออเดอร์ (ต้องมี key ถึงเปิดได้) */
const orderHref = (o: Order, sub = "") => `/order/${encodeURIComponent(o.id)}${sub}${o.key ? `?key=${encodeURIComponent(o.key)}` : ""}`;

/** สีกรอบรูป/ป้าย/การ์ด ตามระดับ — คีย์ด้วย id ระดับ (ไม่ตรงมาตรฐาน → วนตามลำดับ) */
const RING: Record<string, [string, string]> = {
  bronze: ["#F2A97C", "#C4703F"],
  silver: ["#D3E6FB", "#8FA6CC"],
  gold: ["#FFD879", "#E8A22E"],
  platinum: ["#7EE8C0", "#1C9B74"],
  diamond: ["#8ED6FF", "#B49AF0"],
};
const RING_ORDER = Object.keys(RING);
function ringOf(tier: Tier | null, index: number): [string, string] {
  if (!tier) return ["#57B6E8", "#2C81C4"];
  return RING[tier.id] ?? RING[RING_ORDER[index % RING_ORDER.length]];
}
/** ระดับที่ตัวหนังสือบนพื้นสีอ่านยากถ้าเป็นขาว → ใช้กรมท่า */
const DARK_TEXT_TIERS = new Set(["silver", "gold"]);

/** ตราระดับ (ภาพจริงจากไฟล์ต้นแบบ) — ครบทั้ง 5 ระดับ */
const MEDAL_ART = ["bronze", "silver", "gold", "platinum", "diamond"] as const;
const MEDAL_ID: Record<string, (typeof MEDAL_ART)[number]> = {
  bronze: "bronze",
  silver: "silver",
  gold: "gold",
  platinum: "platinum",
  diamond: "diamond",
};
/** ชื่อไฟล์ตราของระดับ — ไม่รู้จัก id ก็เดาจากลำดับ */
function medalArt(tier: Tier | null, index: number): (typeof MEDAL_ART)[number] | null {
  if (!tier) return null;
  return MEDAL_ID[tier.id] ?? MEDAL_ART[Math.min(index, MEDAL_ART.length - 1)];
}

/** ธีมสีโปรไฟล์ = สีของระดับที่เป็นอยู่จริง (สวิตช์เปิด/ปิด — เปิดไว้เป็นค่าเริ่มต้น) */
const THEME_TEXT: Record<string, string> = { bronze: "#fff", silver: "#243B57", gold: "#5A3B08", platinum: "#fff", diamond: "#fff" };
const THEME_KEY = "ducky_acc_theme";
/** สีพื้นไอคอนของแต่ละแถวเมนู (ไอคอนภาพจริงจากไฟล์ต้นแบบ อยู่ที่ /account/menu) */
const rgba = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

/** รหัสลูกค้าแบบอ่านง่าย — ตัดจาก id จริงของบัญชี (แอดมินค้นย้อนได้) */
function customerCode(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return `IDK-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** ขั้นตอนบนแถบติดตาม 5 ขั้น (ตรงกับ ORDER_STEPS) */
const STEP_ICONS = ["✓", "💳", "🖼️", "🏭", "🚚"];
/** ป้ายขั้นตอนตามสถานะจริง (ขั้นที่กำลังทำเปลี่ยนคำให้ตรงกับที่ค้างอยู่) */
function stepLabel(i: number, o: Order): string {
  const cur = STEP_OF[o.status];
  if (i === 0) return "สั่งซื้อสำเร็จ";
  if (i === 1) return cur > 1 ? "ชำระเงินแล้ว" : o.status === "รอตรวจสอบ" ? "รอตรวจสลิป" : "รอชำระเงิน";
  if (i === 2) return cur > 2 ? "อนุมัติแบบแล้ว" : o.status === "แก้ไขแบบ" ? "กำลังแก้แบบ" : o.status === "รอตรวจแบบ" ? "รอคุณตรวจแบบ" : "ทำแบบงาน";
  if (i === 3) return cur > 3 ? "ผลิตเสร็จ" : "กำลังผลิต";
  return o.status === "เสร็จสิ้น" ? "จัดส่งสำเร็จ" : o.status === "จัดส่งแล้ว" ? "จัดส่งแล้ว" : "จัดส่ง";
}
function stepTime(i: number, o: Order): string {
  const cur = STEP_OF[o.status];
  if (i === 0) return o.date;
  if (i === 1 && cur === 1) return orderBalance(o) > 0 ? `ค้างชำระ ${formatPrice(orderBalance(o))}` : "รอตรวจสอบ";
  if (i === 4 && o.tracking) return `พัสดุ ${o.tracking}`;
  if (i < cur) return "เรียบร้อย";
  return "—";
}

const thMonth = (iso: string) => {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { month: "short", year: "numeric" });
};

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading, refresh } = useCustomer();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tierList, setTierList] = useState<Tier[] | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewTier, setPreviewTier] = useState<string | null>(null);
  const [trackOpen, setTrackOpen] = useState(true);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [logoutAsk, setLogoutAsk] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addrDraft, setAddrDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [greet, setGreet] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [themeOn, setThemeOn] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !customer) router.replace("/account/login");
  }, [loading, customer, router]);

  useEffect(() => {
    if (!customer) return;
    (async () => {
      const [res, sett] = await Promise.all([fetchMyOrders(), fetchShopPayment()]);
      setOrders(res.orders);
      setTierList(tiersConfigOf(sett));
    })();
  }, [customer]);

  // บอลลูน "สวัสดีค่ะ" โผล่ตอนเข้าหน้าแล้วหุบเอง
  useEffect(() => {
    if (loading || !customer) return;
    const a = setTimeout(() => setGreet(true), 350);
    const b = setTimeout(() => setGreet(false), 3000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [loading, customer]);

  // สวิตช์ธีมสีตามระดับ — เปิดไว้เป็นค่าเริ่มต้น ปิดแล้วจำในเครื่อง
  useEffect(() => {
    setThemeOn(localStorage.getItem(THEME_KEY) !== "off");
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }

  // ── ระดับสมาชิก ──
  const tiers = useMemo(() => tiersOf(tierList), [tierList]);
  const spend = orders ? paidSpend(orders) : 0;
  const realTier = orders ? tierForSpend(spend, tierList) : null;
  const realIdx = realTier ? tiers.findIndex((t) => t.id === realTier.id) : 0;
  const next = orders ? nextTier(spend, tierList) : null;
  const shownTier = (previewTier && tiers.find((t) => t.id === previewTier)) || realTier;
  const shownIdx = shownTier ? tiers.findIndex((t) => t.id === shownTier.id) : 0;
  const isPreview = !!shownTier && !!realTier && shownTier.id !== realTier.id;
  const realRing = ringOf(realTier, realIdx);
  const shownRing = ringOf(shownTier, shownIdx);
  const progressPct = next && next.minSpend > 0 ? Math.min(100, Math.round((spend / next.minSpend) * 100)) : 100;

  // ── ออเดอร์ ──
  const latest = orders?.[0] ?? null;
  const active = useMemo(() => (orders ?? []).filter((o) => !["เสร็จสิ้น", "ยกเลิก"].includes(o.status)), [orders]);
  const trackList = useMemo(() => {
    const src = active.length ? active : orders ?? [];
    return src.slice(0, 4);
  }, [active, orders]);
  const tracked = trackList.find((o) => o.id === trackId) ?? trackList[0] ?? null;
  const proofOrders = useMemo(() => (orders ?? []).filter((o) => graphicWaitingItems(o).length > 0), [orders]);
  const proofCount = proofOrders.reduce((n, o) => n + graphicWaitingItems(o).length, 0);
  const producing = (orders ?? []).filter((o) => ["อนุมัติแบบ", "กำลังผลิต"].includes(o.status)).length;
  const reviewable = (orders ?? []).filter((o) => o.status === "เสร็จสิ้น").length;
  const notifOn = latest ? latest.notifyLevel !== "off" : true;

  if (loading || !customer) {
    return (
      <div className="dl">
        <div className="acc-loading">กำลังโหลด…</div>
      </div>
    );
  }

  const displayName = customer.name || "สมาชิก";
  const viaLine = /^line[_-]/i.test(customer.email) || !customer.email.includes("@");
  const memberSince = thMonth(customer.createdAt);

  function openTrack(id?: string) {
    if (id) setTrackId(id);
    setTrackOpen(true);
    setTimeout(() => {
      trackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      trackRef.current?.classList.remove("acd-jump");
      void trackRef.current?.offsetWidth;
      trackRef.current?.classList.add("acd-jump");
    }, 120);
  }

  async function logout() {
    clearMyOrders();
    await signOut();
    router.push("/products");
  }

  // ── โหมดแก้ไขโปรไฟล์ (ชื่อ + ที่อยู่จัดส่ง) — กดปุ่ม "แก้ไขโปรไฟล์" เข้า/บันทึก ──
  function enterEdit() {
    setNameDraft(customer!.name);
    setAddrDraft(customer!.address);
    setEditing(true);
    setTimeout(() => nameRef.current?.select(), 30);
  }
  async function saveEdit() {
    const name = nameDraft.trim();
    const address = addrDraft.trim();
    setEditing(false);
    if (!customer) return;
    if (name === customer.name && address === customer.address) return;
    setSaving(true);
    const r = await updateProfile({ name, phone: customer.phone, address });
    setSaving(false);
    if (r.ok) {
      refresh();
      showToast("บันทึกการเปลี่ยนแปลงแล้ว ✓");
    } else showToast(r.error || "บันทึกไม่สำเร็จ");
  }

  // ── รูปโปรไฟล์ ──
  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const r = await uploadAvatar(file);
    setUploading(false);
    if (r.ok) {
      refresh();
      showToast("เปลี่ยนรูปโปรไฟล์แล้ว ✓");
    } else showToast(r.error);
  }

  // ── สวิตช์แจ้งเตือน LINE (ตั้งบนออเดอร์ล่าสุด — ระบบยกไปใช้กับออเดอร์ถัดไปเอง) ──
  async function toggleNotif() {
    if (!latest || notifBusy) return;
    setNotifBusy(true);
    const level = notifOn ? "off" : "all";
    const res = await fetch("/api/orders/notify-pref", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: latest.id, key: latest.key ?? "", level }),
    }).catch(() => null);
    setNotifBusy(false);
    if (res?.ok) {
      setOrders((os) => os?.map((o) => (o.id === latest.id ? { ...o, notifyLevel: level } : o)) ?? os);
      showToast(level === "off" ? "ปิดการแจ้งเตือนผ่าน LINE แล้ว" : "เปิดการแจ้งเตือนผ่าน LINE แล้ว");
    } else showToast("บันทึกการตั้งค่าไม่สำเร็จ");
  }

  async function writeClip(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* คลิปบอร์ดไม่พร้อม */
    }
  }
  /** ชิปรหัสลูกค้า */
  async function copyId() {
    await writeClip(customerCode(customer!.id));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  /** ปุ่มเล็ก "คัดลอกไอดี" ในแถวข้อมูล — ไอดี LINE (หรืออีเมลถ้าสมัครด้วยอีเมล) */
  async function copyLoginId() {
    await writeClip(customer!.lineUserId || customer!.email);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1600);
  }

  function toggleTheme() {
    const on = !themeOn;
    setThemeOn(on);
    localStorage.setItem(THEME_KEY, on ? "on" : "off");
    showToast(on ? `เปิดใช้ธีมสี ${realTier?.name ?? "ระดับของคุณ"} แล้ว 🎨` : "กลับไปใช้สีปกติแล้ว");
  }

  const proofHref = proofOrders[0] ? orderHref(proofOrders[0]) : "/account/orders";
  const tierStyle = { "--ring-a": shownRing[0], "--ring-b": shownRing[1] } as React.CSSProperties;
  const realStyle = { "--ring-a": realRing[0], "--ring-b": realRing[1] } as React.CSSProperties;
  const shownArt = medalArt(shownTier, shownIdx);
  const cid = customerCode(customer.id);

  // ธีมสีตามระดับจริง → ตัวแปร CSS ให้ชิป/เมนูข้าง/เงาการ์ดเปลี่ยนสีตาม
  const pageStyle =
    themeOn && realTier
      ? ({
          "--acd-theme-bg": `linear-gradient(135deg,${realRing[0]},${realRing[1]})`,
          "--acd-theme-fg": THEME_TEXT[realTier.id] ?? "#fff",
          "--acd-theme-line": realRing[1],
          "--acd-theme-row-tint": `linear-gradient(90deg,${rgba(realRing[0], 0.06)} 0%,${rgba(realRing[1], 0.32)} 100%)`,
          "--acd-theme-shadow": `0 16px 32px -14px ${rgba(realRing[1], 0.4)},0 4px 10px -4px ${rgba(realRing[0], 0.22)}`,
        } as React.CSSProperties)
      : undefined;

  return (
    <div className="dl dl-page acd-page" style={pageStyle}>
      <div className="top-stack acd-stack">
        <img className="bg-cloud acd-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud acd-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud acd-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <div className="acd-wrap acd-dash">
          <div className="acd-grid">
            {/* ===== เมนูข้าง ===== */}
            <aside className="acd-side">
              <nav className="acd-sidenav" aria-label="เมนูบัญชี">
                <span className="on">
                  <NavIco name="home" /> บัญชีของฉัน
                </span>
                <Link href="/account/orders">
                  <NavIco name="orders" /> ประวัติการสั่งซื้อ
                </Link>
                <Link href={proofHref}>
                  <NavIco name="proof" /> อนุมัติแบบ {proofCount > 0 && <span className="acd-sidedot" />}
                </Link>
                <button type="button" onClick={() => showToast("คลังไฟล์งานของฉัน — เร็วๆ นี้! ตอนนี้สั่งซ้ำได้จากประวัติการสั่งซื้อ")}>
                  <NavIco name="files" /> ไฟล์งานของฉัน
                </button>
                <Link href="/account/profile">
                  <NavIco name="profile" /> ข้อมูลส่วนตัว
                </Link>
                <Link href="/account/profile">
                  <NavIco name="address" /> ที่อยู่จัดส่ง
                </Link>
                <Link href="/how-to-order">
                  <NavIco name="howto" /> วิธีสั่งซื้อ
                </Link>
                <hr />
                <button type="button" className="logout" onClick={() => setLogoutAsk(true)}>
                  ออกจากระบบ
                </button>
              </nav>
            </aside>

            {/* ===== เนื้อหา ===== */}
            <div className="acd-content">
              {/* โปรไฟล์ */}
              <div className="acd-topbar">
                <div className="acd-ring" style={realStyle} data-ring={realTier?.id}>
                  <div className={`acd-greet${greet ? " show" : ""}`} aria-hidden="true">
                    <span className="acd-wave">👋</span> สวัสดีค่ะ
                  </div>
                  <label className={`acd-avatar${customer.picture ? " has-photo" : ""}${uploading ? " busy" : ""}`} title="เปลี่ยนรูปโปรไฟล์">
                    {customer.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={customer.picture} alt="" />
                    ) : (
                      <span className="acd-initial">{(customer.name || customer.email).slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="acd-avatar-edit">{uploading ? "⏳" : "📷"}</span>
                    <input type="file" accept="image/*" onChange={onPickAvatar} aria-label="อัปโหลดรูปโปรไฟล์" disabled={uploading} />
                  </label>
                  {viaLine && <span className="acd-avatar-badge" title="ยืนยันตัวตนผ่าน LINE">✓</span>}
                </div>
                <div className="acd-who">
                  <div className="acd-name-row">
                    {editing ? (
                      <input
                        ref={nameRef}
                        className="acd-name-input"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditing(false);
                        }}
                        maxLength={60}
                        aria-label="ชื่อที่แสดง"
                      />
                    ) : (
                      <h1 className="acd-shopname">{displayName}</h1>
                    )}
                    {realTier && (
                      <span className={`acd-tier-tag${DARK_TEXT_TIERS.has(realTier.id) ? " dark" : ""}`} style={realStyle}>
                        {realTier.icon} {realTier.name}
                      </span>
                    )}
                  </div>
                  {/* รหัสลูกค้า — แตะทั้งชิปเพื่อคัดลอก (แจ้งแอดมินเวลาสอบถาม) */}
                  <button type="button" className="acd-cid" onClick={copyId} title={copied ? "คัดลอกแล้ว ✓" : "แตะเพื่อคัดลอกรหัสลูกค้า"}>
                    <span className="acd-cid-label">รหัสลูกค้า</span>
                    <span className="acd-cid-code">{cid}</span>
                    <span className={`acd-cid-copy${copied ? " copied" : ""}`} aria-hidden="true">
                      {copied ? "✓" : "⧉"}
                    </span>
                  </button>
                  <div className="acd-meta">
                    {memberSince && (
                      <>
                        <span className="acd-meta-item">
                          <span className="acd-meta-ico">📅</span>สมาชิกตั้งแต่ {memberSince}
                        </span>
                        <span className="acd-meta-dot">•</span>
                      </>
                    )}
                    <span className="acd-meta-item">
                      {viaLine ? (
                        <>
                          <span className="acd-line-badge">L</span>
                          <span className="acd-line-text">เชื่อมต่อ LINE แล้ว</span>
                        </>
                      ) : (
                        <>
                          <span className="acd-meta-ico">✉️</span>
                          <span className="acd-line-text acd-ellip">{customer.email}</span>
                        </>
                      )}
                      <button
                        type="button"
                        className={`acd-copy${copiedId ? " copied" : ""}`}
                        onClick={copyLoginId}
                        aria-label={viaLine ? "คัดลอกไอดี LINE" : "คัดลอกอีเมล"}
                        title={viaLine ? "คัดลอกไอดี LINE" : "คัดลอกอีเมล"}
                      >
                        {copiedId ? "คัดลอกแล้ว ✓" : "คัดลอกไอดี"}
                      </button>
                    </span>
                  </div>
                  {editing ? (
                    <div className="acd-addr-panel">
                      <div className="acd-addr-label">📍 ที่อยู่จัดส่ง</div>
                      <textarea
                        className="acd-addr-input"
                        rows={3}
                        value={addrDraft}
                        onChange={(e) => setAddrDraft(e.target.value)}
                        placeholder="บ้านเลขที่ / ถนน / แขวง / เขต / จังหวัด / รหัสไปรษณีย์"
                        aria-label="ที่อยู่จัดส่ง"
                      />
                      <div className="acd-addr-hint">
                        แก้เบอร์โทรและข้อมูลอื่นได้ที่ <Link href="/account/profile">ข้อมูลส่วนตัว</Link>
                      </div>
                    </div>
                  ) : (
                    <div className="acd-meta">
                      <span className="acd-meta-item">
                        <span className="acd-meta-ico">📍</span>
                        {customer.address ? <span>{customer.address}</span> : <span className="acd-meta-link">ยังไม่ได้ใส่ที่อยู่จัดส่ง — กด &quot;แก้ไขโปรไฟล์&quot;</span>}
                      </span>
                    </div>
                  )}
                </div>
                <div className="acd-topbar-actions">
                  <button
                    type="button"
                    className="acd-theme-toggle"
                    role="switch"
                    aria-checked={themeOn}
                    title={`ใช้ธีมสีตามระดับ${realTier ? ` ${realTier.name}` : ""}`}
                    onClick={toggleTheme}
                  >
                    <span className="acd-theme-toggle-label">ธีมสีตามระดับ</span>
                    <span className="acd-theme-toggle-track" />
                  </button>
                  <button type="button" className="acd-edit-btn" onClick={() => (editing ? saveEdit() : enterEdit())} disabled={saving}>
                    {saving ? "กำลังบันทึก…" : editing ? "บันทึกการเปลี่ยนแปลง" : "แก้ไขโปรไฟล์"}
                  </button>
                </div>
              </div>

              {/* การ์ดระดับ + ออเดอร์ล่าสุด */}
              <div className="acd-cards">
                <div className={`acd-tier${isPreview ? " previewing" : ""}${shownTier && DARK_TEXT_TIERS.has(shownTier.id) ? " dark" : ""}`} style={tierStyle} data-ring={shownTier?.id}>
                  <div className="acd-tier-chiprow">
                    <span className="acd-chip">ระดับสมาชิก</span>
                    {tiers.length > 1 && (
                      <div className="acd-tier-switch-wrap">
                        {switchOpen ? (
                          <div className="acd-tier-switch pop-in" role="tablist" aria-label="ดูสิทธิประโยชน์แต่ละระดับ">
                            {tiers.map((t, i) => {
                              const art = medalArt(t, i);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  className={shownTier?.id === t.id ? "on" : ""}
                                  title={`ดูสิทธิประโยชน์ระดับ ${t.name}`}
                                  aria-label={`ดูสิทธิประโยชน์ระดับ ${t.name}`}
                                  onClick={() => {
                                    setPreviewTier(t.id === realTier?.id ? null : t.id);
                                    setSwitchOpen(false);
                                  }}
                                >
                                  {art ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={`/account/rank/${art}-ico.webp`} alt="" />
                                  ) : (
                                    t.icon
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <button type="button" className="acd-tier-switch-toggle pop-in" onClick={() => setSwitchOpen(true)}>
                            ดูสิทธิ์ระดับอื่น
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="acd-tier-hero">
                    <div className="acd-medal-wrap">
                      {shownArt ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="acd-medal" src={`/account/rank/${shownArt}.webp`} alt={`ตราระดับ ${shownTier?.name ?? ""}`} />
                      ) : (
                        <span className="acd-medal acd-medal-emoji" aria-hidden="true">
                          {shownTier?.icon ?? "🥉"}
                        </span>
                      )}
                    </div>
                    <div className="acd-tier-hero-info">
                      <div className="acd-tier-hero-label">{shownTier?.name ?? "—"}</div>
                      <div className="acd-tier-hero-tag">{isPreview ? "ตัวอย่างสิทธิ์ระดับนี้" : "ระดับสมาชิกของคุณ"}</div>
                    </div>
                  </div>
                  <div className="acd-tier-stats">
                    <small>{isPreview ? "ยอดขั้นต่ำที่ต้องใช้" : "ยอดสะสม"}</small>
                    <b>{orders === null ? "…" : formatPrice(isPreview ? shownTier!.minSpend : spend)}</b>
                  </div>
                  <div className="acd-progress">
                    <i style={{ width: `${isPreview ? 100 : progressPct}%` }} />
                  </div>
                  <div className="acd-tier-foot">
                    {isPreview && shownTier ? (
                      <>
                        สิทธิ์ระดับ {shownTier.name}: <b>{shownTier.discountPct > 0 ? `ลด ${shownTier.discountPct}%` : "ระดับเริ่มต้น"}</b>
                        {shownTier.discountPct > 0 && " ทุกออเดอร์อัตโนมัติ"} · สะสมยอดครบ {formatPrice(shownTier.minSpend)}
                      </>
                    ) : next ? (
                      <>
                        อีก <b>{formatPrice(Math.max(0, next.minSpend - spend))}</b> ขึ้นระดับ {next.icon} {next.name} (ลด {next.discountPct}%)
                      </>
                    ) : realTier ? (
                      <>
                        🎉 คุณอยู่ระดับสูงสุดแล้ว{realTier.discountPct > 0 ? ` — ลด ${realTier.discountPct}% ทุกออเดอร์` : ""}
                      </>
                    ) : (
                      "กำลังโหลด…"
                    )}
                  </div>
                  {isPreview && realTier && (
                    <div className="acd-preview-note">
                      👀 กำลังดูตัวอย่างสิทธิ์ระดับอื่น — ระดับจริงของคุณคือ {realTier.name}{" "}
                      <button type="button" onClick={() => setPreviewTier(null)}>
                        กลับไประดับของฉัน
                      </button>
                    </div>
                  )}
                </div>

                <div className="acd-order">
                  <span className="acd-chip">ออเดอร์ล่าสุด</span>
                  {orders === null ? (
                    <p className="acd-order-empty">กำลังโหลด…</p>
                  ) : latest ? (
                    <>
                      <div className="acd-order-top">
                        <div style={{ minWidth: 0 }}>
                          <div className="acd-order-id">{latest.id}</div>
                          <div className="acd-order-date">
                            {latest.date} · {latest.items.length} รายการ
                          </div>
                        </div>
                        <span className={`acd-status s-${STEP_OF[latest.status]}`}>
                          <i>{latest.status === "รอชำระเงิน" || latest.status === "รอตรวจสอบ" ? "⏳" : latest.status === "ยกเลิก" ? "✕" : STEP_ICONS[Math.min(STEP_OF[latest.status], 4)]}</i> {latest.status}
                        </span>
                      </div>
                      <div className="acd-divider" />
                      <div className="acd-order-bottom">
                        <button
                          type="button"
                          className={`btn btn-ghost acd-btn-compact acd-track-btn${trackOpen ? " open" : ""}`}
                          aria-expanded={trackOpen}
                          aria-controls="acd-track"
                          onClick={() => (trackOpen ? setTrackOpen(false) : openTrack(latest.id))}
                        >
                          ติดตามสถานะ <span className="dot acd-chev">▾</span>
                        </button>
                        {orderBalance(latest) > 0 && latest.status !== "ยกเลิก" ? (
                          <Link href={orderHref(latest)} className="btn btn-primary acd-btn-compact">
                            ชำระเงิน {formatPrice(orderBalance(latest))} <span className="dot">→</span>
                          </Link>
                        ) : (
                          <Link href={orderHref(latest)} className="btn btn-primary acd-btn-compact">
                            ดูออเดอร์ <span className="dot">→</span>
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="acd-order-empty">
                      <span style={{ fontSize: "1.9rem" }}>🧾</span>
                      <p>ยังไม่มีคำสั่งซื้อ</p>
                      <Link className="btn btn-yolk acd-btn-compact" href="/products" style={{ flex: "none" }}>
                        ไปเลือกสินค้า <span className="dot">→</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* ติดตามสถานะ (พับ/กาง) */}
              {tracked && (
                <div className={`acd-collapse${trackOpen ? " open" : ""}`} id="acd-track">
                  <div className="acd-collapse-inner">
                    <div className="acd-track" ref={trackRef}>
                      <div className="acd-track-head">
                        <span className="acd-chip">ติดตามสถานะการสั่งซื้อ</span>
                        <div className="acd-track-tabs" role="tablist">
                          {trackList.map((o) => (
                            <button key={o.id} type="button" role="tab" aria-selected={o.id === tracked.id} className={`acd-ttab${o.id === tracked.id ? " on" : ""}`} onClick={() => setTrackId(o.id)}>
                              {o.id}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="acd-track-meta">
                        ออเดอร์ <b>{tracked.id}</b> · {tracked.items[0]?.name ?? "—"}
                        {tracked.items.length > 1 ? ` +${tracked.items.length - 1}` : ""} · {tracked.items.length} รายการ
                        {" · "}
                        <Link href={orderHref(tracked)} className="acd-track-link">
                          เปิดหน้าออเดอร์ →
                        </Link>
                      </div>
                      {tracked.status === "ยกเลิก" ? (
                        <p className="acd-track-cancel">ออเดอร์นี้ถูกยกเลิกแล้ว</p>
                      ) : (
                        <div className="acd-tracker">
                          {ORDER_STEPS.map((_, i) => {
                            const cur = STEP_OF[tracked.status];
                            const cls = i < cur ? " done" : i === cur ? " current" : "";
                            return (
                              <div key={i} className={`acd-tstep${cls}`}>
                                <span className="tline" />
                                <div className="tdot">{STEP_ICONS[i]}</div>
                                <div className="tlabel">{stepLabel(i, tracked)}</div>
                                <div className="ttime">{stepTime(i, tracked)}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* คูปอง */}
              <MyCoupons variant="dash" />

              {/* เมนูลิสต์ */}
              <div className="acd-menu">
                <div className="acd-menu-head">คำสั่งซื้อ</div>
                <MenuItem href="/account/orders" ico="orders" tone="blue" label="ประวัติการสั่งซื้อ" meta={orders ? `${orders.length} ออเดอร์${active.length ? ` · ${active.length} กำลังดำเนินการ` : ""}` : ""} />
                <MenuItem href={proofHref} ico="proof" tone="yolk" label="อนุมัติแบบ / ขอแก้ไข" badge={proofCount > 0 ? `${proofCount} รอตรวจ` : undefined} meta={proofCount ? undefined : "ไม่มีแบบรอตรวจ"} />
                <MenuItem onClick={() => (tracked ? openTrack(tracked.id) : showToast("ยังไม่มีออเดอร์ให้ติดตาม"))} ico="production" tone="blue" label="ติดตามสถานะการผลิต" meta={producing ? `กำลังผลิต ${producing} ออเดอร์` : "ไม่มีงานกำลังผลิต"} />
                <MenuItem href="/account/orders" ico="files" tone="lilac" label="ไฟล์งานของฉัน / สั่งซ้ำ" meta="สั่งซ้ำจากออเดอร์เดิม" />
                <MenuItem href={latest ? orderHref(latest, "/receipt") : "/account/orders"} ico="receipt" tone="navy" label="ใบเสร็จ / ใบกำกับภาษี" meta={latest ? "ออเดอร์ล่าสุด" : undefined} />
                <MenuItem href={LINE_URL} external ico="claim" tone="coral" label="แจ้งปัญหา / เคลมสินค้า" meta="ทักแอดมินทาง LINE" />
                <MenuItem onClick={() => showToast("ให้คะแนนสินค้า — เร็วๆ นี้!")} ico="review" tone="mint" label="รีวิว / ให้คะแนนสินค้า" meta={reviewable ? `${reviewable} รอรีวิว` : undefined} />

                <div className="acd-menu-head">บัญชี</div>
                <MenuItem href="/account/profile" ico="profile" tone="navy" label="ข้อมูลส่วนตัว" meta="ชื่อ · เบอร์ · ที่อยู่" />
                <MenuItem href="/account/profile" ico="address" tone="blue" label="ที่อยู่จัดส่ง" meta={customer.address ? "1 ที่อยู่" : "ยังไม่ได้ตั้ง"} />
                <div
                  className={`acd-menu-item${latest ? "" : " disabled"}`}
                  role="switch"
                  aria-checked={notifOn}
                  tabIndex={0}
                  onClick={toggleNotif}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleNotif();
                    }
                  }}
                >
                  <div className="acd-menu-ico ico-lilac">
                    <MenuIco name="bell" />
                  </div>
                  <div className="acd-menu-col">
                    <div className="acd-menu-label">แจ้งเตือนผ่าน LINE</div>
                    <div className="acd-menu-sub">
                      {!latest ? "จะตั้งค่าได้หลังมีออเดอร์แรก" : notifOn ? "แจ้งเมื่อค้างชำระ, แบบพร้อมอนุมัติ, และจัดส่งสำเร็จ" : "ปิดอยู่ — จะไม่ได้รับการแจ้งเตือนใดๆ ผ่าน LINE"}
                    </div>
                  </div>
                  <div className={`acd-switch${notifOn && latest ? " on" : ""}`} />
                </div>

                <div className="acd-menu-head">ช่วยเหลือ</div>
                <MenuItem href="/how-to-order" ico="howto" tone="coral" label="วิธีสั่งซื้อ" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>

      {/* ยืนยันออกจากระบบ */}
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

/** ไอคอนภาพจริงของเมนู (ไฟล์อยู่ที่ public/account/menu) */
type IcoName = "home" | "orders" | "proof" | "files" | "profile" | "address" | "howto" | "production" | "receipt" | "claim" | "review" | "bell";
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
function MenuIco({ name }: { name: IcoName }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/account/menu/${name}.webp`} alt="" title={ICO_ALT[name]} loading="lazy" />;
}
/** ไอคอนในเมนูข้าง — วงกลมพื้นฟ้าครอบภาพ */
function NavIco({ name }: { name: IcoName }) {
  return (
    <span className="ico">
      <MenuIco name={name} />
    </span>
  );
}

/** แถวเมนูลิสต์ — ลิงก์ภายใน / ลิงก์นอก / ปุ่ม */
function MenuItem({
  href,
  onClick,
  external,
  ico,
  tone,
  label,
  meta,
  badge,
}: {
  href?: string;
  onClick?: () => void;
  external?: boolean;
  ico: IcoName;
  tone: "blue" | "navy" | "coral" | "mint" | "lilac" | "yolk";
  label: string;
  meta?: string;
  badge?: string;
}) {
  const inner: ReactNode = (
    <>
      <div className={`acd-menu-ico ico-${tone}`}>
        <MenuIco name={ico} />
      </div>
      <div className="acd-menu-label">{label}</div>
      {badge && <span className="acd-menu-badge">{badge}</span>}
      {meta && <div className="acd-menu-meta">{meta}</div>}
      <div className="acd-chevron">›</div>
    </>
  );
  if (href && external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="acd-menu-item">
        {inner}
      </a>
    );
  if (href)
    return (
      <Link href={href} className="acd-menu-item">
        {inner}
      </Link>
    );
  return (
    <button type="button" className="acd-menu-item" onClick={onClick}>
      {inner}
    </button>
  );
}
