"use client";

/**
 * คูปองส่วนลด /admin/coupons  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * สร้างโค้ด/ลิงก์แจกลูกค้า · ใช้ได้ครั้งเดียวต่อใบ · ระบบตัดใช้ฝั่งเซิร์ฟเวอร์กันใช้ซ้ำ
 *
 * ของที่เพิ่มจากเดิม: นับใบที่ "ใกล้หมดอายุใน 7 วัน" — คูปองที่แจกไปแล้ว
 * แต่หมดอายุก่อนลูกค้าได้ใช้ คือส่วนลดที่เสียเปล่าทั้งงบและความรู้สึกลูกค้า
 */

import { useCallback, useEffect, useState } from "react";
import { publicOrigin } from "@/lib/shop-info";
import { couponLabel, type Coupon } from "@/lib/coupons";
import { fetchProductsLite } from "@/lib/product-repo";
import {
  Banner,
  Btn,
  Empty,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  Stat,
  Stats,
  Tag,
} from "@/components/admin/ui";

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

const STATUS: Record<Coupon["status"], { label: string; tone: "mint" | "quiet" | "coral"; bar: string }> = {
  active: { label: "พร้อมใช้", tone: "mint", bar: "var(--dk-mint)" },
  redeemed: { label: "ใช้แล้ว", tone: "quiet", bar: "var(--dk-quiet)" },
  void: { label: "ยกเลิก", tone: "coral", bar: "var(--dk-quiet)" },
};

/** เหลืออีกกี่วันจะหมดอายุ (null = ไม่มีวันหมดอายุ) */
function daysLeft(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return null;
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((mid(d) - mid(new Date())) / 86400000);
}

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

  const expiring = coupons.filter((c) => {
    if (c.status !== "active") return false;
    const d = daysLeft(c.expiresAt);
    return d !== null && d >= 0 && d <= 7;
  }).length;

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="คูปองส่วนลด"
        count={`${coupons.length} ใบ`}
        sub="สร้างโค้ด/ลิงก์แจกลูกค้า · ใช้ได้ครั้งเดียวต่อใบ · ระบบตัดใช้ฝั่งเซิร์ฟเวอร์กันใช้ซ้ำ"
      />

      {needsSetup && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่มีตาราง coupons"
            detail="เปิด Supabase SQL editor แล้วรัน supabase/coupons.sql หนึ่งครั้ง จากนั้นรีเฟรชหน้านี้"
          />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={active}
          label="พร้อมใช้"
          detail={expiring ? `ในนี้หมดอายุใน 7 วัน ${expiring} ใบ — แจกให้ทันก่อนเสียเปล่า` : "ยังไม่มีใบไหนใกล้หมดอายุ"}
          pct={coupons.length ? (active / coupons.length) * 100 : 0}
        />
        <Stat label="ใช้แล้ว" value={redeemed} hint="ตัดใช้ไปแล้ว" />
        <Stat
          label="ใกล้หมดอายุ"
          value={expiring}
          hint={expiring ? "ใบ — ภายใน 7 วัน" : "ใบ"}
          tone={expiring ? "due" : undefined}
        />
      </Stats>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,350px)_1fr]">
        {/* ── ฟอร์มสร้าง ── */}
        <form onSubmit={create} className="dkb-g h-fit p-4 sm:p-5">
          <h2 className="dkb-h2 mb-3 text-[1.06rem]">สร้างคูปองใหม่</h2>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["percent", "fixed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                aria-pressed={form.type === t}
                className="dkb-tab justify-center"
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
              className="dkb-g flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px]" style={{ color: "var(--dk-navy-soft)" }}
            >
              <span>
                สินค้าไม่ร่วมรายการ — ไม่บังคับ
                {exclude.length > 0 && <span className="ml-1 font-semibold" style={{ color: "var(--dk-coral-ink)" }}>({exclude.length})</span>}
              </span>
              <span style={{ color: "var(--dk-faint)" }}>{exOpen ? "▲" : "▼"}</span>
            </button>
            {exOpen && (
              <div className="dkb-g mt-2 p-2">
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
                      <label key={p.id} className="dkb-row !min-h-0 cursor-pointer gap-2 px-2 py-1.5 text-[12px]">
                        <input
                          type="checkbox"
                          checked={exclude.includes(p.id)}
                          onChange={(e) =>
                            setExclude((xs) => (e.target.checked ? [...xs, p.id] : xs.filter((x) => x !== p.id)))
                          }
                          style={{ accentColor: "var(--dk-coral-deep)" }}
                        />
                        <span className="truncate">{p.name}</span>
                      </label>
                    ))}
                  {products.length === 0 && <p className="px-1.5 py-2 text-[12px]" style={{ color: "var(--dk-faint)" }}>กำลังโหลดรายการสินค้า…</p>}
                </div>
                {exclude.length > 0 && (
                  <p className="mt-2 border-t pt-2 text-[11.5px]" style={{ borderColor: "var(--dk-hair)", color: "var(--dk-navy-soft)" }}>
                    เลือกแล้ว {exclude.length} สินค้า — ลูกค้าใช้คูปองได้ แต่ส่วนลดจะไม่คิดจากสินค้าเหล่านี้
                    <button type="button" onClick={() => setExclude([])} className="ml-2 font-semibold hover:underline" style={{ color: "var(--dk-coral-ink)" }}>
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

          {err && (
            <p className="mb-3 rounded-[14px] px-3 py-2 text-[12px]" style={{ background: "var(--dk-coral-wash)", color: "var(--dk-coral-ink)" }}>
              {err}
            </p>
          )}

          <button type="submit" disabled={busy} className="dkb-btn dkb-btn-navy w-full">
            {busy ? "กำลังสร้าง…" : "สร้างคูปอง"}
          </button>

          {justMade.length > 0 && (
            <div className="mt-4 rounded-[18px] p-3" style={{ background: "var(--dk-mint-wash)" }}>
              <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--dk-mint-ink)" }}>สร้างแล้ว {justMade.length} ใบ — คัดลอกลิงก์แจกได้เลย</p>
              <div className="space-y-1.5">
                {justMade.map((code) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <code className="dkb-code flex-1 truncate rounded-lg bg-white px-2 py-1">
                      {code}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(couponUrl(code), `link-${code}`)}
                      className="dkb-btn dkb-btn-navy dkb-btn-sm !min-h-[28px] !px-2.5 !text-[11px]"
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
          <ListHead title="คูปอง" note={`พร้อมใช้ ${active} · ใช้แล้ว ${redeemed}`} />

          {loading ? (
            <Empty title="กำลังโหลด…" body="ดึงคูปองจากเซิร์ฟเวอร์" />
          ) : coupons.length === 0 ? (
            <Empty title="ยังไม่มีคูปอง" body="สร้างใบแรกจากฟอร์มด้านซ้าย — สร้างทีเดียวหลายใบได้" />
          ) : (
            <Rows>
              {coupons.map((c) => {
                const left = daysLeft(c.expiresAt);
                const soon = c.status === "active" && left !== null && left >= 0 && left <= 7;
                return (
                  <Row key={c.code} tone={soon ? "var(--dk-coral-deep)" : STATUS[c.status].bar} done={c.status !== "active"}>
                    <RowMain
                      name={<span className="dkb-code text-[0.95rem]">{c.code}</span>}
                      tags={
                        <>
                          <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag>
                          {soon && <Tag tone="solid">{left === 0 ? "หมดอายุวันนี้" : `หมดอายุอีก ${left} วัน`}</Tag>}
                          {c.assignedTo && <Tag tone="lilac">เจาะจงบัญชี</Tag>}
                        </>
                      }
                      meta={
                        <>
                          <span>{couponLabel(c)}</span>
                          {c.minSpend ? <span>ขั้นต่ำ ฿{c.minSpend}</span> : null}
                          {c.maxDiscount ? <span>สูงสุด ฿{c.maxDiscount}</span> : null}
                          {c.excludeProducts?.length ? (
                            <span title={c.excludeProducts.map((id) => products.find((p) => p.id === id)?.name ?? id).join(", ")}>
                              ไม่ร่วม {c.excludeProducts.length} สินค้า
                            </span>
                          ) : null}
                          {!soon && c.expiresAt ? <span>หมดอายุ {new Date(c.expiresAt).toLocaleDateString("th-TH")}</span> : null}
                          {c.note ? <span>“{c.note}”</span> : null}
                          {c.status === "redeemed" && c.redeemedOrderId ? <span className="id">{c.redeemedOrderId}</span> : null}
                        </>
                      }
                    />
                    <RowSide>
                      {c.status === "active" && (
                        <span className="flex items-center gap-2">
                          <Btn small onClick={() => copy(couponUrl(c.code), `row-${c.code}`)}>
                            {copied === `row-${c.code}` ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                          </Btn>
                          <Btn small onClick={() => void voidCoupon(c.code)}>
                            ยกเลิก
                          </Btn>
                        </span>
                      )}
                    </RowSide>
                  </Row>
                );
              })}
            </Rows>
          )}
        </section>
      </div>
    </PageShell>
  );
}

const inputCls = "w-full border-0 bg-transparent p-0 text-[0.94rem] outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dkb-g dkb-field mb-2.5 block">
      <span className="lb">{label}</span>
      {children}
    </label>
  );
}
