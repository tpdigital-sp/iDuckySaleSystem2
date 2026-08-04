"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RequirePerm from "@/components/RequirePerm";
import { card, h1 } from "@/lib/admin-ui";
import { TOPICS, Key, B, Mark, type Group, type Role } from "./topics";

/**
 * 📋 คู่มือใช้ระบบ — โครงแบบเอกสาร: สารบัญซ้าย (ติดหนึบ) · เนื้อหาขวาคอลัมน์เดียว
 * ค้นหา/กรองตามตำแหน่ง จะกรองทั้งสารบัญและเนื้อหาพร้อมกัน
 */

const ROLES: { key: Role; emoji: string }[] = [
  { key: "แอดมิน", emoji: "🧑‍💼" },
  { key: "กราฟฟิก", emoji: "🎨" },
  { key: "แพ็คของ", emoji: "📮" },
  { key: "คอนเทนต์", emoji: "🏷️" },
];

const GROUPS: { key: Group; emoji: string; label: string; blurb: string }[] = [
  { key: "money", emoji: "💰", label: "รับออเดอร์ & เงิน", blurb: "ตรวจสลิป · มัดจำ · ส่วนลด · ยกเลิก" },
  { key: "order", emoji: "📝", label: "จัดการออเดอร์", blurb: "ใบเสนอราคา · เพิ่มของ · เคลม · เอกสาร" },
  { key: "gfx", emoji: "🎨", label: "งานแบบ (กราฟฟิก)", blurb: "คิวงาน · อัปแบบ · ลูกค้าอนุมัติ" },
  { key: "pack", emoji: "📮", label: "แพ็ค–ส่ง", blurb: "สแกน · ตรวจนับ · ยิงเลขพัสดุ" },
  { key: "product", emoji: "🏷️", label: "สินค้า & ราคา", blurb: "เพิ่มสินค้า · ตัวเลือก · ราคาขั้นบันได · นำเข้า" },
  { key: "setup", emoji: "⚙️", label: "ตั้งค่า & ของหลังบ้าน", blurb: "ค่าส่ง · สต๊อก · สิทธิ์ · ตั้งค่าระบบ" },
];

const ROLE_TONE: Record<Role, string> = {
  แอดมิน: "bg-amber-500/15 text-amber-700",
  กราฟฟิก: "bg-violet-100 text-violet-700",
  แพ็คของ: "bg-teal-100 text-teal-700",
  คอนเทนต์: "bg-rose-100 text-rose-700",
};

const STOPS: { no: string; emoji: string; title: string; who: Role; href: string; line: React.ReactNode }[] = [
  {
    no: "01",
    emoji: "📄",
    title: "ใบเสนอราคา",
    who: "แอดมิน",
    href: "/admin/quotes",
    line: (
      <>
        ลูกค้ายังไม่ตกลง = อยู่ตรงนี้ · <Mark>ยังไม่เข้าคิวกราฟฟิก</Mark>
      </>
    ),
  },
  {
    no: "02",
    emoji: "📦",
    title: "คำสั่งซื้อ",
    who: "แอดมิน",
    href: "/admin/orders",
    line: (
      <>
        SlipOK ตรวจสลิปให้ · ผ่าน = ขึ้น <B>ชำระแล้ว</B> ทันที
      </>
    ),
  },
  {
    no: "03",
    emoji: "🎨",
    title: "แบบงาน",
    who: "กราฟฟิก",
    href: "/admin/orders",
    line: <>ทำแบบ → ลูกค้ากดอนุมัติ / ขอแก้ จากลิงก์ของเขาเอง</>,
  },
  {
    no: "04",
    emoji: "📮",
    title: "แพ็ค–ส่ง",
    who: "แพ็คของ",
    href: "/admin/orders/scan",
    line: <>สแกน → ตรวจนับ → ยืนยันอ่าน → ยิงเลขพัสดุ</>,
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

function GuideInner() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [active, setActive] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [copied, setCopied] = useState("");

  function copyLink(id: string) {
    try {
      void navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  }

  const kw = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      TOPICS.filter((t) => role === "all" || t.roles.includes(role)).filter((t) =>
        kw ? (t.title + " " + t.keywords + " " + t.roles.join(" ")).toLowerCase().includes(kw) : true
      ),
    [kw, role]
  );
  const filtering = kw.length > 0 || role !== "all";

  /** หัวข้อที่เหลือ แยกตามหมวด (หมวดว่างไม่ต้องโชว์) */
  const sections = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: shown.filter((t) => t.group === g.key) })).filter((g) => g.items.length),
    [shown]
  );

  /** ไฮไลต์หัวข้อที่กำลังอ่านอยู่ในสารบัญ */
  useEffect(() => {
    const els = shown.map((t) => document.getElementById(t.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [shown]);

  /** ใช้ลิงก์ #id จริง — กระโดดได้แม้ JS ไม่ทำงาน และคัดลอกส่งให้คนอื่นเจาะหัวข้อได้เลย */
  const jump = useCallback((id: string) => {
    setTocOpen(false);
    setActive(id);
  }, []);

  const toc = (
    <nav className="flex flex-col gap-4">
      {sections.map((g) => (
        <div key={g.key}>
          <p className="px-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-400">
            {g.emoji} {g.label}
          </p>
          <ul className="mt-1 flex flex-col">
            {g.items.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  onClick={() => jump(t.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.82rem] leading-snug transition ${
                    active === t.id ? "bg-amber-50 font-bold text-amber-800" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="shrink-0">{t.icon}</span>
                  <span className="min-w-0 flex-1">{t.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!sections.length && <p className="px-2 text-xs text-slate-400">ไม่พบหัวข้อ</p>}
    </nav>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          main { padding: 0 !important; }
          .guide-block { break-inside: avoid; }
          .guide-grid { display: block !important; }
        }
      `}</style>

      {/* ── หัวหน้า + ค้นหา (ติดบน) ── */}
      <div className="no-print sticky top-0 z-30 -mx-4 bg-slate-50/95 px-4 pb-3 pt-4 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className={h1}>📋 คู่มือใช้ระบบ</h1>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-400 sm:inline">
              {shown.length} เรื่อง{role !== "all" && ` · ที่ ${role} ต้องรู้`}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              🖨️ พิมพ์
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="flex min-w-[16rem] flex-1 items-center gap-2 rounded-full border-2 border-amber-200 bg-white px-4 py-2 focus-within:border-amber-400">
            <span className="text-amber-500">🔍</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา… เช่น เคลม · มัดจำ · ยิงเลขพัสดุ · ล้างรูป"
              className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="shrink-0 text-xs font-bold text-slate-400 hover:text-slate-600">
                ✕
              </button>
            )}
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRole("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
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
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  role === r.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r.emoji} {r.key}
              </button>
            ))}
          </div>
        </div>

        {/* สารบัญแบบพับ (จอแคบ) */}
        <button
          type="button"
          onClick={() => setTocOpen((v) => !v)}
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-xs font-bold text-slate-600 lg:hidden"
        >
          {tocOpen ? "▴ ปิดสารบัญ" : `▾ สารบัญ (${shown.length} เรื่อง)`}
        </button>
      </div>

      {tocOpen && <div className={`${card} no-print mt-2 max-h-80 overflow-y-auto p-3 lg:hidden`}>{toc}</div>}

      <div className="guide-grid mt-3 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* ── สารบัญ (จอกว้าง) ── */}
        <aside className="no-print hidden lg:block">
          <div className="sticky top-[9.5rem] max-h-[calc(100vh-11rem)] overflow-y-auto pb-6 pr-1">{toc}</div>
        </aside>

        {/* ── เนื้อหา ── */}
        <div className="min-w-0 max-w-4xl">
          {/* เริ่มที่นี่ — ซ่อนเมื่อกำลังค้น/กรอง */}
          {!filtering && (
            <section className={`${card} guide-block mb-6 overflow-hidden`}>
              <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">เริ่มที่นี่ · อ่าน 1 นาที</p>
                <p className="text-lg font-extrabold tracking-tight text-slate-900">
                  งาน 1 ชิ้นเดินผ่าน <span className="bg-ducky px-1">4 สถานี</span> นี้เสมอ
                </p>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-4">
                {STOPS.map((s) => (
                  <div key={s.no} className="border-b border-slate-100 p-4 last:border-b-0 sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[1.35rem] font-extrabold leading-none tabular-nums text-amber-500">{s.no}</span>
                      <Link href={s.href} className="text-[0.95rem] font-extrabold text-slate-900 hover:text-amber-600 hover:underline">
                        {s.emoji} {s.title}
                      </Link>
                    </div>
                    <span className={`mt-1.5 inline-block rounded-sm px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.1em] ${ROLE_TONE[s.who]}`}>
                      {s.who}
                    </span>
                    <p className="mt-1.5 text-[0.83rem] leading-relaxed text-slate-500">{s.line}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* หัวข้อ แยกตามหมวด */}
          {!sections.length ? (
            <div className={`${card} p-10 text-center`}>
              <span className="text-4xl">🔍</span>
              <p className="mt-2 text-sm font-semibold text-slate-600">ไม่เจอเรื่อง “{q}”</p>
              <p className="mt-1 text-xs text-slate-400">ลองคำสั้นลง เช่น “เคลม” “มัดจำ” “สลิป” “พัสดุ” “สต๊อก”</p>
            </div>
          ) : (
            sections.map((g) => (
              <section key={g.key} className="mb-8">
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-slate-200 pb-2">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                    {g.emoji} {g.label}
                  </h2>
                  <span className="text-xs text-slate-400">{g.blurb}</span>
                  <span className="ml-auto text-xs tabular-nums text-slate-300">{g.items.length} เรื่อง</span>
                </div>

                <div className="flex flex-col gap-4">
                  {g.items.map((t) => (
                    <article key={t.id} id={t.id} className={`${card} guide-block scroll-mt-40 p-5`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xl">{t.icon}</span>
                        <h3 className="text-base font-extrabold tracking-tight text-slate-900">{t.title}</h3>
                        {t.roles.map((r) => (
                          <span key={r} className={`rounded-sm px-1.5 py-0.5 text-[0.66rem] font-bold uppercase tracking-[0.08em] ${ROLE_TONE[r]}`}>
                            {r}
                          </span>
                        ))}
                        <a
                          href={`#${t.id}`}
                          onClick={() => copyLink(t.id)}
                          title="คัดลอกลิงก์เรื่องนี้ไปส่งให้เพื่อน"
                          className="no-print ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 transition hover:bg-slate-100 hover:text-amber-600"
                        >
                          {copied === t.id ? "คัดลอกแล้ว ✓" : "🔗"}
                        </a>
                      </div>
                      <div className="mt-3 flex flex-col gap-2.5 text-[0.9rem] leading-relaxed text-slate-600">{t.body}</div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}

          {/* อ้างอิงด่วน */}
          {!filtering && (
            <section className={`${card} guide-block mb-6 p-5`}>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900">🏷 ป้ายสถานะ — ดูสีอย่างเดียวก็รู้</h2>
              <p className="mt-0.5 text-sm text-slate-500">เรียงตามลำดับงานจริง · แถวไหนค้างนานผิดปกติ แปลว่ามีอะไรติด</p>
              <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {CHIPS.map(([label, tone, meaning]) => (
                  <div key={label} className="flex items-center gap-2.5">
                    <span className={`w-28 shrink-0 rounded-full px-3 py-1 text-center text-[0.8rem] font-semibold ring-1 ${tone}`}>{label}</span>
                    <span className="text-[0.85rem] text-slate-500">{meaning}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-t-2 border-dashed border-slate-200 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            <span>iDucky Prints Studio · หลังบ้าน</span>
            <span>ไม่แน่ใจตรงไหน — ถามในกลุ่มก่อนกด</span>
          </footer>
        </div>
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
