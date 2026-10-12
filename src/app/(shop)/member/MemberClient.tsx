"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🏅 หน้าสมาชิก (/member) — อธิบายลูกค้าว่าล็อกอินแล้วได้อะไร + ระดับ + กติกาขึ้น/รักษาระดับ
 *
 * ตัวเลขระดับ/ส่วนลดดึงสดจาก /admin/settings (ShopPayment.tiers) ไม่พิมพ์ตายตัว
 * tiersOf() เติมขั้น "สมาชิกทั่วไป ฿0" ให้เองเมื่อตารางเริ่มที่ยอด > 0 (ดู iducky-base-tier)
 * กติกาในหน้านี้ต้องตรงกับโมเดล status-lock ใน @/lib/tiers — แก้ที่นั่นแล้วอย่าลืมแก้ข้อความที่นี่
 *
 * 🎨 ตรา+สีระดับ = ชุดเดียวกับหน้า /account (@/lib/tier-art · ภาพ /account/rank) — ห้ามใช้อีโมจิ 🥉🥈 แทนตรา
 * ระดับของคนที่ล็อกอินอยู่อ่านจาก localStorage "ducky_acc_tier" ที่หน้า /account จดไว้ (แบบเดียวกับ Navbar)
 *
 * โครง (รื้อ 12 ต.ค. 69 ให้อ่านง่าย): ฮีโร่+3 ขั้น → ตารางยอดสะสม→ส่วนลด+ตัวอย่างเป็นบาท → ต้องรู้ 4 ข้อ → FAQ
 * ภาษาเดียวกับหน้าแรก/หน้าตัวแทน — ยืม .dlr-hero/.hto-faq/.chat-cta · ของเฉพาะหน้า prefix .mbr-
 * ⚠️ ห้ามใช้คลาส Tailwind — `.dl *{margin:0;padding:0}` ล้างทิ้งหมด
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { fetchShopPayment, tiersConfigOf } from "@/lib/shop-settings";
import { tiersOf, DEFAULT_TIERS, type Tier } from "@/lib/tiers";
import { tierRing, medalArt, medalSrc, DARK_TEXT_TIERS } from "@/lib/tier-art";
import { formatPrice } from "@/lib/products";
import { LINE_URL } from "@/components/LineButton";

/** 3 ขั้นสั้น ๆ ในฮีโร่ — อ่านจบในบรรทัดเดียว */
const FLOW = [
  { n: 1, t: "ล็อกอินด้วย LINE", d: "ฟรี ไม่ต้องตั้งรหัส" },
  { n: 2, t: "สั่ง + โอนตามปกติ", d: "1 บาท = 1 แต้ม" },
  { n: 3, t: "แต้มถึงเกณฑ์ ลดให้เอง", d: "ทุกบิลต่อจากนั้น" },
];

/** สิ่งที่ต้องรู้ — ข้อแรกสำคัญสุด (ลูกค้าพลาดบ่อย) ติดสีเตือน · กติกาตรงกับโมเดล status-lock ใน @/lib/tiers */
const KNOW = [
  { ico: "⚠️", warn: true, t: "ล็อกอินก่อนกดสั่งซื้อทุกครั้ง", d: "ใบที่สั่งตอนไม่ได้ล็อกอิน จะไม่ได้ส่วนลดสมาชิก และใช้คูปองไม่ได้" },
  { ico: "🪙", t: "1 บาท = 1 แต้ม", d: "นับจากออเดอร์ที่ชำระแล้ว แต้มใช้นับระดับอย่างเดียว แลกเป็นของหรือเงินสดไม่ได้" },
  { ico: "📅", t: "ขึ้นระดับแล้ว อยู่ยาว 1 ปี", d: "ครบปีถ้ายอดในปีนั้นถึงเกณฑ์ = อยู่ต่อ · ไม่ถึงก็ลดลงแค่ 1 ขั้น ไม่ร่วงหายทีเดียว" },
  { ico: "🎟️", t: "มีคูปองด้วย? เลือกที่คุ้มกว่าให้เอง", d: "ระบบเทียบคูปองกับส่วนลดสมาชิกให้ คูปองที่ไม่ได้ใช้ยังเก็บไว้ใช้ครั้งหน้าได้" },
];

const FAQS = [
  {
    q: "สมัครสมาชิกเสียเงินไหม?",
    a: "ไม่เสียเลย ไม่มีค่าสมัคร ไม่มีค่ารายปี แค่ล็อกอินด้วย LINE ก็เป็นสมาชิกแล้ว",
  },
  {
    q: "ไม่ล็อกอินสั่งได้ไหม?",
    a: "สั่งได้ปกติ · แต่ออเดอร์ใบนั้นจะไม่ได้ส่วนลดสมาชิกและใช้คูปองไม่ได้ ถ้าอยากได้สิทธิ์ ล็อกอินก่อนกดสั่งซื้อทุกครั้ง",
  },
  {
    q: "สั่งไปแล้วตอนไม่ได้ล็อกอิน ยอดจะนับเข้าระดับไหม?",
    a: "ใบที่สั่งไปแล้วจะไม่ได้ส่วนลดย้อนหลัง · ถ้าอยากให้ยอดเก่ามานับรวมกับบัญชี ทักแอดมินทางไลน์พร้อมเลขออเดอร์ได้เลย",
  },
  {
    q: "ดูระดับและแต้มของตัวเองได้ที่ไหน?",
    a: "เปิดหน้า “บัญชีของฉัน” จะเห็นระดับปัจจุบัน ยอดสะสม และต้องซื้ออีกเท่าไหร่ถึงขึ้นระดับถัดไป",
  },
  {
    q: "ส่วนลดสมาชิกใช้กับราคาตัวแทนได้ไหม?",
    a: "ไม่ได้ ราคาตัวแทนเป็นราคาสุทธิอยู่แล้ว ส่วนลดสมาชิก คูปอง และของแถมจะไม่คิดซ้ำในออเดอร์ตัวแทน",
  },
  {
    q: "ระดับจะหายไหมถ้าไม่ได้ซื้อนาน?",
    a: "ไม่หายทันที — ระดับล็อกไว้ 1 ปีเต็ม ครบปีถ้ายอดไม่ถึงเกณฑ์จะลดลงแค่ 1 ขั้น แล้วไต่กลับขึ้นได้เสมอ",
  },
];

type TierHint = { cid: string; id: string; name: string; icon: string };
function readTierHint(cid: string): TierHint | null {
  try {
    const h = JSON.parse(localStorage.getItem("ducky_acc_tier") || "null") as TierHint | null;
    return h && h.cid === cid ? h : null;
  } catch {
    return null;
  }
}

/** สีระดับ → ตัวแปร CSS (--ra อ่อน · --rb เข้ม) ให้ตรา/การ์ด/ชิปใช้ชุดเดียวกัน */
const ringVars = (t: Tier, i: number) => {
  const [a, b] = tierRing(t, i);
  return { "--ra": a, "--rb": b } as CSSProperties;
};

/** ตราระดับ — ภาพจริง · ระดับเริ่มต้นไม่มีตรา ใช้วงเทา+อีโมจิ */
function Medal({ tier, index, size = "full", className = "" }: { tier: Tier; index: number; size?: "full" | "ico"; className?: string }) {
  const art = medalArt(tier, index);
  return art ? (
    <img className={`mbr-medal ${className}`} src={medalSrc(art, size)} alt={`ตราระดับ ${tier.name}`} width={220} height={220} />
  ) : (
    <span className={`mbr-medal mbr-medal-base ${className}`} role="img" aria-label={`ระดับ ${tier.name}`}>
      {tier.icon}
    </span>
  );
}

export default function MemberClient() {
  const { customer } = useCustomer();
  // เริ่มจากตารางค่าเริ่มต้นกันหน้าโล่งตอนโหลด แล้วสลับเป็นของจริงจากตั้งค่าร้าน
  const [tiers, setTiers] = useState<Tier[]>(() => tiersOf(DEFAULT_TIERS));
  const [ready, setReady] = useState(false);
  const [myTier, setMyTier] = useState<TierHint | null>(null);
  /** ระดับที่โชว์บนบัตรฮีโร่ — วนเองทุก 3.2 วิ จนกว่าลูกค้าจะแตะเลือกเอง */
  const [shown, setShown] = useState<string | null>(null);
  const [picked, setPicked] = useState(false);

  useEffect(() => {
    void fetchShopPayment().then((p) => {
      setTiers(tiersOf(tiersConfigOf(p)));
      setReady(true);
    });
  }, []);
  useEffect(() => setMyTier(customer ? readTierHint(customer.id) : null), [customer]);

  const ranked = useMemo(() => tiers.filter((t) => t.discountPct > 0), [tiers]);
  const startId = myTier?.id ?? tiers[tiers.length - 1]?.id ?? null;
  useEffect(() => {
    if (picked || ranked.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(() => {
      setShown((cur) => {
        const i = ranked.findIndex((t) => t.id === (cur ?? startId));
        return ranked[(i + 1) % ranked.length].id;
      });
    }, 3200);
    return () => clearInterval(iv);
  }, [picked, ranked, startId]);

  const idx = (t: Tier) => tiers.findIndex((x) => x.id === t.id);
  const maxPct = Math.max(0, ...tiers.map((t) => t.discountPct));
  const top = tiers[tiers.length - 1];
  const mine = myTier ? tiers.find((t) => t.id === myTier.id) ?? null : null;
  const card = tiers.find((t) => t.id === shown) ?? mine ?? top;
  const cardDark = DARK_TEXT_TIERS.has(card.id);

  /** ตัวอย่างคิดเงินจริง — ใช้ระดับกลางตาราง ให้เห็นภาพว่าลดเป็นบาทเท่าไหร่ */
  const eg = ranked[Math.min(1, ranked.length - 1)] ?? null;
  const EG_BILL = 2000;

  return (
    <div className="dl dl-page dlr-page mbr-page">
      {/* ── ฮีโร่: หัวเรื่อง + 3 ขั้นสั้น ๆ ซ้าย · บัตรสมาชิก (ตราจริง) ขวา ── */}
      <div className="top-stack dlr-stack mbr-stack">
        <img className="bg-cloud dlr-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud dlr-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <section className="dlr-top">
          <div className="dlr-hero mbr-hero">
            <div className="dlr-hero-txt">
              <span className="kicker kicker-yolk">
                <i className="folder">👑</i>iDucky Member Club · สมัครฟรี
              </span>
              <h1>
                ยิ่งซื้อสะสม <em>ยิ่งได้ลด</em>
                <br />
                สูงสุด <span className="yolk-underline">{maxPct}% ทุกบิล</span>
              </h1>
              <p className="dlr-lead">ไม่ต้องใส่โค้ด ไม่ต้องทักแอดมิน — ล็อกอินไว้ตอนสั่ง ระบบนับยอดและหักส่วนลดให้เอง</p>

              <ol className="mbr-flow" aria-label="เป็นสมาชิกใน 3 ขั้น">
                {FLOW.map((f) => (
                  <li key={f.n}>
                    <span className="mbr-flow-n">{f.n}</span>
                    <b>{f.t}</b>
                    <small>{f.d}</small>
                  </li>
                ))}
              </ol>

              <div className="dlr-hero-btns">
                {customer ? (
                  <Link className="btn btn-yolk" href="/account">
                    ดูระดับและยอดสะสมของฉัน <span className="dot">→</span>
                  </Link>
                ) : (
                  <Link className="btn btn-yolk mbr-line-btn" href="/account/login">
                    สมัคร / ล็อกอินด้วย LINE <span className="dot">→</span>
                  </Link>
                )}
                <a className="btn btn-ghost" href="#tiers">
                  ซื้อเท่าไหร่ ลดเท่าไหร่? <span className="dot">↓</span>
                </a>
              </div>
              {customer && (
                <p className="dlr-hero-flag">
                  <b>🎉 คุณเป็นสมาชิกแล้ว{mine ? ` · ระดับ ${mine.name}` : ""}</b> — ล็อกอินค้างไว้ตอนสั่ง ส่วนลดจะหักให้เอง
                </p>
              )}
            </div>

            {/* บัตรสมาชิก — สี/ตราเดียวกับการ์ดระดับหน้าบัญชี · แถวตราด้านล่างแตะสลับระดับได้ */}
            <div className="mbr-show">
              <div className={`mbr-card${cardDark ? " dark" : ""}`} style={ringVars(card, idx(card))} key={card.id}>
                <span className="mbr-shine" aria-hidden="true" />
                <div className="mbr-card-top">
                  <span className="mbr-card-brand">iDucky · MEMBER</span>
                  {mine?.id === card.id && <span className="mbr-card-mine">ระดับของคุณ</span>}
                </div>
                <Medal tier={card} index={idx(card)} className="mbr-card-medal" />
                <div className="mbr-card-info">
                  <b>{card.name}</b>
                  <span>{card.minSpend > 0 ? `ยอดสะสม ${formatPrice(card.minSpend)} ขึ้นไป` : "เริ่มต้นทันทีที่ล็อกอิน"}</span>
                </div>
                <div className="mbr-card-off">
                  <small>ส่วนลดทุกบิล</small>
                  <b>{card.discountPct}%</b>
                </div>
              </div>
              <div className="mbr-pick" role="tablist" aria-label="ดูบัตรแต่ละระดับ">
                {ranked.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={card.id === t.id}
                    className={card.id === t.id ? "on" : ""}
                    style={ringVars(t, idx(t))}
                    onClick={() => {
                      setPicked(true);
                      setShown(t.id);
                    }}
                    title={t.name}
                  >
                    <Medal tier={t} index={idx(t)} size="ico" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── ตารางระดับ: ยอดสะสม → ส่วนลด (เรียงเป็นบันได อ่านซ้ายไปขวาบรรทัดเดียว) ── */}
      <div className="combo-band mbr-band" id="tiers" style={{ scrollMarginTop: 90 }}>
        <div className="cb-bg" aria-hidden="true" />
        <section className="wrap">
          <div className="head">
            <span className="kicker kicker-mint">
              <i className="chat-ico">📈</i>ตารางระดับสมาชิก
            </span>
            <h2>
              ซื้อสะสมเท่าไหร่ <em>ได้ลดเท่าไหร่</em>
            </h2>
            <p>นับยอดจากออเดอร์ที่ชำระแล้ว · ส่วนลดหักจากค่าสินค้าให้อัตโนมัติตอนสั่ง</p>
          </div>

          <div className={`mbr-ladder${ready ? "" : " is-loading"}`} role="table" aria-label="ระดับสมาชิก ยอดสะสม และส่วนลด">
            <div className="mbr-row mbr-row-head" role="row">
              <span role="columnheader">ระดับ</span>
              <span role="columnheader">ยอดซื้อสะสม</span>
              <span role="columnheader">ส่วนลดทุกบิล</span>
            </div>
            {tiers.map((t, i) => {
              const isMine = mine?.id === t.id;
              return (
                <div
                  key={t.id}
                  role="row"
                  className={`mbr-row${isMine ? " is-mine" : ""}${t.discountPct > 0 ? "" : " is-base"}`}
                  style={ringVars(t, i)}
                >
                  <span className="mbr-row-tier" role="cell">
                    <span className="mbr-row-medal">
                      <Medal tier={t} index={i} size="ico" />
                    </span>
                    <b>{t.name}</b>
                    {isMine && <span className="mbr-mine">ระดับของคุณ</span>}
                  </span>
                  <span className="mbr-row-min" role="cell">
                    {t.minSpend > 0 ? (
                      <>
                        <small>ครบ</small> {formatPrice(t.minSpend)}
                      </>
                    ) : (
                      "แค่ล็อกอิน"
                    )}
                  </span>
                  <span className="mbr-row-off" role="cell">
                    {t.discountPct > 0 ? <b>{t.discountPct}%</b> : <small>ยังไม่มีส่วนลด</small>}
                  </span>
                </div>
              );
            })}
          </div>

          {eg && (
            <p className="mbr-eg">
              <span className="mbr-eg-tag">ตัวอย่าง</span>
              ยอดสะสมครบ <b>{formatPrice(eg.minSpend)}</b> → เป็น <b>{eg.name}</b> → บิลถัดไปค่าสินค้า{" "}
              <b>{formatPrice(EG_BILL)}</b> ลดให้ทันที <b className="t-off">{formatPrice((EG_BILL * eg.discountPct) / 100)}</b>
            </p>
          )}
        </section>
      </div>

      {/* ── สิ่งที่ต้องรู้ 4 ข้อ (ข้อแรกเตือน) + สิทธิ์อื่นของสมาชิก ── */}
      <section className="dlr-sec mbr-sec">
        <div className="head">
          <span className="kicker kicker-yolk">
            <i>📌</i>อ่านจบใน 30 วินาที
          </span>
          <h2>
            ต้องรู้แค่<em>4 ข้อ</em>
          </h2>
        </div>
        <div className="mbr-rules">
          {KNOW.map((r) => (
            <div className={`mbr-rule${r.warn ? " warn" : ""}`} key={r.t}>
              <i>{r.ico}</i>
              <div>
                <b>{r.t}</b>
                <p>{r.d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mbr-also">
          <b>สมาชิกได้อีก:</b> ใช้คูปองที่ร้านแจกได้ · เห็นประวัติออเดอร์ทุกใบในหน้า “บัญชีของฉัน” ไม่ต้องเก็บลิงก์เอง · กดสั่งซ้ำได้ง่าย
        </p>
      </section>

      {/* ── คำถามที่พบบ่อย ── */}
      <section className="hto-sec" id="faq" style={{ scrollMarginTop: 100 }}>
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">❓</i>คำถามเรื่องสมาชิก
          </span>
          <h2>
            ถาม-ตอบ<em>สมาชิก</em>
          </h2>
        </div>
        <div className="hto-faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>
                <i>▶</i>
                {f.q}
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="hto-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>{customer ? "พร้อมสั่งแล้ว ส่วนลดรออยู่" : "สมัครฟรีวันนี้ เริ่มสะสมยอดตั้งแต่บิลแรก"}</h3>
            <p>ล็อกอินค้างไว้ตอนสั่ง ระบบนับยอดและหักส่วนลดให้เองทุกครั้ง</p>
          </div>
          <div className="cc-btns">
            {customer ? (
              <Link className="btn btn-yolk" href="/products">
                เลือกสินค้า <span className="dot">→</span>
              </Link>
            ) : (
              <Link className="btn btn-yolk" href="/account/login">
                ล็อกอินด้วย LINE <span className="dot">→</span>
              </Link>
            )}
            <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noreferrer">
              ถามแอดมินทาง LINE <span className="dot">💬</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
