"use client";

import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { card, h1, muted } from "@/lib/admin-ui";

/**
 * 📋 ใบงานเดินสาย — สื่อสอนพนักงานใช้ระบบ
 * โครง: อ่านผ่าน ๆ ได้ใน 2 นาที (4 สถานี) แล้วค่อยลงลึกทีละเมนูตอนต้องใช้จริง
 * ทำเป็นใบงานกระดาษที่วิ่งตามงานไปทีละโต๊ะแบบโรงพิมพ์จริง สั่งพิมพ์ติดผนังได้
 */

/** ปุ่มจำลอง — ให้ตรงกับปุ่มจริงบนหน้าจอ จะได้กดถูกตัว */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-b-2 border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[0.92em] font-semibold text-slate-700">
      {children}
    </span>
  );
}

/** ข้อความที่ผิดแล้วเสียหาย — ไฮไลต์เหลืองแบรนด์ */
function Mark({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-ducky px-1.5 py-0.5 font-semibold text-slate-900">{children}</span>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-slate-800">{children}</strong>;
}

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
        หยิบของใส่ใบได้ 2 ทาง: <Key>＋ เพิ่มรายการเอง</Key> หรือ <Key>🛍️ หยิบจากหน้าร้าน</Key>
      </>,
      <>
        ลูกค้าตกลงใบไหน กด <Key>✅ ลูกค้าตกลง — สร้างออเดอร์</Key> แล้ว<B>ใบอื่นของลูกค้ารายนั้นปิดเอง</B>
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
        สลิปเข้ามา ระบบ SlipOK ตรวจให้ก่อน · ผ่าน = ขึ้น <B>ชำระแล้ว</B> ทันที
      </>,
      <>
        ไม่ผ่าน/ระบบล่ม ค่อยตรวจเอง แล้วกด <Key>ยืนยันว่าเงินเข้าแล้ว →</Key>
      </>,
      <>
        งานมัดจำ 50% เริ่มผลิตได้ แต่ <Mark>พิมพ์ใบเสร็จ/ยิงเลขพัสดุไม่ได้จนครบ 100%</Mark>
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
      <>
        แก้แล้วฝั่งลูกค้าจะเห็นป้าย <B>แก้ไขแล้ว</B> ไม่ต้องทักไปบอก
      </>,
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
        สแกนบาร์โค้ดออเดอร์ → ตรวจนับของ → <B>ติ๊กยืนยันว่าอ่านรายละเอียดแล้ว</B>
      </>,
      <>ยิงเลขพัสดุเข้าระบบ ลูกค้าเห็นสถานะ ปณ. เองในหน้าออเดอร์</>,
    ],
  },
];

/** ป้ายสถานะ เรียงตามลำดับงานจริง (สีชุดเดียวกับหน้าคำสั่งซื้อ) */
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

/** เมนูหลังบ้าน — อันไหนมีไว้ทำอะไร ใช้ตอนไหน */
const MENUS: { emoji: string; label: string; href: string; what: string; when: string }[] = [
  {
    emoji: "📊",
    label: "ภาพรวม",
    href: "/admin",
    what: "สรุปความเคลื่อนไหวของร้านวันนี้",
    when: "เปิดเป็นหน้าแรกตอนเริ่มงาน ดูว่ามีอะไรค้าง",
  },
  {
    emoji: "📦",
    label: "คำสั่งซื้อ",
    href: "/admin/orders",
    what: "คิวงานจริงทั้งหมด ตั้งแต่รอเงินจนปิดงาน",
    when: "ใช้ทุกวัน — หน้าหลักของทั้งร้าน",
  },
  {
    emoji: "📮",
    label: "แพ็ค–ส่ง",
    href: "/admin/orders/scan",
    what: "สแกนออเดอร์ ตรวจนับ ยิงเลขพัสดุ",
    when: "ตอนแพ็คของหน้าโต๊ะ — ใช้มือถือสแกนได้",
  },
  {
    emoji: "📄",
    label: "ใบเสนอราคา",
    href: "/admin/quotes",
    what: "เสนอราคาหลายใบต่อลูกค้า 1 ราย โดยไม่ปนคิวงานจริง",
    when: "ลูกค้าถามราคาแต่ยังไม่ตกลง",
  },
  {
    emoji: "🏷️",
    label: "สินค้า",
    href: "/admin/products",
    what: "สินค้าที่ขายบนหน้าเว็บ — ราคา ตัวเลือก รูป SEO",
    when: "เพิ่มสินค้าใหม่ / แก้ราคา / แก้ตัวเลือก",
  },
  {
    emoji: "🛠️",
    label: "รูปแบบสินค้าสั่งพิเศษ",
    href: "/admin/special-products",
    what: "คลังแม่แบบงานสั่งทำที่ไม่มีหน้าเว็บ",
    when: "กด “เพิ่มรายการเอง” ในออเดอร์แล้วอยากได้ชื่อ/สเปคสำเร็จรูป",
  },
  {
    emoji: "📦",
    label: "คลังสต๊อก",
    href: "/admin/stock",
    what: "วัสดุคงเหลือ นำเข้า เบิกเสีย นับจริง",
    when: "รับของเข้า / ของเสีย / นับสต๊อกประจำเดือน",
  },
  {
    emoji: "🎛️",
    label: "คลังตัวเลือก",
    href: "/admin/options",
    what: "กลุ่มตัวเลือกกลางที่สินค้าหลายตัวใช้ร่วมกัน",
    when: "อยากแก้ชนิดกระดาษ/เคลือบ ทีเดียวให้มีผลทุกสินค้า",
  },
  {
    emoji: "🎟️",
    label: "คูปอง",
    href: "/admin/coupons",
    what: "โค้ด/ลิงก์ส่วนลด ใช้ได้ครั้งเดียวต่อใบ",
    when: "จัดโปร / ชดเชยลูกค้าที่ไม่พอใจ",
  },
  {
    emoji: "💬",
    label: "ความพึงพอใจ",
    href: "/admin/ratings",
    what: "คะแนนที่ลูกค้าให้หลังได้ของ (นิรนาม)",
    when: "ดูย้อนหลังว่าช่วงไหนงานมีปัญหา",
  },
  {
    emoji: "👥",
    label: "พนักงาน",
    href: "/admin/staff",
    what: "กำหนดบทบาท/แผนก และเปิด–ปิดสิทธิ์เข้าระบบ",
    when: "มีคนเข้าใหม่ / ลาออก / เปลี่ยนแผนก",
  },
  {
    emoji: "📥",
    label: "นำเข้าสินค้า",
    href: "/admin/import",
    what: "วางลิงก์หน้าราคา แล้วดึงชื่อ/ตาราง/รูปมาให้ตรวจก่อนบันทึก",
    when: "ย้ายสินค้าจากเว็บเดิมเข้ามาทีละหลายตัว",
  },
  {
    emoji: "⚙️",
    label: "ตั้งค่าระบบ",
    href: "/admin/settings",
    what: "ข้อมูลร้าน · บัญชีรับเงิน · ค่าส่ง · ระดับสมาชิก · หมวดหมู่ · ล้างรูปเก่า",
    when: "นาน ๆ ครั้ง — แต่กระทบทั้งเว็บ ให้หัวหน้าแก้",
  },
];

function GuideInner() {
  return (
    <div className="mx-auto max-w-7xl">
      <style>{`
        @media print {
          /* พิมพ์ติดผนัง — ซ่อนแถบข้างและปุ่ม เหลือแต่ใบงาน */
          aside, header nav, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .guide-block { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📋 ใบงานเดินสาย</h1>
          <p className={`mt-1 text-sm ${muted}`}>
            คู่มือใช้ระบบสำหรับพนักงานใหม่ — ส่วนบนอ่านผ่าน ๆ 2 นาที ส่วนล่างค่อยเปิดดูตอนต้องใช้จริง
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          🖨️ พิมพ์ติดผนัง
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {/* ── หัวเอกสาร ── */}
        <header className={`${card} guide-block relative overflow-hidden border-t-4 border-t-slate-900 p-6`}>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 tabular-nums">
            <span>เอกสาร HOW-TO-01</span>
            <span>สำหรับ แอดมิน · กราฟฟิก · แพ็คของ</span>
          </div>
          <h2 className="mt-2 text-[2.15rem] font-extrabold leading-none tracking-tight text-slate-900 sm:text-[3rem]">
            ใบงาน<span className="bg-ducky px-1">เดินสาย</span>
          </h2>
          <p className="mt-2.5 max-w-lg text-sm text-slate-500">
            งาน 1 ชิ้นเดินผ่าน 4 สถานีนี้เสมอ รู้ว่าตอนนี้อยู่สถานีไหน ก็รู้ว่าต้องทำอะไรต่อ
          </p>
          <span className="absolute right-5 top-8 hidden rotate-[-11deg] rounded border-[3px] border-double border-amber-400 px-2.5 py-1 text-center text-[0.78rem] font-extrabold leading-tight tracking-wide text-amber-500 opacity-85 sm:block">
            อ่าน
            <br />2 นาที
          </span>
        </header>

        {/* ── 4 สถานี — สันซ้ายเจาะรูแบบใบงานจริง ── */}
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
          {STOPS.map((s) => (
            <section
              key={s.no}
              className="grid gap-x-4 border-b border-dashed border-slate-200 py-5 pl-5 pr-5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:pl-0"
            >
              <span className="text-[1.6rem] font-extrabold leading-none tabular-nums text-amber-500 sm:row-span-2 sm:justify-self-end">
                {s.no}
              </span>
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                <span>{s.emoji}</span>
                <Link href={s.href} className="hover:text-amber-600 hover:underline">
                  {s.title}
                </Link>
                <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-amber-700">
                  {s.who}
                </span>
              </h3>
              <ul className="mt-2 flex max-w-4xl flex-col gap-1.5 text-sm leading-relaxed text-slate-500">
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

        {/* ── ป้ายสถานะ ── */}
        <section className={`${card} guide-block p-6`}>
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900">ป้ายสถานะ — ดูสีอย่างเดียวก็รู้</h3>
          <p className="mt-0.5 text-sm text-slate-500">เรียงตามลำดับงานจริง · แถวไหนค้างนานผิดปกติ แปลว่ามีอะไรติด</p>
          <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {CHIPS.map(([label, tone, meaning]) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className={`w-28 shrink-0 rounded-full px-3 py-1 text-center text-[0.8rem] font-semibold ring-1 ${tone}`}>
                  {label}
                </span>
                <span className="text-sm text-slate-500">{meaning}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── เมนูหลังบ้าน ── */}
        <section className={`${card} guide-block p-6`}>
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900">เมนูหลังบ้าน — อันไหนมีไว้ทำอะไร</h3>
          <p className="mt-0.5 text-sm text-slate-500">เมนูที่ตำแหน่งของคุณไม่มีสิทธิ์ ระบบจะซ่อนไว้ให้เอง ไม่ต้องตกใจถ้าเห็นไม่ครบ</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MENUS.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-amber-300 hover:bg-amber-50/30"
              >
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <span className="text-base">{m.emoji}</span>
                  <span className="group-hover:text-amber-700">{m.label}</span>
                </p>
                <p className="mt-1.5 text-[0.85rem] leading-relaxed text-slate-600">{m.what}</p>
                <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
                  <span className="font-semibold text-slate-500">ใช้ตอน:</span> {m.when}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 4 เรื่องที่คนใหม่งงบ่อย ── */}
        <section className="guide-block">
          <h3 className="px-1 text-lg font-extrabold tracking-tight text-slate-900">4 เรื่องที่คนใหม่งงบ่อย</h3>
          <p className="mt-0.5 px-1 text-sm text-slate-500">อ่านตอนที่เจอของจริงจะเข้าใจเร็วกว่า</p>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {/* 1. คลังตัวเลือก */}
            <div className={`${card} p-5`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-600">คำถามยอดฮิต</p>
              <h4 className="mt-1 text-base font-extrabold text-slate-900">🎛️ “คลังตัวเลือก” มีไว้ทำไม?</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                ชนิดกระดาษชุดเดียวกันถูกใช้กับสินค้าเป็นสิบตัว ถ้าพิมพ์ตัวเลือกซ้ำในทุกสินค้า พอวันหนึ่ง
                <B> เลิกขายกระดาษ 1 ชนิด</B> ต้องไล่แก้ทีละตัวจนหลุดแน่ คลังตัวเลือกคือการเก็บชุดนั้นไว้ที่เดียว
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-rose-50/70 p-3 ring-1 ring-rose-100">
                  <p className="text-xs font-bold text-rose-700">❌ ถ้าไม่ใช้คลัง</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-600">
                    พิมพ์ “ชนิดกระดาษ” ซ้ำในสินค้า 30 ตัว · แก้ทีต้องเปิด 30 หน้า · ชื่อเพี้ยนกันเองจนลูกค้าสับสน
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
                  <p className="text-xs font-bold text-emerald-700">✅ ถ้าใช้คลัง</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-600">
                    แก้ที่คลังครั้งเดียว · สินค้าที่ <B>🔗 ลิงก์</B> อยู่เปลี่ยนตามทันทีทั้งหมด
                  </p>
                </div>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.85rem] leading-relaxed text-slate-500">
                <li className="relative pl-4">
                  <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
                  สินค้าตัวไหนอยาก<B>ต่างจากชาวบ้าน</B> → เปิดหน้าสินค้านั้น กด <Key>ปรับเฉพาะตัว</Key> เพื่อตัดลิงก์
                  แล้วแก้ได้อิสระ (กลายเป็นสำเนาของตัวเอง ไม่ตามคลังอีก)
                </li>
                <li className="relative pl-4">
                  <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
                  <Mark>คลังที่ยังมีสินค้าลิงก์อยู่ ลบไม่ได้</Mark> ระบบจะบอกว่าติดกี่สินค้า ให้ไปตัดลิงก์ก่อน
                </li>
              </ul>
            </div>

            {/* 2. ราคาขั้นบันได */}
            <div className={`${card} p-5`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-600">เรื่องเงิน</p>
              <h4 className="mt-1 text-base font-extrabold text-slate-900">💰 ราคาไม่ได้มีราคาเดียว</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                สินค้าส่วนใหญ่คิด<B>ราคาขั้นบันได</B> — สั่งเยอะ ราคา/ชิ้นถูกลง และบางตัวยังขึ้นกับตัวเลือกที่เลือกด้วย
                (เช่น ขนาด × ชนิดกระดาษ) ระบบคิดให้เองตั้งแต่หน้าร้าน
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[18rem] text-left text-[0.82rem]">
                  <thead className="text-[0.72rem] font-bold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="pb-1 font-bold">จำนวนที่สั่ง</th>
                      <th className="pb-1 text-right font-bold">ราคา/ชิ้น</th>
                      <th className="pb-1 text-right font-bold">รวม</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-slate-600">
                    <tr className="border-t border-slate-100">
                      <td className="py-1">10 ชิ้น</td>
                      <td className="py-1 text-right">฿120</td>
                      <td className="py-1 text-right font-semibold text-slate-800">฿1,200</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="py-1">50 ชิ้น</td>
                      <td className="py-1 text-right">฿95</td>
                      <td className="py-1 text-right font-semibold text-slate-800">฿4,750</td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="py-1">100 ชิ้น</td>
                      <td className="py-1 text-right">฿80</td>
                      <td className="py-1 text-right font-semibold text-slate-800">฿8,000</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-1 text-[0.72rem] text-slate-400">* ตัวเลขตัวอย่าง — ของจริงตั้งได้ต่อสินค้า</p>
              </div>
              <p className="mt-3 text-[0.85rem] leading-relaxed text-slate-500">
                เพราะงั้นเวลาสั่งแทนลูกค้า ให้ <Mark>หยิบจากหน้าร้าน</Mark> ดีกว่าพิมพ์ราคาเอง — ได้ตัวเลือกครบและราคาตรงเสมอ
              </p>
            </div>

            {/* 3. สินค้าในเว็บ vs งานพิเศษ */}
            <div className={`${card} p-5`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-600">เลือกให้ถูกทาง</p>
              <h4 className="mt-1 text-base font-extrabold text-slate-900">🏷️ สินค้าในเว็บ vs 🛠️ งานพิเศษ</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold text-slate-700">🏷️ มีขายบนเว็บอยู่แล้ว</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-600">
                    ใช้ <Key>🛍️ หยิบจากหน้าร้าน</Key> — ได้ตัวเลือก ราคาขั้นบันได และรูปสินค้าอัตโนมัติ
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
                  <p className="text-xs font-bold text-slate-700">🛠️ งานสั่งทำ ไม่มีบนเว็บ</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-600">
                    ใช้ <Key>＋ เพิ่มรายการเอง</Key> — พิมพ์ชื่องานแล้วจะมีคลังแม่แบบขึ้นให้เลือก ไม่ต้องพิมพ์สเปคใหม่ทุกครั้ง
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[0.85rem] leading-relaxed text-slate-500">
                ตั้งราคา <B>฿0</B> ได้ถ้ายังไม่รู้ราคา — ระบบจะขึ้นป้าย <B>รอตีราคา</B> ให้เห็นชัดว่ายังไม่จบ
              </p>
            </div>

            {/* 4. คลังสต๊อก */}
            <div className={`${card} p-5`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-600">ของในคลัง</p>
              <h4 className="mt-1 text-base font-extrabold text-slate-900">📦 ทำไมแก้ยอดสต๊อกตรง ๆ ไม่ได้</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                ยอดคงเหลือ<B>คำนวณจากประวัติการเคลื่อนไหวเท่านั้น</B> (รับเข้า · ขายตัด · เบิกผลิต · ของเสีย)
                ไม่มีช่องให้พิมพ์ตัวเลขทับ เพราะถ้าพิมพ์ทับได้ ของหายแล้วจะไม่มีใครรู้ว่าหายตอนไหน
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.85rem] leading-relaxed text-slate-500">
                <li className="relative pl-4">
                  <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
                  ขายได้ = ระบบ<B>ตัดสต๊อกให้เอง</B> ไม่ต้องมากดเอง
                </li>
                <li className="relative pl-4">
                  <span className="absolute left-0 top-[0.62em] h-1.5 w-1.5 rounded-full border-[1.5px] border-amber-400" />
                  นับจริงแล้วไม่ตรง → ใช้เมนู <Key>นับจริง</Key> ระบบ<Mark>บังคับให้ใส่เหตุผล</Mark>ก่อนปรับยอด
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── 3 ข้อห้ามลืม ── */}
        <section className="guide-block grid gap-3 md:grid-cols-3">
          <div className={`${card} border-l-4 border-l-rose-500 p-4`}>
            <h4 className="text-sm font-extrabold leading-snug text-slate-900">ยังไม่ชำระ → ยังไม่ต้องทำแบบ</h4>
            <p className="mt-1 text-[0.9rem] leading-relaxed text-slate-500">
              ระบบล็อกช่องอัปโหลดไว้ให้ กันทำงานฟรี ถ้าเป็นลูกค้าประจำค่อยกดปลดล็อกเอง
            </p>
          </div>
          <div className={`${card} border-l-4 border-l-rose-500 p-4`}>
            <h4 className="text-sm font-extrabold leading-snug text-slate-900">ลบรายการ ต้องใส่เหตุผลทุกครั้ง</h4>
            <p className="mt-1 text-[0.9rem] leading-relaxed text-slate-500">
              ระบบเก็บ log ว่าใครลบ ลบตอนไหน เพราะอะไร — ย้อนดูได้เสมอ
            </p>
          </div>
          <div className={`${card} border-l-4 border-l-emerald-600 p-4`}>
            <h4 className="text-sm font-extrabold leading-snug text-slate-900">เคลม = ฟรี · สั่งซ้ำ = คิดเงิน</h4>
            <p className="mt-1 text-[0.9rem] leading-relaxed text-slate-500">
              กด <Key>♻️ ทำใหม่ / เคลม</Key> ในออเดอร์เดิม แล้วเลือกให้ถูกแบบ ระบบตั้งราคาให้เอง
            </p>
          </div>
        </section>

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
