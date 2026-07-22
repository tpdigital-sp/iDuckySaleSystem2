"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice, FREE_SHIPPING_THRESHOLD, SHIPPING_METHODS } from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { useCustomer } from "@/lib/customer-context";
import { fetchShopPayment, hasPayment, EMPTY_PAYMENT, type ShopPayment } from "@/lib/shop-settings";
import { placeOrder, reportPayment } from "@/lib/order-repo";

interface Placed {
  id: string;
  text: string;
  total: number;
  url: string;
  key?: string;
}

export default function CheckoutPage() {
  const { items, subtotal, totalQty, productOf, clear } = useCart();
  const { customer } = useCustomer();
  const [payment, setPayment] = useState<ShopPayment>(EMPTY_PAYMENT);
  const [shippingId, setShippingId] = useState<string>(SHIPPING_METHODS[0].id);

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

  const [linkCopied, setLinkCopied] = useState(false);

  // แจ้งโอน (อัปโหลดสลิป)
  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string>("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportErr, setReportErr] = useState("");

  const [dragOver, setDragOver] = useState(false);

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
    fetchShopPayment().then(setPayment);
    const s = localStorage.getItem("iducky-shipping-v1");
    if (s) setShippingId(s);
  }, []);

  const shippingMethod = SHIPPING_METHODS.find((s) => s.id === shippingId) ?? SHIPPING_METHODS[0];
  const freeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingCost = freeShipping ? 0 : shippingMethod.price;
  const total = subtotal + shippingCost;

  async function submit() {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setErr("กรอกชื่อ เบอร์โทร และที่อยู่จัดส่งให้ครบ");
      return;
    }
    setPlacing(true);
    setErr("");
    const orderItems = items.map((it) => ({
      productId: it.productId,
      name: productOf(it.productId)?.name ?? it.productId,
      selections: Object.entries(it.selections).map(([k, v]) => `${k}: ${v}`).join(" · "),
      qty: it.qty,
      unitPrice: it.unitPrice,
    }));
    const res = await placeOrder({
      customerName: name,
      phone,
      address,
      email: customer?.email,
      customerId: customer?.id,
      shipping: shippingMethod.name,
      shippingCost,
      subtotal,
      total,
      items: orderItems,
    });
    setPlacing(false);
    if (!res.ok || !res.orderId) {
      setErr(res.error ?? "สั่งซื้อไม่สำเร็จ");
      return;
    }
    // ลิงก์ออเดอร์ (สำหรับส่งให้แอดมินเปิดดู/แก้ไข)
    const orderUrl = `${window.location.origin}/admin/orders?order=${res.orderId}`;
    // สร้างข้อความ LINE ก่อนล้างตะกร้า
    const lines = [`🦆 ออเดอร์ ${res.orderId}`, `ชื่อ: ${name.trim()} · ${phone.trim()}`, "━━━━━━━━━━━━━━"];
    orderItems.forEach((it, i) => {
      lines.push(`${i + 1}) ${it.name} ×${it.qty} = ${it.unitPrice > 0 ? formatPrice(it.unitPrice * it.qty) : "รอตีราคา"}`);
      if (it.selections) lines.push(`   • ${it.selections}`);
    });
    lines.push("━━━━━━━━━━━━━━");
    lines.push(`รวม ${totalQty} ชิ้น · จัดส่ง ${freeShipping ? "ฟรี" : formatPrice(shippingCost)}`);
    lines.push(`ยอดชำระ: ${formatPrice(total)}`);
    lines.push("(โอนแล้วแนบรูปสลิปในแชทนี้ได้เลย)");
    lines.push(`🔗 ลิงก์ออเดอร์: ${orderUrl}`);
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

  /* ── หลังสั่งซื้อสำเร็จ: เลขออเดอร์ + แจ้งโอน + แชร์ LINE ── */
  if (placed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-2xl bg-emerald-50/70 p-6 text-center ring-1 ring-emerald-200">
          <span className="text-5xl">✅</span>
          <h1 className="mt-3 text-2xl font-extrabold text-emerald-800">สั่งซื้อสำเร็จ!</h1>
          <p className="mt-1 text-sm text-stone-600">เลขออเดอร์ของคุณ</p>
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
            {linkCopied ? "✓ คัดลอกลิงก์แล้ว" : "🔗 คัดลอกลิงก์ออเดอร์ (ส่งให้แอดมิน)"}
          </button>
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
      <h1 className="mt-1 text-2xl font-extrabold text-amber-950">ยืนยันการสั่งซื้อ</h1>
      <p className="mt-1 text-sm text-stone-500">กรอกข้อมูลผู้รับ แล้วกดสั่งซื้อ · ขั้นถัดไปจะแจ้งเลขออเดอร์ + บัญชีให้โอน</p>

      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-bold text-stone-700">ชื่อผู้รับ</label>
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

      {/* สรุปยอด */}
      <div className="mt-5 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
        <div className="flex justify-between text-sm text-stone-600"><span>รวมสินค้า ({totalQty} ชิ้น)</span><span>{formatPrice(subtotal)}</span></div>
        <div className="mt-1 flex justify-between text-sm text-stone-600"><span>ค่าจัดส่ง ({shippingMethod.name})</span><span>{freeShipping ? "ฟรี" : formatPrice(shippingCost)}</span></div>
        <div className="mt-2 flex justify-between border-t border-amber-100 pt-2 text-base font-extrabold text-amber-950"><span>ยอดชำระ</span><span className="text-amber-600">{formatPrice(total)}</span></div>
      </div>

      {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{err}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={placing}
        className="mt-4 w-full rounded-full bg-amber-400 px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:scale-[1.01] hover:bg-amber-500 disabled:opacity-50"
      >
        {placing ? "กำลังสั่งซื้อ…" : "✅ ยืนยันสั่งซื้อ"}
      </button>
    </div>
  );
}
