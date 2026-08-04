"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { card, h1, muted } from "@/lib/admin-ui";
import { TOPICS, Key, B, Mark, type Role } from "./topics";

/**
 * 📋 คู่มือใช้ระบบ — ค้นหาได้ + กรองตามหน้าที่ (แอดมิน / กราฟฟิก / แพ็คของ)
 * เนื้อหาอยู่ใน topics.tsx · หน้านี้ทำแค่ค้นหา กรอง และจัดวาง
 */

const ROLES: { key: Role; emoji: string; hint: string }[] = [
  { key: "แอดมิน", emoji: "🧑‍💼", hint: "รับออเดอร์ · เงิน · ใบเสนอราคา · เคลม" },
  { key: "กราฟฟิก", emoji: "🎨", hint: "ทำแบบ · ส่งให้ลูกค้าตรวจ · แก้ตามที่ขอ" },
  { key: "แพ็คของ", emoji: "📮", hint: "ตรวจนับ · ถ่ายรูป · ยิงเลขพัสดุ" },
];

const STOPS: { no: string; emoji: string; title: string; who: string; href: string; lines: React.ReactNode[] }[] = [
  {
    no: "01",
    emoji: "📄",
    title: "ใบเสนอราคา",
    who: "แอดมิน",
    href: "/admin/quotes",
    lines: [
      <>
        ลูกค้ายังไม่ตกลง = อยู่ตรงนี้ · เสนอกี่ใบก็ได้ <Mark>ยังไม่เข้าคิวกราฟฟิก</Mark>
      </>,
      <>
        ลูกค้าตกลงใบไหน กด <Key>✅ ลูกค้าตกลง — สร้างออเดอร์</Key> แล้วใบอื่นปิดเอง
      </>,
    ],
  },
  {
    no: "02",
    emoji: "📦",
    title: "คำสั่งซื้อ",
    who: "แอดมิน",
    href: "/admin/orders",
    lines: [
      <>
        SlipOK ตรวจสลิปให้ก่อน · ผ่าน = ขึ้น <B>ชำระแล้ว</B> ทันที
      </>,
      <>
        ไม่ผ่านค่อยตรวจเอง แล้วกด <Key>ยืนยันว่าเงินเข้าแล้ว →</Key>
      </>,
    ],
  },
  {
    no: "03",
    emoji: "🎨",
    title: "แบบงาน",
    who: "กราฟฟิก",
    href: "/admin/orders",
    lines: [
      <>
        ช่องภาพมีจุดเดียวต่อรายการ — <B>ลากภาพทับได้เลย ไม่ต้องลบของเดิม</B>
      </>,
      <>ลูกค้ากดอนุมัติ / ขอแก้ ได้เองจากลิงก์ออเดอร์ของเขา</>,
    ],
  },
  {
    no: "04",
    emoji: "📮",
    title: "แพ็ค–ส่ง",
    who: "แพ็คของ",
    href: "/admin/orders/scan",
    lines: [
      <>
        สแกน → ตรวจนับ → <B>ติ๊กยืนยันว่าอ่านรายละเอียดแล้ว</B> → ยิงเลขพัสดุ
      </>,
    ],
  },
];

const CHIPS: [string, string, string][] = [
  ["รอชำระเงิน", "bg-yellow-50 text-yellow-700 ring-yellow-200/70", "ยังไม่โอน — ยังไม่ต้องทำแบบ"],
  ["รอตรวจสอบ", "bg-orange-50 text-orange-700 ring-orange-200/70", "มีสลิปแล้ว รอแอดมินตรวจ"],
  ["ชำระแล้ว", "bg-green-50 text-green-700 ring-green-200/70", "เงินเข้าแล้ว กราฟฟิกเริ่มได้"],
  ["รอตรวจแบบ", "bg-violet-50 text-violet-700 ring-violet-200/70", "ส่งแบบให้ลูกค้าแล้ว รอเขาตอบ"],
  ["แก้ไขแบบ", "bg-rose-50 text-rose-700 ring-rose-200/70", "ลูกค้าขอแก้ — กลับไปที่กราฟฟิก"],
  ["อนุมัติแบบ", "bg-teal-50 text-teal-700 ring-teal-200/70", "ลูกค้าโอเคแล้ว ส่งเข้าผลิต"],
  ["กำลังผลิต", "bg-indigo-50 text-indigo-700 ring-indigo-200/70", "อยู่ที่โรงงาน/หน้าเครื่อง"],
  ["จัดส่งแล้ว", "bg-sky-50 text-sky-700 ring-sky-200/70", "ยิงเลขพัสดุแล้ว"],
  ["เสร็จสิ้น", "bg-slate-200 text-slate-700 ring-slate-300/70", "ปิดงาน ลูกค้าได้ของแล้ว"],
];

const MENUS: { emoji: string; label: string; href: string; what: string }[] = [
  { emoji: "📊", label: "ภาพรวม", href: "/admin", what: "สรุปความเคลื่อนไหวของร้านวันนี้" },
  { emoji: "📦", label: "คำสั่งซื้อ", href: "/admin/orders", what: "คิวงานจริงทั้งหมด — หน้าหลักของร้าน" },
  { emoji: "📮", label: "แพ็ค–ส่ง", href: "/admin/orders/scan", what: "สแกน ตรวจนับ ยิงเลขพัสดุ" },
  { emoji: "📄", label: "ใบเสนอราคา", href: "/admin/quotes", what: "เสนอราคาหลายใบโดยไม่ปนคิวงานจริง" },
  { emoji: "🏷️", label: "สินค้า", href: "/admin/products", what: "ราคา ตัวเลือก รูป SEO ของสินค้าบนเว็บ" },
  { emoji: "🛠️", label: "รูปแบบสินค้าสั่งพิเศษ", href: "/admin/special-products", what: "คลังแม่แบบงานสั่งทำที่ไม่มีหน้าเว็บ" },
  { emoji: "📦", label: "คลังสต๊อก", href: "/admin/stock", what: "วัสดุคงเหลือ นำเข้า เบิกเสีย นับจริง" },
  { emoji: "🎛️", label: "คลังตัวเลือก", href: "/admin/options", what: "กลุ่มตัวเลือกกลางที่สินค้าหลายตัวใช้ร่วมกัน" },
  { emoji: "🎟️", label: "คูปอง", href: "/admin/coupons", what: "โค้ด/ลิงก์ส่วนลด ใช้ได้ครั้งเดียวต่อใบ" },
  { emoji: "💬", label: "ความพึงพอใจ", href: "/admin/ratings", what: "คะแนนที่ลูกค้าให้หลังได้ของ (นิรนาม)" },
  { emoji: "👥", label: "พนักงาน", href: "/admin/staff", what: "บทบาท/แผนก และเปิด–ปิดสิทธิ์เข้าระบบ" },
  { emoji: "📥", label: "นำเข้าสินค้า", href: "/admin/import", what: "ดึงสินค้าจากลิงก์หน้าราคามาให้ตรวจก่อนบันทึก" },
  { emoji: "⚙️", label: "ตั้งค่าระบบ", href: "/admin/settings", what: "ร้าน · บัญชี · ค่าส่ง · สมาชิก · หมวดหมู่" },
];

const ROLE_TONE: Record<Role, string> = {
  แอดมิน: "bg-amber-500/15 text-amber-700",
  กราฟฟิก: "bg-violet-100 text-violet-700",
  แพ็คของ: "bg-teal-100 text-teal-700",
};

function GuideInner() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "all">("all");

  const kw = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      TOPICS.filter((t) => role === "all" || t.roles.includes(role)).filter((t) =>
        kw ? (t.title + " " + t.keywords + " " + t.roles.join(" ")).toLowerCase().includes(kw) : true
      ),
    [kw, role]
  );
  /** กำลังค้น/กรองอยู่ → ซ่อนส่วนอ้างอิงท้ายหน้า ให้เหลือเฉพาะที่หา */
  const searching = kw.length > 0;

  return (
    <div className="mx-auto max-w-7xl">
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .guide-block { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📋 คู่มือใช้ระบบ</h1>
          <p className={`mt-1 text-sm ${muted}`}>ค้นหาเรื่องที่อยากรู้ หรือกดเลือกตำแหน่งของตัวเองเพื่อดูเฉพาะที่เกี่ยวข้อง</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          🖨️ พิมพ์ (ตามที่กรองอยู่)
        </button>
      </div>

      {/* ── ค้นหา + เลือกตำแหน่ง ── */}
      <div className="no-print sticky top-0 z-20 -mx-2 mt-4 bg-slate-50/90 px-2 py-3 backdrop-blur">
        <label className="flex items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2.5 focus-within:border-amber-400">
          <span className="text-amber-500">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="อยากรู้เรื่องอะไร? เช่น เคลม · มัดจำ · ยิงเลขพัสดุ · คลังตัวเลือก"
            className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="shrink-0 text-xs font-bold text-slate-400 hover:text-slate-600">
              ล้าง ✕
            </button>
          )}
        </label>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRole("all")}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              role === "all" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            ทุกตำแหน่ง
          </button>
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              title={r.hint}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                role === r.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.emoji} {r.key}
            </button>
          ))}
          <span className="self-center text-xs text-slate-400">
            {shown.length} เรื่อง
            {role !== "all" && ` · เฉพาะที่ ${role} ต้องรู้`}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-4">
        {/* ── เส้นทางงาน 4 สถานี (ซ่อนตอนค้นหา) ── */}
        {!searching && (
          <div
            className={`${card} guide-block overflow-hidden`}
            style={{
              backgroundImage:
                "radial-gradient(circle at 1.5rem 1.1rem, rgb(241 245 249) 0 0.26rem, transparent 0.26rem), linear-gradient(rgb(226 232 240), rgb(226 232 240))",
              backgroundRepeat: "repeat-y, no-repeat",
              backgroundSize: "100% 2.2rem, 1px 100%",
              backgroundPosition: "0 0.4rem, 3.4rem 0",
            }}
          >
            <div className="border-b border-slate-100 px-5 py-3 sm:pl-[5.5rem]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">เริ่มที่นี่ · อ่าน 1 นาที</p>
              <p className="text-lg font-extrabold tracking-tight text-slate-900">
                งาน 1 ชิ้นเดินผ่าน <span className="bg-ducky px-1">4 สถานี</span> นี้เสมอ
              </p>
            </div>
            {STOPS.map((s) => (
              <section
                key={s.no}
                className="grid gap-x-4 border-b border-dashed border-slate-200 py-4 pl-5 pr-5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:pl-0"
              >
                <span className="text-[1.6rem] font-extrabold leading-none tabular-nums text-amber-500 sm:row-span-2 sm:justify-self-end">
                  {s.no}
                </span>
                <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
                  <span>{s.emoji}</span>
                  <Link href={s.href} className="hover:text-amber-600 hover:underline">
                    {s.title}
                  </Link>
                  <span className={`rounded-sm px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] ${ROLE_TONE[s.who as Role]}`}>
                    {s.who}
                  </span>
                </h3>
                <ul className="mt-1.5 flex max-w-4xl flex-col gap-1.5 text-sm leading-relaxed text-slate-500">
                  {s.lines.map((line, i) => (
                    <li key={i} className="relative pl-4">
                      <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* ── หัวข้อทั้งหมด ── */}
        {shown.length === 0 ? (
          <div className={`${card} p-10 text-center`}>
            <span className="text-4xl">🔍</span>
            <p className="mt-2 text-sm font-semibold text-slate-600">ไม่เจอเรื่อง “{q}”</p>
            <p className="mt-1 text-xs text-slate-400">ลองคำสั้นลง เช่น “เคลม” “มัดจำ” “สลิป” “พัสดุ” “สต๊อก”</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {shown.map((t) => (
              <article key={t.id} id={t.id} className={`${card} guide-block scroll-mt-28 p-5`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xl">{t.icon}</span>
                  <h2 className="text-base font-extrabold tracking-tight text-slate-900">{t.title}</h2>
                  {t.roles.map((r) => (
                    <span key={r} className={`rounded-sm px-1.5 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.08em] ${ROLE_TONE[r]}`}>
                      {r}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2.5 text-[0.9rem] leading-relaxed text-slate-600">{t.body}</div>
              </article>
            ))}
          </div>
        )}

        {/* ── อ้างอิง (ซ่อนตอนค้นหา) ── */}
        {!searching && (
          <>
            <section className={`${card} guide-block p-6`}>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">ป้ายสถานะ — ดูสีอย่างเดียวก็รู้</h2>
              <p className="mt-0.5 text-sm text-slate-500">เรียงตามลำดับงานจริง · แถวไหนค้างนานผิดปกติ แปลว่ามีอะไรติด</p>
              <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {CHIPS.map(([label, tone, meaning]) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className={`w-28 shrink-0 rounded-full px-3 py-1 text-center text-[0.8rem] font-semibold ring-1 ${tone}`}>{label}</span>
                    <span className="text-sm text-slate-500">{meaning}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${card} guide-block p-6`}>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">เมนูหลังบ้าน — อันไหนมีไว้ทำอะไร</h2>
              <p className="mt-0.5 text-sm text-slate-500">เมนูที่ตำแหน่งของคุณไม่มีสิทธิ์ ระบบจะซ่อนไว้ให้เอง ไม่ต้องตกใจถ้าเห็นไม่ครบ</p>
              <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {MENUS.map((m) => (
                  <Link
                    key={m.label}
                    href={m.href}
                    className="group rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-amber-300 hover:bg-amber-50/30"
                  >
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <span className="text-base">{m.emoji}</span>
                      <span className="group-hover:text-amber-700">{m.label}</span>
                    </p>
                    <p className="mt-1 text-[0.83rem] leading-relaxed text-slate-500">{m.what}</p>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t-2 border-dashed border-slate-200 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          <span>iDucky Prints Studio · หลังบ้าน</span>
          <span>ไม่แน่ใจตรงไหน — ถามในกลุ่มก่อนกด</span>
        </footer>
      </div>
    </div>
  );
}

export default function AdminGuidePage() {
  return (
    <RequirePerm perm="admin.access">
      <GuideInner />
    </RequirePerm>
  );
}
