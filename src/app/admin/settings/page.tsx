"use client";

import RequirePerm from "@/components/RequirePerm";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_SHIPPING,
  fetchShopPayment,
  freeShippingMinOf,
  persistShopPayment,
  shippingOf,
  tiersConfigOf,
  welcomeCouponOf,
  type BankAccount,
  type ShippingMethod,
  type ShopPayment,
  type WelcomeCouponConfig,
} from "@/lib/shop-settings";
import { DEFAULT_TIERS, type Tier } from "@/lib/tiers";
import { btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

const newId = (p = "b") =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

type Tab = "pay" | "ship" | "tier" | "welcome";

function AdminSettingsPageInner() {
  const [tab, setTab] = useState<Tab>("pay");

  // ── ชำระเงิน ──
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [promptpay, setPromptpay] = useState("");
  const [promptpayName, setPromptpayName] = useState("");
  const [note, setNote] = useState("");

  // ── จัดส่ง ──
  const [shipping, setShipping] = useState<ShippingMethod[]>([]);
  const [freeMin, setFreeMin] = useState<number>(0);

  // ── ระดับสมาชิก ──
  const [tiers, setTiers] = useState<Tier[]>([]);

  // ── คูปองต้อนรับ ──
  const [welcome, setWelcome] = useState<WelcomeCouponConfig>(welcomeCouponOf(null));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchShopPayment().then((p) => {
      setBanks(p.banks ?? []);
      setPromptpay(p.promptpay ?? "");
      setPromptpayName(p.promptpayName ?? "");
      setNote(p.note ?? "");
      setShipping(shippingOf(p));
      setFreeMin(freeShippingMinOf(p));
      setTiers(tiersConfigOf(p));
      setWelcome(welcomeCouponOf(p));
      setLoading(false);
    });
  }, []);

  const patchWelcome = (patch: Partial<WelcomeCouponConfig>) => {
    setWelcome((w) => ({ ...w, ...patch }));
    touch();
  };

  const touch = () => setSaved(false);

  /* ── บัญชี ── */
  function patchBank(id: string, patch: Partial<BankAccount>) {
    setBanks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    touch();
  }
  const addBank = () => {
    setBanks((bs) => [...bs, { id: newId(), bank: "", accountName: "", accountNo: "" }]);
    touch();
  };
  const removeBank = (id: string) => {
    setBanks((bs) => bs.filter((b) => b.id !== id));
    touch();
  };

  /* ── จัดส่ง ── */
  function patchShip(id: string, patch: Partial<ShippingMethod>) {
    setShipping((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    touch();
  }
  const addShip = () => {
    setShipping((ss) => [...ss, { id: newId("s"), name: "", price: 0 }]);
    touch();
  };
  const removeShip = (id: string) => {
    setShipping((ss) => ss.filter((s) => s.id !== id));
    touch();
  };

  async function save() {
    setSaving(true);
    setError("");
    const cleanShipping = shipping
      .map((s) => ({ ...s, name: s.name.trim(), price: Number(s.price) || 0 }))
      .filter((s) => s.name);

    if (cleanShipping.length === 0) {
      setSaving(false);
      setError("ต้องมีรูปแบบจัดส่งอย่างน้อย 1 อย่าง (ไม่งั้นลูกค้าเลือกไม่ได้)");
      setTab("ship");
      return;
    }

    const payload: ShopPayment = {
      banks: banks
        .map((b) => ({ ...b, bank: b.bank.trim(), accountName: b.accountName.trim(), accountNo: b.accountNo.trim() }))
        .filter((b) => b.accountNo || b.bank),
      promptpay: promptpay.trim() || undefined,
      promptpayName: promptpayName.trim() || undefined,
      note: note.trim() || undefined,
      shipping: cleanShipping,
      freeShippingMin: Number(freeMin) || 0,
      tiers: tiers
        .map((t) => ({ ...t, name: t.name.trim(), minSpend: Number(t.minSpend) || 0, discountPct: Number(t.discountPct) || 0 }))
        .filter((t) => t.name)
        .sort((a, b) => a.minSpend - b.minSpend),
      welcomeCoupon: {
        enabled: welcome.enabled,
        type: welcome.type,
        value: Number(welcome.value) || 0,
        minSpend: Number(welcome.minSpend) || 0,
        maxDiscount: welcome.type === "percent" ? Number(welcome.maxDiscount) || 0 : 0,
        expiryDays: Number(welcome.expiryDays) || 0,
      },
    };
    const res = await persistShopPayment(payload);
    setSaving(false);
    if (res.ok) {
      setShipping(cleanShipping);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(`บันทึกไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>⚙️ ตั้งค่าระบบ</h1>
      <p className={`mt-1 ${muted}`}>ช่องทางรับเงิน และรูปแบบการจัดส่งที่ลูกค้าเลือกได้ตอนสั่งซื้อ</p>

      {/* แท็บ */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["pay", "🏦 ชำระเงิน"],
            ["ship", "🚚 การจัดส่ง"],
            ["tier", "🏅 ระดับสมาชิก"],
            ["welcome", "🎁 คูปองต้อนรับ"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === k
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`mt-5 p-8 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>
      ) : (
        <>
          {/* ══════ ชำระเงิน ══════ */}
          {tab === "pay" && (
            <>
              <section className={`mt-4 p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">🏦 บัญชีธนาคาร ({banks.length})</h2>
                  <button
                    type="button"
                    onClick={addBank}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    ＋ เพิ่มบัญชี
                  </button>
                </div>

                {banks.length === 0 && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
                    ยังไม่มีบัญชี — กด “เพิ่มบัญชี” เพื่อกรอกเลขบัญชีร้าน
                  </p>
                )}

                <div className="mt-3 space-y-3">
                  {banks.map((b) => (
                    <div key={b.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={b.bank}
                          onChange={(e) => patchBank(b.id, { bank: e.target.value })}
                          placeholder="ธนาคาร (เช่น กสิกรไทย)"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <input
                          value={b.accountName}
                          onChange={(e) => patchBank(b.id, { accountName: e.target.value })}
                          placeholder="ชื่อบัญชี"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeBank(b.id)}
                          className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          🗑 ลบ
                        </button>
                      </div>
                      <input
                        value={b.accountNo}
                        onChange={(e) => patchBank(b.id, { accountNo: e.target.value })}
                        placeholder="เลขบัญชี (เช่น 123-4-56789-0)"
                        className={`${inputCls} mt-2 font-mono tracking-wide`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className={`p-5 ${card}`}>
                  <h2 className="text-sm font-semibold text-slate-800">📱 พร้อมเพย์ (PromptPay)</h2>
                  <div className="mt-3 space-y-2">
                    <input
                      value={promptpay}
                      onChange={(e) => {
                        setPromptpay(e.target.value);
                        touch();
                      }}
                      placeholder="เบอร์ / เลขบัตร ปชช. / เลขนิติบุคคล"
                      className={`${inputCls} font-mono tracking-wide`}
                    />
                    <input
                      value={promptpayName}
                      onChange={(e) => {
                        setPromptpayName(e.target.value);
                        touch();
                      }}
                      placeholder="ชื่อบัญชีพร้อมเพย์"
                      className={inputCls}
                    />
                  </div>
                </section>

                <section className={`p-5 ${card}`}>
                  <h2 className="text-sm font-semibold text-slate-800">📝 หมายเหตุถึงลูกค้า (ไม่บังคับ)</h2>
                  <textarea
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      touch();
                    }}
                    rows={3}
                    placeholder="เช่น โอนแล้วแนบสลิปในหน้าออเดอร์ · โอนภายใน 24 ชม."
                    className={`${inputCls} mt-3 h-[calc(100%-2.5rem)] resize-y`}
                  />
                </section>
              </div>
            </>
          )}

          {/* ══════ การจัดส่ง ══════ */}
          {tab === "ship" && (
            <>
              <section className={`mt-4 p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">🚚 รูปแบบการจัดส่ง ({shipping.length})</h2>
                  <button
                    type="button"
                    onClick={addShip}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    ＋ เพิ่มรูปแบบ
                  </button>
                </div>
                <p className={`mt-1 text-xs ${faint}`}>ลูกค้าจะเลือกจากรายการนี้ในหน้าตะกร้า · เรียงจากบนลงล่างตามที่แสดง</p>

                {shipping.length === 0 && (
                  <p className="mt-3 rounded-xl bg-rose-50 p-4 text-center text-xs font-semibold text-rose-600">
                    ⚠️ ยังไม่มีรูปแบบจัดส่ง — ลูกค้าจะสั่งซื้อไม่ได้ กรุณาเพิ่มอย่างน้อย 1 อย่าง
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  {shipping.map((s, i) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                        {i + 1}
                      </span>
                      <input
                        value={s.name}
                        onChange={(e) => patchShip(s.id, { name: e.target.value })}
                        placeholder="ชื่อที่ลูกค้าเห็น (เช่น ส่งธรรมดา 3-5 วัน)"
                        className={`${inputCls} min-w-52 flex-1`}
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={s.price}
                          onChange={(e) => patchShip(s.id, { price: Number(e.target.value) })}
                          className={`${inputCls} w-24 text-right tabular-nums`}
                        />
                        <span className="text-xs text-slate-500">บาท</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShip(s.id)}
                        className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        🗑 ลบ
                      </button>
                    </div>
                  ))}
                </div>

                {shipping.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShipping(DEFAULT_SHIPPING.map((d) => ({ ...d })));
                      touch();
                    }}
                    className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    ↩︎ ใช้ค่าเริ่มต้น (ส่งธรรมดา ฿50 · ส่งด่วน ฿90)
                  </button>
                )}
              </section>

              <section className={`mt-4 p-5 ${card}`}>
                <h2 className="text-sm font-semibold text-slate-800">🎁 ส่งฟรีเมื่อซื้อครบ</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={freeMin}
                    onChange={(e) => {
                      setFreeMin(Number(e.target.value));
                      touch();
                    }}
                    className={`${inputCls} w-36 text-right tabular-nums`}
                  />
                  <span className="text-sm text-slate-600">บาทขึ้นไป</span>
                </div>
                <p className={`mt-2 text-xs ${faint}`}>
                  {freeMin > 0
                    ? `ลูกค้าซื้อครบ ฿${freeMin.toLocaleString()} จะไม่เสียค่าส่ง (แสดงแถบความคืบหน้าในตะกร้าด้วย)`
                    : "ใส่ 0 = ปิดโปรส่งฟรี ลูกค้าจ่ายค่าส่งทุกออเดอร์"}
                </p>
              </section>
            </>
          )}

          {/* ══════ ระดับสมาชิก ══════ */}
          {tab === "tier" && (
            <section className={`mt-4 p-5 ${card}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">🏅 ระดับสมาชิก ({tiers.length})</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTiers([...tiers, { id: newId("t"), name: "", icon: "🎖", minSpend: 0, discountPct: 0 }]);
                    touch();
                  }}
                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  ＋ เพิ่มระดับ
                </button>
              </div>
              <p className={`mt-1 text-xs ${faint}`}>
                ลูกค้าสะสมยอด "จ่ายจริง" ตลอดชีพ ถึงขั้นต่ำของระดับไหน → ได้ส่วนลด % นั้นอัตโนมัติทุกออเดอร์ (คิดจากราคาสินค้าก่อนค่าส่ง)
              </p>

              {/* หัวตาราง */}
              <div className="mt-3 hidden grid-cols-[3rem_1fr_8rem_6rem_2.5rem] gap-2 px-1 text-[11px] font-bold text-slate-400 sm:grid">
                <span>ไอคอน</span>
                <span>ชื่อระดับ</span>
                <span className="text-right">ยอดสะสม ≥</span>
                <span className="text-right">ลด %</span>
                <span />
              </div>
              <div className="mt-1 space-y-2">
                {tiers.map((t, i) => (
                  <div key={t.id} className="grid grid-cols-[3rem_1fr_8rem_6rem_2.5rem] items-center gap-2">
                    <input
                      value={t.icon}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x))); touch(); }}
                      className={`${inputCls} text-center`}
                      maxLength={2}
                    />
                    <input
                      value={t.name}
                      placeholder="ชื่อระดับ"
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))); touch(); }}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={0}
                      value={t.minSpend}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, minSpend: Number(e.target.value) } : x))); touch(); }}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={t.discountPct}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, discountPct: Number(e.target.value) } : x))); touch(); }}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={() => { setTiers(tiers.filter((_, j) => j !== i)); touch(); }}
                      className="grid h-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"
                      aria-label="ลบระดับ"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>

              {tiers.length === 0 && (
                <button
                  type="button"
                  onClick={() => { setTiers(DEFAULT_TIERS.map((d) => ({ ...d }))); touch(); }}
                  className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  ↩︎ ใช้ค่าเริ่มต้น (5 ระดับ 🥉→👑)
                </button>
              )}
              <p className={`mt-3 text-xs ${faint}`}>
                💡 ควรมีระดับเริ่มต้นที่ยอด 0 · ลด 0% (สมาชิกใหม่) และเรียงยอดจากน้อยไปมาก · ระบบจะเรียงให้อัตโนมัติตอนบันทึก
              </p>
            </section>
          )}

          {tab === "welcome" && (
            <section className={card}>
              {/* หัว: ชื่อ + สวิตช์เปิด/ปิด (มีป้ายสถานะชัดเจน) */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">🎁 คูปองต้อนรับสมาชิกใหม่</h2>
                  <p className={`mt-0.5 text-xs ${faint}`}>แจกอัตโนมัติเมื่อลูกค้าสมัคร/ล็อกอินครั้งแรก · ผูกบัญชี ใช้ครั้งเดียว</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={welcome.enabled}
                  onClick={() => patchWelcome({ enabled: !welcome.enabled })}
                  className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs font-bold transition ${
                    welcome.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {welcome.enabled ? "เปิดแจกอยู่" : "ปิดอยู่"}
                  <span className={`relative h-6 w-11 rounded-full transition ${welcome.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${welcome.enabled ? "left-[22px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_18rem]">
                {/* ── ซ้าย: ตั้งค่า ── */}
                <div className={`space-y-5 ${welcome.enabled ? "" : "pointer-events-none opacity-50"}`}>
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-slate-600">รูปแบบส่วนลด</span>
                    <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                      {(["percent", "fixed"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => patchWelcome({ type: t })}
                          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                            welcome.type === t ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {t === "percent" ? "ลด %" : "ลดเป็นบาท"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">{welcome.type === "percent" ? "ส่วนลด (%)" : "ส่วนลด (บาท)"}</span>
                      <input type="number" min={0} value={welcome.value} onChange={(e) => patchWelcome({ value: Number(e.target.value) })} className={`${inputCls} text-right tabular-nums`} />
                    </label>
                    {welcome.type === "percent" && (
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">ส่วนลดสูงสุด (บาท)</span>
                        <input type="number" min={0} value={welcome.maxDiscount ?? 0} onChange={(e) => patchWelcome({ maxDiscount: Number(e.target.value) })} className={`${inputCls} text-right tabular-nums`} />
                        <span className="mt-1 block text-[11px] text-slate-400">0 = ไม่จำกัด</span>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">ยอดสั่งซื้อขั้นต่ำ (บาท)</span>
                      <input type="number" min={0} value={welcome.minSpend ?? 0} onChange={(e) => patchWelcome({ minSpend: Number(e.target.value) })} className={`${inputCls} text-right tabular-nums`} />
                      <span className="mt-1 block text-[11px] text-slate-400">0 = ไม่มีขั้นต่ำ</span>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">อายุคูปอง (วัน)</span>
                      <input type="number" min={0} value={welcome.expiryDays ?? 0} onChange={(e) => patchWelcome({ expiryDays: Number(e.target.value) })} className={`${inputCls} text-right tabular-nums`} />
                      <span className="mt-1 block text-[11px] text-slate-400">0 = ไม่หมดอายุ</span>
                    </label>
                  </div>

                  <p className={`text-xs ${faint}`}>💡 คูปองจะโผล่ให้ลูกค้าใส่อัตโนมัติตอนสั่งซื้อครั้งแรก — ไม่ต้องแจกโค้ดเอง</p>
                </div>

                {/* ── ขวา: พรีวิวตั๋วสด ── */}
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">ตัวอย่างที่ลูกค้าเห็น</span>
                  <div className={`overflow-hidden rounded-2xl shadow-sm ring-1 ${welcome.enabled ? "ring-sky-100" : "ring-slate-200 grayscale"}`}>
                    <div className={`px-4 py-5 text-center text-white ${welcome.enabled ? "bg-gradient-to-br from-sky-400 to-teal-500" : "bg-slate-400"}`}>
                      <span className="text-3xl">🎟️</span>
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wider opacity-90">คูปองต้อนรับ</p>
                      <p className="mt-0.5 text-2xl font-extrabold">
                        {welcome.type === "percent" ? `ลด ${welcome.value || 0}%` : `ลด ${welcome.value || 0}฿`}
                      </p>
                    </div>
                    <div className="space-y-1.5 bg-white px-4 py-4 text-center text-xs text-slate-500">
                      {welcome.type === "percent" && (welcome.maxDiscount ?? 0) > 0 && <p>• ลดสูงสุด {welcome.maxDiscount}฿</p>}
                      <p>• {(welcome.minSpend ?? 0) > 0 ? `ยอดขั้นต่ำ ${welcome.minSpend}฿` : "ไม่มียอดขั้นต่ำ"}</p>
                      <p>• {(welcome.expiryDays ?? 0) > 0 ? `ใช้ได้ภายใน ${welcome.expiryDays} วัน` : "ไม่มีวันหมดอายุ"}</p>
                      <p>• ใช้ได้ครั้งเดียว · เฉพาะบัญชีที่ได้รับ</p>
                    </div>
                  </div>
                  {!welcome.enabled && <p className="mt-2 text-center text-[11px] text-slate-400">ปิดอยู่ — ยังไม่แจกให้สมาชิกใหม่</p>}
                </div>
              </div>
            </section>
          )}

          {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-xs ${faint}`}>บันทึกครั้งเดียวมีผลทุกแท็บ</p>
            <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} ${saved ? "!bg-emerald-600" : ""}`}>
              {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
            </button>
          </div>

          <p className={`mt-6 text-center text-xs ${faint}`}>
            ดูผลฝั่งลูกค้าได้ที่หน้า{" "}
            <Link href="/cart" className="font-semibold text-amber-600 hover:underline">
              ตะกร้าสินค้า
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/** กันคนที่ไม่มีสิทธิ์พิมพ์ URL เข้าตรง ๆ */
export default function AdminSettingsPage() {
  return (
    <RequirePerm perm="settings.manage">
      <AdminSettingsPageInner />
    </RequirePerm>
  );
}
