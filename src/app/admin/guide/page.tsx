"use client";

import RequirePerm from "@/components/RequirePerm";
import { card, h1, muted } from "@/lib/admin-ui";

/**
 * 📋 ใบงานเดินสาย — สื่อสอนพนักงานใช้ระบบ (อ่านจบใน 2 นาที)
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

const STOPS: { no: string; emoji: string; title: string; who: string; lines: React.ReactNode[] }[] = [
  {
    no: "01",
    emoji: "📄",
    title: "ใบเสนอราคา",
    who: "แอดมิน",
    lines: [
      <>
        ลูกค้ายังไม่ตกลง = อยู่ตรงนี้ · เสนอกี่ใบก็ได้ <Mark>ยังไม่เข้าคิวกราฟฟิก</Mark>
      </>,
      <>
        หยิบของใส่ใบได้ 2 ทาง: <Key>＋ เพิ่มรายการเอง</Key> หรือ <Key>🛍️ หยิบจากหน้าร้าน</Key>
      </>,
      <>
        ลูกค้าตกลงใบไหน กด <Key>✅ ลูกค้าตกลง — สร้างออเดอร์</Key> แล้ว
        <strong className="font-semibold text-slate-800">ใบอื่นของลูกค้ารายนั้นปิดเอง</strong>
      </>,
    ],
  },
  {
    no: "02",
    emoji: "📦",
    title: "คำสั่งซื้อ",
    who: "แอดมิน",
    lines: [
      <>
        สลิปเข้ามา ระบบ SlipOK ตรวจให้ก่อน · ผ่าน = ขึ้น{" "}
        <strong className="font-semibold text-slate-800">ชำระแล้ว</strong> ทันที
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
    lines: [
      <>
        ช่องภาพมีจุดเดียวต่อรายการ —{" "}
        <strong className="font-semibold text-slate-800">ลากภาพทับได้เลย ไม่ต้องลบของเดิม</strong>
      </>,
      <>ลูกค้ากดอนุมัติ / ขอแก้ ได้เองจากลิงก์ออเดอร์ของเขา</>,
      <>
        แก้แล้วฝั่งลูกค้าจะเห็นป้าย <strong className="font-semibold text-slate-800">แก้ไขแล้ว</strong> ไม่ต้องทักไปบอก
      </>,
    ],
  },
  {
    no: "04",
    emoji: "📮",
    title: "แพ็ค–ส่ง",
    who: "แพ็คของ",
    lines: [
      <>
        สแกนบาร์โค้ดออเดอร์ → ตรวจนับของ →{" "}
        <strong className="font-semibold text-slate-800">ติ๊กยืนยันว่าอ่านรายละเอียดแล้ว</strong>
      </>,
      <>ยิงเลขพัสดุเข้าระบบ ลูกค้าเห็นสถานะ ปณ. เองในหน้าออเดอร์</>,
    ],
  },
];

/** ป้ายสถานะ เรียงตามลำดับงานจริง (สีชุดเดียวกับหน้าคำสั่งซื้อ) */
const CHIPS: [string, string][] = [
  ["รอชำระเงิน", "bg-yellow-50 text-yellow-700 ring-yellow-200/70"],
  ["รอตรวจสอบ", "bg-orange-50 text-orange-700 ring-orange-200/70"],
  ["ชำระแล้ว", "bg-green-50 text-green-700 ring-green-200/70"],
  ["รอตรวจแบบ", "bg-violet-50 text-violet-700 ring-violet-200/70"],
  ["แก้ไขแบบ", "bg-rose-50 text-rose-700 ring-rose-200/70"],
  ["อนุมัติแบบ", "bg-teal-50 text-teal-700 ring-teal-200/70"],
  ["กำลังผลิต", "bg-indigo-50 text-indigo-700 ring-indigo-200/70"],
  ["จัดส่งแล้ว", "bg-sky-50 text-sky-700 ring-sky-200/70"],
  ["เสร็จสิ้น", "bg-slate-200 text-slate-700 ring-slate-300/70"],
];

const RULES: { title: string; body: React.ReactNode; tone: "warn" | "ok" }[] = [
  {
    tone: "warn",
    title: "ยังไม่ชำระ → ยังไม่ต้องทำแบบ",
    body: <>ระบบล็อกช่องอัปโหลดไว้ให้ กันทำงานฟรี ถ้าเป็นลูกค้าประจำค่อยกดปลดล็อกเอง</>,
  },
  {
    tone: "warn",
    title: "ลบรายการ ต้องใส่เหตุผลทุกครั้ง",
    body: <>ระบบเก็บ log ว่าใครลบ ลบตอนไหน เพราะอะไร — ย้อนดูได้เสมอ</>,
  },
  {
    tone: "ok",
    title: "เคลม = ฟรี · สั่งซ้ำ = คิดเงิน",
    body: (
      <>
        กด <Key>♻️ ทำใหม่ / เคลม</Key> ในออเดอร์เดิม แล้วเลือกให้ถูกแบบ ระบบตั้งราคาให้เอง
      </>
    ),
  },
];

function GuideInner() {
  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @media print {
          /* พิมพ์ติดผนัง — ซ่อนแถบข้างและปุ่ม เหลือแต่ใบงาน */
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .guide-sheet { break-inside: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>📋 ใบงานเดินสาย</h1>
          <p className={`mt-1 text-sm ${muted}`}>สื่อสอนใช้ระบบสำหรับพนักงานใหม่ — อ่านจบใน 2 นาที</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          🖨️ พิมพ์ติดผนัง
        </button>
      </div>

      <div className="guide-sheet mt-4 flex flex-col gap-4">
        {/* หัวเอกสาร */}
        <header className={`${card} relative overflow-hidden border-t-4 border-t-slate-900 p-6`}>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 tabular-nums">
            <span>เอกสาร HOW-TO-01</span>
            <span>สำหรับ แอดมิน · กราฟฟิก · แพ็คของ</span>
          </div>
          <h2 className="mt-2 text-[2.15rem] font-extrabold leading-none tracking-tight text-slate-900 sm:text-[3rem]">
            ใบงาน<span className="bg-ducky px-1">เดินสาย</span>
          </h2>
          <p className="mt-2.5 max-w-md text-sm text-slate-500">
            งาน 1 ชิ้นเดินผ่าน 4 สถานีนี้เสมอ รู้ว่าตอนนี้อยู่สถานีไหน ก็รู้ว่าต้องทำอะไรต่อ
          </p>
          <span className="absolute right-5 top-8 hidden rotate-[-11deg] rounded border-[3px] border-double border-amber-400 px-2.5 py-1 text-center text-[0.78rem] font-extrabold leading-tight tracking-wide text-amber-500 opacity-85 sm:block">
            อ่าน
            <br />2 นาที
          </span>
        </header>

        {/* 4 สถานี — สันซ้ายเจาะรูแบบใบงานจริง */}
        <div
          className={`${card} overflow-hidden`}
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
              className="grid gap-x-4 border-b border-dashed border-slate-200 py-5 pr-5 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:pl-0 pl-5"
            >
              <span className="text-[1.6rem] font-extrabold leading-none text-amber-500 tabular-nums sm:row-span-2 sm:justify-self-end">
                {s.no}
              </span>
              <h3 className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                <span>{s.emoji}</span>
                {s.title}
                <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-amber-700">
                  {s.who}
                </span>
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-slate-500">
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

        {/* ป้ายสถานะ */}
        <section className={`${card} p-6`}>
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900">ป้ายสถานะ — ดูสีอย่างเดียวก็รู้</h3>
          <p className="mt-0.5 text-sm text-slate-500">เรียงตามลำดับงานจริง ซ้ายไปขวา</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CHIPS.map(([label, tone]) => (
              <span key={label} className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${tone}`}>
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* 3 ข้อห้ามลืม */}
        <section className="grid gap-3 sm:grid-cols-3">
          {RULES.map((r) => (
            <div
              key={r.title}
              className={`${card} border-l-4 p-4 ${r.tone === "ok" ? "border-l-emerald-600" : "border-l-rose-500"}`}
            >
              <h4 className="text-sm font-extrabold leading-snug text-slate-900">{r.title}</h4>
              <p className="mt-1 text-[0.9rem] leading-relaxed text-slate-500">{r.body}</p>
            </div>
          ))}
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
