"use client";

import RequirePerm from "@/components/RequirePerm";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_SHIPPING,
  fetchShopPayment,
  freeShippingMinOf,
  persistShopPayment,
  shippingOf,
  tiersConfigOf,
  welcomeCouponOf,
  shopInfoOf,
  imageCleanupOf,
  type ImageCleanupConfig,
  type BankAccount,
  type ShippingMethod,
  type ShopPayment,
  type WelcomeCouponConfig,
  type ShopInfo,
  type SeoConfig,
} from "@/lib/shop-settings";
import { DEFAULT_TIERS, type Tier } from "@/lib/tiers";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import {
  DEPT_ADMIN,
  DEPT_CONTENT,
  DEPT_PACKING,
  PERM_INFO,
  ROLE_ADMINISTRATOR,
  type Perm,
  type RolePermsMap,
} from "@/lib/permissions";
import { btnPrimary, card, faint, h1, muted } from "@/lib/admin-ui";

/** ไอคอนหมวดหมู่ให้เลือก — จัดกลุ่มตามชนิดงานของร้าน (พิมพ์อีโมจิอื่นเองก็ได้) */
const CAT_ICONS: { group: string; items: string[] }[] = [
  { group: "อะคริลิค · สแตนดี้", items: ["🔑", "🪟", "🧍", "💡", "🪞", "🧲", "🏷️", "📛", "🪪"] },
  { group: "กระดาษ · การ์ด · ป้าย", items: ["🎴", "🗂️", "📇", "📄", "📋", "📣", "🖼️", "📅", "📓", "✉️"] },
  { group: "ผ้า · ของใช้", items: ["👕", "🧢", "👜", "🎒", "🧶", "🛏️", "🧸", "🧦", "🩳", "☂️"] },
  { group: "บ้าน · แก้ว · แก็ดเจ็ต", items: ["🏠", "☕", "🥤", "🍶", "🖱️", "📱", "⌚", "🎧", "🔌", "💻"] },
  { group: "ของขวัญ · ตกแต่ง", items: ["🎁", "🎀", "🎈", "✨", "🌸", "⭐", "❤️", "🐶", "🐱", "🎨"] },
];

/** อัปโหลดรูปหมวดขึ้นคลัง (ใช้ทั้งปุ่มเลือกไฟล์และลากวาง) */
async function uploadCatImage(file: File): Promise<{ url?: string; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", "categories");
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) return { error: j.error ?? "อัปโหลดไม่สำเร็จ" };
    return { url: j.url };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

/** รูปหมวด: thumbnail + ปุ่มอัปโหลด + รับลากรูปมาวาง */
function CatImage({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  async function up(f: File) {
    if (!f.type.startsWith("image/")) return;
    setBusy(true);
    const r = await uploadCatImage(f);
    if (r.url) onChange(r.url);
    setBusy(false);
  }
  return (
    <span
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void up(f);
      }}
      className={`flex items-center gap-1 rounded-lg p-0.5 transition ${over ? "ring-2 ring-amber-400 bg-amber-50" : ""}`}
      title="ลากรูปมาวางตรงนี้ได้เลย"
    >
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded px-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50"
            title="เอารูปออก (กลับไปใช้อีโมจิ)"
          >
            ✕
          </button>
        </>
      ) : (
        <label
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400 transition hover:border-amber-400 hover:text-amber-600"
          title="อัปโหลดรูปหมวด หรือลากรูปมาวาง"
        >
          {busy ? "…" : "🖼"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void up(f);
            }}
          />
        </label>
      )}
    </span>
  );
}

/** ปุ่มเลือกไอคอน — กดแล้วมีชุดให้เลือก หรือพิมพ์อีโมจิเองในช่องด้านล่าง */
function IconPicker({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="เลือกไอคอนหมวดนี้"
        className={`grid h-10 w-12 place-items-center rounded-lg border text-xl transition ${
          open ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:border-amber-300"
        }`}
      >
        {value || "🏷️"}
      </button>
      {open && (
        <>
          <button type="button" aria-label="ปิด" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" />
          <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            {CAT_ICONS.map((g) => (
              <div key={g.group} className="mb-1.5 last:mb-0">
                <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.group}</p>
                <div className="mt-0.5 flex flex-wrap gap-0.5">
                  {g.items.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => {
                        onPick(ic);
                        setOpen(false);
                      }}
                      className={`grid h-8 w-8 place-items-center rounded-lg text-lg transition hover:bg-amber-50 ${
                        ic === value ? "bg-amber-100 ring-1 ring-amber-300" : ""
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="mt-1 block border-t border-slate-100 pt-1.5 text-[10px] font-bold text-slate-400">
              หรือพิมพ์อีโมจิเอง
              <input
                value={value}
                onChange={(e) => onPick(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-center text-lg focus:border-amber-300 focus:outline-none"
              />
            </label>
          </div>
        </>
      )}
    </span>
  );
}

const newId = (p = "b") =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

type Tab = "shop" | "pay" | "ship" | "tier" | "welcome" | "roles" | "files" | "cats" | "google";

const TAB_KEYS: Tab[] = ["shop", "pay", "ship", "tier", "welcome", "roles", "files", "cats", "google"];

function AdminSettingsPageInner() {
  const [tab, setTab] = useState<Tab>("pay");
  // เปิดแท็บตามลิงก์ได้ เช่น /admin/settings?tab=cats (ใช้จากผังหน้าแรกในเมนูหน้าร้าน)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TAB_KEYS.includes(t)) setTab(t);
  }, []);

  // ── ชำระเงิน ──
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [promptpay, setPromptpay] = useState("");
  const [promptpayName, setPromptpayName] = useState("");
  const [note, setNote] = useState("");

  // ── จัดส่ง ──
  const [shipping, setShipping] = useState<ShippingMethod[]>([]);
  const [freeMin, setFreeMin] = useState<number>(0);

  // ── ระดับสมาชิก ──
  const [tiers, setTiers] = useState<Tier[]>([]);

  // ── คูปองต้อนรับ ──
  const [welcome, setWelcome] = useState<WelcomeCouponConfig>(welcomeCouponOf(null));

  // ── หมวดหมู่สินค้า ──
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  const [catSaving, setCatSaving] = useState(false);
  const [catSaved, setCatSaved] = useState(false);
  const [catErr, setCatErr] = useState("");
  useEffect(() => {
    fetchCategories().then(setCats);
    // นับสินค้าต่อหมวด — กันลบหมวดที่ยังมีสินค้าอยู่
    fetch("/api/admin/products-lite", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { list?: { id: string; category?: string }[] }) => {
        const map: Record<string, number> = {};
        for (const p of j.list ?? []) if (p.category) map[p.category] = (map[p.category] ?? 0) + 1;
        setCatCounts(map);
      })
      .catch(() => {});
  }, []);
  const patchCat = (i: number, patch: Partial<ShopCategory>) =>
    setCats((cur) => cur.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const moveCat = (i: number, dir: -1 | 1) =>
    setCats((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  async function saveCats() {
    setCatSaving(true);
    setCatErr("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: cats }),
      });
      const j = await res.json();
      if (!res.ok) setCatErr(j.error ?? "บันทึกไม่สำเร็จ");
      else {
        setCatSaved(true);
        setTimeout(() => setCatSaved(false), 2500);
      }
    } catch {
      setCatErr("เชื่อมต่อไม่ได้");
    }
    setCatSaving(false);
  }

  // ── ล้างรูปออเดอร์เก่า ──
  const [cleanup, setCleanup] = useState<ImageCleanupConfig>(imageCleanupOf(null));
  const [dryRun, setDryRun] = useState<{ orders: number; files: number; list: { id: string; status: string; files: number }[] } | null>(null);
  const [dryBusy, setDryBusy] = useState(false);
  const [dryErr, setDryErr] = useState("");

  // ── ข้อมูลร้าน (แสดงบนใบงาน/ใบปะหน้า/ใบเสร็จ) ──
  const [info, setInfo] = useState<ShopInfo>(shopInfoOf(null));

  // ── Google & SEO (แอดมินเอารหัสจาก Search Console/Analytics มาวางเอง) ──
  const [seo, setSeo] = useState<SeoConfig>({});
  const patchSeo = (v: Partial<SeoConfig>) => setSeo((c) => ({ ...c, ...v }));
  const patchInfo = (patch: Partial<ShopInfo>) => {
    setInfo((v) => ({ ...v, ...patch }));
    touch();
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // ── บทบาท & สิทธิ์ (เก็บแยกแถว __role_perms__ — บันทึกด้วยปุ่มของแท็บนี้เอง) ──
  const [rolesMap, setRolesMap] = useState<RolePermsMap | null>(null);
  const [rolesEditable, setRolesEditable] = useState(false);
  const [rolesDirty, setRolesDirty] = useState(false);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesSaved, setRolesSaved] = useState(false);
  const [rolesErr, setRolesErr] = useState("");
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    fetch("/api/admin/role-perms", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.roles) setRolesMap(j.roles as RolePermsMap);
        setRolesEditable(!!j.editable);
      })
      .catch(() => {});
  }, []);

  const togglePerm = (dept: string, perm: Perm) => {
    setRolesMap((m) => {
      if (!m) return m;
      const cur = m[dept] ?? [];
      return { ...m, [dept]: cur.includes(perm) ? cur.filter((p) => p !== perm) : [...cur, perm] };
    });
    setRolesDirty(true);
    setRolesSaved(false);
  };
  const addRole = () => {
    const name = newRole.trim().slice(0, 30);
    if (!name) return;
    if (name === ROLE_ADMINISTRATOR || name === "ผู้ดูแลระบบ") return setRolesErr("ชื่อนี้สงวนไว้สำหรับผู้ดูแลระบบ");
    setRolesMap((m) => {
      if (!m || m[name]) return m;
      return { ...m, [name]: ["admin.access"] };
    });
    setNewRole("");
    setRolesDirty(true);
    setRolesSaved(false);
    setRolesErr("");
  };
  const removeRole = (dept: string) => {
    if (!confirm(`ลบบทบาท "${dept}"? พนักงานแผนกนี้จะเข้าหลังบ้านไม่ได้จนกว่าจะย้ายแผนก`)) return;
    setRolesMap((m) => {
      if (!m) return m;
      const next = { ...m };
      delete next[dept];
      return next;
    });
    setRolesDirty(true);
    setRolesSaved(false);
  };
  async function saveRoles() {
    if (!rolesMap) return;
    setRolesSaving(true);
    setRolesErr("");
    const res = await fetch("/api/admin/role-perms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roles: rolesMap }),
    });
    const j = await res.json().catch(() => ({}));
    setRolesSaving(false);
    if (!res.ok) return setRolesErr(j.error ?? "บันทึกไม่สำเร็จ");
    if (j.roles) setRolesMap(j.roles as RolePermsMap); // เซิร์ฟเวอร์อาจเติม admin.access ให้อัตโนมัติ
    setRolesDirty(false);
    setRolesSaved(true);
    setTimeout(() => setRolesSaved(false), 2500);
  }

  useEffect(() => {
    fetchShopPayment().then((p) => {
      setBanks(p.banks ?? []);
      setPromptpay(p.promptpay ?? "");
      setPromptpayName(p.promptpayName ?? "");
      setNote(p.note ?? "");
      setShipping(shippingOf(p));
      setFreeMin(freeShippingMinOf(p));
      setTiers(tiersConfigOf(p));
      setWelcome(welcomeCouponOf(p));
      setInfo(shopInfoOf(p));
      setCleanup(imageCleanupOf(p));
      setSeo(p?.seo ?? {});
      setLoading(false);
    });
  }, []);

  const patchWelcome = (patch: Partial<WelcomeCouponConfig>) => {
    setWelcome((w) => ({ ...w, ...patch }));
    touch();
  };

  const touch = () => setSaved(false);

  /* ── บัญชี ── */
  function patchBank(id: string, patch: Partial<BankAccount>) {
    setBanks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    touch();
  }
  const addBank = () => {
    setBanks((bs) => [...bs, { id: newId(), bank: "", accountName: "", accountNo: "" }]);
    touch();
  };
  const removeBank = (id: string) => {
    setBanks((bs) => bs.filter((b) => b.id !== id));
    touch();
  };

  /* ── จัดส่ง ── */
  function patchShip(id: string, patch: Partial<ShippingMethod>) {
    setShipping((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    touch();
  }
  const addShip = () => {
    setShipping((ss) => [...ss, { id: newId("s"), name: "", price: 0 }]);
    touch();
  };
  const removeShip = (id: string) => {
    setShipping((ss) => ss.filter((s) => s.id !== id));
    touch();
  };

  async function save() {
    setSaving(true);
    setError("");
    const cleanShipping = shipping
      .map((s) => ({
        ...s,
        name: s.name.trim(),
        price: Number(s.price) || 0,
        // เกณฑ์เลือกอัตโนมัติ — 0/ว่าง = ไม่ใช้ ตัดออกไม่ให้ค้างในฐาน
        ...(Number(s.minQty) > 0 ? { minQty: Math.floor(Number(s.minQty)) } : { minQty: undefined }),
        ...(Number(s.minSubtotal) > 0 ? { minSubtotal: Math.floor(Number(s.minSubtotal)) } : { minSubtotal: undefined }),
      }))
      .filter((s) => s.name);

    if (cleanShipping.length === 0) {
      setSaving(false);
      setError("ต้องมีรูปแบบจัดส่งอย่างน้อย 1 อย่าง (ไม่งั้นลูกค้าเลือกไม่ได้)");
      setTab("ship");
      return;
    }

    const payload: ShopPayment = {
      banks: banks
        .map((b) => ({ ...b, bank: b.bank.trim(), accountName: b.accountName.trim(), accountNo: b.accountNo.trim() }))
        .filter((b) => b.accountNo || b.bank),
      promptpay: promptpay.trim() || undefined,
      promptpayName: promptpayName.trim() || undefined,
      note: note.trim() || undefined,
      shipping: cleanShipping,
      freeShippingMin: Number(freeMin) || 0,
      tiers: tiers
        .map((t) => ({ ...t, name: t.name.trim(), minSpend: Number(t.minSpend) || 0, discountPct: Number(t.discountPct) || 0 }))
        .filter((t) => t.name)
        .sort((a, b) => a.minSpend - b.minSpend),
      shopInfo: {
        name: info.name.trim(),
        legalName: info.legalName.trim(),
        address: info.address.trim(),
        phone: info.phone.trim(),
        taxId: info.taxId?.trim() || undefined,
      },
      imageCleanup: {
        ...cleanup,
        days: Math.max(1, Number(cleanup.days) || 30),
      },
      seo: {
        googleVerification: seo.googleVerification?.trim() || undefined,
        bingVerification: seo.bingVerification?.trim() || undefined,
        ga4Id: seo.ga4Id?.trim() || undefined,
        gtmId: seo.gtmId?.trim() || undefined,
        noindex: !!seo.noindex,
      },
      welcomeCoupon: {
        enabled: welcome.enabled,
        type: welcome.type,
        value: Number(welcome.value) || 0,
        minSpend: Number(welcome.minSpend) || 0,
        maxDiscount: welcome.type === "percent" ? Number(welcome.maxDiscount) || 0 : 0,
        expiryDays: Number(welcome.expiryDays) || 0,
      },
    };
    const res = await persistShopPayment(payload);
    setSaving(false);
    if (res.ok) {
      setShipping(cleanShipping);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(`บันทึกไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
  // ช่องกรอกขนาดใหญ่ (ใช้ในแท็บคูปองต้อนรับ ให้โปร่ง อ่านง่าย)
  const bigInput =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>⚙️ ตั้งค่าระบบ</h1>
      <p className={`mt-1 ${muted}`}>ช่องทางรับเงิน และรูปแบบการจัดส่งที่ลูกค้าเลือกได้ตอนสั่งซื้อ</p>

      {/* แท็บ */}
      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["shop", "🏪 ข้อมูลร้าน"],
            ["pay", "🏦 ชำระเงิน"],
            ["ship", "🚚 การจัดส่ง"],
            ["tier", "🏅 ระดับสมาชิก"],
            ["welcome", "🎁 คูปองต้อนรับ"],
            ["roles", "👥 บทบาท"],
            ["cats", "🗂 หมวดหมู่สินค้า"],
            ["files", "🧹 ล้างรูปเก่า"],
            ["google", "🔍 Google & SEO"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === k
                ? "bg-amber-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={`mt-5 p-8 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>
      ) : (
        <>
          {/* ══════ ข้อมูลร้าน ══════ */}
          {tab === "shop" && (
            <section className={`mt-4 p-5 ${card}`}>
              <h2 className="text-sm font-semibold text-slate-800">🏪 ข้อมูลร้าน</h2>
              <p className={`mt-0.5 text-xs ${faint}`}>แสดงบนใบงาน · ใบปะหน้าพัสดุ (ผู้ส่ง) · ใบเสร็จ</p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">ชื่อร้าน (แบรนด์)</span>
                  <input value={info.name} onChange={(e) => patchInfo({ name: e.target.value })} className={inputCls} placeholder="เช่น iDucky Prints Studio" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">ชื่อบริษัท / ผู้ส่ง</span>
                  <input value={info.legalName} onChange={(e) => patchInfo({ legalName: e.target.value })} className={inputCls} placeholder="เช่น บริษัท ทีพีดิจิตอล" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-600">ที่อยู่ร้าน</span>
                  <textarea value={info.address} onChange={(e) => patchInfo({ address: e.target.value })} rows={2} className={`${inputCls} resize-y`} placeholder="บ้านเลขที่ ซอย/ถนน แขวง/เขต จังหวัด รหัสไปรษณีย์" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทรร้าน</span>
                  <input value={info.phone} onChange={(e) => patchInfo({ phone: e.target.value })} inputMode="tel" className={inputCls} placeholder="เช่น 096-569-9414" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">เลขประจำตัวผู้เสียภาษี — ไม่บังคับ</span>
                  <input value={info.taxId ?? ""} onChange={(e) => patchInfo({ taxId: e.target.value })} className={inputCls} placeholder="เว้นว่าง = ไม่แสดงบนใบเสร็จ" />
                </label>
              </div>
            </section>
          )}

          {/* ══════ ชำระเงิน ══════ */}
          {tab === "pay" && (
            <>
              <section className={`mt-4 p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">🏦 บัญชีธนาคาร ({banks.length})</h2>
                  <button
                    type="button"
                    onClick={addBank}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    ＋ เพิ่มบัญชี
                  </button>
                </div>

                {banks.length === 0 && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
                    ยังไม่มีบัญชี — กด “เพิ่มบัญชี” เพื่อกรอกเลขบัญชีร้าน
                  </p>
                )}

                <div className="mt-3 space-y-3">
                  {banks.map((b) => (
                    <div key={b.id} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={b.bank}
                          onChange={(e) => patchBank(b.id, { bank: e.target.value })}
                          placeholder="ธนาคาร (เช่น กสิกรไทย)"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <input
                          value={b.accountName}
                          onChange={(e) => patchBank(b.id, { accountName: e.target.value })}
                          placeholder="ชื่อบัญชี"
                          className={`${inputCls} min-w-40 flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeBank(b.id)}
                          className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          🗑 ลบ
                        </button>
                      </div>
                      <input
                        value={b.accountNo}
                        onChange={(e) => patchBank(b.id, { accountNo: e.target.value })}
                        placeholder="เลขบัญชี (เช่น 123-4-56789-0)"
                        className={`${inputCls} mt-2 font-mono tracking-wide`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className={`p-5 ${card}`}>
                  <h2 className="text-sm font-semibold text-slate-800">📱 พร้อมเพย์ (PromptPay)</h2>
                  <div className="mt-3 space-y-2">
                    <input
                      value={promptpay}
                      onChange={(e) => {
                        setPromptpay(e.target.value);
                        touch();
                      }}
                      placeholder="เบอร์ / เลขบัตร ปชช. / เลขนิติบุคคล"
                      className={`${inputCls} font-mono tracking-wide`}
                    />
                    <input
                      value={promptpayName}
                      onChange={(e) => {
                        setPromptpayName(e.target.value);
                        touch();
                      }}
                      placeholder="ชื่อบัญชีพร้อมเพย์"
                      className={inputCls}
                    />
                  </div>
                </section>

                <section className={`p-5 ${card}`}>
                  <h2 className="text-sm font-semibold text-slate-800">📝 หมายเหตุถึงลูกค้า (ไม่บังคับ)</h2>
                  <textarea
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      touch();
                    }}
                    rows={3}
                    placeholder="เช่น โอนแล้วแนบสลิปในหน้าออเดอร์ · โอนภายใน 24 ชม."
                    className={`${inputCls} mt-3 h-[calc(100%-2.5rem)] resize-y`}
                  />
                </section>
              </div>
            </>
          )}

          {/* ══════ การจัดส่ง ══════ */}
          {tab === "ship" && (
            <>
              <section className={`mt-4 p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-800">🚚 รูปแบบการจัดส่ง ({shipping.length})</h2>
                  <button
                    type="button"
                    onClick={addShip}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    ＋ เพิ่มรูปแบบ
                  </button>
                </div>
                <p className={`mt-1 text-xs ${faint}`}>
                  ลูกค้าจะเลือกจากรายการนี้ในหน้าตะกร้า · เรียงจากบนลงล่างตามที่แสดง ·
                  ตั้ง “เด้งมาใช้เมื่อ” ไว้ ระบบจะเลือกกล่องที่พอดีให้ลูกค้าเอง (ของเยอะ = กล่องใหญ่)
                </p>

                {shipping.length === 0 && (
                  <p className="mt-3 rounded-xl bg-rose-50 p-4 text-center text-xs font-semibold text-rose-600">
                    ⚠️ ยังไม่มีรูปแบบจัดส่ง — ลูกค้าจะสั่งซื้อไม่ได้ กรุณาเพิ่มอย่างน้อย 1 อย่าง
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  {shipping.map((s, i) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                        {i + 1}
                      </span>
                      <input
                        value={s.name}
                        onChange={(e) => patchShip(s.id, { name: e.target.value })}
                        placeholder="ชื่อที่ลูกค้าเห็น (เช่น ส่งธรรมดา 3-5 วัน)"
                        className={`${inputCls} min-w-52 flex-1`}
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={s.price}
                          onChange={(e) => patchShip(s.id, { price: Number(e.target.value) })}
                          className={`${inputCls} w-24 text-right tabular-nums`}
                        />
                        <span className="text-xs text-slate-500">บาท</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeShip(s.id)}
                        className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        🗑 ลบ
                      </button>

                      {/* เงื่อนไขเลือกอัตโนมัติ — ของเยอะ/ยอดสูง ระบบยกระดับมาใช้กล่องนี้เอง */}
                      <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-600">เด้งมาใช้เมื่อ</span>
                        <label className="flex items-center gap-1.5">
                          สั่งตั้งแต่
                          <input
                            type="number"
                            min={0}
                            value={s.minQty ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              patchShip(s.id, { minQty: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })
                            }
                            className={`${inputCls} w-20 text-right tabular-nums`}
                          />
                          ชิ้นขึ้นไป
                        </label>
                        <span className="text-slate-300">หรือ</span>
                        <label className="flex items-center gap-1.5">
                          ยอดถึง
                          <input
                            type="number"
                            min={0}
                            value={s.minSubtotal ?? ""}
                            placeholder="—"
                            onChange={(e) =>
                              patchShip(s.id, { minSubtotal: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })
                            }
                            className={`${inputCls} w-24 text-right tabular-nums`}
                          />
                          บาท
                        </label>
                        <span className="text-slate-400">· เว้นว่าง = ไม่เด้ง</span>
                      </div>
                    </div>
                  ))}
                </div>

                {shipping.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShipping(DEFAULT_SHIPPING.map((d) => ({ ...d })));
                      touch();
                    }}
                    className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    ↩︎ ใช้ค่าเริ่มต้น (ส่งธรรมดา ฿50 · ส่งด่วน ฿90)
                  </button>
                )}
              </section>

              <section className={`mt-4 p-5 ${card}`}>
                <h2 className="text-sm font-semibold text-slate-800">🎁 ส่งฟรีเมื่อซื้อครบ</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={freeMin}
                    onChange={(e) => {
                      setFreeMin(Number(e.target.value));
                      touch();
                    }}
                    className={`${inputCls} w-36 text-right tabular-nums`}
                  />
                  <span className="text-sm text-slate-600">บาทขึ้นไป</span>
                </div>
                <p className={`mt-2 text-xs ${faint}`}>
                  {freeMin > 0
                    ? `ลูกค้าซื้อครบ ฿${freeMin.toLocaleString()} จะไม่เสียค่าส่ง (แสดงแถบความคืบหน้าในตะกร้าด้วย)`
                    : "ใส่ 0 = ปิดโปรส่งฟรี ลูกค้าจ่ายค่าส่งทุกออเดอร์"}
                </p>
              </section>
            </>
          )}

          {/* ══════ ระดับสมาชิก ══════ */}
          {tab === "tier" && (
            <section className={`mt-4 p-5 ${card}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">🏅 ระดับสมาชิก ({tiers.length})</h2>
                <button
                  type="button"
                  onClick={() => {
                    setTiers([...tiers, { id: newId("t"), name: "", icon: "🎖", minSpend: 0, discountPct: 0 }]);
                    touch();
                  }}
                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  ＋ เพิ่มระดับ
                </button>
              </div>
              <p className={`mt-1 text-xs ${faint}`}>
                ลูกค้าสะสมยอด "จ่ายจริง" ตลอดชีพ ถึงขั้นต่ำของระดับไหน → ได้ส่วนลด % นั้นอัตโนมัติทุกออเดอร์ (คิดจากราคาสินค้าก่อนค่าส่ง)
              </p>

              {/* หัวตาราง */}
              <div className="mt-3 hidden grid-cols-[3rem_1fr_8rem_6rem_2.5rem] gap-2 px-1 text-[11px] font-bold text-slate-400 sm:grid">
                <span>ไอคอน</span>
                <span>ชื่อระดับ</span>
                <span className="text-right">ยอดสะสม ≥</span>
                <span className="text-right">ลด %</span>
                <span />
              </div>
              <div className="mt-1 space-y-2">
                {tiers.map((t, i) => (
                  <div key={t.id} className="grid grid-cols-[3rem_1fr_8rem_6rem_2.5rem] items-center gap-2">
                    <input
                      value={t.icon}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x))); touch(); }}
                      className={`${inputCls} text-center`}
                      maxLength={2}
                    />
                    <input
                      value={t.name}
                      placeholder="ชื่อระดับ"
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))); touch(); }}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={0}
                      value={t.minSpend}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, minSpend: Number(e.target.value) } : x))); touch(); }}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={t.discountPct}
                      onChange={(e) => { setTiers(tiers.map((x, j) => (j === i ? { ...x, discountPct: Number(e.target.value) } : x))); touch(); }}
                      className={`${inputCls} text-right tabular-nums`}
                    />
                    <button
                      type="button"
                      onClick={() => { setTiers(tiers.filter((_, j) => j !== i)); touch(); }}
                      className="grid h-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"
                      aria-label="ลบระดับ"
                    >
                      🗑
                    </button>
                  </div>
                ))}
              </div>

              {tiers.length === 0 && (
                <button
                  type="button"
                  onClick={() => { setTiers(DEFAULT_TIERS.map((d) => ({ ...d }))); touch(); }}
                  className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  ↩︎ ใช้ค่าเริ่มต้น (5 ระดับ 🥉→👑)
                </button>
              )}
              <p className={`mt-3 text-xs ${faint}`}>
                💡 ควรมีระดับเริ่มต้นที่ยอด 0 · ลด 0% (สมาชิกใหม่) และเรียงยอดจากน้อยไปมาก · ระบบจะเรียงให้อัตโนมัติตอนบันทึก
              </p>
            </section>
          )}

          {tab === "welcome" && (
            <section className={`mt-5 ${card} p-6 sm:p-8`}>
              {/* หัว: ชื่อ + สวิตช์เปิด/ปิด (มีป้ายสถานะชัดเจน) */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">🎁 คูปองต้อนรับสมาชิกใหม่</h2>
                  <p className={`mt-1 text-sm ${muted}`}>แจกอัตโนมัติเมื่อลูกค้าสมัคร/ล็อกอินครั้งแรก · ผูกบัญชี ใช้ครั้งเดียว</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={welcome.enabled}
                  onClick={() => patchWelcome({ enabled: !welcome.enabled })}
                  className={`flex shrink-0 items-center gap-2.5 rounded-full py-1.5 pl-4 pr-1.5 text-sm font-bold transition ${
                    welcome.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {welcome.enabled ? "เปิดแจกอยู่" : "ปิดอยู่"}
                  <span className={`relative h-7 w-12 rounded-full transition ${welcome.enabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${welcome.enabled ? "left-[22px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>

              <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_22rem]">
                {/* ── ซ้าย: ตั้งค่า ── */}
                <div className={`space-y-7 ${welcome.enabled ? "" : "pointer-events-none opacity-50"}`}>
                  <div>
                    <span className="mb-2 block text-sm font-semibold text-slate-700">รูปแบบส่วนลด</span>
                    <div className="inline-flex rounded-xl border border-slate-200 p-1">
                      {(["percent", "fixed"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => patchWelcome({ type: t })}
                          className={`rounded-lg px-6 py-2.5 text-base font-medium transition ${
                            welcome.type === t ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {t === "percent" ? "ลด %" : "ลดเป็นบาท"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-6 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{welcome.type === "percent" ? "ส่วนลด (%)" : "ส่วนลด (บาท)"}</span>
                      <input type="number" min={0} value={welcome.value} onChange={(e) => patchWelcome({ value: Number(e.target.value) })} className={`${bigInput} text-right tabular-nums`} />
                    </label>
                    {welcome.type === "percent" && (
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">ส่วนลดสูงสุด (บาท)</span>
                        <input type="number" min={0} value={welcome.maxDiscount ?? 0} onChange={(e) => patchWelcome({ maxDiscount: Number(e.target.value) })} className={`${bigInput} text-right tabular-nums`} />
                        <span className="mt-1.5 block text-xs text-slate-400">0 = ไม่จำกัด</span>
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">ยอดสั่งซื้อขั้นต่ำ (บาท)</span>
                      <input type="number" min={0} value={welcome.minSpend ?? 0} onChange={(e) => patchWelcome({ minSpend: Number(e.target.value) })} className={`${bigInput} text-right tabular-nums`} />
                      <span className="mt-1.5 block text-xs text-slate-400">0 = ไม่มีขั้นต่ำ</span>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">อายุคูปอง (วัน)</span>
                      <input type="number" min={0} value={welcome.expiryDays ?? 0} onChange={(e) => patchWelcome({ expiryDays: Number(e.target.value) })} className={`${bigInput} text-right tabular-nums`} />
                      <span className="mt-1.5 block text-xs text-slate-400">0 = ไม่หมดอายุ</span>
                    </label>
                  </div>

                  <p className={`text-sm ${faint}`}>💡 คูปองจะโผล่ให้ลูกค้าใส่อัตโนมัติตอนสั่งซื้อครั้งแรก — ไม่ต้องแจกโค้ดเอง</p>
                </div>

                {/* ── ขวา: พรีวิวตั๋วสด ── */}
                <div>
                  <span className="mb-2 block text-sm font-semibold text-slate-700">ตัวอย่างที่ลูกค้าเห็น</span>
                  <div className={`overflow-hidden rounded-3xl shadow-md ring-1 ${welcome.enabled ? "ring-sky-100" : "ring-slate-200 grayscale"}`}>
                    <div className={`px-6 py-8 text-center text-white ${welcome.enabled ? "bg-gradient-to-br from-sky-400 to-teal-500" : "bg-slate-400"}`}>
                      <span className="text-5xl">🎟️</span>
                      <p className="mt-2 text-xs font-medium uppercase tracking-wider opacity-90">คูปองต้อนรับ</p>
                      <p className="mt-1 text-4xl font-extrabold">
                        {welcome.type === "percent" ? `ลด ${welcome.value || 0}%` : `ลด ${welcome.value || 0}฿`}
                      </p>
                    </div>
                    <div className="space-y-2 bg-white px-6 py-5 text-center text-sm text-slate-500">
                      {welcome.type === "percent" && (welcome.maxDiscount ?? 0) > 0 && <p>• ลดสูงสุด {welcome.maxDiscount}฿</p>}
                      <p>• {(welcome.minSpend ?? 0) > 0 ? `ยอดขั้นต่ำ ${welcome.minSpend}฿` : "ไม่มียอดขั้นต่ำ"}</p>
                      <p>• {(welcome.expiryDays ?? 0) > 0 ? `ใช้ได้ภายใน ${welcome.expiryDays} วัน` : "ไม่มีวันหมดอายุ"}</p>
                      <p>• ใช้ได้ครั้งเดียว · เฉพาะบัญชีที่ได้รับ</p>
                    </div>
                  </div>
                  {!welcome.enabled && <p className="mt-3 text-center text-xs text-slate-400">ปิดอยู่ — ยังไม่แจกให้สมาชิกใหม่</p>}
                </div>
              </div>
            </section>
          )}

          {/* ══════ บทบาท & สิทธิ์ — ผู้ดูแลระบบติ๊กแก้สิทธิ์/เพิ่มบทบาทได้ ══════ */}
          {tab === "cats" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
                <p className="font-bold">🗂 หมวดหมู่สินค้า</p>
                <p className="mt-1">
                  ชื่อ/อีโมจิ/ลำดับที่ตั้งตรงนี้จะขึ้นบนหน้าแรก · หน้าสินค้าทั้งหมด · และช่องเลือกหมวดในหลังบ้าน
                  · ติ๊ก “ซ่อน” เพื่อพักหมวดจากหน้าร้านโดยไม่ลบสินค้า
                </p>
              </div>

              {/* หัวคอลัมน์ (จอกว้าง) — ให้แถวด้านล่างอ่านเป็นตาราง */}
              <div className="hidden items-center gap-2 px-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 lg:grid lg:grid-cols-[2.5rem_3rem_4.5rem_minmax(0,1fr)_11rem_4.5rem_9rem_3.5rem]">
                <span>ลำดับ</span>
                <span className="text-center">ไอคอน</span>
                <span className="text-center">รูป</span>
                <span>ชื่อหมวด (ไทย)</span>
                <span>ชื่ออังกฤษ</span>
                <span className="text-center">ซ่อน</span>
                <span className="text-right">สินค้า · รหัส</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {cats.map((c, i) => (
                  <div
                    key={c.id}
                    className={`items-center gap-2 rounded-xl p-2 ring-1 max-lg:flex max-lg:flex-wrap lg:grid lg:grid-cols-[2.5rem_3rem_4.5rem_minmax(0,1fr)_11rem_4.5rem_9rem_3.5rem] ${
                      c.hidden ? "bg-slate-50 ring-slate-200" : "bg-white ring-amber-100"
                    }`}
                  >
                    <span className="flex justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveCat(i, -1)}
                        disabled={i === 0}
                        className="rounded px-1 text-[10px] text-slate-400 transition hover:bg-slate-100 disabled:opacity-25"
                        aria-label="เลื่อนขึ้น"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCat(i, 1)}
                        disabled={i === cats.length - 1}
                        className="rounded px-1 text-[10px] text-slate-400 transition hover:bg-slate-100 disabled:opacity-25"
                        aria-label="เลื่อนลง"
                      >
                        ▼
                      </button>
                    </span>
                    <IconPicker value={c.emoji} onPick={(v) => patchCat(i, { emoji: v })} />
                    <CatImage value={c.image} onChange={(v) => patchCat(i, { image: v })} />
                    <input
                      value={c.name}
                      onChange={(e) => patchCat(i, { name: e.target.value })}
                      placeholder="ชื่อหมวด (ไทย)"
                      className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800 focus:border-amber-300 focus:outline-none"
                    />
                    <input
                      value={c.nameEn}
                      onChange={(e) => patchCat(i, { nameEn: e.target.value })}
                      placeholder="ชื่ออังกฤษ (ไม่ใส่ก็ได้)"
                      className="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500 focus:border-amber-300 focus:outline-none"
                    />
                    <label className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500">
                      <input
                        type="checkbox"
                        checked={Boolean(c.hidden)}
                        onChange={(e) => patchCat(i, { hidden: e.target.checked })}
                        className="h-4 w-4 accent-slate-500"
                      />
                      ซ่อน
                    </label>
                    <span className="truncate text-right text-[11px] text-slate-400" title={c.id}>
                      {catCounts[c.id] ?? 0} สินค้า · <span className="font-mono">{c.id}</span>
                    </span>
                    <button
                      type="button"
                      disabled={(catCounts[c.id] ?? 0) > 0}
                      onClick={() => setCats((cur) => cur.filter((_, k) => k !== i))}
                      title={(catCounts[c.id] ?? 0) > 0 ? "ลบไม่ได้ — ยังมีสินค้าอยู่ในหมวดนี้ (ใช้ ‘ซ่อน’ แทน)" : "ลบหมวดนี้"}
                      className="justify-self-end rounded-lg px-2 py-1 text-xs font-bold text-rose-500 transition hover:bg-rose-50 disabled:opacity-25"
                    >
                      ✕ ลบ
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setCats((cur) => [
                    ...cur,
                    {
                      id: `cat-${Date.now().toString(36)}`,
                      name: "",
                      nameEn: "",
                      emoji: "🏷️",
                      gradient: "from-amber-100 to-amber-200",
                      description: "",
                    },
                  ])
                }
                className="rounded-full border border-dashed border-amber-300 px-4 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
              >
                ＋ เพิ่มหมวดใหม่
              </button>

              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={saveCats}
                  disabled={catSaving}
                  className={`${btnPrimary} disabled:opacity-40`}
                >
                  {catSaving ? "กำลังบันทึก…" : "💾 บันทึกหมวดหมู่"}
                </button>
                {catSaved && <span className="text-xs font-bold text-emerald-600">✓ บันทึกแล้ว</span>}
                {catErr && <span className="text-xs font-bold text-rose-600">{catErr}</span>}
                <span className="text-[11px] text-slate-400">หมวดที่มีสินค้าอยู่ลบไม่ได้ — ใช้ “ซ่อน” แทน</span>
              </div>
            </div>
          )}

          {tab === "files" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
                <p className="font-bold">🧹 ล้างรูปของออเดอร์เก่าอัตโนมัติ</p>
                <p className="mt-1">
                  ไฟล์แบบงาน/ลายลูกค้าเป็นก้อนที่ใหญ่ที่สุดของระบบ (หลาย MB ต่อรูป) ออเดอร์ที่ปิดงานไปนานแล้วแทบไม่มีใครเปิดดูรูปอีก
                  ระบบจะลบเฉพาะ “ไฟล์รูป” — ข้อมูลออเดอร์ (ชื่อ/ราคา/ที่อยู่/ประวัติ) ยังอยู่ครบ และหน้าออเดอร์จะขึ้นข้อความแทนรูปแตก
                </p>
                <p className="mt-1 font-semibold">ระบบรันให้เองวันละครั้ง (ตี 3 ครึ่ง) — ลบแล้วกู้คืนไม่ได้ ควรกด “ลองดูก่อน” ทุกครั้งที่เปลี่ยนค่า</p>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <input
                  type="checkbox"
                  checked={cleanup.enabled}
                  onChange={(e) => setCleanup({ ...cleanup, enabled: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
                <span className="text-sm font-bold text-slate-800">เปิดใช้การล้างรูปอัตโนมัติ</span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <span className="text-xs font-bold text-slate-500">ลบรูปเมื่อออเดอร์เก่ากว่า (วัน)</span>
                  <input
                    type="number"
                    min={1}
                    value={cleanup.days}
                    onChange={(e) => setCleanup({ ...cleanup, days: Math.max(1, Number(e.target.value) || 1) })}
                    className="mt-1 w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-800 focus:border-amber-300 focus:outline-none"
                  />
                  <span className="ml-2 text-xs text-slate-400">นับจากวันที่สร้างออเดอร์</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={cleanup.onlyClosed}
                    onChange={(e) => setCleanup({ ...cleanup, onlyClosed: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                  />
                  <span className="text-xs leading-relaxed text-slate-700">
                    <strong className="block text-sm">ล้างเฉพาะออเดอร์ที่ปิดงานแล้ว</strong>
                    เสร็จสิ้น / ยกเลิก เท่านั้น — ถ้าเอาติ๊กออก จะล้างทุกออเดอร์ที่ครบอายุ แม้ยังทำงานอยู่ (ไม่แนะนำ)
                  </span>
                </label>
              </div>

              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-bold text-slate-500">ล้างไฟล์ชนิดไหนบ้าง</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["proofs", "🖼 แบบงานที่ส่งให้ลูกค้าตรวจ", "ไฟล์ใหญ่ที่สุด — ลบได้เมื่อจบงาน"],
                      ["artwork", "🎨 ลายที่ลูกค้าแนบมา", "ต้นฉบับจริงลูกค้าเก็บเอง/ส่งลิงก์ไว้แล้ว"],
                      ["packPhotos", "📸 ภาพก่อนปิดกล่อง", "หลักฐานตอนส่ง — เก็บไว้เผื่อเคลม"],
                      ["slips", "🧾 สลิปโอนเงิน", "หลักฐานการเงิน — ไม่แนะนำให้ลบ"],
                    ] as [keyof ImageCleanupConfig["targets"], string, string][]
                  ).map(([k, label, hint]) => (
                    <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-2.5">
                      <input
                        type="checkbox"
                        checked={cleanup.targets[k]}
                        onChange={(e) => setCleanup({ ...cleanup, targets: { ...cleanup.targets, [k]: e.target.checked } })}
                        className="mt-0.5 h-4 w-4 accent-amber-500"
                      />
                      <span className="text-xs leading-relaxed text-slate-700">
                        <strong className="block">{label}</strong>
                        <span className="text-slate-400">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <button
                  type="button"
                  disabled={dryBusy}
                  onClick={async () => {
                    setDryBusy(true);
                    setDryErr("");
                    setDryRun(null);
                    try {
                      const r = await fetch(`/api/admin/cleanup-preview?days=${cleanup.days}&closed=${cleanup.onlyClosed ? 1 : 0}`);
                      const j = await r.json();
                      if (!r.ok) setDryErr(j.error ?? "ลองดูไม่สำเร็จ");
                      else setDryRun(j);
                    } catch {
                      setDryErr("เชื่อมต่อไม่ได้");
                    }
                    setDryBusy(false);
                  }}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:opacity-40"
                >
                  {dryBusy ? "กำลังตรวจ…" : "🔍 ลองดูก่อน — ถ้ารันตอนนี้จะลบอะไรบ้าง"}
                </button>
                {dryErr && <p className="mt-2 text-xs font-bold text-rose-600">{dryErr}</p>}
                {dryRun && (
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-bold">
                      จะล้าง {dryRun.orders} ออเดอร์ · {dryRun.files} ไฟล์
                    </p>
                    {dryRun.list?.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
                        {dryRun.list.map((o) => (
                          <li key={o.id}>
                            {o.id} · {o.status} · {o.files} ไฟล์
                          </li>
                        ))}
                      </ul>
                    )}
                    {dryRun.orders === 0 && <p className="mt-1 text-slate-400">ยังไม่มีออเดอร์ไหนเข้าเงื่อนไข</p>}
                  </div>
                )}
                {cleanup.lastRunAt && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    รันล่าสุด {new Date(cleanup.lastRunAt).toLocaleString("th-TH")} · ลบไป {cleanup.lastDeleted ?? 0} ไฟล์
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ══════ Google & SEO ══════ */}
          {tab === "google" && (
            <section className={`mt-4 p-5 ${card}`}>
              <h2 className="text-sm font-semibold text-slate-800">🔍 เชื่อมกับ Google &amp; การค้นหา</h2>
              <p className={`mt-0.5 text-xs ${faint}`}>
                เอารหัสจากบริการของ Google มาวางที่นี่ · ช่องไหนเว้นว่าง = ไม่ใช้ตัวนั้น (เว็บไม่โหลดสคริปต์เกินจำเป็น)
              </p>

              {/* พร้อมใช้อยู่แล้ว ไม่ต้องตั้งค่า */}
              <div className="mt-4 rounded-xl bg-emerald-50/70 p-3 text-xs ring-1 ring-emerald-100">
                <p className="font-bold text-emerald-800">✅ พร้อมอยู่แล้ว ไม่ต้องทำอะไร</p>
                <ul className="mt-1.5 space-y-1 text-slate-600">
                  <li>
                    • <a className="font-semibold text-emerald-700 underline" href="/sitemap.xml" target="_blank" rel="noreferrer">/sitemap.xml</a>{" "}
                    — รายชื่อหน้าทั้งหมด (หน้าหลัก · หมวด · สินค้าทุกตัว · บทความ) สร้างสดจากฐานข้อมูล เพิ่มสินค้าใหม่ไม่ต้องมาแก้
                  </li>
                  <li>
                    • <a className="font-semibold text-emerald-700 underline" href="/robots.txt" target="_blank" rel="noreferrer">/robots.txt</a>{" "}
                    — บอกบอทว่าเก็บอะไรได้ · ปิดหลังบ้าน/ตะกร้า/ข้อมูลลูกค้าไว้แล้ว และชี้ไปที่ sitemap
                  </li>
                  <li>• ทุกหน้าสินค้ามี meta + FAQ + ข้อมูลโครงสร้าง (JSON-LD) ให้ Google/AI ดึงไปตอบอยู่แล้ว</li>
                </ul>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    Google Search Console — โค้ดยืนยันสิทธิ์
                  </span>
                  <input
                    value={seo.googleVerification ?? ""}
                    onChange={(e) => patchSeo({ googleVerification: e.target.value })}
                    className={inputCls}
                    placeholder="เช่น 4Ab1c…  (หรือวางทั้งแท็ก <meta …> ก็ได้)"
                  />
                  <span className="mt-1 block text-[11px] text-slate-400">
                    เอามาจาก Search Console → เพิ่มพร็อพเพอร์ตี้ → <b>แท็ก HTML</b> · วางแล้วกดบันทึก แล้วค่อยกดยืนยันฝั่ง Google
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Bing Webmaster — โค้ดยืนยัน (ถ้ามี)</span>
                  <input
                    value={seo.bingVerification ?? ""}
                    onChange={(e) => patchSeo({ bingVerification: e.target.value })}
                    className={inputCls}
                    placeholder="msvalidate.01"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Google Analytics 4 (GA4)</span>
                  <input
                    value={seo.ga4Id ?? ""}
                    onChange={(e) => patchSeo({ ga4Id: e.target.value })}
                    className={inputCls}
                    placeholder="G-XXXXXXXXXX"
                  />
                  <span className="mt-1 block text-[11px] text-slate-400">ใส่แล้วเว็บจะเก็บสถิติผู้เข้าชมให้อัตโนมัติ</span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Google Tag Manager (ถ้าใช้)</span>
                  <input
                    value={seo.gtmId ?? ""}
                    onChange={(e) => patchSeo({ gtmId: e.target.value })}
                    className={inputCls}
                    placeholder="GTM-XXXXXXX"
                  />
                  <span className="mt-1 block text-[11px] text-slate-400">
                    ใช้ GTM แล้วไม่ต้องใส่ GA4 ซ้ำ (ตั้ง GA4 ในตัว GTM แทน)
                  </span>
                </label>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl bg-rose-50/70 p-3 ring-1 ring-rose-100">
                <input
                  type="checkbox"
                  checked={!!seo.noindex}
                  onChange={(e) => patchSeo({ noindex: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-rose-500"
                />
                <span className="text-xs text-slate-700">
                  <b className="text-rose-700">ปิดไม่ให้ Google เก็บทั้งเว็บ</b> (ใช้ตอนเว็บยังไม่พร้อมเปิดจริง) —
                  ติ๊กแล้ว robots.txt จะห้ามทุกบอท และ sitemap จะว่าง{" "}
                  <b>อย่าลืมเอาติ๊กออกตอนเปิดร้านจริง</b> ไม่งั้นเว็บจะไม่ขึ้นในผลค้นหาเลย
                </span>
              </label>

              <div className="mt-4 rounded-xl bg-sky-50/70 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-sky-100">
                <p className="font-bold text-sky-800">📖 ขั้นตอนเชื่อม Search Console (ครั้งเดียวจบ)</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>
                    เปิด{" "}
                    <a className="font-semibold text-sky-700 underline" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">
                      Google Search Console
                    </a>{" "}
                    → เพิ่มพร็อพเพอร์ตี้แบบ <b>คำนำหน้า URL</b> ใส่ที่อยู่เว็บร้าน
                  </li>
                  <li>เลือกวิธียืนยัน <b>แท็ก HTML</b> → ก๊อปโค้ดมาวางในช่องด้านบน → กด <b>บันทึก</b> ที่หน้านี้</li>
                  <li>กลับไปกด <b>ยืนยัน</b> ใน Search Console</li>
                  <li>
                    เมนู <b>Sitemaps</b> → ใส่ <b>sitemap.xml</b> → ส่ง (ทำครั้งเดียว Google จะมาดึงเองเรื่อย ๆ)
                  </li>
                </ol>
              </div>
            </section>
          )}

          {tab === "roles" &&
            (() => {
              const EMOJI: Record<string, string> = { [DEPT_ADMIN]: "🧑‍💼", [DEPT_PACKING]: "📦", [DEPT_CONTENT]: "🖋️" };
              const BUILTIN = [DEPT_ADMIN, DEPT_PACKING, DEPT_CONTENT];
              const depts = rolesMap ? Object.keys(rolesMap) : [];
              return (
                <section className={`mt-5 p-5 ${card} sm:p-6`}>
                  <h2 className="text-sm font-semibold text-slate-800">👥 บทบาทการทำงาน — แต่ละตำแหน่งทำอะไรได้บ้าง</h2>
                  <p className={`mt-1 text-xs ${faint}`}>
                    {rolesEditable
                      ? "ติ๊กเลือกสิทธิ์ของแต่ละบทบาทได้เลย แล้วกด “บันทึกบทบาท” — มีผลกับทุกคนในแผนกนั้นทันทีที่โหลดหน้าใหม่/ล็อกอินครั้งถัดไป"
                      : "ดูได้อย่างเดียว — แก้ชุดสิทธิ์ได้เฉพาะผู้ดูแลระบบ"}{" "}
                    · ผู้ดูแลระบบได้ทุกสิทธิ์เสมอ (แก้ไม่ได้ กันล็อกตัวเองออกจากระบบ)
                  </p>

                  {!rolesMap ? (
                    <p className="py-10 text-center text-sm text-slate-400">กำลังโหลดชุดสิทธิ์…</p>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left">
                              <th className="py-2 pr-3 font-semibold text-slate-500">สิทธิ์</th>
                              <th className="w-24 px-2 py-2 text-center font-semibold text-slate-700">
                                <span className="block text-lg">👑</span>
                                <span className="block text-[11px] leading-tight">ผู้ดูแลระบบ</span>
                              </th>
                              {depts.map((d) => (
                                <th key={d} className="w-24 px-2 py-2 text-center font-semibold text-slate-700">
                                  <span className="block text-lg">{EMOJI[d] ?? "🏢"}</span>
                                  <span className="block text-[11px] leading-tight">พนักงาน · {d}</span>
                                  {rolesEditable && !BUILTIN.includes(d) && (
                                    <button
                                      type="button"
                                      onClick={() => removeRole(d)}
                                      className="mt-0.5 text-[10px] font-medium text-rose-500 hover:underline"
                                    >
                                      ลบบทบาท
                                    </button>
                                  )}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {PERM_INFO.map((g) => (
                              <Fragment key={g.group}>
                                <tr>
                                  <td colSpan={depts.length + 2} className="pb-1 pt-4 text-xs font-bold text-slate-500">
                                    {g.group}
                                  </td>
                                </tr>
                                {g.perms.map((p) => (
                                  <tr key={p.perm} className="border-b border-slate-100">
                                    <td className="py-2 pr-3 text-[13px] leading-snug text-slate-700">{p.label}</td>
                                    <td className="px-2 py-2 text-center">
                                      <span className="font-bold text-emerald-600">✓</span>
                                    </td>
                                    {depts.map((d) => (
                                      <td key={d} className="px-2 py-2 text-center">
                                        {rolesEditable ? (
                                          <input
                                            type="checkbox"
                                            checked={(rolesMap[d] ?? []).includes(p.perm)}
                                            onChange={() => togglePerm(d, p.perm)}
                                            className="h-4 w-4 cursor-pointer accent-emerald-600"
                                            aria-label={`${d}: ${p.label}`}
                                          />
                                        ) : (rolesMap[d] ?? []).includes(p.perm) ? (
                                          <span className="font-bold text-emerald-600">✓</span>
                                        ) : (
                                          <span className="text-slate-300">—</span>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {rolesEditable && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                          <input
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRole())}
                            className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                            placeholder="ชื่อบทบาทใหม่ เช่น การตลาด"
                            maxLength={30}
                          />
                          <button
                            type="button"
                            onClick={addRole}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                          >
                            ＋ เพิ่มบทบาท
                          </button>
                          <button
                            type="button"
                            onClick={saveRoles}
                            disabled={!rolesDirty || rolesSaving}
                            className={`ml-auto rounded-lg px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40 ${
                              rolesSaved ? "bg-emerald-600" : "bg-amber-500 hover:bg-amber-600"
                            }`}
                          >
                            {rolesSaving ? "กำลังบันทึก…" : rolesSaved ? "✓ บันทึกแล้ว" : "💾 บันทึกบทบาท"}
                          </button>
                          {rolesErr && <p className="w-full text-xs font-medium text-rose-600">{rolesErr}</p>}
                          <p className={`w-full text-[11px] ${faint}`}>
                            บทบาทใหม่จะไปโผล่ในตัวเลือกแผนกที่หน้า 👥 พนักงาน · ถ้าติ๊กสิทธิ์ใดไว้ ระบบจะเติม “เข้าหลังบ้านได้”
                            ให้อัตโนมัติ · ชื่อบทบาทต้องตรงกับช่อง department ของพนักงาน
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  <p className={`mt-4 text-xs ${faint}`}>
                    💡 การซ่อนเมนู/ปุ่มในหน้าจอเป็นแค่ความสะดวก — สิทธิ์จริงถูกบังคับที่เซิร์ฟเวอร์ทุกครั้ง
                  </p>
                </section>
              );
            })()}

          {error && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={`text-xs ${faint}`}>บันทึกครั้งเดียวมีผลทุกแท็บ</p>
            <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} ${saved ? "!bg-emerald-600" : ""}`}>
              {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
            </button>
          </div>

          <p className={`mt-6 text-center text-xs ${faint}`}>
            ดูผลฝั่งลูกค้าได้ที่หน้า{" "}
            <Link href="/cart" className="font-semibold text-amber-600 hover:underline">
              ตะกร้าสินค้า
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

/** กันคนที่ไม่มีสิทธิ์พิมพ์ URL เข้าตรง ๆ */
export default function AdminSettingsPage() {
  return (
    <RequirePerm perm="settings.manage">
      <AdminSettingsPageInner />
    </RequirePerm>
  );
}
