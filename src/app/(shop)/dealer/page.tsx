"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * 🤝 หน้าสมัครตัวแทนจำหน่าย (/dealer) — ลิงก์นี้ร้านส่งให้ลูกค้าที่อยากเป็นตัวแทน
 *
 * ต้องล็อกอินก่อนสมัคร (ใบสมัครผูกกับบัญชี — พออนุมัติแล้วบัญชีนั้นเห็นราคาตัวแทนทันที)
 * ส่งใบสมัคร → รอร้านอนุมัติที่ /admin/dealers · สมัครซ้ำ = แก้ใบเดิมได้จนกว่าร้านจะจัดการ
 *
 * 🎨 ดีไซน์: ภาษาเดียวกับหน้าแรก — ครอบ `.dl dl-page dlr-page` แล้วใช้ token/คอมโพเนนต์ของ landing.css
 * (Mitr หัวเรื่อง+ปุ่ม · Plex Looped เนื้อความ · sky/navy/yolk · พื้นฟ้าจาง + เมฆลอย)
 * ⚠️ ห้ามใช้คลาส Tailwind ในหน้านี้ — `.dl *{margin:0;padding:0}` ล้างทิ้งหมด
 * สไตล์ทั้งหมดอยู่ใน landing.css หัวข้อ "หน้าสมัครตัวแทนจำหน่าย" prefix .dlr-
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken, signIn } from "@/lib/customer-auth";
import { LINE_URL } from "@/components/LineButton";
import { hasCustomSender } from "@/lib/order-sender";
import { cleanPhone, phoneProblem } from "@/lib/contact-validate";
import type { OrderSender } from "@/lib/admin-data";

type Me = { dealer: boolean; applied: boolean; application?: { shopName: string; channel: string; detail?: string } };

/** สิ่งที่ตัวแทนได้ — 4 ใบ เรียงจากเรื่องที่ลูกค้าถามบ่อยที่สุด */
const PERKS = [
  {
    ico: "💸",
    tone: "t-yolk",
    title: "ราคาตัวแทนทุกชิ้น",
    desc: "ราคาตัวแทนถูกกว่าราคาหน้าเว็บทุกช่วงจำนวน เห็นราคาจริงตั้งแต่หน้าสินค้า ไม่ต้องทักถามทีละชิ้น",
  },
  {
    ico: "1️⃣",
    tone: "t-sky",
    title: "ไม่มีขั้นต่ำ เริ่มที่ 1 ชิ้น",
    desc: "สั่งชิ้นเดียวก็ได้ราคาตัวแทน รับออเดอร์ลูกค้ามาแล้วค่อยสั่ง ไม่ต้องสต๊อกของเอง",
  },
  {
    ico: "📮",
    tone: "t-mint",
    title: "ส่งในชื่อร้านคุณ",
    desc: "ตั้งชื่อร้านคุณเป็นผู้ส่งบนกล่องได้ — ลูกค้าปลายทางไม่เห็นชื่อร้านเรา ตั้งครั้งเดียวติดไปทุกออเดอร์",
  },
  {
    ico: "⚡",
    tone: "t-lilac",
    title: "อนุมัติแล้วใช้ได้ทันที",
    desc: "ราคาตัวแทนผูกกับบัญชีนี้ พออนุมัติแล้วเปิดหน้าสินค้าจะเห็นป้าย 🤝 และราคาใหม่ทันที",
  },
];

/** 3 ขั้นตอนสมัคร — ไอคอนชุดเดียวกับหน้าวิธีสั่งซื้อ */
const STEPS = [
  {
    ico: "guide",
    title: "กรอกใบสมัคร",
    desc: "เข้าสู่ระบบ แล้วกรอกชื่อร้านกับช่องทางขายของคุณในฟอร์มด้านล่าง ใช้เวลาไม่ถึงนาที",
  },
  {
    ico: "pay",
    title: "ทักไลน์ชำระค่าสมัคร",
    desc: "ทักไลน์ร้านแจ้งว่าสมัครแล้ว พร้อมชำระค่าสมัคร 200 บาท (ครั้งเดียว ไม่มีรายปี)",
  },
  {
    ico: "pick",
    title: "ร้านอนุมัติ — เริ่มขายได้เลย",
    desc: "แอดมินกดอนุมัติให้ บัญชีนี้จะเห็นราคาตัวแทนทั้งร้านทันที สั่งได้เลยไม่ต้องรอรอบ",
  },
];

const FAQS = [
  {
    q: "ค่าสมัคร 200 บาท จ่ายครั้งเดียวจริงไหม?",
    a: "จ่ายครั้งเดียวตอนสมัคร ไม่มีค่าต่ออายุรายปี ไม่มียอดสั่งขั้นต่ำที่ต้องรักษาไว้",
  },
  {
    q: "ราคาตัวแทนใช้ร่วมกับส่วนลดอื่นได้ไหม?",
    a: "ไม่ได้ — ราคาตัวแทนเป็นราคาสุทธิที่ใช้แทนส่วนลดทุกแบบ ทั้งส่วนลดระดับสมาชิก คูปอง ส่วนลดโอนไว และของแถมตามจำนวน",
  },
  {
    q: "สมัครแล้วต้องรอนานไหม?",
    a: "แอดมินอนุมัติหลังได้รับค่าสมัครทางไลน์แล้ว ปกติภายในวันทำการเดียวกัน · ยังไม่ทักไลน์ = ใบสมัครจะค้างรออยู่ ยังไม่ถูกอนุมัติ",
  },
  {
    q: "ลูกค้าปลายทางจะรู้ไหมว่าสั่งจาก iDucky?",
    a: "ตั้งชื่อร้านคุณเป็นผู้ส่งบนกล่องได้ที่หน้าบัญชีของฉัน — กล่องจะขึ้นชื่อร้านคุณแทน · ส่วนใบเสร็จ/ใบกำกับภาษีต้องเป็นชื่อร้านเราตามกฎหมาย",
  },
  {
    q: "สั่งของยังไงหลังเป็นตัวแทนแล้ว?",
    a: "สั่งผ่านเว็บตามปกติ แค่ต้องล็อกอินบัญชีที่เป็นตัวแทนก่อนทุกครั้ง — ถ้าลืมล็อกอินแล้วสั่ง ใบนั้นจะเป็นราคาปกติ ทักแอดมินให้แก้ให้ได้",
  },
  {
    q: "กรอกใบสมัครผิด แก้ได้ไหม?",
    a: "ได้ กดปุ่มแก้ไขใบสมัครในหน้านี้ แล้วส่งใหม่ทับใบเดิมได้เรื่อย ๆ จนกว่าร้านจะกดอนุมัติ",
  },
];

export default function DealerApplyPage() {
  const { customer, loading, refresh } = useCustomer();
  const [me, setMe] = useState<Me | null>(null);
  const [shopName, setShopName] = useState("");
  const [channel, setChannel] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");

  /* 🆕 บล็อก "บัญชีสำหรับรับราคาตัวแทน" — โผล่เฉพาะคนที่ยังไม่ล็อกอิน
     สิทธิ์ตัวแทนผูกกับบัญชีสมาชิกเสมอ เลยต้องมีบัญชี แต่ไม่เด้งออกไปหน้าอื่น สร้างให้ตรงนี้ตอนกดส่ง */
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");

  /* 📮 ผู้ส่งประจำ — ชื่อร้านของตัวแทนที่จะขึ้นบนกล่องแทนชื่อร้านเรา (ออเดอร์ใหม่ติดไปเอง) */
  const [sender, setSender] = useState<OrderSender | undefined>(undefined);


  // สถานะของบัญชีนี้ (เป็นตัวแทนแล้ว / ส่งใบสมัครแล้ว) + เติมฟอร์มจากใบเดิม
  useEffect(() => {
    if (!customer) {
      setMe(null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/dealers/me", { headers: { Authorization: `Bearer ${token}` } });
        const j = (await res.json()) as Me;
        if (!alive) return;
        setMe(j);
        // เป็นตัวแทนแล้ว → ดึงผู้ส่งประจำที่เคยตั้งไว้มาโชว์
        if (j.dealer) {
          try {
            const r2 = await fetch("/api/dealers/sender", { headers: { Authorization: `Bearer ${token}` } });
            const s2 = (await r2.json()) as { sender?: OrderSender };
            if (alive) setSender(s2.sender);
          } catch {
            /* ไม่เป็นไร — กดตั้งเองได้ */
          }
        }
        if (j.application) {
          setShopName((v) => v || j.application!.shopName);
          setChannel((v) => v || j.application!.channel);
          setDetail((v) => v || (j.application!.detail ?? ""));
        }
        // เพิ่งได้รับอนุมัติ — อัปแคชสถานะของเซสชันนี้ให้เห็นราคาตัวแทนทันทีโดยไม่ต้องเปิดแท็บใหม่
        try {
          sessionStorage.setItem(`ducky_dealer_${customer.id}`, j.dealer ? "1" : "0");
        } catch {
          /* ไม่เป็นไร */
        }
      } catch {
        if (alive) setMe({ dealer: false, applied: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [customer]);

  /** ส่งใบสมัคร — ล็อกอินอยู่แล้วใช้ token · ยังไม่มีบัญชีส่ง account ไปให้เซิร์ฟเวอร์สร้างให้ในคำขอเดียว */
  async function postApply(token: string | null, withAccount: boolean) {
    return fetch("/api/dealers/apply", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        shopName: shopName.trim(),
        channel: channel.trim(),
        detail: detail.trim() || undefined,
        ...(withAccount
          ? {
              account: {
                name: accName.trim(),
                phone: cleanPhone(accPhone),
                email: accEmail.trim(),
                password: accPassword,
              },
            }
          : {}),
      }),
    });
  }

  async function submit() {
    if (busy) return;
    setErr("");
    if (shopName.trim().length < 2) {
      setErr("กรอกชื่อร้าน/ธุรกิจของคุณก่อนครับ");
      return;
    }
    if (channel.trim().length < 2) {
      setErr("กรอกช่องทางขาย เช่น IG / Facebook / หน้าร้าน");
      return;
    }
    // ยังไม่ล็อกอิน = ต้องกรอกบัญชีให้ครบด้วย (เช็คฝั่งหน้าเว็บก่อน จะได้บอกทีละช่องได้)
    if (!customer) {
      if (accName.trim().length < 2) {
        setErr("กรอกชื่อผู้สมัคร");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(accEmail.trim())) {
        setErr("กรอกอีเมลให้ถูกต้อง — ใช้เข้าสู่ระบบและรับข่าวจากร้าน");
        return;
      }
      const phoneErr = phoneProblem(accPhone);
      if (phoneErr) {
        setErr(phoneErr);
        return;
      }
      if (accPassword.length < 6) {
        setErr("ตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร");
        return;
      }
    }
    setBusy(true);
    try {
      const token = await getAccessToken();
      let res = await postApply(token, !customer);
      let j = await res.json();

      // อีเมลนี้เคยสมัครไว้แล้ว → ลองเข้าสู่ระบบด้วยรหัสที่เพิ่งกรอก แล้วส่งใบสมัครซ้ำในนามบัญชีนั้น
      if (!res.ok && j?.emailTaken) {
        const login = await signIn(accEmail.trim(), accPassword);
        if (!login.ok) {
          setErr("อีเมลนี้มีบัญชีอยู่แล้ว แต่รหัสผ่านไม่ตรง — ใส่รหัสเดิม หรือกดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ");
          return;
        }
        await refresh();
        res = await postApply(await getAccessToken(), false);
        j = await res.json();
      }

      if (!res.ok) {
        setErr(j?.error ?? "ส่งใบสมัครไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }

      // เพิ่งสร้างบัญชีให้ → ล็อกอินให้เลย จะได้เห็นสถานะใบสมัครและราคาตัวแทนทันทีที่ร้านอนุมัติ
      if (j?.created) {
        await signIn(accEmail.trim(), accPassword);
        await refresh();
        setAccPassword("");
      }

      setSent(true);
      setEditing(false);
      setMe((m) => ({ ...(m ?? { dealer: false, applied: false }), applied: true }));
    } catch {
      setErr("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  // ข้อความตั้งต้นในแชท (มือถือ) — แอดมินจับคู่กับใบสมัครในหลังบ้านได้จากชื่อร้าน · ไม่ใส่อีเมล/เบอร์ลงลิงก์
  const lineHref = `${LINE_URL}?text=${encodeURIComponent(
    `สมัครตัวแทนจำหน่ายบนเว็บแล้ว${shopName.trim() ? ` ชื่อร้าน: ${shopName.trim()}` : ""} ขอชำระค่าสมัคร 200 บาท และรออนุมัติ`
  )}`;

  // ยังไม่ล็อกอินก็กรอกได้เลย (สร้างบัญชีให้ตอนกดส่ง) · ล็อกอินแล้วรอผล /api/dealers/me ก่อน
  const showForm = !sent && (!customer || (!!me && !me.dealer && (!me.applied || editing)));
  const isDealer = !!me?.dealer;

  return (
    <div className="dl dl-page dlr-page">
      {/* ── แถบฟ้าหัวหน้า: ฮีโร่ + สิ่งที่ตัวแทนได้ ── */}
      <div className="top-stack dlr-stack">
        <img className="bg-cloud dlr-c1" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud dlr-c2" src="/landing/cloud.webp" alt="" aria-hidden="true" />
        <img className="bg-cloud dlr-c3" src="/landing/cloud.webp" alt="" aria-hidden="true" />

        <section className="dlr-top">
          <div className="dlr-hero">
            <div className="dlr-hero-txt">
              <span className="kicker kicker-yolk">
                <i className="folder">🤝</i>โปรแกรมตัวแทนจำหน่าย
              </span>
              <h1>
                ขายของพิมพ์ลาย<em>ในชื่อร้านคุณ</em>
                <br />
                ด้วย <span className="yolk-underline">ราคาตัวแทน</span>
              </h1>
              <p className="dlr-lead">
                รับออเดอร์จากลูกค้าคุณ แล้วสั่งกับเราในราคาตัวแทน — <b>ไม่ต้องสต๊อกของ ไม่ต้องมีเครื่องพิมพ์</b>{" "}
                เราผลิตและส่งตรงถึงลูกค้าปลายทางในชื่อร้านคุณได้เลย
              </p>
              <div className="dlr-facts">
                <span className="dlr-fact">ค่าสมัคร 200 บาท ครั้งเดียว</span>
                <span className="dlr-fact yolk">ไม่มีขั้นต่ำ เริ่มที่ 1 ชิ้น</span>
                <span className="dlr-fact mint">ไม่มีค่าต่ออายุรายปี</span>
              </div>
              <div className="dlr-hero-btns">
                {isDealer ? (
                  <Link className="btn btn-yolk" href="/products">
                    ดูสินค้าราคาตัวแทน <span className="dot">→</span>
                  </Link>
                ) : (
                  <a className="btn btn-yolk" href="#apply">
                    กรอกใบสมัคร <span className="dot">↓</span>
                  </a>
                )}
                <a className="btn btn-ghost" href="#faq">
                  คำถามที่พบบ่อย <span className="dot">?</span>
                </a>
              </div>
              {isDealer && (
                <p className="dlr-hero-flag">
                  <b>🎉 บัญชีนี้เป็นตัวแทนจำหน่ายแล้ว</b> — สินค้าที่มีราคาตัวแทนจะขึ้นป้าย 🤝 ให้เห็นบนหน้าสินค้า
                </p>
              )}
            </div>

            {/* ฟองคำพูดต้องอยู่ในกรอบเดียวกับรูปเป็ด — ตำแหน่งจะได้อิงขอบรูปจริง ไม่ใช่ช่องตาราง */}
            <div className="dlr-hero-art">
              <span className="dlr-duck">
                <span className="dlr-bub dlr-b1">ราคาตัวแทน ตั้งแต่ชิ้นแรก 🐥</span>
                <span className="dlr-bub dlr-b2">กล่องขึ้นชื่อร้านคุณ 📮</span>
                <img src="/landing/duck-hug.webp" alt="" aria-hidden="true" />
              </span>
            </div>
          </div>

          {/* สิ่งที่ตัวแทนได้ — 4 ใบกางเต็มความกว้าง */}
          <div className="dlr-perks">
            {PERKS.map((p) => (
              <div className="dlr-perk" key={p.title}>
                <i className={p.tone}>{p.ico}</i>
                <b>{p.title}</b>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>

          {/* ข้อควรรู้ข้อเดียวที่ถามบ่อยที่สุด — วางก่อนสมัคร ไม่ให้ไปรู้ทีหลัง */}
          <div className="dlr-note">
            <b>ℹ️ ราคาตัวแทนเป็นราคาสุทธิ</b> ใช้แทนส่วนลดทุกแบบ — ส่วนลดระดับสมาชิก คูปอง ส่วนลดโอนไว และของแถมตามจำนวน
            จะไม่ถูกนำมาคิดซ้ำในออเดอร์ของตัวแทน
          </div>
        </section>
      </div>

      {/* ── 3 ขั้นตอนสมัคร — แถบไล่สีชุดเดียวกับโซนขายดีหน้าแรก ── */}
      <div className="combo-band dlr-band">
        <div className="cb-bg" aria-hidden="true" />
        <section className="wrap">
          <div className="head">
            <span className="kicker kicker-mint">
              <i className="chat-ico">✨</i>สมัครง่าย ใช้เวลาไม่ถึงนาที
            </span>
            <h2>
              สมัครวันนี้ <em>เริ่มขายได้เลย</em>
            </h2>
            <p>
              ค่าสมัคร <b>200 บาท ครั้งเดียว</b> — ร้านอนุมัติหลังได้รับค่าสมัครทางไลน์แล้ว
            </p>
          </div>
          <ol className="dlr-steps">
            {STEPS.map((s, i) => (
              <li className="dlr-step" key={s.title}>
                <span className="dlr-node">{i + 1}</span>
                <span className="dlr-ico">
                  <img src={`/how-to/${s.ico}.webp`} alt="" aria-hidden="true" />
                </span>
                <span className="stepno">ขั้นที่ {i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* ── ใบสมัคร (หัวใจของหน้า) ── */}
      <section className="dlr-sec" id="apply" style={{ scrollMarginTop: 100 }}>
        {/* หัวข้อเปลี่ยนตามสถานะบัญชี — คนที่เป็นตัวแทนแล้วไม่ต้องเห็นคำว่า "กรอกใบสมัคร" */}
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">{isDealer ? "🤝" : "📨"}</i>
            {isDealer ? "สถานะบัญชีของคุณ" : "ใบสมัครตัวแทน"}
          </span>
          {isDealer ? (
            <h2>
              บัญชีตัวแทน<em>ของคุณ</em>
            </h2>
          ) : (
            <h2>
              กรอกใบสมัคร<em>ที่นี่</em>
            </h2>
          )}
          <p>
            {isDealer
              ? "ราคาตัวแทนผูกกับบัญชีนี้แล้ว — ล็อกอินบัญชีนี้ทุกครั้งก่อนสั่งของ"
              : "ใบสมัครผูกกับบัญชีสมาชิก — พออนุมัติ บัญชีนี้จะเห็นราคาตัวแทนอัตโนมัติ"}
          </p>
        </div>

        <div className="dlr-apply">
          {loading || (customer && me === null) ? (
            <p className="dlr-wait">กำลังตรวจสอบบัญชี…</p>
          ) : isDealer ? (
            <div className="dlr-state ok">
              <span className="dlr-state-ico t-mint">🎉</span>
              <b>บัญชีของคุณเป็นตัวแทนจำหน่ายแล้ว</b>
              <p>เปิดหน้าสินค้าได้เลย — สินค้าที่มีราคาตัวแทนจะขึ้นป้าย 🤝 และแสดงราคาตัวแทนให้ทันที</p>
              <Link className="btn btn-yolk" href="/products">
                ดูสินค้าราคาตัวแทน <span className="dot">→</span>
              </Link>

              {/* 📮 ฝากส่งให้ลูกค้าปลายทาง — ช่องตั้งค่าอยู่ที่ "บัญชีของฉัน" ที่เดียว (กันมีสองที่แก้) */}
              <div className="dlr-sender">
                <b>📮 ฝากส่งถึงลูกค้าของคุณ?</b>
                <p>
                  ตั้ง<b>ชื่อร้านคุณเป็นผู้ส่งบนกล่อง</b>ได้ — ลูกค้าปลายทางจะไม่เห็นชื่อร้านเรา
                  {hasCustomSender({ sender })
                    ? ` · ตอนนี้ตั้งไว้ว่า “${sender?.name || "ร้าน iDucky"}”`
                    : " · ตอนนี้กล่องขึ้นชื่อร้าน iDucky"}
                </p>
                <Link className="dlr-mini" href="/account">
                  📮 ตั้งชื่อผู้ส่งที่ บัญชีของฉัน
                </Link>
              </div>
            </div>
          ) : showForm ? (
            <form
              className="dlr-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="dlr-field">
                <span className="dlr-label">
                  ชื่อร้าน / ธุรกิจของคุณ <i>*</i>
                </span>
                <input
                  className="auth-input"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="เช่น ร้านของขวัญบ้านหมี"
                />
              </label>
              <label className="dlr-field">
                <span className="dlr-label">
                  ช่องทางขาย <i>*</i>
                </span>
                <input
                  className="auth-input"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="เช่น IG @bearshop · Facebook · หน้าร้านที่เชียงใหม่"
                />
              </label>
              <label className="dlr-field wide">
                <span className="dlr-label">รายละเอียดเพิ่มเติม (ไม่บังคับ)</span>
                <textarea
                  className="auth-input"
                  rows={3}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="สินค้าที่สนใจ · ปริมาณที่คาดว่าจะสั่งต่อเดือน"
                />
              </label>

              {/* 🔑 ยังไม่ล็อกอิน = กรอกบัญชีต่อท้ายในใบเดียวกัน ระบบสร้างบัญชีให้ตอนกดส่ง ไม่เด้งออกจากหน้านี้ */}
              {!customer && (
                <div className="dlr-acc">
                  <p className="dlr-acc-head">
                    <b>🔑 บัญชีสำหรับรับราคาตัวแทน</b>
                    <span>ราคาตัวแทนผูกกับบัญชีนี้ — ระบบสร้างให้ตอนกดส่ง ไม่ต้องไปสมัครที่อื่นก่อน</span>
                  </p>
                  <div className="dlr-acc-grid">
                    <label className="dlr-field">
                      <span className="dlr-label">
                        ชื่อผู้สมัคร <i>*</i>
                      </span>
                      <input
                        className="auth-input"
                        value={accName}
                        onChange={(e) => setAccName(e.target.value)}
                        autoComplete="name"
                        placeholder="ชื่อ-นามสกุล หรือชื่อที่ให้แอดมินเรียก"
                      />
                    </label>
                    <label className="dlr-field">
                      <span className="dlr-label">
                        เบอร์โทร <i>*</i>
                      </span>
                      <input
                        className="auth-input"
                        value={accPhone}
                        onChange={(e) => setAccPhone(e.target.value)}
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="เบอร์ที่แอดมินติดต่อกลับได้ เช่น 0812345678"
                      />
                    </label>
                    <label className="dlr-field">
                      <span className="dlr-label">
                        อีเมล <i>*</i>
                      </span>
                      <input
                        className="auth-input"
                        type="email"
                        value={accEmail}
                        onChange={(e) => setAccEmail(e.target.value)}
                        autoComplete="email"
                        placeholder="ใช้เข้าสู่ระบบครั้งต่อไป"
                      />
                    </label>
                    <label className="dlr-field">
                      <span className="dlr-label">
                        ตั้งรหัสผ่าน <i>*</i>
                      </span>
                      <input
                        className="auth-input"
                        type="password"
                        value={accPassword}
                        onChange={(e) => setAccPassword(e.target.value)}
                        autoComplete="new-password"
                        placeholder="อย่างน้อย 6 ตัวอักษร"
                      />
                    </label>
                  </div>
                  <p className="dlr-acc-alt">
                    เคยสมัครสมาชิกไว้แล้ว? ใส่อีเมลกับรหัสผ่านเดิมได้เลย ระบบจะผูกใบสมัครเข้าบัญชีนั้นให้ · หรือ{" "}
                    <a href="/api/auth/line/login">เข้าสู่ระบบด้วย LINE</a> แล้วค่อยกรอก
                  </p>
                </div>
              )}

              {err && <p className="auth-msg err dlr-err">{err}</p>}

              <div className="dlr-submit">
                <button className="btn btn-yolk" type="submit" disabled={busy}>
                  {busy
                    ? "กำลังส่ง…"
                    : me?.applied
                      ? "บันทึกใบสมัครใหม่"
                      : customer
                        ? "ส่งใบสมัคร"
                        : "สร้างบัญชี + ส่งใบสมัคร"}{" "}
                  <span className="dot">{busy ? "…" : "→"}</span>
                </button>
                <span className="dlr-submit-hint">
                  {customer ? "ส่งแล้วยังแก้ได้ จนกว่าร้านจะกดอนุมัติ" : "กดแล้วระบบสร้างบัญชีให้ + ส่งใบสมัครในทีเดียว · แก้ไขได้จนกว่าร้านจะอนุมัติ"}
                </span>
              </div>
            </form>
          ) : (
            <div className="dlr-state sent">
              <span className="dlr-state-ico t-yolk">📨</span>
              <b>ส่งใบสมัครแล้ว — เหลืออีกขั้นตอนเดียว</b>
              <p>
                <b>ขั้นตอนสุดท้าย: ทักไลน์ร้าน</b>แจ้งว่าสมัครตัวแทนแล้ว เพื่อชำระค่าสมัคร <b>200 บาท</b>{" "}
                และให้ร้านกดอนุมัติ
              </p>
              <p className="dlr-warn">⚠️ ยังไม่ทักไลน์ = ร้านยังไม่อนุมัติ · อนุมัติเมื่อไหร่ บัญชีนี้เห็นราคาตัวแทนทันที</p>
              <a className="btn btn-line" href={lineHref} target="_blank" rel="noopener noreferrer">
                ทักไลน์ร้าน <span className="dot">💬</span>
              </a>
              <button
                className="dlr-mini"
                type="button"
                onClick={() => {
                  setSent(false);
                  setEditing(true);
                }}
              >
                ✏️ แก้ไขใบสมัคร
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── คำถามที่พบบ่อย ── */}
      <section className="dlr-sec tight" id="faq" style={{ scrollMarginTop: 100 }}>
        <div className="head">
          <span className="kicker kicker-why">
            <i className="beat-heart">❓</i>คำถามที่พบบ่อย
          </span>
          <h2>
            ถาม-ตอบ<em>ก่อนสมัคร</em>
          </h2>
        </div>
        <div className="dlr-faq">
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

      {/* ── ปิดท้าย — แถบเนวี่ตัวเดียวกับหน้าแรก ── */}
      <div className="dlr-cta-wrap">
        <div className="chat-cta">
          <div className="cc-text">
            <h3>ยังไม่แน่ใจว่าเหมาะกับร้านคุณไหม?</h3>
            <p>ทักมาคุยกับแอดมินได้เลย — เล่าให้ฟังว่าขายอะไรอยู่ เราช่วยดูให้ว่าสินค้าตัวไหนน่าเริ่ม</p>
          </div>
          <div className="cc-btns">
            <a className="btn btn-line" href={LINE_URL} target="_blank" rel="noopener noreferrer">
              ทักแอดมินทาง LINE <span className="dot">💬</span>
            </a>
            <Link className="btn btn-yolk" href="/products">
              ดูสินค้าทั้งหมด <span className="dot">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
