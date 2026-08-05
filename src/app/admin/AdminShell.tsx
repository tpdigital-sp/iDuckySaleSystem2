"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminSession, signOut } from "@/lib/auth";
import { PermProvider } from "@/lib/perm-context";
import type { Perm } from "@/lib/permissions";
import { markRatingsSeen, unseenRatingCount } from "@/lib/ratings";

/** เมนู + สิทธิ์ที่ต้องมีถึงจะเห็น */
/** เมนูแบ่งเป็นกลุ่มตามงาน — เมนูยาวขึ้นเรื่อย ๆ ไล่หาทีละบรรทัดไม่ไหวแล้ว */
const MENU: { href: string; label: string; emoji: string; perm: Perm; group: string }[] = [
  // 📦 งานขายรายวัน
  { href: "/admin", label: "ภาพรวม", emoji: "📊", perm: "orders.view", group: "งานขาย" },
  { href: "/admin/orders", label: "คำสั่งซื้อ", emoji: "📦", perm: "orders.view", group: "งานขาย" },
  { href: "/admin/print", label: "คิวปริ้น", emoji: "🖨", perm: "pack.ship", group: "งานขาย" },
  { href: "/admin/orders/scan", label: "แพ็ค–ส่ง", emoji: "📮", perm: "pack.ship", group: "งานขาย" },
  { href: "/admin/quotes", label: "ใบเสนอราคา", emoji: "📄", perm: "orders.edit", group: "งานขาย" },
  // 🏷️ ของที่ขาย
  { href: "/admin/products", label: "สินค้า", emoji: "🏷️", perm: "products.view", group: "สินค้า" },
  { href: "/admin/import", label: "นำเข้าสินค้า", emoji: "📥", perm: "products.import", group: "สินค้า" },
  { href: "/admin/options", label: "คลังตัวเลือก", emoji: "🎛️", perm: "presets.manage", group: "สินค้า" },
  { href: "/admin/special-products", label: "รูปแบบการสินค้าสั่งพิเศษ", emoji: "🛠️", perm: "orders.edit", group: "สินค้า" },
  { href: "/admin/stock", label: "คลังสต๊อก", emoji: "📦", perm: "orders.edit", group: "สินค้า" },
  // 💛 ลูกค้า & การตลาด
  { href: "/admin/coupons", label: "คูปอง", emoji: "🎟️", perm: "coupons.manage", group: "ลูกค้า" },
  { href: "/admin/ratings", label: "ความพึงพอใจ", emoji: "💬", perm: "orders.viewAll", group: "ลูกค้า" },
  // ⚙️ ร้าน & ระบบ
  { href: "/admin/articles", label: "บทความ", emoji: "✍️", perm: "products.view", group: "ระบบ" },
  { href: "/admin/nav", label: "เมนูหน้าร้าน", emoji: "🧭", perm: "settings.manage", group: "ระบบ" },
  { href: "/admin/settings", label: "ตั้งค่าระบบ", emoji: "⚙️", perm: "settings.manage", group: "ระบบ" },
  { href: "/admin/staff", label: "พนักงาน", emoji: "👥", perm: "staff.manage", group: "ระบบ" },
  { href: "/admin/guide", label: "วิธีใช้ระบบ", emoji: "📋", perm: "admin.access", group: "ระบบ" },
];

/** ป้ายหัวกลุ่ม (เรียงตามนี้) */
const MENU_GROUPS: { key: string; label: string }[] = [
  { key: "งานขาย", label: "📦 งานขาย" },
  { key: "สินค้า", label: "🏷️ สินค้า" },
  { key: "ลูกค้า", label: "💛 ลูกค้า & การตลาด" },
  { key: "ระบบ", label: "⚙️ ร้าน & ระบบ" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // พับแถบข้างเป็นแถวไอคอน (เดสก์ท็อป) — เริ่มต้นพับไว้ ได้พื้นที่ทำงานกว้าง · จำที่เลือกไว้ต่อเครื่อง
  const [railed, setRailed] = useState(true);
  useEffect(() => {
    try {
      // ไม่เคยตั้ง = พับ · "0" = เคยกดกางไว้ ให้กางตามนั้น
      setRailed(localStorage.getItem("admin.sidebar.railed") !== "0");
    } catch {}
  }, []);
  function toggleRail() {
    setRailed((v) => {
      const next = !v;
      try {
        localStorage.setItem("admin.sidebar.railed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }
  // สถานะสิทธิ์: null = กำลังตรวจ, true/false = ผลลัพธ์
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // ตั้งค่า Firebase auth แล้วหรือยัง (โหมดจริง vs เดโม)
  const [configured, setConfigured] = useState(false);
  // สิทธิ์ + ตำแหน่งของผู้ใช้ที่ล็อกอินอยู่ (ส่งต่อให้ทุกหน้าใต้ /admin)
  const [perms, setPerms] = useState<Perm[]>([]);
  const [roleName, setRoleName] = useState("");
  const [userName, setUserName] = useState(""); // ชื่อคนที่ล็อกอินอยู่
  // badge แจ้งจำนวนประเมินความพึงพอใจใหม่ที่ยังไม่ได้เปิดดู (นับต่อเครื่องด้วย localStorage)
  const [newRatings, setNewRatings] = useState(0);

  // กลุ่มเมนูที่หุบอยู่ — จำไว้ต่อเครื่อง (เมนูเยอะ หุบกลุ่มที่ไม่ได้ใช้ให้สั้นลง)
  const [foldedGroups, setFoldedGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setFoldedGroups(JSON.parse(localStorage.getItem("admin.sidebar.folded") ?? "{}") as Record<string, boolean>);
    } catch {}
  }, []);
  function toggleGroup(key: string) {
    setFoldedGroups((m) => {
      const next = { ...m, [key]: !m[key] };
      try {
        localStorage.setItem("admin.sidebar.folded", JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  // เข้าหน้าไหน กางกลุ่มของหน้านั้นให้เอง (ไม่งั้นไฮไลต์หน้าปัจจุบันหายไปในกลุ่มที่หุบ)
  useEffect(() => {
    const g = MENU.filter((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.group;
    if (g) setFoldedGroups((m) => (m[g] ? { ...m, [g]: false } : m));
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/admin/login" || !perms.includes("orders.viewAll")) return;
    let active = true;
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const rows = (j.ratings ?? []) as { id: string }[];
        if (pathname === "/admin/ratings") {
          // กำลังเปิดหน้าประเมินอยู่ → ถือว่าเห็นครบแล้ว
          markRatingsSeen(rows.map((r) => r.id));
          setNewRatings(0);
        } else {
          setNewRatings(unseenRatingCount(rows));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [perms, pathname]);

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) return;
    let active = true;
    getAdminSession().then((s) => {
      if (!active) return;
      setConfigured(s.configured);
      setPerms(s.perms ?? []);
      setRoleName(s.role ?? "");
      setUserName(s.name ?? "");
      const ok = !s.configured || s.loggedIn;
      setAllowed(ok);
      // เก็บปลายทางเดิม (เช่น ลิงก์ลึก ?order=) ไว้ใน ?next= เพื่อพากลับหลังล็อกอิน
      if (!ok) router.replace(`/admin/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    });
    return () => {
      active = false;
    };
  }, [isLoginPage, pathname, router]);

  async function handleSignOut() {
    await signOut();
    router.replace("/admin/login");
  }

  // หน้าล็อกอิน: แสดงเต็มจอไม่มี sidebar/guard
  if (isLoginPage) return <>{children}</>;

  // กำลังตรวจสิทธิ์ (เฉพาะโหมด Supabase) หรือไม่มีสิทธิ์ → กันเนื้อหาไว้ก่อน
  if (allowed === null && configured) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-stone-400">
        กำลังตรวจสอบสิทธิ์…
      </div>
    );
  }
  if (allowed === false) return null;

  // เมนูที่เห็นตามสิทธิ์ (การซ่อนเป็นแค่ความสะดวก — ของจริงบังคับที่ API)
  const menu = MENU.filter((m) => perms.includes(m.perm));

  // เมนูที่ "ตรงที่สุด" กับ path ปัจจุบัน — /admin/orders/OD-123 → ไฮไลต์ "คำสั่งซื้อ"
  // ส่วน /admin/orders/scan → ไฮไลต์ "ยิงเลขพัสดุ" (เพราะ href ยาวกว่า จึงชนะ)
  const activeHref = menu
    .map((m) => m.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  /** การ์ดบอกว่าใครล็อกอินอยู่ + แผนกไหน (ทีมงานใช้เครื่องร่วมกัน ต้องเห็นชัดว่าเป็นใคร) */
  const userCard = userName ? (
    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ducky text-sm font-bold text-slate-800">
        {userName.trim().charAt(0) || "?"}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold text-slate-800" title={userName}>
          {userName}
        </span>
        {roleName && <span className="block truncate text-[11px] text-slate-500">{roleName}</span>}
      </span>
    </div>
  ) : null;

  const navFor = (rail: boolean) => (
    <nav className="space-y-0.5">
      {MENU_GROUPS.flatMap(({ key, label }, groupIdx) => {
        const items = menu.filter((m) => m.group === key);
        if (!items.length) return [];
        const folded = !!foldedGroups[key];
        return [
          rail ? (
            groupIdx > 0 ? (
              <div key={`h-${key}`} className="mx-2 my-2 border-t border-slate-200" aria-hidden="true" />
            ) : null
          ) : (
            <button
              key={`h-${key}`}
              type="button"
              onClick={() => toggleGroup(key)}
              aria-expanded={!folded}
              title={folded ? "กางกลุ่มนี้" : "หุบกลุ่มนี้"}
              className={`flex w-full items-center gap-1.5 rounded-lg px-3 pb-1 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 transition hover:text-slate-600 ${
                groupIdx > 0 ? "mt-4" : "mt-1"
              }`}
            >
              <span className={`text-[8px] transition-transform ${folded ? "-rotate-90" : ""}`}>▼</span>
              {label}
              {folded && (
                <span className="ml-auto rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-400">
                  {items.length}
                </span>
              )}
            </button>
          ),
          ...(folded && !rail ? [] : items).map((m) => {
        const active = m.href === activeHref;
        const badge = m.href === "/admin/ratings" && newRatings > 0;
        return (
          <Link
            key={m.href}
            href={m.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            title={rail ? m.label : undefined}
            className={`relative flex items-center rounded-xl py-2.5 text-sm font-medium transition ${
              rail ? "justify-center px-0" : "gap-3 px-3"
            } ${
              active
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className={`text-base ${active ? "" : "opacity-80"}`}>{m.emoji}</span>
            {!rail && m.label}
            {badge &&
              (rail ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              ) : (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                  {newRatings > 99 ? "99+" : newRatings}
                </span>
              ))}
          </Link>
        );
          }),
        ];
      })}
    </nav>
  );
  const nav = navFor(false);

  return (
    <PermProvider value={{ perms, role: roleName, name: userName }}>
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* แถบข้าง (เดสก์ท็อป) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white p-3 transition-[width] duration-200 md:flex print:hidden ${
          railed ? "w-20 items-stretch" : "w-60"
        }`}
      >
        <div className={`mb-4 flex items-center ${railed ? "flex-col gap-2" : "justify-between gap-2"}`}>
          <Link href="/admin" className={`flex items-center gap-2.5 py-1 ${railed ? "" : "px-2"}`} title="iDucky Admin">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ducky text-xl shadow-sm">🦆</span>
            {!railed && (
              <span className="leading-tight">
                <span className="block text-sm font-bold text-slate-900">iDucky Admin</span>
                <span className="block text-[11px] text-slate-400">ระบบหลังบ้าน</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleRail}
            title={railed ? "กางแถบเมนู" : "พับแถบเมนู"}
            aria-label={railed ? "กางแถบเมนู" : "พับแถบเมนู"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 ring-1 ring-slate-200 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {railed ? "»" : "«"}
          </button>
        </div>
        {navFor(railed)}
        <div className="mt-auto space-y-0.5 border-t border-slate-100 pt-2">
          {userCard &&
            (railed ? (
              <div className="mb-1.5 flex justify-center" title={`${userName}${roleName ? ` · ${roleName}` : ""}`}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-ducky text-sm font-bold text-slate-800">
                  {userName.trim().charAt(0) || "?"}
                </span>
              </div>
            ) : (
              <div className="mb-1.5">{userCard}</div>
            ))}
          <Link
            href="/"
            title={railed ? "กลับหน้าร้าน" : undefined}
            className={`flex items-center rounded-xl py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${
              railed ? "justify-center px-0" : "gap-3 px-3"
            }`}
          >
            <span className="text-base opacity-80">🏪</span> {!railed && "กลับหน้าร้าน"}
          </Link>
          {configured && (
            <button
              type="button"
              onClick={handleSignOut}
              title={railed ? "ออกจากระบบ" : undefined}
              className={`flex w-full items-center rounded-xl py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 ${
                railed ? "justify-center px-0" : "gap-3 px-3"
              }`}
            >
              <span className="text-base opacity-80">🚪</span> {!railed && "ออกจากระบบ"}
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* แถบบน (มือถือ) */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:hidden print:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ducky text-lg">🦆</span>
            <span className="text-sm font-bold text-slate-900">iDucky Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-lg text-slate-600"
            aria-label="เปิดเมนูแอดมิน"
            aria-expanded={open}
          >
            {open ? "✕" : "☰"}
          </button>
        </header>
        {open && (
          <div className="border-b border-slate-200 bg-white p-3 md:hidden">
            {nav}
            <div className="mt-1 border-t border-slate-100 pt-1">
              {userCard && <div className="mb-1.5">{userCard}</div>}
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600"
              >
                <span className="text-base opacity-80">🏪</span> กลับหน้าร้าน
              </Link>
              {configured && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600"
                >
                  <span className="text-base opacity-80">🚪</span> ออกจากระบบ
                </button>
              )}
            </div>
          </div>
        )}

        {configured ? (
          <div className="flex items-center justify-center gap-1.5 border-b border-emerald-100 bg-emerald-50/60 px-4 py-1.5 text-xs font-medium text-emerald-700 print:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> เชื่อมต่อจริง — Firebase + Supabase · การแก้ไขบันทึกลงฐานข้อมูล
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 border-b border-amber-100 bg-amber-50/60 px-4 py-1.5 text-xs font-medium text-amber-700 print:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> โหมดตัวอย่าง (Demo) — ยังไม่ได้ตั้งค่าฐานข้อมูล การแก้ไขเก็บในเบราว์เซอร์นี้
          </div>
        )}

        {/* ความกว้างคุมจากแต่ละหน้าเอง (หน้าแก้ไขสินค้าใช้เต็มจอ) */}
        <main className="w-full flex-1 px-4 py-6 md:px-8 md:py-8 print:p-0">{children}</main>
      </div>
    </div>
    </PermProvider>
  );
}
