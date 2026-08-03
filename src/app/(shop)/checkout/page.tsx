"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { getAppendPicks, clearAppendPicks } from "@/lib/append-order";
import { useCustomer } from "@/lib/customer-context";
import {
  fetchShopPayment,
  hasPayment,
  freeShippingMinOf,
  shippingOf,
  tiersConfigOf,
  DEFAULT_SHIPPING,
  EMPTY_PAYMENT,
  type ShopPayment,
  type ShippingMethod,
} from "@/lib/shop-settings";
import { getAccessToken } from "@/lib/customer-auth";
import { paidSpend, tierForSpend, tierDiscountAmount } from "@/lib/tiers";
import type { Order } from "@/lib/admin-data";
import { appendToOrder, placeOrder, reportPayment } from "@/lib/order-repo";
import { clearAppendTarget, getAppendTarget, type AppendTarget } from "@/lib/append-order";
import { publicOrigin } from "@/lib/shop-info";

interface Placed {
  id: string;
  text: string;
  total: number;
  url: string;
  key?: string;
}

export default function CheckoutPage() {
  const { items: allItems, productOf, clear, removeItem } = useCart();
  /** โหมดสั่งเพิ่ม: ลูกค้าติ๊กเลือกได้ว่าจะส่งรายการไหนเข้าออเดอร์เดิม (ไม่เลือก = ทั้งตะกร้า) */
  const [picks, setPicks] = useState<string[] | null>(null);
  useEffect(() => {
    setPicks(getAppendPicks());
  }, []);
  const items = picks === null ? allItems : allItems.filter((i) => picks.includes(i.key));
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const { customer } = useCustomer();
  const [payment, setPayment] = useState<ShopPayment>(EMPTY_PAYMENT);
  const [methods, setMethods] = useState<ShippingMethod[]>(DEFAULT_SHIPPING);
  const [freeMin, setFreeMin] = useState(0);
  const [shippingId, setShippingId] = useState<string>(DEFAULT_SHIPPING[0].id);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // เติมข้อมูลจากโปรไฟล์สมาชิกอัตโนมัติ (ถ้าล็อกอินและยังไม่ได้กรอก)
  useEffect(() => {
    if (!customer) return;
    setName((v) => v || customer.name);
    setPhone((v) => v || customer.phone);
    setAddress((v) => v || customer.address);
  }, [customer]);
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState("");
  const [placed, setPlaced] = useState<Placed | null>(null);

  // ── โหมดพนักงาน: สั่งแทนลูกค้า (เห็นเฉพาะคนที่ล็อกอินหลังบ้านและมีสิทธิ์แก้ออเดอร์) ──
  const [staffName, setStaffName] = useState("");
  const [staffMode, setStaffMode] = useState(false);
  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.loggedIn && Array.isArray(j.perms) && j.perms.includes("orders.edit")) setStaffName(j.name || "พนักงาน");
      })
      .catch(() => {});
  }, []);
  const toggleStaffMode = (on: boolean) => {
    setStaffMode(on);
    if (on) {
      // ล้างข้อมูลที่เติมจากโปรไฟล์พนักงานเอง — ต้องกรอกของ "ลูกค้า" แทน
      setName("");
      setPhone("");
      setAddress("");
    }
  };

  const [linkCopied, setLinkCopied] = useState(false);

  // แจ้งโอน (อัปโหลดสลิป)
  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string>("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportErr, setReportErr] = useState("");

  const [dragOver, setDragOver] = useState(false);

  /* โหมดสั่งเพิ่มในออเดอร์เดิม (มาจากหน้าเช็คออเดอร์) */
  const [appendTo, setAppendTo] = useState<AppendTarget | null>(null);
  const [appendDone, setAppendDone] = useState<{ owed: number } | null>(null);
  useEffect(() => setAppendTo(getAppendTarget()), []);

  function pickSlip(file: File | null) {
    setReportErr("");
    if (file && !file.type.startsWith("image/")) {
      setReportErr("รองรับเฉพาะไฟล์รูปภาพ (PNG / JPG)");
      return;
    }
    setSlip(file);
    setSlipPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : "";
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) pickSlip(file);
  }

  async function submitSlip() {
    if (!placed || !slip) return;
    setReporting(true);
    setReportErr("");
    const res = await reportPayment(placed.id, placed.key, slip);
    setReporting(false);
    if (!res.ok) {
      setReportErr(res.error ?? "แจ้งโอนไม่สำเร็จ");
      return;
    }
    setReported(true);
  }

  useEffect(() => {
    fetchShopPayment().then((p) => {
      setPayment(p);
      const list = shippingOf(p);
      setMethods(list);
      setFreeMin(freeShippingMinOf(p));
      setShippingId((cur) => (list.some((m) => m.id === cur) ? cur : list[0].id));
    });
    const s = localStorage.getItem("iducky-shipping-v1");
    if (s) setShippingId(s);
  }, []);

  const shippingMethod = methods.find((s) => s.id === shippingId) ?? methods[0];
  const freeShipping = freeMin > 0 && subtotal >= freeMin;
  // สั่งเพิ่มในออเดอร์เดิม → ไม่คิดค่าส่งซ้ำ (จ่ายไปแล้วในออเดอร์แรก)
  const shippingCost = appendTo ? 0 : freeShipping ? 0 : shippingMethod.price;

  // ── ส่วนลดระดับสมาชิก (โชว์เป็นตัวอย่าง — เซิร์ฟเวอร์คิดจริงตอนสร้างออเดอร์) ──
  const [tier, setTier] = useState<{ name: string; icon: string; pct: number } | null>(null);
  useEffect(() => {
    if (!customer || appendTo) { setTier(null); return; } // สั่งเพิ่มไม่คิดส่วนลดใหม่
    (async () => {
      const token = await getAccessToken();
      const [ordRes, sett] = await Promise.all([
        fetch("/api/orders/mine", { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
        fetchShopPayment(),
      ]);
      const spend = paidSpend((ordRes.orders ?? []) as Order[]);
      const t = tierForSpend(spend, tiersConfigOf(sett));
      setTier(t.discountPct > 0 ? { name: t.name, icon: t.icon, pct: t.discountPct } : null);
    })();
  }, [customer, appendTo]);

  const tierDiscount = tier ? tierDiscountAmount(subtotal, tier.pct) : 0;

  // ── คูปอง (ต้องล็อกอิน) — พรีวิวส่วนลด เซิร์ฟเวอร์ตัดใช้จริงตอนสั่งซื้อ ──
  const [couponInput, setCouponInput] = useState("");
  const [couponPreview, setCouponPreview] = useState<{ code: string; discount: number; label: string; note?: string } | null>(null);
  const [couponErr, setCouponErr] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  // รับโค้ดจากลิงก์ /coupon/[code] (เก็บไว้ตอนเปิดลิงก์)
  useEffect(() => {
    const saved = localStorage.getItem("ducky_coupon");
    if (saved) setCouponInput(saved.toUpperCase());
  }, []);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    if (!customer) {
      setCouponErr("เข้าสู่ระบบก่อนใช้คูปอง");
      return;
    }
    setCouponBusy(true);
    setCouponErr("");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          code,
          subtotal,
          // ส่งรายการสินค้าไปด้วย — คูปองบางใบมีสินค้าไม่ร่วมรายการ (คิดส่วนลดเฉพาะที่ร่วม)
          items: items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })),
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setCouponPreview(null);
        setCouponErr(j.error ?? "ใช้คูปองไม่ได้");
        return;
      }
      setCouponPreview({ code: j.code, discount: j.discount, label: j.label, note: j.note });
      localStorage.setItem("ducky_coupon", j.code);
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setCouponPreview(null);
    setCouponInput("");
    setCouponErr("");
    localStorage.removeItem("ducky_coupon");
  }

  // เลือกส่วนลดที่ดีกว่า (ระดับ vs คูปอง) — ตรงกับที่เซิร์ฟเวอร์คิด
  // โหมดพนักงานสั่งแทน: ไม่คิดส่วนลดสมาชิก/คูปองของพนักงานเอง (ออเดอร์เป็นของลูกค้า)
  const couponDisc = staffMode ? 0 : (couponPreview?.discount ?? 0);
  const effTierDiscount = staffMode ? 0 : tierDiscount;
  const useCoupon = couponDisc > effTierDiscount;
  const discount = Math.max(effTierDiscount, couponDisc);
  const total = Math.max(0, subtotal - discount + shippingCost);

  async function submit() {
    const useByDate = (() => {
      try {
        return localStorage.getItem("ducky-use-by-date") || "";
      } catch {
        return "";
      }
    })();
    const orderItems = items.map((it) => {
      // ภาพลายที่ลูกค้าแนบ เก็บมาในตะกร้าเป็น URL คั่น " | " → แยกเป็นฟิลด์ของตัวเอง
      // (ไม่ปนกับข้อความตัวเลือก ไม่งั้น URL ยาวจะรกทั้งใบงานและหน้าออเดอร์)
      const { "ภาพลายที่แนบ": artRaw, "รอเช็คสต๊อก": bulkFlag, ...restSel } = it.selections;
      const artworkUrls = (artRaw ?? "").split(" | ").map((u) => u.trim()).filter(Boolean);
      return {
        productId: it.productId,
        name: productOf(it.productId)?.name ?? it.productId,
        selections: Object.entries(restSel).map(([k, v]) => `${k}: ${v}`).join(" · "),
        sel: restSel,
        qty: it.qty,
        unitPrice: it.unitPrice,
        ...(artworkUrls.length ? { artworkUrls } : {}),
        ...(bulkFlag ? { needStockCheck: true } : {}),
      };
    });

    // ── โหมดสั่งเพิ่ม: ต่อท้ายออเดอร์เดิม ไม่ต้องกรอกที่อยู่ใหม่ ──
    if (appendTo) {
      setPlacing(true);
      setErr("");
      const res = await appendToOrder(appendTo.id, appendTo.key, orderItems);
      setPlacing(false);
      if (!res.ok) {
        setErr(res.error ?? "สั่งเพิ่มไม่สำเร็จ");
        return;
      }
      clearAppendTarget();
      setAppendDone({ owed: res.owed ?? 0 });
      // เอาเฉพาะรายการที่ส่งเข้าออเดอร์เดิมออกจากตะกร้า — ที่ไม่ได้ติ๊กยังอยู่ให้สั่งทีหลัง
      if (picks === null) clear();
      else items.forEach((it) => removeItem(it.key));
      clearAppendPicks();
      return;
    }

    if (!name.trim() || !phone.trim() || !address.trim()) {
      setErr("กรอกชื่อ เบอร์โทร และที่อยู่จัดส่งให้ครบ");
      return;
    }
    setPlacing(true);
    setErr("");
    const res = await placeOrder({
      customerName: name,
      phone,
      address,
      email: staffMode ? undefined : customer?.email,
      customerId: staffMode ? undefined : customer?.id,
      shipping: shippingMethod.name,
      shippingCost,
      subtotal,
      total,
      couponCode: staffMode ? undefined : couponPreview?.code,
      staffOrder: staffMode || undefined,
      items: orderItems,
        ...(useByDate ? { useByDate } : {}),
    });
    setPlacing(false);
    if (!res.ok || !res.orderId) {
      setErr(res.error ?? "สั่งซื้อไม่สำเร็จ");
      return;
    }
    // ลิงก์ออเดอร์ของลูกค้า — เช็คสถานะ / ดูแบบงาน / อนุมัติ (ต้องมี key ถึงเปิดได้)
    const orderUrl = `${publicOrigin()}/order/${res.orderId}${res.key ? `?key=${encodeURIComponent(res.key)}` : ""}`;
    // สร้างข้อความ LINE ก่อนล้างตะกร้า
    const lines = [`🦆 ออเดอร์ ${res.orderId}`, `ชื่อ: ${name.trim()} · ${phone.trim()}`, "━━━━━━━━━━━━━━"];
    orderItems.forEach((it, i) => {
      lines.push(`${i + 1}) ${it.name} ×${it.qty} = ${it.unitPrice > 0 ? formatPrice(it.unitPrice * it.qty) : "รอตีราคา"}`);
      if (it.selections) lines.push(`   • ${it.selections}`);
      if (it.artworkUrls?.length) lines.push(`   🎨 แนบภาพลาย ${it.artworkUrls.length} รูป (ดูในลิงก์ออเดอร์)`);
      if (it.needStockCheck) lines.push(`   📦 สั่งจำนวนมาก — รอร้านยืนยันสต๊อก/คิวผลิต`);
    });
    lines.push("━━━━━━━━━━━━━━");
    lines.push(`รวม ${totalQty} ชิ้น · จัดส่ง ${freeShipping ? "ฟรี" : formatPrice(shippingCost)}`);
    lines.push(`ยอดชำระ: ${formatPrice(total)}`);
    lines.push("(โอนแล้วแนบรูปสลิปในแชทนี้ได้เลย)");
    lines.push(`🔗 เช็คออเดอร์/ดูแบบงาน: ${orderUrl}`);
    if (res.coupon?.applied) localStorage.removeItem("ducky_coupon"); // คูปองถูกตัดใช้แล้ว
    setPlaced({ id: res.orderId, text: lines.join("\n"), total, url: orderUrl, key: res.key });
    clear();
  }

  function shareToLine(text: string) {
    try {
      navigator.clipboard?.writeText(text).catch(() => {});
    } catch {
      /* ข้าม */
    }
    window.open("https://line.me/R/msg/text/?" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }

  /* ── สั่งเพิ่มในออเดอร์เดิมสำเร็จ ── */
  if (appendDone && appendTo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <div className="rounded-2xl bg-emerald-50/70 p-6 ring-1 ring-emerald-200">
          <span className="text-5xl">🛍️</span>
          <h1 className="mt-3 text-2xl font-extrabold text-emerald-800">เพิ่มเข้าออเดอร์เดิมแล้ว!</h1>
          <p className="mt-1 text-sm text-stone-600">
            รายการใหม่ถูกเพิ่มเข้า{" "}
            <Link
              href={staffName ? `/admin/orders/${appendTo.id}` : `/order/${appendTo.id}?key=${encodeURIComponent(appendTo.key)}`}
              className="font-bold text-stone-900 underline decoration-amber-300 decoration-2 underline-offset-2 hover:text-amber-700"
              title={staffName ? "เปิดออเดอร์นี้ในหลังบ้าน" : "เปิดหน้าออเดอร์"}
            >
              {appendTo.id}
            </Link>{" "}
            เรียบร้อย
          </p>
          {appendDone.owed > 0 && (
            <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-amber-200">
              ยอดที่ต้องโอนเพิ่ม <span className="text-lg font-extrabold text-amber-600">{formatPrice(appendDone.owed)}</span>
              <br />
              <span className="text-xs text-stone-500">ไม่มีค่าจัดส่งเพิ่ม เพราะรวมส่งกับออเดอร์เดิม</span>
            </p>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/order/${appendTo.id}?key=${encodeURIComponent(appendTo.key)}`}
            className="inline-block rounded-full bg-amber-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-amber-600"
          >
            ไปหน้าออเดอร์ เพื่อแจ้งโอน →
          </Link>
          {staffName && (
            <Link
              href={`/admin/orders/${appendTo.id}`}
              className="inline-block rounded-full border-2 border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              🛠 เปิดในหลังบ้าน
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ── หลังสั่งซื้อสำเร็จ: เลขออเดอร์ + แจ้งโอน + แชร์ LINE ── */
  if (placed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl bg-emerald-50/70 p-6 text-center ring-1 ring-emerald-200">
          <span className="text-5xl">✅</span>
          <h1 className="mt-3 text-2xl font-extrabold text-emerald-800">{staffMode ? "สั่งแทนลูกค้าสำเร็จ!" : "สั่งซื้อสำเร็จ!"}</h1>
          {staffMode && (
            <p className="mx-auto mt-2 max-w-sm rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
              🧑‍💼 คัดลอกลิงก์ออเดอร์ด้านล่างส่งให้ลูกค้า — ลูกค้าเปิดดูยอด โอนเงิน และแนบสลิปเองได้จากลิงก์เดียว
            </p>
          )}
          <p className="mt-1 text-sm text-stone-600">{staffMode ? "เลขออเดอร์" : "เลขออเดอร์ของคุณ"}</p>
          <p className="select-all text-2xl font-extrabold tracking-wide text-stone-900">{placed.id}</p>
          <p className="mt-2 text-sm text-stone-500">
            ยอดที่ต้องโอน <span className="font-bold text-amber-600">{formatPrice(placed.total)}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(placed.url).catch(() => {});
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200 transition hover:bg-stone-50"
          >
            {linkCopied ? "✓ คัดลอกลิงก์แล้ว" : "🔗 คัดลอกลิงก์เช็คออเดอร์"}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
            เก็บลิงก์นี้ไว้นะครับ — ใช้เช็คสถานะ · <strong className="text-stone-500">ดูแบบงานที่กราฟฟิกทำ และกดอนุมัติ</strong>
          </p>
        </div>

        {hasPayment(payment) && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-bold text-stone-700">💳 โอนมาที่บัญชีร้าน</p>
            {payment.banks.filter((b) => b.accountNo?.trim()).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                <div>
                  <p className="text-xs text-stone-500">{b.bank}{b.accountName ? ` · ${b.accountName}` : ""}</p>
                  <p className="select-all font-mono text-lg font-bold tracking-wide text-stone-800">{b.accountNo}</p>
                </div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(b.accountNo).catch(() => {})} className="shrink-0 rounded-full bg-stone-100 px-3.5 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200">คัดลอก</button>
              </div>
            ))}
            {payment.promptpay?.trim() && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                <div>
                  <p className="text-xs text-stone-500">📱 พร้อมเพย์{payment.promptpayName ? ` · ${payment.promptpayName}` : ""}</p>
                  <p className="select-all font-mono text-lg font-bold tracking-wide text-stone-800">{payment.promptpay}</p>
                </div>
                <button type="button" onClick={() => navigator.clipboard?.writeText(payment.promptpay ?? "").catch(() => {})} className="shrink-0 rounded-full bg-stone-100 px-3.5 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200">คัดลอก</button>
              </div>
            )}
          </div>
        )}

        {/* ── แจ้งโอน: อัปโหลดสลิป (flow หลัก) ── */}
        {reported ? (
          <div className="mt-5 rounded-2xl bg-emerald-50/70 p-5 text-center ring-1 ring-emerald-200">
            <span className="text-3xl">🎉</span>
            <p className="mt-2 font-bold text-emerald-800">แจ้งโอนเรียบร้อยแล้ว!</p>
            <p className="mt-1 text-sm text-stone-600">ทางร้านได้รับสลิปของคุณแล้ว กำลังตรวจสอบยอด — จะยืนยันและเริ่มผลิตให้เร็วที่สุด 🦆</p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <p className="text-sm font-bold text-stone-700">📤 โอนแล้ว? แจ้งสลิปที่นี่</p>
            <p className="mt-0.5 text-xs text-stone-500">แนบรูปสลิปการโอน แล้วกดแจ้งโอน — ทางร้านจะตรวจสอบยอดให้อัตโนมัติ</p>

            <label
              className="mt-3 block cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => pickSlip(e.target.files?.[0] ?? null)}
              />
              {slipPreview ? (
                <div className="relative overflow-hidden rounded-xl ring-1 ring-stone-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slipPreview} alt="ตัวอย่างสลิป" className="max-h-64 w-full object-contain bg-stone-50" />
                  <span className="absolute bottom-2 right-2 rounded-full bg-stone-900/70 px-3 py-1 text-xs font-semibold text-white">เปลี่ยนรูป</span>
                </div>
              ) : (
                <div
                  className={`grid place-items-center gap-1 rounded-xl border-2 border-dashed py-8 text-center transition ${
                    dragOver ? "border-amber-400 bg-amber-50/70" : "border-stone-200 hover:border-amber-300 hover:bg-amber-50/40"
                  }`}
                >
                  <span className="text-3xl">🖼️</span>
                  <span className="text-sm font-semibold text-stone-600">{dragOver ? "วางรูปที่นี่ได้เลย" : "แตะ หรือ ลากรูปมาวาง"}</span>
                  <span className="text-xs text-stone-400">PNG / JPG · ไม่เกิน 5MB</span>
                </div>
              )}
            </label>

            {reportErr && <p className="mt-2 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{reportErr}</p>}

            <button
              type="button"
              onClick={submitSlip}
              disabled={!slip || reporting}
              className="mt-3 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.01] hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {reporting ? "กำลังส่งสลิป…" : "✅ แจ้งโอนแล้ว"}
            </button>

            {/* ── ทางเลือกเสริม: LINE ── */}
            <div className="mt-4 border-t border-stone-100 pt-3 text-center">
              <p className="text-xs text-stone-400">หรือแจ้งผ่านช่องทางอื่น</p>
              <button
                type="button"
                onClick={() => shareToLine(placed.text)}
                className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-[#06C755] ring-1 ring-[#06C755]/40 transition hover:bg-[#06C755]/5"
              >
                💬 แจ้งสลิป + ส่งออเดอร์ทาง LINE
              </button>
            </div>
          </div>
        )}

        <Link href="/products" className="mt-4 block text-center text-sm font-semibold text-stone-400 hover:text-stone-600">← เลือกซื้อสินค้าต่อ</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
        <span className="text-6xl">🧾</span>
        <h1 className="mt-4 text-2xl font-extrabold text-amber-950">ยังไม่มีรายการสั่งซื้อ</h1>
        <Link href="/products" className="mt-6 inline-block rounded-full bg-amber-400 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:scale-105">🛍️ ไปเลือกสินค้า</Link>
      </div>
    );
  }

  const inputCls = "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300";

  /* ── ฟอร์มกรอกข้อมูลผู้รับ + ยืนยันสั่งซื้อ ── */
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/cart" className="text-sm font-semibold text-stone-400 hover:text-stone-600">← ตะกร้า</Link>
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950">
        {appendTo ? "สั่งเพิ่มในออเดอร์เดิม" : "ยืนยันการสั่งซื้อ"}
      </h1>
      {appendTo ? (
        <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm ring-1 ring-amber-200">
          <p className="font-bold text-amber-900">
            🛍️ กำลังเพิ่มเข้าออเดอร์ <span className="font-mono">{appendTo.id}</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">
            ใช้ชื่อ/ที่อยู่เดิม · <strong className="text-amber-700">ไม่คิดค่าจัดส่งเพิ่ม</strong> เพราะส่งรวมกล่องเดียวกัน
          </p>
          <button
            type="button"
            onClick={() => {
              clearAppendTarget();
              setAppendTo(null);
            }}
            className="mt-2 text-xs font-bold text-stone-500 underline underline-offset-2 hover:text-rose-600"
          >
            ยกเลิก — สั่งเป็นออเดอร์ใหม่แทน
          </button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-stone-500">กรอกข้อมูลผู้รับ แล้วกดสั่งซื้อ · ขั้นถัดไปจะแจ้งเลขออเดอร์ + บัญชีให้โอน</p>
      )}

      {/* โหมดพนักงาน: สั่งแทนลูกค้า (เห็นเฉพาะคนที่ล็อกอินหลังบ้าน) */}
      {staffName && !appendTo && (
        <label className={`mt-5 flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 transition ${staffMode ? "bg-sky-50 ring-sky-300" : "bg-white ring-stone-200 hover:ring-sky-200"}`}>
          <input type="checkbox" checked={staffMode} onChange={(e) => toggleStaffMode(e.target.checked)} className="mt-0.5 h-4 w-4 accent-sky-600" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-stone-800">🧑‍💼 สั่งแทนลูกค้า (โหมดพนักงาน — {staffName})</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              กรอกชื่อ/เบอร์/ที่อยู่ของ<strong>ลูกค้า</strong> · ออเดอร์จะบันทึกว่าสั่งโดยคุณ ไม่ผูกบัญชี/คูปอง/แต้มสมาชิกของคุณ ·
              สั่งเสร็จคัดลอกลิงก์ออเดอร์ส่งให้ลูกค้าโอน/แนบสลิปเองได้เลย
            </span>
          </span>
        </label>
      )}

      <div className={`mt-5 space-y-3 ${appendTo ? "hidden" : ""}`}>
        <div>
          <label className="mb-1 block text-sm font-bold text-stone-700">{staffMode ? "ชื่อผู้รับ (ลูกค้า)" : "ชื่อผู้รับ"}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-นามสกุล" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-stone-700">เบอร์โทร</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\-+ ]/g, ""))} inputMode="tel" placeholder="08x-xxx-xxxx" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-bold text-stone-700">ที่อยู่จัดส่ง</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} placeholder="บ้านเลขที่ · ถนน · ตำบล/อำเภอ · จังหวัด · รหัสไปรษณีย์" className={`${inputCls} resize-y`} />
        </div>
      </div>

      {/* คูปองส่วนลด (เฉพาะสมาชิก · ไม่ใช้ตอนสั่งเพิ่ม/สั่งแทนลูกค้า) */}
      {customer && !appendTo && !staffMode && (
        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-amber-200">
          <p className="text-sm font-bold text-stone-700">🎟️ คูปองส่วนลด</p>
          {couponPreview ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-emerald-800">{couponPreview.label}</p>
                <p className="text-xs text-emerald-600">ส่วนลด {formatPrice(couponPreview.discount)}</p>
                {couponPreview.note && <p className="mt-0.5 text-[11px] text-amber-600">⚠️ {couponPreview.note}</p>}
              </div>
              <button type="button" onClick={removeCoupon} className="shrink-0 text-xs font-bold text-stone-400 underline underline-offset-2 hover:text-rose-600">
                เอาออก
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                placeholder="กรอกโค้ดคูปอง"
                className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-2.5 font-mono text-sm uppercase tracking-wide text-stone-700 ring-1 ring-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                type="button"
                onClick={applyCoupon}
                disabled={couponBusy || !couponInput.trim()}
                className="shrink-0 rounded-2xl bg-stone-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-stone-900 disabled:opacity-40"
              >
                {couponBusy ? "…" : "ใช้"}
              </button>
            </div>
          )}
          {couponErr && <p className="mt-2 text-xs font-medium text-rose-600">{couponErr}</p>}
          {couponPreview && !useCoupon && tierDiscount > 0 && (
            <p className="mt-2 text-xs text-stone-500">ℹ️ ส่วนลดสมาชิกของคุณสูงกว่า จึงใช้ส่วนลดสมาชิกแทน (คูปองยังไม่ถูกตัดใช้ เก็บไว้ครั้งหน้าได้)</p>
          )}
        </div>
      )}

      {/* สรุปยอด */}
      <div className="mt-5 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
        <div className="flex justify-between text-sm text-stone-600"><span>รวมสินค้า ({totalQty} ชิ้น)</span><span>{formatPrice(subtotal)}</span></div>
        {discount > 0 && (
          <div className="mt-1 flex justify-between text-sm font-semibold text-emerald-600">
            <span>
              {useCoupon
                ? `🎟️ ${couponPreview!.label}`
                : `${tier?.icon ?? "🎖️"} ส่วนลดสมาชิก ${tier?.name ?? ""} (${tier?.pct ?? 0}%)`}
            </span>
            <span>−{formatPrice(discount)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between text-sm text-stone-600">
          <span>ค่าจัดส่ง{appendTo ? "" : ` (${shippingMethod.name})`}</span>
          <span>{appendTo ? "รวมกับออเดอร์เดิมแล้ว" : freeShipping ? "ฟรี" : formatPrice(shippingCost)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-amber-100 pt-2 text-base font-extrabold text-amber-950"><span>{appendTo ? "ยอดที่ต้องโอนเพิ่ม" : "ยอดชำระ"}</span><span className="text-amber-600">{formatPrice(total)}</span></div>
      </div>

      {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{err}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={placing}
        className="mt-4 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.01] hover:bg-amber-500 disabled:opacity-50"
      >
        {placing ? "กำลังบันทึก…" : appendTo ? `➕ เพิ่มเข้าออเดอร์ ${appendTo.id}` : "✅ ยืนยันสั่งซื้อ"}
      </button>
    </div>
  );
}
