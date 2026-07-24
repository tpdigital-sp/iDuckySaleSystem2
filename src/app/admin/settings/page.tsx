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
  type BankAccount,
  type ShippingMethod,
  type ShopPayment,
} from "@/lib/shop-settings";
import { btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

const newId = (p = "b") =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

type Tab = "pay" | "ship";

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
      setLoading(false);
    });
  }, []);

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
    <div className="mx-auto max-w-3xl">
      <h1 className={h1}>⚙️ ตั้งค่าระบบ</h1>
      <p className={`mt-1 ${muted}`}>ช่องทางรับเงิน และรูปแบบการจัดส่งที่ลูกค้าเลือกได้ตอนสั่งซื้อ</p>

      {/* แท็บ */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["pay", "🏦 ชำระเงิน"],
            ["ship", "🚚 การจัดส่ง"],
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

              <section className={`mt-4 p-5 ${card}`}>
                <h2 className="text-sm font-semibold text-slate-800">📱 พร้อมเพย์ (PromptPay)</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    value={promptpay}
                    onChange={(e) => {
                      setPromptpay(e.target.value);
                      touch();
                    }}
                    placeholder="เบอร์ / เลขบัตร ปชช. / เลขนิติบุคคล"
                    className={`${inputCls} min-w-52 flex-1 font-mono tracking-wide`}
                  />
                  <input
                    value={promptpayName}
                    onChange={(e) => {
                      setPromptpayName(e.target.value);
                      touch();
                    }}
                    placeholder="ชื่อบัญชีพร้อมเพย์"
                    className={`${inputCls} min-w-44 flex-1`}
                  />
                </div>
              </section>

              <section className={`mt-4 p-5 ${card}`}>
                <h2 className="text-sm font-semibold text-slate-800">📝 หมายเหตุถึงลูกค้า (ไม่บังคับ)</h2>
                <textarea
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    touch();
                  }}
                  rows={2}
                  placeholder="เช่น โอนแล้วแนบสลิปในหน้าออเดอร์ · โอนภายใน 24 ชม."
                  className={`${inputCls} mt-3 resize-y`}
                />
              </section>
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

          {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-xs ${faint}`}>บันทึกครั้งเดียวมีผลทั้ง 2 แท็บ</p>
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
