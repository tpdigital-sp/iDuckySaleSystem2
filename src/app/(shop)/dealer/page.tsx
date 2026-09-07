"use client";

/**
 * 🤝 หน้าสมัครตัวแทนจำหน่าย (/dealer) — ลิงก์นี้ร้านส่งให้ลูกค้าที่อยากเป็นตัวแทน
 *
 * ต้องล็อกอินก่อนสมัคร (ใบสมัครผูกกับบัญชี — พออนุมัติแล้วบัญชีนั้นเห็นราคาตัวแทนทันที)
 * ส่งใบสมัคร → รอร้านอนุมัติที่ /admin/dealers · สมัครซ้ำ = แก้ใบเดิมได้จนกว่าร้านจะจัดการ
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/lib/customer-context";
import { getAccessToken } from "@/lib/customer-auth";
import { LINE_URL } from "@/components/LineButton";

type Me = { dealer: boolean; applied: boolean; application?: { shopName: string; channel: string; detail?: string } };

const inputCls =
  "w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-stone-700 ring-1 ring-amber-200 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-300";

export default function DealerApplyPage() {
  const { customer, loading } = useCustomer();
  const [me, setMe] = useState<Me | null>(null);
  const [shopName, setShopName] = useState("");
  const [channel, setChannel] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");

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
    setBusy(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/dealers/apply", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ shopName: shopName.trim(), channel: channel.trim(), detail: detail.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "ส่งใบสมัครไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
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

  const showForm = customer && me && !me.dealer && (!me.applied || editing) && !sent;

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-amber-100">
        {/* หัวการ์ด */}
        <div className="bg-gradient-to-br from-teal-400 to-sky-500 px-6 py-8 text-center text-white">
          <span className="text-5xl">🤝</span>
          <p className="mt-2 text-lg font-extrabold">สมัครตัวแทนจำหน่าย iDucky</p>
          <p className="mt-1 text-xs opacity-90">รับราคาตัวแทน สั่งได้ตั้งแต่ชิ้นแรก</p>
        </div>

        <div className="px-6 py-6">
          {/* จุดขายสั้น ๆ */}
          <ul className="space-y-1.5 text-sm text-stone-600">
            <li>✅ เห็นราคาตัวแทนบนเว็บทันทีหลังได้รับอนุมัติ</li>
            <li>✅ สั่งจำนวนน้อยก็ได้ราคาตัวแทน ไม่มีขั้นต่ำ</li>
            <li>ℹ️ ราคาตัวแทนใช้แทนส่วนลด/คูปอง/ของแถมทุกรายการ</li>
          </ul>

          <div className="mt-5">
            {loading || (customer && me === null) ? (
              <p className="py-6 text-center text-sm text-stone-400">กำลังตรวจสอบบัญชี…</p>
            ) : !customer ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-stone-700">เข้าสู่ระบบก่อนสมัคร</p>
                <p className="mt-1 text-xs text-stone-500">
                  ใบสมัครผูกกับบัญชีสมาชิก — พอได้รับอนุมัติ บัญชีนี้จะเห็นราคาตัวแทนอัตโนมัติ
                </p>
                <Link
                  href="/account/login"
                  className="mt-3 inline-block rounded-full bg-stone-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-stone-900"
                >
                  🔑 เข้าสู่ระบบ / สมัครสมาชิก
                </Link>
              </div>
            ) : me?.dealer ? (
              <div className="rounded-2xl bg-emerald-50 px-4 py-4 text-center">
                <p className="text-sm font-bold text-emerald-700">🎉 บัญชีของคุณเป็นตัวแทนจำหน่ายแล้ว</p>
                <p className="mt-1 text-xs text-emerald-600">เปิดหน้าสินค้าได้เลย — สินค้าที่มีราคาตัวแทนจะขึ้นป้าย 🤝</p>
                <Link
                  href="/products"
                  className="mt-3 inline-block rounded-full bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-700"
                >
                  🛍️ ดูสินค้าราคาตัวแทน
                </Link>
              </div>
            ) : showForm ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="flex flex-col gap-3"
              >
                <label className="text-xs font-bold text-stone-600">
                  ชื่อร้าน / ธุรกิจของคุณ *
                  <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="เช่น ร้านของขวัญบ้านหมี" className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs font-bold text-stone-600">
                  ช่องทางขาย *
                  <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="เช่น IG @bearshop · Facebook · หน้าร้านที่เชียงใหม่" className={`mt-1 ${inputCls}`} />
                </label>
                <label className="text-xs font-bold text-stone-600">
                  รายละเอียดเพิ่มเติม (ไม่บังคับ)
                  <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} placeholder="สินค้าที่สนใจ · ปริมาณที่คาดว่าจะสั่งต่อเดือน" className={`mt-1 resize-y ${inputCls}`} />
                </label>
                {err && <p className="text-xs font-semibold text-rose-600">{err}</p>}
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-teal-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-40"
                >
                  {busy ? "กำลังส่ง…" : me?.applied ? "💾 บันทึกใบสมัครใหม่" : "📨 ส่งใบสมัคร"}
                </button>
              </form>
            ) : (
              <div className="rounded-2xl bg-sky-50 px-4 py-4 text-center">
                <p className="text-sm font-bold text-sky-700">📨 ส่งใบสมัครเรียบร้อยแล้ว</p>
                <p className="mt-1 text-xs text-sky-600">
                  ทางร้านจะตรวจและติดต่อกลับ — ได้รับอนุมัติเมื่อไหร่ บัญชีนี้จะเห็นราคาตัวแทนทันที
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setEditing(true);
                    }}
                    className="rounded-full bg-white px-4 py-2 text-xs font-bold text-stone-600 ring-1 ring-stone-200 transition hover:ring-teal-300"
                  >
                    ✏️ แก้ไขใบสมัคร
                  </button>
                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-[#06C755] px-4 py-2 text-xs font-bold text-white transition hover:brightness-95"
                  >
                    💬 ทักไลน์ร้าน
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
