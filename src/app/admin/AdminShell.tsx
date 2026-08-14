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
  // 🎨 งานแบบ — ฝ่ายกราฟฟิกเปิดหมวดนี้หมวดเดียวก็ทำงานได้ครบ
  { href: "/admin/graphics", label: "ออเดอร์กราฟฟิก", emoji: "🎨", perm: "proof.manage", group: "กราฟฟิก" },
  { href: "/admin/graphics/designs", label: "รายงานแบบงาน", emoji: "📋", perm: "proof.manage", group: "กราฟฟิก" },
  // 🏷️ ของที่ขาย
  { href: "/admin/products", label: "สินค้า", emoji: "🏷️", perm: "products.view", group: "สินค้า" },
  { href: "/admin/import", label: "นำเข้าสินค้า", emoji: "📥", perm: "products.import", group: "สินค้า" },
  { href: "/admin/options", label: "คลังตัวเลือก", emoji: "🎛️", perm: "presets.manage", group: "สินค้า" },
  { href: "/admin/templates", label: "คลังเทมเพลตไฟล์งาน", emoji: "📐", perm: "products.manage", group: "สินค้า" },
  { href: "/admin/special-products", label: "รูปแบบการสินค้าสั่งพิเศษ", emoji: "🛠️", perm: "orders.edit", group: "สินค้า" },
  { href: "/admin/stock", label: "คลังสต๊อก", emoji: "📦", perm: "orders.edit", group: "สินค้า" },
  // 🧪 ยังทดลองอยู่ — หน้าร้านไม่เห็น ใช้ทดสอบทำเส้นไดคัทจากลายลูกค้า
  { href: "/admin/diecut", label: "เส้นไดคัท (ทดลอง)", emoji: "✂️", perm: "products.manage", group: "สินค้า" },
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

/** ป้ายหัวกลุ่ม (เรียงตามนี้) — แต่ละกลุ่มมีสีประจำตัว ให้กวาดตาหาง่าย */
const MENU_GROUPS: {
  key: string;
  label: string;
  /** สีข้อความหัวกลุ่ม / จุดสถานะ / ป้ายจำนวน / แถบคั่นโหมดพับ */
  text: string;
  dot: string;
  badge: string;
  line: string;
}[] = [
  // ธีมผสม: navy เข้มพรีเมียม + เหลืองเป็ด — หัวกลุ่มสีอ่อนตามหมวด อ่านชัดบนพื้น #173A6B · จุดสีใช้จานสี landing
  // หัวกลุ่มใช้สีสดของหมวด (300) ให้เด่นบนพื้น navy · hover สว่างขึ้น
  { key: "งานขาย", label: "📦 งานขาย", text: "text-sky-300 hover:text-sky-100", dot: "bg-sky-400", badge: "bg-white/10 text-sky-100", line: "border-white/15" },
  { key: "กราฟฟิก", label: "🎨 กราฟฟิก", text: "text-rose-300 hover:text-rose-100", dot: "bg-[#FF9EB0]", badge: "bg-white/10 text-rose-100", line: "border-white/15" },
  { key: "สินค้า", label: "🏷️ สินค้า", text: "text-yellow-300 hover:text-yellow-100", dot: "bg-[#FFD447]", badge: "bg-white/10 text-yellow-100", line: "border-white/15" },
  { key: "ลูกค้า", label: "💛 ลูกค้า & การตลาด", text: "text-violet-300 hover:text-violet-100", dot: "bg-[#C7C4F5]", badge: "bg-white/10 text-violet-100", line: "border-white/15" },
  { key: "ระบบ", label: "⚙️ ร้าน & ระบบ", text: "text-[#7CC4F0] hover:text-sky-100", dot: "bg-[#57B6E8]", badge: "bg-white/10 text-sky-100", line: "border-white/15" },
];

/** แคชป้ายจำนวนประเมินใหม่ (module scope — อยู่ข้ามการเปลี่ยนหน้า) กันดึงเรตติ้งทั้งชุดซ้ำทุกคลิก */
let ratingsBadgeCache: { at: number; rows: { id: string }[] } | null = null;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // พับแถบข้างเป็นแถวไอคอน (เดสก์ท็อป) — จำไว้ต่อเครื่อง
  const [railed, setRailed] = useState(false);
  useEffect(() => {
    try {
      setRailed(localStorage.getItem("admin.sidebar.railed") === "1");
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
  const [isAdministrator, setIsAdministrator] = useState(false);
  // badge แจ้งจำนวนประเมินความพึงพอใจใหม่ที่ยังไม่ได้เปิดดู (นับต่อเครื่องด้วย localStorage)
  const [newRatings, setNewRatings] = useState(0);

  // ── โลโก้หลังบ้าน — กดที่โลโก้มุมซ้ายบนเพื่อเปลี่ยนรูปได้เลย (เก็บในแถวเมนู __site_nav__) ──
  const [adminLogo, setAdminLogo] = useState<string | undefined>(undefined);
  const [logoBusy, setLogoBusy] = useState(false);
  const canEditLogo = perms.includes("settings.manage");
  useEffect(() => {
    // โลโก้หลังบ้านเปลี่ยนน้อยมาก → ใช้แคชของ API ได้ (เดิม no-store ทำให้โหลด 16 KB ใหม่ทุกหน้า)
    fetch("/api/nav")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const u = (j as { nav?: { adminLogo?: string } } | null)?.nav?.adminLogo;
        if (typeof u === "string" && u) setAdminLogo(u);
      })
      .catch(() => {});
  }, []);
  /** บันทึกโลโก้ (undefined = กลับไปใช้เป็ด 🦆) — โหลดเมนูล่าสุดมาก่อน กันเขียนทับส่วนอื่น */
  async function saveAdminLogo(url?: string) {
    setLogoBusy(true);
    try {
      const r = await fetch("/api/nav", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as { nav?: Record<string, unknown> } | null;
      const res = await fetch("/api/nav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nav: { ...(j?.nav ?? {}), adminLogo: url } }),
      });
      if (res.ok) setAdminLogo(url);
      else alert("บันทึกโลโก้ไม่สำเร็จ");
    } catch {
      alert("บันทึกโลโก้ไม่สำเร็จ");
    } finally {
      setLogoBusy(false);
    }
  }
  async function pickAdminLogo(f: File) {
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("productId", "sitenav");
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const j = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !j?.url) {
        alert(j?.error ?? "อัปโหลดไม่สำเร็จ");
        setLogoBusy(false);
        return;
      }
      await saveAdminLogo(j.url);
    } catch {
      alert("อัปโหลดไม่สำเร็จ");
      setLogoBusy(false);
    }
  }
  /** ไอคอนโลโก้ — รูปที่ตั้งไว้ หรือเป็ด 🦆 เดิม */
  const logoIcon = (size: string, rounded: string) =>
    adminLogo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={adminLogo} alt="โลโก้หลังบ้าน" className={`${size} shrink-0 ${rounded} bg-white object-cover shadow-sm ring-1 ring-white/30`} />
    ) : (
      <span className={`flex ${size} shrink-0 items-center justify-center ${rounded} bg-[var(--color-ducky)] text-xl shadow-sm`}>🦆</span>
    );

  /**
   * กลุ่มเมนูที่หุบอยู่ — เริ่มต้น "หุบทุกกลุ่ม" (เมนูเยอะ เห็นภาพรวมง่ายกว่า)
   * กดหัวกลุ่มเพื่อกาง แล้วระบบจำไว้ต่อเครื่อง
   */
  const ALL_FOLDED: Record<string, boolean> = Object.fromEntries(MENU_GROUPS.map((g) => [g.key, true]));
  const [foldedGroups, setFoldedGroups] = useState<Record<string, boolean>>(ALL_FOLDED);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin.sidebar.folded");
      // ไม่เคยตั้งค่า = หุบทุกกลุ่ม · เคยตั้งแล้วใช้ตามนั้น (กลุ่มที่ไม่มีในค่าเก่า = หุบ)
      setFoldedGroups(saved ? { ...ALL_FOLDED, ...(JSON.parse(saved) as Record<string, boolean>) } : ALL_FOLDED);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /** กลุ่มที่มีหน้าที่เปิดอยู่ — ใช้ไฮไลต์หัวกลุ่มตอนหุบ (ไม่กางให้เอง จะได้หุบตามที่ตั้งไว้) */
  const activeGroup = MENU.filter((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.group;

  useEffect(() => {
    if (pathname === "/admin/login" || !perms.includes("orders.viewAll")) return;
    // แคชผลไว้ 2 นาที — เดิมยิงดึงเรตติ้งทั้งชุดใหม่ "ทุกคลิกเปลี่ยนหน้า" ทำให้หลังบ้านหน่วงโดยไม่จำเป็น
    const cached = ratingsBadgeCache && Date.now() - ratingsBadgeCache.at < 120_000 ? ratingsBadgeCache.rows : null;
    if (cached && pathname !== "/admin/ratings") {
      setNewRatings(unseenRatingCount(cached));
      return;
    }
    let active = true;
    fetch("/api/admin/ratings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const rows = (j.ratings ?? []) as { id: string }[];
        ratingsBadgeCache = { at: Date.now(), rows };
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
      setIsAdministrator(!!s.isAdministrator);
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

  /** อวตารตัวอักษรแรกของชื่อ — ใช้ทั้งโหมดกางและโหมดพับ */
  const avatar = (size = "h-8 w-8") => (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-ducky text-sm font-bold text-slate-800`}>
      {userName.trim().charAt(0) || "?"}
    </span>
  );

  /** ปุ่มไอคอนท้ายแถบ (กลับหน้าร้าน / ออกจากระบบ) — ทรงเดียวกัน ต่างแค่สีตอนชี้เมาส์ */
  const footBtn =
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white";

  const iconStore = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M4 9.5v10h16v-10" />
      <path d="M3 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
  const iconLogout = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );

  const navFor = (rail: boolean) => (
    <nav className="space-y-0.5">
      {MENU_GROUPS.flatMap(({ key, label, text, dot, badge, line }, groupIdx) => {
        const items = menu.filter((m) => m.group === key);
        if (!items.length) return [];
        const folded = !!foldedGroups[key];
        return [
          rail ? (
            groupIdx > 0 ? (
              <div key={`h-${key}`} className={`mx-2 my-2 border-t ${line}`} aria-hidden="true" />
            ) : null
          ) : (
            <button
              key={`h-${key}`}
              type="button"
              onClick={() => toggleGroup(key)}
              aria-expanded={!folded}
              title={folded ? "กางกลุ่มนี้" : "หุบกลุ่มนี้"}
              className={`flex w-full items-center gap-1.5 rounded-lg px-3 pb-1 text-left font-display text-[14px] font-semibold uppercase tracking-wide transition ${
                groupIdx > 0 ? "mt-4" : "mt-1"
              } ${text}`}
            >
              <span className={`text-[9px] transition-transform ${folded ? "-rotate-90" : ""}`}>▼</span>
              {label}
              {/* หุบอยู่แต่มีหน้าที่เปิดค้างในกลุ่มนี้ → จุดบอกให้รู้ว่าอยู่ตรงไหน */}
              {folded && activeGroup === key && (
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-label="อยู่ในกลุ่มนี้" />
              )}
              {folded && (
                <span className={`ml-auto rounded-full px-2 text-[11px] font-bold ${badge}`}>
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
            className={`relative flex items-center rounded-xl py-2.5 font-display text-[12.5px] font-medium transition ${
              rail ? "justify-center px-0" : "gap-3 px-3"
            } ${
              active
                ? "bg-white font-semibold text-[#173A6B] shadow-[0_4px_14px_rgba(0,0,0,0.3)]"
                : "text-sky-100/90 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className={`text-base ${active ? "" : "opacity-80"}`}>{m.emoji}</span>
            {!rail && m.label}
            {badge &&
              (rail ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-400 ring-2 ring-[#173A6B]" />
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
    <PermProvider value={{ perms, role: roleName, name: userName, isAdministrator }}>
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      {/* แถบข้าง (เดสก์ท็อป) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[#122E56] bg-[#173A6B] p-3 transition-[width] duration-200 md:flex print:hidden ${
          railed ? "w-20 items-stretch" : "w-60"
        }`}
      >
        <div className={`mb-4 flex items-center ${railed ? "flex-col gap-2" : "justify-between gap-2"}`}>
          <div className={`flex items-center gap-2.5 py-1 ${railed ? "" : "px-2"}`}>
            {/* กดที่โลโก้เพื่อเปลี่ยนรูปได้เลย (เฉพาะคนมีสิทธิ์ตั้งค่าระบบ · โหมดพับใช้เป็นลิงก์ตามเดิม) */}
            {canEditLogo && !railed ? (
              <label className="group/logo relative h-9 w-9 shrink-0 cursor-pointer" title="กดเพื่อเปลี่ยนโลโก้หลังบ้าน">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void pickAdminLogo(f);
                  }}
                />
                {logoIcon("h-9 w-9", "rounded-xl")}
                <span
                  className={`absolute inset-0 ${logoBusy ? "grid" : "hidden group-hover/logo:grid"} place-items-center rounded-xl bg-slate-900/50 text-xs text-white`}
                >
                  {logoBusy ? "⏳" : "📤"}
                </span>
                {adminLogo && !logoBusy && (
                  <button
                    type="button"
                    title="เอารูปออก — กลับไปใช้เป็ด 🦆"
                    onClick={(e) => {
                      e.preventDefault();
                      void saveAdminLogo(undefined);
                    }}
                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-rose-500 shadow ring-1 ring-slate-200 group-hover/logo:grid"
                  >
                    ✕
                  </button>
                )}
              </label>
            ) : (
              <Link href="/admin" title="iDucky Admin" className="shrink-0">
                {logoIcon("h-9 w-9", "rounded-xl")}
              </Link>
            )}
            {!railed && (
              <Link href="/admin" className="leading-tight" title="iDucky Admin">
                <span className="block font-display text-sm font-semibold text-white">iDucky Admin</span>
                <span className="block text-[11px] text-sky-200/80">ระบบหลังบ้าน</span>
              </Link>
            )}
          </div>
          <button
            type="button"
            onClick={toggleRail}
            title={railed ? "กางแถบเมนู" : "พับแถบเมนู"}
            aria-label={railed ? "กางแถบเมนู" : "พับแถบเมนู"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/60 ring-1 ring-white/20 transition hover:bg-white/10 hover:text-white"
          >
            {railed ? "»" : "«"}
          </button>
        </div>
        {/*
          เมนูต้องเลื่อนเองได้ — แถบข้างสูงเท่าจอ (h-screen) พอเมนูยาวเกินจอแล้วไม่มีตัวเลื่อน
          รายการท้าย ๆ (ร้าน & ระบบ · บทความ) จะโดนตัดหายไปเลย กดไม่ได้
          min-h-0 จำเป็น: ลูกของ flex ตั้งต้นเป็น min-height:auto ทำให้ย่อต่ำกว่าเนื้อหาไม่ได้ overflow เลยไม่ทำงาน
        */}
        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">{navFor(railed)}</div>
        {/*
          ท้ายแถบ — รวมเป็นแถวเดียว: ตัวตนทางซ้าย · ปุ่มลัดทางขวา
          เดิมเป็น 3 ก้อนซ้อนกัน (การ์ดผู้ใช้ + กลับหน้าร้าน + ออกจากระบบ) กินสูงเกือบ 150px
          ซึ่งไปเบียดเมนูในแถบที่สูงเท่าจออยู่แล้ว · แบบใหม่เหลือ ~48px
          และ "ออกจากระบบ" ไม่ทำสีแดงค้างไว้ เพราะเป็นของที่ใช้นาน ๆ ครั้ง
          ไม่ควรเด่นกว่าเมนูงานจริง — เปลี่ยนเป็นแดงตอนชี้เมาส์แทน
        */}
        <div className="mt-auto shrink-0 border-t border-white/10 pt-2">
          {railed ? (
            <div className="flex flex-col items-center gap-1">
              {userName && <span title={`${userName}${roleName ? ` · ${roleName}` : ""}`}>{avatar("h-9 w-9")}</span>}
              <Link href="/" title="กลับหน้าร้าน" className={footBtn}>
                {iconStore}
              </Link>
              {configured && (
                <button type="button" onClick={handleSignOut} title="ออกจากระบบ" className={`${footBtn} hover:!bg-rose-500/20 hover:!text-rose-300`}>
                  {iconLogout}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-1 py-1">
              {userName && avatar()}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-bold text-white" title={userName}>
                  {userName || "—"}
                </span>
                {roleName && <span className="block truncate text-[11px] text-sky-200/70">{roleName}</span>}
              </span>
              <Link href="/" title="กลับหน้าร้าน" aria-label="กลับหน้าร้าน" className={footBtn}>
                {iconStore}
              </Link>
              {configured && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="ออกจากระบบ"
                  aria-label="ออกจากระบบ"
                  className={`${footBtn} hover:!bg-rose-500/20 hover:!text-rose-300`}
                >
                  {iconLogout}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* แถบบน (มือถือ) */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#122E56] bg-[#173A6B]/95 px-4 backdrop-blur md:hidden print:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            {logoIcon("h-8 w-8", "rounded-lg")}
            <span className="font-display text-sm font-semibold text-white">iDucky Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-lg text-white"
            aria-label="เปิดเมนูแอดมิน"
            aria-expanded={open}
          >
            {open ? "✕" : "☰"}
          </button>
        </header>
        {open && (
          <div className="border-b border-[#122E56] bg-[#173A6B] p-3 md:hidden">
            {nav}
            {/* ท้ายเมนูมือถือ — แถวเดียวแบบเดียวกับเดสก์ท็อป (นิ้วแตะง่าย ปุ่ม 36px) */}
            <div className="mt-1 flex items-center gap-2 border-t border-white/10 px-1 pt-2">
              {userName && avatar()}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-bold text-white">{userName || "—"}</span>
                {roleName && <span className="block truncate text-[11px] text-sky-200/70">{roleName}</span>}
              </span>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                title="กลับหน้าร้าน"
                aria-label="กลับหน้าร้าน"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                {iconStore}
              </Link>
              {configured && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="ออกจากระบบ"
                  aria-label="ออกจากระบบ"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-rose-500/20 hover:text-rose-300"
                >
                  {iconLogout}
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
