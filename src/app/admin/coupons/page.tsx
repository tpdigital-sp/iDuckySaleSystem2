"use client";

import { useCallback, useEffect, useState } from "react";
import { publicOrigin } from "@/lib/shop-info";
import { couponLabel, type Coupon } from "@/lib/coupons";
import { fetchProductsLite } from "@/lib/product-repo";

type Form = {
  type: "percent" | "fixed";
  value: string;
  minSpend: string;
  maxDiscount: string;
  expiresAt: string;
  note: string;
  assignedTo: string;
  count: string;
  codePrefix: string;
};

const EMPTY: Form = {
  type: "percent",
  value: "",
  minSpend: "",
  maxDiscount: "",
  expiresAt: "",
  note: "",
  assignedTo: "",
  count: "1",
  codePrefix: "",
};

const STATUS: Record<Coupon["status"], { label: string; cls: string }> = {
  active: { label: "พร้อมใช้", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  redeemed: { label: "ใช้แล้ว", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
  void: { label: "ยกเลิก", cls: "bg-rose-50 text-rose-600 ring-rose-200" },
};

function couponUrl(code: string) {
  return `${publicOrigin()}/coupon/${encodeURIComponent(code)}`;
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justMade, setJustMade] = useState<string[]>([]);
  const [copied, setCopied] = useState<string>("");
  // สินค้าไม่ร่วมรายการ (เลือกจากรายการสินค้าจริง)
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [exSearch, setExSearch] = useState("");
  const [exOpen, setExOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/coupons", { cache: "no-store" });
      const j = await res.json();
      setCoupons(j.coupons ?? []);
      setNeedsSetup(!!j.needsSetup);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetchProductsLite()
      .then((ps) => setProducts(ps.map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, [load]);

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ไม่รองรับ clipboard */
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setJustMade([]);
    const value = Number(form.value);
    if (!value || value <= 0) return setErr("ใส่มูลค่าส่วนลดให้มากกว่า 0");
    if (form.type === "percent" && value > 100) return setErr("ส่วนลด % ต้องไม่เกิน 100");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          value,
          minSpend: Number(form.minSpend) || undefined,
          maxDiscount: form.type === "percent" ? Number(form.maxDiscount) || undefined : undefined,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
          note: form.note.trim() || undefined,
          assignedTo: form.assignedTo.trim() || undefined,
          excludeProducts: exclude.length ? exclude : undefined,
          count: Number(form.count) || 1,
          codePrefix: form.codePrefix.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setErr(j.error ?? "สร้างคูปองไม่สำเร็จ");
      setJustMade(j.codes ?? []);
      setForm((f) => ({ ...EMPTY, type: f.type })); // คงชนิดไว้ เผื่อสร้างต่อ
      setExclude([]);
      setExSearch("");
      setExOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function voidCoupon(code: string) {
    if (!confirm(`ยกเลิกคูปอง ${code}?`)) return;
    const res = await fetch(`/api/admin/coupons?code=${encodeURIComponent(code)}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return alert(j.error ?? "ยกเลิกไม่สำเร็จ");
    await load();
  }

  const active = coupons.filter((c) => c.status === "active").length;
  const redeemed = coupons.filter((c) => c.status === "redeemed").length;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">🎟️ คูปองส่วนลด</h1>
        <p className="mt-1 text-sm text-slate-500">
          สร้างโค้ด/ลิงก์แจกลูกค้า · ใช้ได้ครั้งเดียวต่อใบ · ระบบตัดใช้ฝั่งเซิร์ฟเวอร์กันใช้ซ้ำ
        </p>
      </header>

      {needsSetup && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ยังไม่มีตาราง <code className="font-mono">coupons</code> — เปิด Supabase SQL editor แล้วรัน{" "}
          <code className="font-mono">supabase/coupons.sql</code> หนึ่งครั้ง จากนั้นรีเฟรชหน้านี้
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ── ฟอร์มสร้าง ── */}
        <form onSubmit={create} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">สร้างคูปองใหม่</h2>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  form.type === t
                    ? "border-sky-400 bg-sky-50 text-sky-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {t === "percent" ? "ลด %" : "ลดเป็นบาท"}
              </button>
            ))}
          </div>

          <Field label={form.type === "percent" ? "ส่วนลด (%)" : "ส่วนลด (บาท)"}>
            <input
              type="number"
              min={1}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              className={inputCls}
              placeholder={form.type === "percent" ? "เช่น 10" : "เช่น 100"}
            />
          </Field>

          {form.type === "percent" && (
            <Field label="ส่วนลดสูงสุด (บาท) — ไม่บังคับ">
              <input
                type="number"
                min={0}
                value={form.maxDiscount}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                className={inputCls}
                placeholder="เช่น 300"
              />
            </Field>
          )}

          <Field label="ยอดขั้นต่ำ (บาท) — ไม่บังคับ">
            <input
              type="number"
              min={0}
              value={form.minSpend}
              onChange={(e) => setForm((f) => ({ ...f, minSpend: e.target.value }))}
              className={inputCls}
              placeholder="เช่น 500"
            />
          </Field>

          <Field label="วันหมดอายุ — ไม่บังคับ">
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className={inputCls}
            />
          </Field>

          <Field label="เจาะจงลูกค้า (customer ID) — ไม่บังคับ">
            <input
              value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              className={inputCls}
              placeholder="ล็อกให้ใช้ได้เฉพาะบัญชีนี้"
            />
          </Field>

          {/* สินค้าไม่ร่วมรายการ — ส่วนลด/ยอดขั้นต่ำจะคิดเฉพาะสินค้าที่ร่วม */}
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setExOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <span>
                🚫 สินค้าไม่ร่วมรายการ — ไม่บังคับ
                {exclude.length > 0 && <span className="ml-1 font-bold text-rose-600">({exclude.length})</span>}
              </span>
              <span className="text-slate-400">{exOpen ? "▲" : "▼"}</span>
            </button>
            {exOpen && (
              <div className="mt-2 rounded-lg border border-slate-200 p-2">
                <input
                  value={exSearch}
                  onChange={(e) => setExSearch(e.target.value)}
                  className={inputCls}
                  placeholder="ค้นหาชื่อสินค้า…"
                />
                <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
                  {products
                    .filter((p) => !exSearch.trim() || p.name.toLowerCase().includes(exSearch.trim().toLowerCase()))
                    .map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={exclude.includes(p.id)}
                          onChange={(e) =>
                            setExclude((xs) => (e.target.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id)))
                          }
                          className="accent-rose-500"
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  {products.length === 0 && <p className="px-1.5 py-2 text-xs text-slate-400">กำลังโหลดรายการสินค้า…</p>}
                </div>
                {exclude.length > 0 && (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    เลือกแล้ว {exclude.length} สินค้า — ลูกค้าใช้คูปองได้ แต่ส่วนลดจะไม่คิดจากสินค้าเหล่านี้
                    <button type="button" onClick={() => setExclude([])} className="ml-2 font-medium text-rose-600 hover:underline">
                      ล้างทั้งหมด
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="จำนวนใบ">
              <input
                type="number"
                min={1}
                max={500}
                value={form.count}
                onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="คำนำหน้าโค้ด">
              <input
                value={form.codePrefix}
                onChange={(e) => setForm((f) => ({ ...f, codePrefix: e.target.value.toUpperCase() }))}
                className={inputCls}
                placeholder="เช่น NEW"
                maxLength={6}
              />
            </Field>
          </div>

          <Field label="โน้ตภายใน — ไม่บังคับ">
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className={inputCls}
              placeholder="เช่น แจกงานอีเวนต์ ต.ค."
            />
          </Field>

          {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? "กำลังสร้าง…" : "สร้างคูปอง"}
          </button>

          {justMade.length > 0 && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="mb-2 text-xs font-bold text-emerald-800">สร้างแล้ว {justMade.length} ใบ — คัดลอกลิงก์แจกได้เลย</p>
              <div className="space-y-1.5">
                {justMade.map((code) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-emerald-200">
                      {code}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(couponUrl(code), `link-${code}`)}
                      className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                    >
                      {copied === `link-${code}` ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* ── รายการคูปอง ── */}
        <section>
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
            <span>ทั้งหมด {coupons.length} ใบ</span>
            <span className="text-emerald-600">พร้อมใช้ {active}</span>
            <span className="text-slate-400">ใช้แล้ว {redeemed}</span>
          </div>

          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">กำลังโหลด…</p>
          ) : coupons.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              ยังไม่มีคูปอง — สร้างใบแรกจากฟอร์มด้านซ้าย
            </p>
          ) : (
            <div className="space-y-2">
              {coupons.map((c) => (
                <div
                  key={c.code}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <code className="font-mono text-sm font-bold text-slate-800">{c.code}</code>
                  <span className="text-xs text-slate-500">{couponLabel(c)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS[c.status].cls}`}>
                    {STATUS[c.status].label}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {c.status === "active" && (
                      <>
                        <button
                          type="button"
                          onClick={() => copy(couponUrl(c.code), `row-${c.code}`)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          {copied === `row-${c.code}` ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                        </button>
                        <button
                          type="button"
                          onClick={() => voidCoupon(c.code)}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          ยกเลิก
                        </button>
                      </>
                    )}
                  </div>
                  <div className="w-full text-[11px] text-slate-400">
                    {c.minSpend ? `ขั้นต่ำ ฿${c.minSpend} · ` : ""}
                    {c.maxDiscount ? `สูงสุด ฿${c.maxDiscount} · ` : ""}
                    {c.excludeProducts?.length ? (
                      <span
                        className="cursor-help underline decoration-dotted"
                        title={c.excludeProducts.map((id) => products.find((p) => p.id === id)?.name ?? id).join(", ")}
                      >
                        ไม่ร่วม {c.excludeProducts.length} สินค้า
                      </span>
                    ) : (
                      ""
                    )}
                    {c.excludeProducts?.length ? " · " : ""}
                    {c.expiresAt ? `หมดอายุ ${new Date(c.expiresAt).toLocaleDateString("th-TH")} · ` : ""}
                    {c.assignedTo ? "เจาะจงบัญชี · " : ""}
                    {c.note ? `“${c.note}” · ` : ""}
                    {c.status === "redeemed" && c.redeemedOrderId ? `ใช้กับ ${c.redeemedOrderId}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
