"use client";

import { useEffect, useMemo, useState } from "react";
import { botApi } from "../bot-ui";
import { emojisOf, RichText, textOf, type Emoji, type Reply } from "../saved-replies/shared";

/**
 * ⊕ เลือกคอนเทนต์ → 💬 ข้อความตอบกลับ (เจ้าของร้าน 14 ต.ค. 69 "ทำตามภาพ" — หน้าตาเหมือนหน้าต่างใน LINE OA Manager)
 * ซ้าย: ค้นหาด้วยชื่อ · ทั้งหมด/ติดดาว · เรียงลำดับ · รายการ (ชื่อ + ข้อความบรรทัดเดียว + ★)
 * ขวา: ดูตัวอย่างบนพื้นห้องแชทสีฟ้าแบบ LINE · "เลือก" = ใส่ข้อความลงช่องพิมพ์ (ยังไม่ส่ง — แอดมินแก้ก่อนกดส่งได้)
 * ข้อมูลจากสำเนาในหน้า /admin/chatbot/saved-replies (ดึงจาก LINE OA)
 * 🎟 แท็บ คูปอง (14 ต.ค. 69): คูปองของร้านเราที่คนนี้ใช้ได้ (/api/admin/chatbot/chats/coupons) → "เลือก" = ข้อความชวนใช้คูปอง + ลิงก์ /coupon/CODE
 *    (ไม่ใช่คูปองของ LINE OA — คนละระบบ ใช้ลดบนเว็บไม่ได้)
 */
type CouponRow = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  minSpend: number | null;
  maxDiscount: number | null;
  expiresAt: string | null;
  note: string;
  usesLeft: number;
  maxUses: number;
  forThisCustomer: boolean;
  hasExclusions: boolean;
  link: string;
};
type CouponRes = { member: { id: string; name: string } | null; coupons: CouponRow[] };
type Tab = "replies" | "coupons";

const baht = (n: number) => `฿${n.toLocaleString("th-TH")}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const couponValue = (c: CouponRow) => (c.type === "percent" ? `ลด ${c.value}%${c.maxDiscount ? ` (สูงสุด ${baht(c.maxDiscount)})` : ""}` : `ลด ${baht(c.value)}`);

/** ข้อความที่ใส่ช่องพิมพ์เมื่อเลือกคูปอง — บอกเงื่อนไขครบ + ต้องล็อกอิน (คูปองตัดสิทธิ์ด้วยบัญชีเว็บเท่านั้น) */
function couponMessage(c: CouponRow): string {
  const lines = [`🎟 คูปองส่วนลดสำหรับคุณลูกค้าค่ะ`, ``, `${couponValue(c)}`, `โค้ด: ${c.code}`];
  if (c.minSpend) lines.push(`เมื่อสั่งซื้อครบ ${baht(c.minSpend)}`);
  if (c.expiresAt) lines.push(`ใช้ได้ถึง ${fmtDate(c.expiresAt)}`);
  if (c.hasExclusions) lines.push(`(ยกเว้นสินค้าบางรายการ)`);
  lines.push(``, `👉 กดรับคูปอง: ${c.link}`, ``, `⚠️ เข้าสู่ระบบด้วย LINE ก่อนสั่งซื้อ จึงจะใช้คูปองได้นะคะ`);
  return lines.join("\n");
}
type Res = { items: Reply[] };
type Sort = "oa" | "name";

/** ตัวแทนชื่อแบบปุ่ม "ชื่อผู้ใช้/ชื่อบัญชี" ใน OA — Messaging API ไม่แทนให้ จึงแทนเองก่อนใส่ช่องพิมพ์ */
function fillPlaceholders(text: string, customerName: string): string {
  return text.replace(/\{Nickname\}/g, customerName || "คุณลูกค้า").replace(/\{AccountName\}/g, "iDuckyShop");
}

let cache: Reply[] | null = null;

export default function SavedReplyPicker({
  chatId,
  customerName,
  onClose,
  onPick,
}: {
  /** LINE userId ของห้อง — ใช้หาบัญชีเว็บ/คูปองของคนนี้ */
  chatId: string;
  customerName: string;
  onClose: () => void;
  onPick: (text: string, emojis: Emoji[]) => void;
}) {
  const [items, setItems] = useState<Reply[] | null>(cache);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fav, setFav] = useState(false);
  const [sort, setSort] = useState<Sort>("oa");
  const [selId, setSelId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("replies");
  const [cp, setCp] = useState<CouponRes | null>(null);
  const [cpErr, setCpErr] = useState("");
  const [selCode, setSelCode] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "coupons" || cp) return;
    botApi<CouponRes>(`/api/admin/chatbot/chats/coupons?id=${encodeURIComponent(chatId)}`)
      .then(setCp)
      .catch((e) => setCpErr(e instanceof Error ? e.message : String(e)));
  }, [tab, cp, chatId]);
  const selCoupon = cp?.coupons.find((c) => c.code === selCode) ?? null;

  useEffect(() => {
    // เปิดทุกครั้งดึงใหม่เงียบ ๆ (มีของเก่าโชว์ก่อน) — แก้ในหน้าข้อความตอบกลับแล้วเห็นทันที
    botApi<Res>("/api/admin/chatbot/saved-replies")
      .then((d) => {
        cache = d.items;
        setItems(d.items);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const all = items ?? [];
  const favCount = all.filter((r) => r.favorite).length;
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    const xs = all.filter((r) => (!fav || r.favorite) && (!k || r.title.toLowerCase().includes(k)));
    return sort === "name" ? [...xs].sort((a, b) => a.title.localeCompare(b.title, "th")) : xs;
  }, [all, q, fav, sort]);
  const sel = all.find((r) => r.id === selId) ?? null;

  const pick = (r: Reply | null) => {
    if (!r) return;
    onPick(fillPlaceholders(textOf(r), customerName), emojisOf(r));
  };
  const pickCoupon = (c: CouponRow | null) => c && onPick(couponMessage(c), []);
  const canPick = tab === "replies" ? !!sel : !!selCoupon;

  const field = "min-h-[44px] rounded-lg bg-white px-3 text-[14px] outline-none";
  return (
    <div className="dkb-mwrap" role="dialog" aria-modal="true" aria-label="เลือกคอนเทนต์" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dkb-modal flex max-h-[92vh] flex-col" style={{ maxWidth: 960 }}>
        <div className="flex items-center justify-between px-5 pb-2 pt-5 md:px-6">
          <p className="text-[20px] font-extrabold" style={{ color: "var(--dk-navy)" }}>
            เลือกคอนเทนต์
          </p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-[var(--dk-sky)]">
            ✕
          </button>
        </div>
        <div className="px-5 md:px-6" style={{ borderBottom: "1px solid var(--dk-hair)" }}>
          {(
            [
              ["replies", "💬 ข้อความตอบกลับ"],
              ["coupons", "🎟 คูปอง"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className="-mb-px inline-flex min-h-[44px] items-center gap-2 rounded-t-lg px-4 text-[14.5px] font-bold"
              style={tab === k ? { border: "1px solid var(--dk-hair)", borderBottomColor: "white", background: "white", color: "var(--dk-navy)" } : { border: "1px solid transparent", color: "#06A045" }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "coupons" ? (
          <CouponPane cp={cp} err={cpErr} customerName={customerName} selCode={selCode} onSel={setSelCode} onPick={pickCoupon} selected={selCoupon} />
        ) : (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 md:grid-cols-2 md:px-6">
          {/* ซ้าย: รายการ */}
          <div className="flex min-h-0 flex-col gap-2.5">
            <div className="flex">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาด้วยชื่อ"
                aria-label="ค้นหาด้วยชื่อ"
                autoFocus
                className={`${field} min-w-0 flex-1 rounded-r-none`}
                style={{ border: "1px solid var(--dk-hair)" }}
              />
              <span className="grid w-12 place-items-center rounded-r-lg text-white" style={{ background: "#06C755" }} aria-hidden>
                🔍
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select value={fav ? "fav" : "all"} onChange={(e) => setFav(e.target.value === "fav")} aria-label="กรอง" className={field} style={{ border: "1px solid var(--dk-hair)" }}>
                <option value="all">ทั้งหมด ({all.length})</option>
                <option value="fav">ติดดาว ({favCount})</option>
              </select>
              <label className="flex items-center gap-2 text-[13.5px] font-bold" style={{ color: "var(--dk-navy-soft)" }}>
                เรียงลำดับตาม:
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={field} style={{ border: "1px solid var(--dk-hair)" }}>
                  <option value="oa">ตามลำดับใน LINE OA</option>
                  <option value="name">ชื่อ ก–ฮ</option>
                </select>
              </label>
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto rounded-lg md:max-h-[46vh]" style={{ border: "1px solid var(--dk-hair)" }}>
              {err ? (
                <p className="p-4 text-[13px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
                  {err}
                </p>
              ) : !items ? (
                <p className="p-4 text-[13px]" style={{ color: "var(--dk-faint)" }}>
                  กำลังโหลด…
                </p>
              ) : !list.length ? (
                <p className="p-4 text-[13px]" style={{ color: "var(--dk-faint)" }}>
                  {all.length ? "ไม่พบข้อความที่ค้น" : "ยังไม่มีข้อความตอบกลับ — ไปโหลดจาก LINE OA ที่หน้า 💬 ข้อความตอบกลับ"}
                </p>
              ) : (
                list.map((r) => {
                  const on = r.id === selId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelId(r.id)}
                      onDoubleClick={() => pick(r)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      style={{ borderBottom: "1px solid var(--dk-hair)", background: on ? "#E8F8EE" : "white", boxShadow: on ? "inset 3px 0 0 #06C755" : undefined }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold" style={{ color: "var(--dk-navy)" }}>
                          {r.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                          <RichText text={textOf(r)} emojis={emojisOf(r)} oneLine />
                        </span>
                      </span>
                      {r.favorite ? (
                        <span className="shrink-0 text-[18px]" style={{ color: "#22B14C" }} aria-label="ติดดาว">
                          ★
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
            <a href="/admin/chatbot/saved-replies" target="_blank" rel="noreferrer" className="grid min-h-[48px] place-items-center rounded-lg bg-white text-[14.5px] font-bold" style={{ border: "1px solid var(--dk-hair)", color: "var(--dk-navy)" }}>
              สร้างข้อความตอบกลับ
            </a>
          </div>

          {/* ขวา: ดูตัวอย่าง */}
          <div className="flex min-h-[260px] flex-col overflow-hidden rounded-lg">
            <p className="px-4 py-3 text-[15px] font-bold text-white" style={{ background: "#3C3C3C" }}>
              ดูตัวอย่าง
            </p>
            <div className="flex-1 overflow-y-auto p-4 md:max-h-[52vh]" style={{ background: "linear-gradient(180deg,#8FA8D8,#A9BEE3)" }}>
              {sel ? (
                <div className="flex items-start gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[16px]" aria-hidden>
                    🦆
                  </span>
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ color: "#111" }}>
                    <RichText text={fillPlaceholders(textOf(sel), customerName)} emojis={emojisOf(sel)} />
                  </p>
                </div>
              ) : (
                <p className="pt-10 text-center text-[13px] text-white/90">กดเลือกข้อความทางซ้ายเพื่อดูตัวอย่าง</p>
              )}
            </div>
          </div>
        </div>
        )}

        <div className="flex justify-end gap-2 px-5 pb-5 pt-2 md:px-6">
          <button type="button" onClick={onClose} className="min-h-[48px] rounded-lg bg-white px-5 text-[15px] font-bold" style={{ border: "1px solid var(--dk-navy)", color: "var(--dk-navy)" }}>
            ยกเลิก
          </button>
          <button type="button" onClick={() => (tab === "replies" ? pick(sel) : pickCoupon(selCoupon))} disabled={!canPick} className="min-h-[48px] rounded-lg px-6 text-[15px] font-bold text-white disabled:opacity-35" style={{ background: "#06C755" }}>
            เลือก
          </button>
        </div>
      </div>
    </div>
  );
}

/** แท็บ 🎟 คูปอง — ซ้าย: บัญชีเว็บของลูกค้า + รายการคูปองที่ใช้ได้ · ขวา: ตัวอย่างข้อความที่จะใส่ช่องพิมพ์ */
function CouponPane({
  cp,
  err,
  customerName,
  selCode,
  onSel,
  onPick,
  selected,
}: {
  cp: CouponRes | null;
  err: string;
  customerName: string;
  selCode: string | null;
  onSel: (code: string) => void;
  onPick: (c: CouponRow) => void;
  selected: CouponRow | null;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-4 md:grid-cols-2 md:px-6">
      <div className="flex min-h-0 flex-col gap-2.5">
        {cp ? (
          cp.member ? (
            <p className="rounded-lg px-3 py-2.5 text-[13px]" style={{ background: "#E8F8EE", color: "#166534" }}>
              ✓ {customerName || "ลูกค้าคนนี้"} มีบัญชีเว็บแล้ว ({cp.member.name || "ล็อกอินด้วย LINE"}) — คูปองที่เจาะจงคนนี้ขึ้นก่อน
            </p>
          ) : (
            <p className="rounded-lg px-3 py-2.5 text-[13px]" style={{ background: "#FFF4D6", color: "#8A5A00" }}>
              ⚠️ {customerName || "ลูกค้าคนนี้"} ยังไม่มีบัญชีเว็บ — ส่งได้เฉพาะคูปองแบบใครก็ใช้ได้ · ลูกค้าต้องเข้าสู่ระบบด้วย LINE ก่อนสั่งถึงจะใช้คูปองได้
            </p>
          )
        ) : null}
        <div className="min-h-[200px] flex-1 overflow-y-auto rounded-lg md:max-h-[46vh]" style={{ border: "1px solid var(--dk-hair)" }}>
          {err ? (
            <p className="p-4 text-[13px] font-bold" style={{ color: "var(--dk-coral-ink)" }}>
              {err}
            </p>
          ) : !cp ? (
            <p className="p-4 text-[13px]" style={{ color: "var(--dk-faint)" }}>
              กำลังโหลด…
            </p>
          ) : !cp.coupons.length ? (
            <p className="p-4 text-[13px]" style={{ color: "var(--dk-faint)" }}>
              ยังไม่มีคูปองที่คนนี้ใช้ได้ — กด “สร้างคูปอง” ด้านล่าง
            </p>
          ) : (
            cp.coupons.map((c) => {
              const on = c.code === selCode;
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => onSel(c.code)}
                  onDoubleClick={() => onPick(c)}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  style={{ borderBottom: "1px solid var(--dk-hair)", background: on ? "#E8F8EE" : "white", boxShadow: on ? "inset 3px 0 0 #06C755" : undefined }}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[20px]" style={{ background: "#FFF4D6" }} aria-hidden>
                    🎟
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[15px] font-bold" style={{ color: "var(--dk-navy)" }}>
                        {couponValue(c)}
                      </span>
                      {c.forThisCustomer ? (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#E8F8EE", color: "#166534" }}>
                          ของคนนี้
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                      {c.code}
                      {c.minSpend ? ` · ขั้นต่ำ ${baht(c.minSpend)}` : ""}
                      {c.expiresAt ? ` · ถึง ${fmtDate(c.expiresAt)}` : ""}
                      {c.maxUses > 1 ? ` · เหลือ ${c.usesLeft}/${c.maxUses} สิทธิ์` : ""}
                      {c.note ? ` · ${c.note}` : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <a href="/admin/coupons" target="_blank" rel="noreferrer" className="grid min-h-[48px] place-items-center rounded-lg bg-white text-[14.5px] font-bold" style={{ border: "1px solid var(--dk-hair)", color: "var(--dk-navy)" }}>
          สร้างคูปอง
        </a>
      </div>

      <div className="flex min-h-[260px] flex-col overflow-hidden rounded-lg">
        <p className="px-4 py-3 text-[15px] font-bold text-white" style={{ background: "#3C3C3C" }}>
          ดูตัวอย่าง
        </p>
        <div className="flex-1 overflow-y-auto p-4 md:max-h-[52vh]" style={{ background: "linear-gradient(180deg,#8FA8D8,#A9BEE3)" }}>
          {selected ? (
            <div className="flex items-start gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[16px]" aria-hidden>
                🦆
              </span>
              <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ color: "#111" }}>
                {couponMessage(selected)}
              </p>
            </div>
          ) : (
            <p className="pt-10 text-center text-[13px] text-white/90">กดเลือกคูปองทางซ้ายเพื่อดูตัวอย่าง</p>
          )}
        </div>
      </div>
    </div>
  );
}
