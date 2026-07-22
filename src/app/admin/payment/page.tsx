"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchShopPayment,
  persistShopPayment,
  type BankAccount,
  type ShopPayment,
} from "@/lib/shop-settings";
import { btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

export default function AdminPaymentPage() {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [promptpay, setPromptpay] = useState("");
  const [promptpayName, setPromptpayName] = useState("");
  const [note, setNote] = useState("");
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
      setLoading(false);
    });
  }, []);

  function patchBank(id: string, patch: Partial<BankAccount>) {
    setBanks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setSaved(false);
  }
  function addBank() {
    setBanks((bs) => [...bs, { id: newId(), bank: "", accountName: "", accountNo: "" }]);
    setSaved(false);
  }
  function removeBank(id: string) {
    setBanks((bs) => bs.filter((b) => b.id !== id));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    const payload: ShopPayment = {
      banks: banks
        .map((b) => ({ ...b, bank: b.bank.trim(), accountName: b.accountName.trim(), accountNo: b.accountNo.trim() }))
        .filter((b) => b.accountNo || b.bank),
      promptpay: promptpay.trim() || undefined,
      promptpayName: promptpayName.trim() || undefined,
      note: note.trim() || undefined,
    };
    const res = await persistShopPayment(payload);
    setSaving(false);
    if (res.ok) {
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
      <h1 className={h1}>บัญชี / ช่องทางชำระเงิน</h1>
      <p className={`mt-1 ${muted}`}>
        ตั้งค่าบัญชีรับเงินของร้าน — ลูกค้าจะเห็นในหน้าตะกร้าเพื่อโอนเงิน แล้วแจ้งสลิปทาง LINE
      </p>

      {loading ? (
        <div className={`mt-6 p-8 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>
      ) : (
        <>
          {/* บัญชีธนาคาร */}
          <section className={`mt-5 p-5 ${card}`}>
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

          {/* พร้อมเพย์ */}
          <section className={`mt-4 p-5 ${card}`}>
            <h2 className="text-sm font-semibold text-slate-800">📱 พร้อมเพย์ (PromptPay)</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={promptpay}
                onChange={(e) => {
                  setPromptpay(e.target.value);
                  setSaved(false);
                }}
                placeholder="เบอร์ / เลขบัตร ปชช. / เลขนิติบุคคล"
                className={`${inputCls} min-w-52 flex-1 font-mono tracking-wide`}
              />
              <input
                value={promptpayName}
                onChange={(e) => {
                  setPromptpayName(e.target.value);
                  setSaved(false);
                }}
                placeholder="ชื่อบัญชีพร้อมเพย์"
                className={`${inputCls} min-w-44 flex-1`}
              />
            </div>
          </section>

          {/* หมายเหตุ */}
          <section className={`mt-4 p-5 ${card}`}>
            <h2 className="text-sm font-semibold text-slate-800">📝 หมายเหตุถึงลูกค้า (ไม่บังคับ)</h2>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
              rows={2}
              placeholder="เช่น โอนแล้วแจ้งสลิปทาง LINE พร้อมเลขออเดอร์ · โอนภายใน 24 ชม."
              className={`${inputCls} mt-3 resize-y`}
            />
          </section>

          {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-xs ${faint}`}>ลูกค้าจะเห็นในหน้าตะกร้า · เกี่ยวข้องกับปุ่ม LINE ที่แจ้งสลิป</p>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={`${btnPrimary} ${saved ? "!bg-emerald-600" : ""}`}
            >
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
