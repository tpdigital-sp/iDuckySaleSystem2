"use client";

import RequirePerm from "@/components/RequirePerm";
import { useIsAdministrator } from "@/lib/perm-context";

import { Fragment, useEffect, useState } from "react";
import { fetchProduct } from "@/lib/product-repo";
import Link from "next/link";
import {
  DEFAULT_SHIPPING,
  fetchShopPayment,
  freeShippingMinOf,
  giftPromosOf,
  boxFeesOf,
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
  giftNeedsArtwork,
  type GiftPromo,
  type GiftSize,
  type GiftRequire,
  type BoxFee,
  type ShopInfo,
  type SeoConfig,
} from "@/lib/shop-settings";
import { DEFAULT_TIERS, type Tier } from "@/lib/tiers";
import { fetchCategories, DEFAULT_CATEGORIES, type ShopCategory } from "@/lib/categories";
import {
  DEPT_ADMIN,
  DEPT_CONTENT,
  DEPT_GRAPHIC,
  DEPT_PACKING,
  PERM_INFO,
  ROLE_ADMINISTRATOR,
  type Perm,
  type RolePermsMap,
} from "@/lib/permissions";
import { btnPrimary, card, faint, muted } from "@/lib/admin-ui";
import { PageHead, PageShell } from "@/components/admin/ui";

/** โลโก้/สีประจำธนาคาร — จับจากชื่อที่พิมพ์อิสระ (พิมพ์ "กสิกร" ก็ขึ้นโลโก้เขียว K ให้เอง)
 *  ใช้ตัวย่อ+สีแบรนด์แทนไฟล์ภาพ: ไม่ต้องเก็บ asset, จับได้ทั้งชื่อไทย/อังกฤษ/พิมพ์ย่อ */
const BANK_BRANDS: { match: RegExp; abbr: string; color: string; fg?: string; full: string; logo?: string }[] = [
  { match: /กสิกร|kbank|kasikorn/i, abbr: "K", color: "#00A950", full: "กสิกรไทย", logo: "/banks/kbank.png" },
  { match: /ไทยพาณิชย์|scb/i, abbr: "SCB", color: "#4E2A84", full: "ไทยพาณิชย์" },
  { match: /กรุงเทพ|bangkok|bbl/i, abbr: "BBL", color: "#1E4598", full: "กรุงเทพ" },
  { match: /กรุงไทย|krungthai|ktb/i, abbr: "KTB", color: "#00A4E4", full: "กรุงไทย" },
  { match: /กรุงศรี|krungsri|bay|อยุธยา/i, abbr: "BAY", color: "#FFC800", fg: "#5A4500", full: "กรุงศรีอยุธยา" },
  { match: /ทหารไทย|ธนชาต|ttb|tmb/i, abbr: "ttb", color: "#0050F0", full: "ทีทีบีธนชาต" },
  { match: /ออมสิน|gsb/i, abbr: "GSB", color: "#EB198D", full: "ออมสิน" },
  { match: /เกษตร|ธกส|ธ\.ก\.ส|baac/i, abbr: "ธกส", color: "#009645", full: "ธ.ก.ส." },
  { match: /อาคารสงเคราะห์|ธอส|ghb/i, abbr: "ธอส", color: "#F57C00", full: "อาคารสงเคราะห์" },
  { match: /ยูโอบี|uob/i, abbr: "UOB", color: "#0B3979", full: "ยูโอบี" },
  { match: /ซีไอเอ็มบี|cimb/i, abbr: "CIMB", color: "#C8102E", full: "ซีไอเอ็มบี ไทย" },
  { match: /เกียรตินาคิน|kkp/i, abbr: "KKP", color: "#1B3F94", full: "เกียรตินาคินภัทร" },
  { match: /แลนด์|lh bank|lhb/i, abbr: "LH", color: "#6CB33F", full: "แลนด์ แอนด์ เฮ้าส์" },
];
function bankBrand(name: string): { abbr: string; color: string; fg?: string; full: string; logo?: string } {
  const hit = BANK_BRANDS.find((b) => b.match.test(name || ""));
  return hit ?? { abbr: "🏦", color: "#94A3B8", fg: "#fff", full: "" };
}
/** ป้ายโลโก้ธนาคาร (สี่เหลี่ยมมน สีแบรนด์ + ตัวย่อ) — ใช้ซ้ำทั้งการ์ดบัญชีและที่อื่น */
function BankLogo({ name, size = 44 }: { name: string; size?: number }) {
  const b = bankBrand(name);
  // มีไฟล์โลโก้จริง (เช่น กสิกร) → ใช้ภาพบนพื้นขาว · ธนาคารอื่นใช้ป้ายสีแบรนด์+ตัวย่อ
  if (b.logo) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200"
        style={{ width: size, height: size }}
        title={b.full || undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- โลโก้ svg ขนาดจิ๋ว ไม่ต้องผ่าน next/image */}
        <img src={b.logo} alt={`โลโก้ธนาคาร${b.full}`} className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size, height: size, background: b.color, color: b.fg ?? "#fff",
        fontSize: b.abbr.length <= 1 ? size * 0.5 : b.abbr.length <= 3 ? size * 0.32 : size * 0.26,
      }}
      title={b.full || undefined}
    >
      {b.abbr}
    </div>
  );
}

/** ไอคอนหมวดหมู่ให้เลือก — จัดกลุ่มตามชนิดงานของร้าน (พิมพ์อีโมจิอื่นเองก็ได้) */
const CAT_ICONS: { group: string; items: string[] }[] = [
  { group: "อะคริลิค · สแตนดี้", items: ["🔑", "🪟", "🧍", "💡", "🪞", "🧲", "🏷️", "📛", "🪪"] },
  { group: "กระดาษ · การ์ด · ป้าย", items: ["🎴", "🗂️", "📇", "📄", "📋", "📣", "🖼️", "📅", "📓", "✉️"] },
  { group: "ผ้า · ของใช้", items: ["👕", "🧢", "👜", "🎒", "🧶", "🛏️", "🧸", "🧦", "🩳", "☂️"] },
  { group: "บ้าน · แก้ว · แก็ดเจ็ต", items: ["🏠", "☕", "🥤", "🍶", "🖱️", "📱", "⌚", "🎧", "🔌", "💻"] },
  { group: "ของขวัญ · ตกแต่ง", items: ["🎁", "🎀", "🎈", "✨", "🌸", "⭐", "❤️", "🐶", "🐱", "🎨"] },
];

/** อัปโหลดรูปหมวดขึ้นคลัง (ใช้ทั้งปุ่มเลือกไฟล์และลากวาง) */
async function uploadCatImage(file: File, folder = "categories"): Promise<{ url?: string; error?: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("productId", folder);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const j = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !j.url) return { error: j.error ?? "อัปโหลดไม่สำเร็จ" };
    return { url: j.url };
  } catch {
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

/** รูปหมวด: thumbnail + ปุ่มอัปโหลด + รับลากรูปมาวาง */
function CatImage({ value, onChange, folder }: { value?: string; onChange: (v: string | undefined) => void; folder?: string }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  async function up(f: File) {
    if (!f.type.startsWith("image/")) return;
    setBusy(true);
    const r = await uploadCatImage(f, folder);
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

/** ค้นหาสินค้าเพื่อเพิ่มเข้าโปรของแถม (พิมพ์ชื่อ → กดเลือก) */
function ProductPicker({
  list,
  exclude,
  onPick,
  inputCls,
}: {
  list: { id: string; name: string; category: string }[];
  exclude: string[];
  onPick: (id: string) => void;
  inputCls: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const hits = term
    ? list.filter((p) => !exclude.includes(p.id) && (p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term))).slice(0, 8)
    : [];
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="พิมพ์ชื่อสินค้าเพื่อค้นหา…"
        className={`${inputCls} text-xs`}
      />
      {hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPick(p.id);
                setQ("");
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition hover:bg-amber-50"
            >
              <span className="truncate font-medium text-slate-700">{p.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{p.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 🎁 ผูกของแถมเข้ากับ "สินค้าจริง" ในร้าน (เช่น กระดาษรองหลัง) แล้วดึงขนาด/รูปจากสินค้าตัวนั้นมาใช้เลย
 * — ไม่ต้องพิมพ์ขนาดเองทีละอัน และรูปตรงกับหน้าสินค้าจริงเสมอ
 */
function GiftFromProduct({
  productId,
  list,
  onPick,
  onSizes,
  inputCls,
}: {
  productId?: string;
  list: { id: string; name: string; category: string }[];
  onPick: (id: string | undefined) => void;
  onSizes: (sizes: GiftSize[], groupLabel: string) => void;
  inputCls: string;
}) {
  const [groups, setGroups] = useState<{ label: string; sizes: GiftSize[] }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const prod = list.find((p) => p.id === productId);

  async function load() {
    if (!productId) return;
    setBusy(true);
    setErr("");
    setGroups(null);
    try {
      const p = await fetchProduct(productId);
      // กลุ่มที่พอเป็น "ขนาด" ได้ = มีตัวเลือกตั้งแต่ 2 ตัวขึ้นไป และมีรูป/จำนวนต่อแผ่นให้ดึง
      const gs = (p?.options ?? [])
        .filter((o) => (o.choices ?? []).length >= 2)
        .map((o) => ({
          label: o.label,
          // เอาเฉพาะตัวเลือกที่เป็น "ขนาดจริง" — ตัวที่ไม่มีทั้งรูปและจำนวนต่อแผ่น (เช่น 📐 กำหนดขนาดเอง) ไม่ต้องดึงมา
          sizes: (o.choices ?? [])
            .map((c) => ({
              label: c.name,
              image: c.imageSrc,
              perSheet: c.piecesPerUnit ?? c.perUnit ?? undefined,
              note: c.badge,
            }))
            .filter((x) => x.image || (x.perSheet ?? 0) > 0),
        }))
        .filter((g) => g.sizes.some((x) => x.image || x.perSheet));
      if (gs.length === 0) setErr("สินค้าตัวนี้ไม่มีกลุ่มตัวเลือกที่ดึงเป็นขนาดได้");
      setGroups(gs);
    } catch {
      setErr("ดึงข้อมูลสินค้าไม่สำเร็จ");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-semibold text-slate-700">🎁 ของแถมนี้คือสินค้าตัวไหนในร้าน</span>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        เลือกสินค้าจริง (เช่น <strong className="text-slate-500">กระดาษรองหลัง</strong>) แล้วกด &quot;ดึงขนาดจากสินค้านี้&quot;
        — ระบบจะเอาชื่อขนาด · รูป · จำนวนใบต่อแผ่น A3 จากหน้าสินค้ามาใส่ให้เลย (แก้เพิ่มทีหลังได้)
      </p>

      {prod || productId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-amber-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            {prod?.name || productId}
            <button
              type="button"
              onClick={() => {
                onPick(undefined);
                setGroups(null);
              }}
              className="rounded-full px-1 text-amber-400 transition hover:bg-white hover:text-rose-500"
            >
              ✕
            </button>
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:opacity-40"
          >
            {busy ? "กำลังดึง…" : "📐 ดึงขนาดจากสินค้านี้"}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <ProductPicker list={list} exclude={[]} onPick={(id) => onPick(id)} inputCls={inputCls} />
        </div>
      )}

      {err && <p className="mt-2 text-[11px] font-medium text-rose-500">{err}</p>}

      {groups && groups.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <span className="text-[11px] font-semibold text-slate-600">เลือกกลุ่มตัวเลือกที่จะใช้เป็นขนาดของแถม</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button
                key={g.label}
                type="button"
                onClick={() => {
                  onSizes(g.sizes, g.label);
                  setGroups(null);
                }}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-300"
              >
                {g.label} <span className="text-[10px] text-slate-400">({g.sizes.length} ตัวเลือก)</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 📐 ขนาด/แบบของแถมที่ให้ลูกค้าเลือกเองในตะกร้า (เช่น "9 × 9 cm")
 * แต่ละขนาดใส่ได้: รูปตัวอย่าง · ชื่อ · ได้กี่ใบต่อแผ่น A3 · คำอธิบายสั้น ๆ
 * ตัวแรกในลิสต์ = ค่าเริ่มต้นที่ระบบเลือกให้ (ลูกค้าเปลี่ยนเองได้)
 */
function GiftSizes({
  sizes,
  label,
  onChange,
  onLabel,
  inputCls,
}: {
  sizes: GiftSize[];
  label?: string;
  onChange: (v: GiftSize[]) => void;
  onLabel: (v: string) => void;
  inputCls: string;
}) {
  const patch = (k: number, v: Partial<GiftSize>) => onChange(sizes.map((x, j) => (j === k ? { ...x, ...v } : x)));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">📐 ขนาด/แบบที่ให้ลูกค้าเลือก</span>
        <input
          value={label ?? ""}
          onChange={(e) => onLabel(e.target.value)}
          placeholder='ชื่อกลุ่ม (ไม่ใส่ = "ขนาด")'
          className={`${inputCls} h-8 w-44 px-2 py-1 text-[11px]`}
        />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        ไม่ใส่เลย = ของแถมไม่มีให้เลือก · ใส่ตัวเดียว = ขนาดตายตัว · ใส่ตั้งแต่ 2 ตัว = ลูกค้าเลือกเองในตะกร้า
        (⭐ ตัวแรกคือค่าเริ่มต้น) — ขนาดที่เลือกจะขึ้นบนใบงานฝ่ายแพ็ค ·{" "}
        <strong className="text-slate-500">&quot;ได้กี่ใบ/แผ่น A3&quot;</strong> ใช้คิดว่าเศษที่เหลือถึงครึ่งแผ่นไหม
      </p>

      <div className="mt-3 space-y-2">
        {sizes.map((sz, k) => (
          <div key={k} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <CatImage value={sz.image} onChange={(v) => patch(k, { image: v })} folder="gifts" />
            <input
              value={sz.label}
              onChange={(e) => patch(k, { label: e.target.value })}
              placeholder="ขนาด เช่น 9 × 9 cm"
              className={`${inputCls} h-9 w-40 py-1 text-xs font-semibold`}
            />
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              ได้
              <input
                type="number"
                min={0}
                value={sz.perSheet ?? 0}
                onChange={(e) => patch(k, { perSheet: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className={`${inputCls} h-9 w-16 py-1 text-right text-xs tabular-nums`}
              />
              ใบ / แผ่น A3
            </label>
            <input
              value={sz.note ?? ""}
              onChange={(e) => patch(k, { note: e.target.value })}
              placeholder="คำอธิบาย เช่น ได้ 15 ใบ + ไดคัท พร้อมซองใส"
              className={`${inputCls} h-9 min-w-[10rem] flex-1 py-1 text-xs`}
            />
            {k === 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700" title="ค่าเริ่มต้น">
                ⭐ ค่าเริ่มต้น
              </span>
            ) : (
              <button
                type="button"
                title="ตั้งเป็นค่าเริ่มต้น"
                onClick={() => onChange([sz, ...sizes.filter((_, j) => j !== k)])}
                className="rounded-full px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
              >
                ⭐ ตั้งเป็นค่าเริ่มต้น
              </button>
            )}
            <button
              type="button"
              title="ลบขนาดนี้"
              onClick={() => onChange(sizes.filter((_, j) => j !== k))}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...sizes, { label: "" }])}
        className="mt-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
      >
        + เพิ่มขนาด
      </button>
    </div>
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

type Tab = "shop" | "pay" | "ship" | "tier" | "welcome" | "gift" | "box" | "roles" | "files" | "cats" | "google";

const TAB_KEYS: Tab[] = ["shop", "pay", "ship", "tier", "welcome", "gift", "box", "roles", "files", "cats", "google"];

/** เมนูหัวข้อตั้งค่า — ไอคอน + ชื่อ + คำอธิบายย่อย (โชว์ในแถบข้างจอกว้าง) */
const TAB_META: { key: Tab; emoji: string; label: string; hint: string }[] = [
  { key: "shop", emoji: "🏪", label: "ข้อมูลร้าน", hint: "ชื่อ · ที่อยู่ · ใบเสร็จ" },
  { key: "pay", emoji: "🏦", label: "ชำระเงิน", hint: "บัญชีธนาคาร · พร้อมเพย์" },
  { key: "ship", emoji: "🚚", label: "การจัดส่ง", hint: "ค่าส่ง · โปรส่งฟรี" },
  { key: "tier", emoji: "🏅", label: "ระดับสมาชิก", hint: "ส่วนลดตามยอดสะสม" },
  { key: "welcome", emoji: "🎁", label: "คูปองต้อนรับ", hint: "แจกสมาชิกใหม่อัตโนมัติ" },
  { key: "gift", emoji: "🎀", label: "ของแถมฟรี", hint: "สั่งครบตามจำนวน แถมฟรี" },
  { key: "box", emoji: "📦", label: "ค่ากล่องอัตโนมัติ", hint: "โปสเตอร์/A3 บวกค่ากล่อง" },
  { key: "roles", emoji: "👥", label: "บทบาท", hint: "สิทธิ์แต่ละตำแหน่ง" },
  { key: "cats", emoji: "🗂", label: "หมวดหมู่สินค้า", hint: "หมวดบนหน้าร้าน" },
  { key: "files", emoji: "🧹", label: "ล้างรูปเก่า", hint: "คืนพื้นที่เก็บไฟล์" },
  { key: "google", emoji: "🔍", label: "Google & SEO", hint: "Search Console · GA4" },
];

/** แท็บอ่อนไหว — พนักงานมองไม่เห็นทั้งปุ่มและเนื้อหา เห็นเฉพาะ Administrator (2026-08-14)
 *  ฝั่งเซิร์ฟเวอร์กันซ้ำอยู่แล้ว: shop-settings คงค่าบัญชี/SEO เดิมเมื่อคนบันทึกไม่ใช่แอดมิน
 *  และ role-perms PUT รับเฉพาะแอดมิน */
const ADMIN_ONLY_TABS: Tab[] = ["pay", "roles", "google"];

function AdminSettingsPageInner() {
  /** ผู้ดูแลระบบเท่านั้นที่แก้บัญชีร้าน/บทบาท และเห็นแท็บเชื่อม Google */
  const isAdmin = useIsAdministrator();
  // แอดมินเปิดมาเจอแท็บชำระเงิน (ของเดิม) · พนักงานเริ่มที่ข้อมูลร้านแทน (แท็บ pay ถูกซ่อน)
  const [tab, setTab] = useState<Tab>(isAdmin ? "pay" : "shop");
  // เปิดแท็บตามลิงก์ได้ เช่น /admin/settings?tab=cats (ใช้จากผังหน้าแรกในเมนูหน้าร้าน)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TAB_KEYS.includes(t) && (isAdmin || !ADMIN_ONLY_TABS.includes(t))) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อ่านครั้งเดียวตอน mount
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

  // ── 🎀 ของแถมฟรีตามจำนวนชิ้น ──
  const [gifts, setGifts] = useState<GiftPromo[]>([]);
  /** รายชื่อสินค้าย่อ — ไว้ค้นหาเพิ่มสินค้าเฉพาะตัวเข้าโปร (เช่น Griptok ที่อยู่ปนหมวดเคสมือถือ) */
  const [prodList, setProdList] = useState<{ id: string; name: string; category: string }[]>([]);
  const patchGift = (i: number, patch: Partial<GiftPromo>) => {
    setGifts((cur) => cur.map((g, k) => (k === i ? { ...g, ...patch } : g)));
    touch();
  };
  const addGift = () => {
    setGifts((cur) => [
      ...cur,
      { id: newId("g"), name: "", minQty: 30, step: 30, giveQty: 1, active: true, categories: [], productIds: [] },
    ]);
    touch();
  };
  const removeGift = (i: number) => {
    setGifts((cur) => cur.filter((_, k) => k !== i));
    touch();
  };

  // ── 📦 ค่ากล่อง/ค่าแพ็คอัตโนมัติ (เช่น งานโปสเตอร์/ขนาด A3 +30) ──
  const [boxFees, setBoxFees] = useState<BoxFee[]>([]);
  const patchBox = (i: number, patch: Partial<BoxFee>) => {
    setBoxFees((cur) => cur.map((f, k) => (k === i ? { ...f, ...patch } : f)));
    touch();
  };
  const addBox = () => {
    setBoxFees((cur) => [
      ...cur,
      { id: newId("bx"), name: "ค่ากล่องกันกระแทก", amount: 30, keywords: ["A3"], optionGroups: [], categories: [], productIds: [], active: true },
    ]);
    touch();
  };
  const removeBox = (i: number) => {
    setBoxFees((cur) => cur.filter((_, k) => k !== i));
    touch();
  };

  // ── หมวดหมู่สินค้า ──
  const [cats, setCats] = useState<ShopCategory[]>(DEFAULT_CATEGORIES);
  const [catCounts, setCatCounts] = useState<Record<string, number>>({});
  /** มีแก้หมวดหมู่ค้างอยู่ — ปุ่ม "บันทึก" รวมข้างล่างจะบันทึกให้ (กันเซฟทับฐานด้วยค่าตั้งต้นตอนยังโหลดไม่เสร็จ) */
  const [catsDirty, setCatsDirty] = useState(false);
  useEffect(() => {
    fetchCategories({ fresh: true }).then(setCats);
    // นับสินค้าต่อหมวด — กันลบหมวดที่ยังมีสินค้าอยู่
    fetch("/api/admin/products-lite", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { list?: { id: string; name?: string; category?: string }[] }) => {
        const map: Record<string, number> = {};
        for (const p of j.list ?? []) if (p.category) map[p.category] = (map[p.category] ?? 0) + 1;
        setCatCounts(map);
        // ใช้ซ้ำในแท็บของแถม (ค้นหาสินค้าเฉพาะตัว)
        setProdList((j.list ?? []).map((p) => ({ id: p.id, name: p.name ?? "", category: p.category ?? "" })));
      })
      .catch(() => {});
  }, []);
  const patchCat = (i: number, patch: Partial<ShopCategory>) => {
    setCats((cur) => cur.map((c, k) => (k === i ? { ...c, ...patch } : c)));
    setCatsDirty(true);
  };
  const moveCat = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    setCats((cur) => {
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setCatsDirty(true);
  };
  /** บันทึกหมวดหมู่ (เรียกจากปุ่ม "บันทึก" รวม) — คืนข้อความ error หรือ null เมื่อสำเร็จ */
  async function saveCats(): Promise<string | null> {
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: cats }),
      });
      const j = (await res.json()) as { error?: string; list?: ShopCategory[] };
      if (!res.ok) return j.error ?? "บันทึกไม่สำเร็จ";
      // sync state จากชุดที่เซิร์ฟเวอร์บันทึกจริง — กัน state/DB เหลื่อมกันหลังเซฟ
      if (Array.isArray(j.list)) setCats(j.list);
      setCatsDirty(false);
      return null;
    } catch {
      return "เชื่อมต่อไม่ได้";
    }
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
  };
  /** บันทึกบทบาท (เรียกจากปุ่ม "บันทึก" รวม เมื่อมีแก้ค้าง) — คืนข้อความ error หรือ null เมื่อสำเร็จ */
  async function saveRoles(): Promise<string | null> {
    if (!rolesMap) return null;
    setRolesErr("");
    try {
      const res = await fetch("/api/admin/role-perms", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roles: rolesMap }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return (j as { error?: string }).error ?? "บันทึกไม่สำเร็จ";
      const roles = (j as { roles?: RolePermsMap }).roles;
      if (roles) setRolesMap(roles); // เซิร์ฟเวอร์อาจเติม admin.access ให้อัตโนมัติ
      setRolesDirty(false);
      return null;
    } catch {
      return "เชื่อมต่อไม่ได้";
    }
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
      setGifts(giftPromosOf(p));
      setBoxFees(boxFeesOf(p));
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
      boxFees: boxFees
        .map((f) => ({
          ...f,
          name: f.name.trim(),
          note: f.note?.trim() || undefined,
          amount: Math.max(0, Math.round(Number(f.amount) || 0)),
          perQty: Math.max(0, Math.floor(Number(f.perQty) || 0)) || undefined,
          categories: (f.categories ?? []).filter(Boolean),
          productIds: (f.productIds ?? []).filter(Boolean),
          excludeIds: (f.excludeIds ?? []).filter(Boolean),
          optionGroups: (f.optionGroups ?? []).map((g) => g.trim()).filter(Boolean),
          keywords: (f.keywords ?? []).map((k) => k.trim()).filter(Boolean),
        }))
        .filter((f) => f.name && f.amount > 0),
      gifts: gifts
        .map((g) => ({
          ...g,
          name: g.name.trim(),
          note: g.note?.trim() || undefined,
          image: g.image?.trim() || undefined,
          value: Math.max(0, Number(g.value) || 0) || undefined,
          minQty: Math.max(1, Math.floor(Number(g.minQty) || 1)),
          step: Math.max(0, Math.floor(Number(g.step) || 0)) || undefined,
          giveQty: Math.max(1, Math.floor(Number(g.giveQty) || 1)),
          maxQty: Math.max(0, Math.floor(Number(g.maxQty) || 0)) || undefined,
          categories: (g.categories ?? []).filter(Boolean),
          productIds: (g.productIds ?? []).filter(Boolean),
          sizes: (g.sizes ?? [])
            .map((x) => ({
              label: x.label.trim(),
              image: x.image?.trim() || undefined,
              perSheet: Math.max(0, Math.floor(Number(x.perSheet) || 0)) || undefined,
              note: x.note?.trim() || undefined,
            }))
            .filter((x) => x.label),
          sizeLabel: g.sizeLabel?.trim() || undefined,
          giftProductId: g.giftProductId?.trim() || undefined,
          condition: g.condition?.trim() || undefined,
          needArtwork: typeof g.needArtwork === "boolean" ? g.needArtwork : undefined,
          requires: (g.requires ?? [])
            .map((r) => ({
              label: r.label?.trim() || undefined,
              contains: r.contains?.trim() || undefined,
              minCm: Math.max(0, Number(r.minCm) || 0) || undefined,
              cmMode: r.cmMode === "max" ? ("max" as const) : ("min" as const),
              whenMissing: r.whenMissing === "fail" ? ("fail" as const) : ("pass" as const),
            }))
            .filter((r) => r.contains || r.minCm),
          partial: g.partial?.name?.trim()
            ? {
                name: g.partial.name.trim(),
                image: g.partial.image?.trim() || undefined,
                minFill: Math.min(1, Math.max(0.01, Number(g.partial.minFill) || 0.5)),
              }
            : undefined,
          from: g.from?.trim() || undefined,
          to: g.to?.trim() || undefined,
        }))
        .filter((g) => g.name),
      welcomeCoupon: {
        enabled: welcome.enabled,
        type: welcome.type,
        value: Number(welcome.value) || 0,
        minSpend: Number(welcome.minSpend) || 0,
        maxDiscount: welcome.type === "percent" ? Number(welcome.maxDiscount) || 0 : 0,
        expiryDays: Number(welcome.expiryDays) || 0,
      },
    };
    // ปุ่มเดียวบันทึกทุกส่วน — หมวดหมู่/บทบาทเก็บคนละที่ (API แยก) จึงยิงเมื่อมีแก้ค้างเท่านั้น
    const errs: string[] = [];
    const res = await persistShopPayment(payload);
    if (!res.ok) errs.push(`บันทึกไม่สำเร็จ: ${res.error ?? "เกิดข้อผิดพลาด"}`);
    if (catsDirty) {
      const e = await saveCats();
      if (e) {
        errs.push(`หมวดหมู่สินค้า: ${e}`);
        setTab("cats");
      }
    }
    if (rolesDirty && rolesEditable) {
      const e = await saveRoles();
      if (e) {
        errs.push(`บทบาท: ${e}`);
        setTab("roles");
      }
    }
    setSaving(false);
    if (errs.length) {
      setError(errs.join(" · "));
    } else {
      setShipping(cleanShipping);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
  // ช่องกรอกขนาดใหญ่ (ใช้ในแท็บคูปองต้อนรับ ให้โปร่ง อ่านง่าย)
  const bigInput =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  return (
    <PageShell>
      <PageHead
        group="ระบบ"
        title="ตั้งค่าระบบ"
        sub="ข้อมูลร้าน · ช่องทางรับเงิน · การจัดส่ง · สิทธิ์ทีมงาน — ตั้งครบจากที่เดียว · แก้แล้วมีผลกับหน้าร้านทันที"
      />

      <div className="mt-4 items-start gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* เมนูหัวข้อ — จอกว้างเป็นแถบข้าง sticky · จอเล็กเป็นชิปเลื่อนซ้ายขวา */}
        <aside className="max-lg:-mx-4 max-lg:px-4 lg:sticky lg:top-6">
          <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-2xl lg:border lg:border-slate-200/70 lg:bg-white lg:p-2 lg:shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {TAB_META.filter((t) => isAdmin || !ADMIN_ONLY_TABS.includes(t.key)).map((t) => {
              const active = tab === t.key;
              // 🔒 = เฉพาะผู้ดูแลระบบ · 👁 = ตำแหน่งนี้ดูได้อย่างเดียว
              const locked = t.key === "google" || ((t.key === "pay" || t.key === "roles") && isAdmin);
              const viewOnly = (t.key === "pay" || t.key === "roles") && !isAdmin;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-pressed={active}
                  className={`flex shrink-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition lg:w-full ${
                    active
                      ? "bg-amber-500 text-white shadow-[0_4px_12px_rgba(44,129,196,0.25)]"
                      : "text-slate-600 hover:bg-amber-50 hover:text-slate-900 max-lg:border max-lg:border-slate-200 max-lg:bg-white"
                  }`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${active ? "bg-white/20" : "bg-slate-100/80"}`}>
                    {t.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap leading-tight">
                      {t.label}
                      {locked && <span className="ml-1 align-middle text-[10px]" title="เฉพาะผู้ดูแลระบบ (Administrator)">🔒</span>}
                      {viewOnly && <span className="ml-1 align-middle text-[10px]" title="ตำแหน่งของคุณดูได้อย่างเดียว — แก้ได้เฉพาะผู้ดูแลระบบ">👁</span>}
                    </span>
                    <span className={`hidden text-[11px] font-normal leading-tight lg:block ${active ? "text-white/75" : "text-slate-400"}`}>
                      {t.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 max-lg:mt-4">
      {loading ? (
        <div className={`p-8 text-center text-sm ${muted} ${card}`}>กำลังโหลด…</div>
      ) : (
        <>
          {/* ══════ ข้อมูลร้าน ══════ */}
          {tab === "shop" && (
            <section className={`p-5 ${card}`}>
              <h2 className="font-display text-[15px] font-semibold text-slate-800">🏪 ข้อมูลร้าน</h2>
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
            <fieldset disabled={!isAdmin} className={`space-y-4 ${!isAdmin ? "opacity-95" : ""}`}>
              {!isAdmin && (
                <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                  👁 ตำแหน่งของคุณ<b className="mx-1">ดูได้อย่างเดียว</b>— บัญชีรับเงินของร้านแก้ได้เฉพาะผู้ดูแลระบบ
                  (กันเลขบัญชีถูกเปลี่ยนโดยไม่ตั้งใจ)
                </p>
              )}
              <section className={`p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[15px] font-semibold text-slate-800">🏦 บัญชีธนาคาร ({banks.length})</h2>
                  <button
                    type="button"
                    onClick={addBank}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                  >
                    ＋ เพิ่มบัญชี
                  </button>
                </div>

                {/* รายชื่อธนาคารยอดนิยม — พิมพ์ไม่กี่ตัวอักษรแล้วเลือกได้เลย (โลโก้/สีจับอัตโนมัติ) */}
                <datalist id="thai-bank-list">
                  {BANK_BRANDS.map((b) => (
                    <option key={b.abbr} value={b.full} />
                  ))}
                </datalist>

                {banks.length === 0 && (
                  <p className="mt-3 rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">
                    ยังไม่มีบัญชี — กด “เพิ่มบัญชี” เพื่อกรอกเลขบัญชีร้าน
                  </p>
                )}

                <div className="mt-3 space-y-3">
                  {banks.map((b) => {
                    const brand = bankBrand(b.bank);
                    return (
                      <div key={b.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                        {/* แถบสีแบรนด์ธนาคาร — เปลี่ยนตามชื่อที่พิมพ์ทันที */}
                        <div className="h-1.5 w-full" style={{ background: brand.color }} />
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <BankLogo name={b.bank} />
                            <div className="grid min-w-0 flex-1 gap-2.5 sm:grid-cols-2">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-500">ธนาคาร</span>
                                <input
                                  value={b.bank}
                                  onChange={(e) => patchBank(b.id, { bank: e.target.value })}
                                  placeholder="เช่น กสิกรไทย"
                                  list="thai-bank-list"
                                  className={inputCls}
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-500">ชื่อบัญชี</span>
                                <input
                                  value={b.accountName}
                                  onChange={(e) => patchBank(b.id, { accountName: e.target.value })}
                                  placeholder="เช่น บจก.ทีพีดิจิตอล"
                                  className={inputCls}
                                />
                              </label>
                              <label className="block sm:col-span-2">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-500">เลขบัญชี</span>
                                <input
                                  value={b.accountNo}
                                  onChange={(e) => patchBank(b.id, { accountNo: e.target.value })}
                                  placeholder="เช่น 123-4-56789-0"
                                  inputMode="numeric"
                                  className={`${inputCls} font-mono text-base tracking-[0.15em]`}
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBank(b.id)}
                              className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              🗑 ลบ
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className={`p-5 ${card}`}>
                  <div className="flex items-center gap-3">
                    {/* ป้ายพร้อมเพย์ — โทนน้ำเงินกรมท่าแบบ Thai QR */}
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#113F67] text-lg font-bold text-white shadow-sm ring-1 ring-black/5">
                      P
                    </div>
                    <div>
                      <h2 className="font-display text-[15px] font-semibold text-slate-800">พร้อมเพย์ (PromptPay)</h2>
                      <p className="text-[11px] text-slate-400">ลูกค้าสแกน/โอนด้วยเบอร์หรือเลขนิติบุคคลได้</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">หมายเลขพร้อมเพย์</span>
                      <input
                        value={promptpay}
                        onChange={(e) => {
                          setPromptpay(e.target.value);
                          touch();
                        }}
                        placeholder="เบอร์ / เลขบัตร ปชช. / เลขนิติบุคคล"
                        inputMode="numeric"
                        className={`${inputCls} font-mono text-base tracking-[0.15em]`}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">ชื่อบัญชี</span>
                      <input
                        value={promptpayName}
                        onChange={(e) => {
                          setPromptpayName(e.target.value);
                          touch();
                        }}
                        placeholder="ชื่อบัญชีพร้อมเพย์"
                        className={inputCls}
                      />
                    </label>
                  </div>
                </section>

                <section className={`p-5 ${card}`}>
                  <h2 className="font-display text-[15px] font-semibold text-slate-800">📝 หมายเหตุถึงลูกค้า (ไม่บังคับ)</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">โชว์ใต้ข้อมูลบัญชีตอนลูกค้าจ่ายเงิน</p>
                  <textarea
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      touch();
                    }}
                    rows={3}
                    placeholder="เช่น โอนแล้วแนบสลิปในหน้าออเดอร์ · โอนภายใน 24 ชม."
                    className={`${inputCls} mt-3 h-[calc(100%-4rem)] resize-y`}
                  />
                </section>
              </div>
          </fieldset>
          )}

          {/* ══════ การจัดส่ง ══════ */}
          {tab === "ship" && (
            <div className="space-y-4">
              <section className={`p-5 ${card}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[15px] font-semibold text-slate-800">🚚 รูปแบบการจัดส่ง ({shipping.length})</h2>
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
                        <span className="text-slate-400">
                          · เว้นว่าง = ไม่เด้ง · ยอดถึงเกณฑ์แต่ทั้งตะกร้ายังเป็นเรทปลีก (เช่น 1-10 ชิ้น) = ไม่เด้ง
                        </span>
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

              <section className={`p-5 ${card}`}>
                <h2 className="font-display text-[15px] font-semibold text-slate-800">🎁 ส่งฟรีเมื่อซื้อครบ</h2>
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
            </div>
          )}

          {/* ══════ ระดับสมาชิก ══════ */}
          {tab === "tier" && (
            <section className={`p-5 ${card}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[15px] font-semibold text-slate-800">🏅 ระดับสมาชิก ({tiers.length})</h2>
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
            <section className={`${card} p-6 sm:p-8`}>
              {/* หัว: ชื่อ + สวิตช์เปิด/ปิด (มีป้ายสถานะชัดเจน) */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-slate-900">🎁 คูปองต้อนรับสมาชิกใหม่</h2>
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

          {/* ══════ 🎀 ของแถมฟรีตามจำนวนชิ้น (สั่งครบตามขั้นต่ำ แถมฟรี) ══════ */}
          {tab === "gift" && (
            <section className={`${card} p-6 sm:p-8`}>
              <div className="border-b border-slate-100 pb-5">
                <h2 className="font-display text-lg font-semibold text-slate-900">🎀 ของแถมฟรีตามจำนวนชิ้น</h2>
                <p className={`mt-1 text-sm ${muted}`}>
                  เช่น &quot;สั่งพวงกุญแจ/สแตนดี้/Griptok/อะคริลิค ครบ 30 ชิ้น รับแพ็คเกจรองหลังฟรี · ทุก 30 ชิ้นถัดไปได้เพิ่มอีก 1&quot;
                  — ลูกค้าเห็นป้ายในตะกร้าทันที และของแถมจะขึ้นบนใบงานให้ฝ่ายแพ็คด้วย
                </p>
              </div>

              <div className="mt-6 space-y-5">
                {gifts.length === 0 && (
                  <p className={`rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm ${faint}`}>
                    ยังไม่มีโปรของแถม — กด &quot;+ เพิ่มโปรของแถม&quot; ด้านล่าง
                  </p>
                )}

                {gifts.map((g, i) => {
                  const on = g.active !== false;
                  const minQty = Math.max(1, Number(g.minQty) || 1);
                  const step = Math.max(1, Number(g.step) || minQty);
                  const per = Math.max(1, Number(g.giveQty) || 1);
                  const picked = prodList.filter((p) => (g.productIds ?? []).includes(p.id));
                  return (
                    <div
                      key={g.id}
                      className={`rounded-2xl border p-5 transition ${on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"}`}
                    >
                      {/* หัวการ์ด: รูป + ชื่อ + สวิตช์ + ลบ */}
                      <div className="flex items-start gap-3">
                        <CatImage value={g.image} onChange={(v) => patchGift(i, { image: v })} folder="gifts" />
                        <div className="min-w-0 flex-1">
                          <input
                            value={g.name}
                            onChange={(e) => patchGift(i, { name: e.target.value })}
                            placeholder="ชื่อของแถม เช่น แพ็คเกจรองหลัง"
                            className={`${inputCls} font-semibold`}
                          />
                          <input
                            value={g.note ?? ""}
                            onChange={(e) => patchGift(i, { note: e.target.value })}
                            placeholder="คำอธิบายสั้น ๆ (ไม่ใส่ก็ได้) เช่น ซองใส + การ์ดรองหลังลายร้าน"
                            className={`${inputCls} mt-2 text-xs`}
                          />
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => patchGift(i, { active: !on })}
                            className={`flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs font-bold transition ${
                              on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {on ? "เปิดอยู่" : "ปิดอยู่"}
                            <span className={`relative h-6 w-10 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGift(i)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50"
                          >
                            ลบโปรนี้
                          </button>
                        </div>
                      </div>

                      {/* เกณฑ์ */}
                      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">สั่งครบกี่ชิ้น</span>
                          <input
                            type="number"
                            min={1}
                            value={g.minQty ?? 1}
                            onChange={(e) => patchGift(i, { minQty: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">ทุก ๆ กี่ชิ้นได้เพิ่ม</span>
                          <input
                            type="number"
                            min={0}
                            value={g.step ?? 0}
                            onChange={(e) => patchGift(i, { step: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">ว่าง/0 = เท่ากับขั้นต่ำ</span>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">ได้ครั้งละกี่ชิ้น</span>
                          <input
                            type="number"
                            min={1}
                            value={g.giveQty ?? 1}
                            onChange={(e) => patchGift(i, { giveQty: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">แถมสูงสุด/ออเดอร์</span>
                          <input
                            type="number"
                            min={0}
                            value={g.maxQty ?? 0}
                            onChange={(e) => patchGift(i, { maxQty: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">0 = ไม่จำกัด</span>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">มูลค่า/ชุด (฿)</span>
                          <input
                            type="number"
                            min={0}
                            value={g.value ?? 0}
                            onChange={(e) => patchGift(i, { value: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">โชว์ราคาขีดฆ่า</span>
                        </label>
                      </div>

                      {/* 🎁 ผูกกับสินค้าจริง + ดึงขนาดจากสินค้านั้น */}
                      <div className="mt-5">
                        <GiftFromProduct
                          productId={g.giftProductId}
                          list={prodList}
                          onPick={(id) => patchGift(i, { giftProductId: id })}
                          onSizes={(sizes, groupLabel) =>
                            patchGift(i, { sizes, sizeLabel: g.sizeLabel?.trim() || groupLabel })
                          }
                          inputCls={inputCls}
                        />
                      </div>

                      {/* 📐 ขนาด/แบบที่ให้ลูกค้าเลือก */}
                      <div className="mt-3 rounded-xl bg-slate-50 p-4">
                        <GiftSizes
                          sizes={g.sizes ?? []}
                          label={g.sizeLabel}
                          onChange={(v) => patchGift(i, { sizes: v })}
                          onLabel={(v) => patchGift(i, { sizeLabel: v })}
                          inputCls={inputCls}
                        />

                        {/* 🧾 เศษไม่เต็มแผ่น A3 → ได้ของแทน */}
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <span className="text-xs font-semibold text-slate-700">🧾 เศษที่ไม่เต็มแผ่น A3 ได้ของแทน</span>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                            เช่น 9 × 9 ได้ 15 ใบ/แผ่น · ลูกค้าสั่ง 20 ชิ้น → 15 ชิ้นแรกได้รองหลังพิมพ์ลาย
                            ส่วนอีก 5 ชิ้นไม่ถึงครึ่งแผ่น (ต้อง 8 ใบขึ้นไป) จะได้ของแทนตามที่ตั้งไว้นี้ —
                            เว้นชื่อของแทนว่าง = ไม่ใช้กติกานี้ (ได้ของแถมครบทุกชิ้น)
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <CatImage
                              value={g.partial?.image}
                              onChange={(v) => patchGift(i, { partial: { ...(g.partial ?? { name: "" }), image: v } })}
                              folder="gifts"
                            />
                            <input
                              value={g.partial?.name ?? ""}
                              onChange={(e) => patchGift(i, { partial: { ...(g.partial ?? {}), name: e.target.value } })}
                              placeholder="ชื่อของแทน เช่น ซองใส-หลังขาว"
                              className={`${inputCls} h-9 w-56 py-1 text-xs font-semibold`}
                            />
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              เศษต้องเต็ม
                              <input
                                type="number"
                                min={1}
                                max={100}
                                value={Math.round((g.partial?.minFill ?? 0.5) * 100)}
                                onChange={(e) =>
                                  patchGift(i, {
                                    partial: {
                                      ...(g.partial ?? { name: "" }),
                                      minFill: Math.min(1, Math.max(0.01, (Number(e.target.value) || 50) / 100)),
                                    },
                                  })
                                }
                                className={`${inputCls} h-9 w-16 py-1 text-right text-xs tabular-nums`}
                              />
                              % ของแผ่น ถึงจะพิมพ์ให้
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* 🎨 ของแถมชิ้นนี้ต้องพิมพ์ลายไหม — เปิดแล้วตะกร้าจะมีกล่องแนบลายบนการ์ดของแถม */}
                      <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3">
                        <input
                          type="checkbox"
                          checked={giftNeedsArtwork(g)}
                          onChange={(e) => patchGift(i, { needArtwork: e.target.checked })}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-slate-700">🎨 ของแถมชิ้นนี้ต้องพิมพ์ลาย (เช่น กระดาษรองหลัง)</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">
                            เปิดแล้วการ์ดของแถมในตะกร้าจะมีให้เลือก{" "}
                            <strong className="text-slate-500">“ใช้ลายเดียวกับสินค้าที่สั่ง” (ค่าเริ่มต้น)</strong> หรือแนบไฟล์ลายอื่น ·
                            ไฟล์ที่แนบจะขึ้นในใบงานฝ่ายผลิตให้อัตโนมัติ
                          </span>
                        </span>
                      </label>

                      {/* 📋 เงื่อนไขเพิ่มเติม (ข้อความ) + เงื่อนไขที่ระบบตรวจให้ */}
                      <label className="mt-4 block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-700">📋 เงื่อนไขเพิ่มเติม (ลูกค้าเห็นในตะกร้า)</span>
                        <input
                          value={g.condition ?? ""}
                          onChange={(e) => patchGift(i, { condition: e.target.value })}
                          placeholder="เช่น อะคริลิคที่สั่งต้องขนาด 4 ซม. ขึ้นไป หนา 3 มม."
                          className={`${inputCls} text-xs`}
                        />
                      </label>

                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <span className="text-xs font-semibold text-slate-700">🔎 เงื่อนไขที่ระบบตรวจให้เอง (ตัดสิทธิ์อัตโนมัติ)</span>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                          ดูจากตัวเลือกที่ลูกค้าเลือกในสินค้าชิ้นนั้น — ชิ้นที่ไม่ผ่านจะ<strong className="text-slate-500">ไม่นับเข้าโปร</strong>
                          (ยังสั่งซื้อได้ปกติ) · ไม่ใส่เลย = นับทุกชิ้นของสินค้าที่เข้าโปร ·
                          ⚠️ ชิ้นที่หากลุ่มตัวเลือกนี้ไม่เจอ ถือว่าไม่ผ่าน
                        </p>
                        <div className="mt-2 space-y-2">
                          {(g.requires ?? []).map((r, k) => {
                            const patchReq = (v: Partial<GiftRequire>) =>
                              patchGift(i, { requires: (g.requires ?? []).map((x, j) => (j === k ? { ...x, ...v } : x)) });
                            return (
                              <div key={k} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
                                <input
                                  value={r.label ?? ""}
                                  onChange={(e) => patchReq({ label: e.target.value })}
                                  placeholder="กลุ่มตัวเลือก เช่น ขนาด"
                                  className={`${inputCls} h-9 w-40 py-1 text-xs font-semibold`}
                                />
                                <input
                                  value={r.contains ?? ""}
                                  onChange={(e) => patchReq({ contains: e.target.value })}
                                  placeholder='ต้องมีคำว่า เช่น "3 มม."'
                                  className={`${inputCls} h-9 w-40 py-1 text-xs`}
                                />
                                <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                  ขนาดขั้นต่ำ
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    value={r.minCm ?? 0}
                                    onChange={(e) => patchReq({ minCm: Math.max(0, Number(e.target.value) || 0) })}
                                    className={`${inputCls} h-9 w-16 py-1 text-right text-xs tabular-nums`}
                                  />
                                  ซม.
                                </label>
                                <select
                                  value={r.cmMode ?? "min"}
                                  onChange={(e) => patchReq({ cmMode: e.target.value as "min" | "max" })}
                                  className={`${inputCls} h-9 w-40 py-1 text-xs`}
                                >
                                  <option value="min">ทุกด้านต้องถึง</option>
                                  <option value="max">ด้านยาวสุดถึงก็พอ</option>
                                </select>
                                <select
                                  value={r.whenMissing ?? "pass"}
                                  onChange={(e) => patchReq({ whenMissing: e.target.value as "pass" | "fail" })}
                                  title="สินค้าที่ไม่มีกลุ่มตัวเลือกนี้ (เช่น Griptok ขนาดตายตัว) จะเอายังไง"
                                  className={`${inputCls} h-9 w-52 py-1 text-xs`}
                                >
                                  <option value="pass">ไม่มีกลุ่มนี้ = ปล่อยผ่าน</option>
                                  <option value="fail">ไม่มีกลุ่มนี้ = ไม่นับ</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => patchGift(i, { requires: (g.requires ?? []).filter((_, j) => j !== k) })}
                                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-400 transition hover:bg-rose-50 hover:text-rose-600"
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            patchGift(i, { requires: [...(g.requires ?? []), { label: "", cmMode: "min", whenMissing: "pass" }] })
                          }
                          className="mt-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
                        >
                          + เพิ่มเงื่อนไข
                        </button>
                      </div>

                      {/* หมวดที่นับเข้าโปร */}
                      <div className="mt-5">
                        <span className="mb-2 block text-xs font-semibold text-slate-700">หมวดสินค้าที่นับเข้าโปร</span>
                        <div className="flex flex-wrap gap-1.5">
                          {cats.map((c) => {
                            const sel = (g.categories ?? []).includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  patchGift(i, {
                                    categories: sel
                                      ? (g.categories ?? []).filter((x) => x !== c.id)
                                      : [...(g.categories ?? []), c.id],
                                  })
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  sel ? "bg-amber-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                {c.emoji} {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* สินค้าเฉพาะตัว */}
                      <div className="mt-5">
                        <span className="mb-2 block text-xs font-semibold text-slate-700">
                          เพิ่มสินค้าเฉพาะตัว <span className="font-normal text-slate-400">(สำหรับตัวที่อยู่ปนหมวดอื่น เช่น Griptok)</span>
                        </span>
                        {picked.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {picked.map((p) => (
                              <span key={p.id} className="flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100">
                                {p.name}
                                <button
                                  type="button"
                                  onClick={() => patchGift(i, { productIds: (g.productIds ?? []).filter((x) => x !== p.id) })}
                                  className="text-sky-400 hover:text-rose-500"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <ProductPicker
                          list={prodList}
                          exclude={g.productIds ?? []}
                          onPick={(id) => patchGift(i, { productIds: [...(g.productIds ?? []), id] })}
                          inputCls={inputCls}
                        />
                      </div>

                      {/* ช่วงเวลาโปร + สรุปกติกา */}
                      <div className="mt-5 grid gap-4 sm:grid-cols-[10rem_10rem_minmax(0,1fr)] sm:items-end">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">เริ่มวันที่</span>
                          <input type="date" value={g.from ?? ""} onChange={(e) => patchGift(i, { from: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">ถึงวันที่</span>
                          <input type="date" value={g.to ?? ""} onChange={(e) => patchGift(i, { to: e.target.value })} className={inputCls} />
                        </label>
                        <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-900 ring-1 ring-emerald-100">
                          🎁 สั่งครบ <strong>{minQty}</strong> ชิ้น ได้ <strong>{g.name?.trim() || "ของแถม"} ×{per}</strong>
                          {" · "}ทุก ๆ {step} ชิ้นถัดไปได้เพิ่มอีก {per}
                          {Number(g.maxQty) > 0 ? ` · สูงสุด ${g.maxQty} ชิ้น/ออเดอร์` : ""}
                          {(g.categories ?? []).length + (g.productIds ?? []).length === 0 && (
                            <span className="mt-1 block font-semibold text-amber-700">⚠️ ยังไม่เลือกหมวด/สินค้า = นับสินค้าทั้งร้าน</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addGift}
                  className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
                >
                  + เพิ่มโปรของแถม
                </button>
              </div>

              <p className={`mt-5 text-sm ${faint}`}>
                💡 ระบบคิดของแถมใหม่ฝั่งเซิร์ฟเวอร์ตอนสร้างออเดอร์เสมอ — แก้โปรตรงนี้แล้วมีผลกับออเดอร์ใหม่ทันที (ออเดอร์เก่าไม่เปลี่ยน)
              </p>
            </section>
          )}

          {/* ══════ 📦 ค่ากล่อง/ค่าแพ็คอัตโนมัติ (เช่น งานโปสเตอร์/ขนาด A3 +30) ══════ */}
          {tab === "box" && (
            <section className={`${card} p-6 sm:p-8`}>
              <div className="border-b border-slate-100 pb-5">
                <h2 className="font-display text-lg font-semibold text-slate-900">📦 ค่ากล่อง/ค่าแพ็คอัตโนมัติ</h2>
                <p className={`mt-1 text-sm ${muted}`}>
                  เช่น &quot;งานโปสเตอร์ หรือ งานที่ลูกค้าสั่งขนาด A3 บวกค่ากล่องกันกระแทก 30 บาท&quot; — ระบบบวกให้เอง
                  <strong> ครั้งเดียวต่อออเดอร์</strong> (หลายรายการเข้าเงื่อนไขก็ใบเดียว ส่งกล่องเดียวกัน)
                  โดยห้อยป้ายไว้ใต้รายการแรกที่เข้าเงื่อนไขในตะกร้า รายการอื่นขึ้นป้าย &quot;ใช้กล่องเดียวกัน ไม่คิดเพิ่ม&quot;
                </p>
              </div>

              <div className="mt-6 space-y-5">
                {boxFees.length === 0 && (
                  <p className={`rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm ${faint}`}>
                    ยังไม่มีกติกาค่ากล่อง — กด &quot;+ เพิ่มกติกา&quot; ด้านล่าง
                  </p>
                )}

                {boxFees.map((f, i) => {
                  const on = f.active !== false;
                  const picked = prodList.filter((p) => (f.productIds ?? []).includes(p.id));
                  const per = Math.max(0, Number(f.perQty) || 0);
                  return (
                    <div
                      key={f.id}
                      className={`rounded-2xl border p-5 transition ${on ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"}`}
                    >
                      {/* หัวการ์ด: ชื่อ + จำนวนเงิน + สวิตช์ + ลบ */}
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <input
                            value={f.name}
                            onChange={(e) => patchBox(i, { name: e.target.value })}
                            placeholder="ชื่อที่ลูกค้าเห็น เช่น ค่ากล่องกันกระแทก"
                            className={`${inputCls} font-semibold`}
                          />
                          <input
                            value={f.note ?? ""}
                            onChange={(e) => patchBox(i, { note: e.target.value })}
                            placeholder="คำอธิบายสั้น ๆ (ไม่ใส่ก็ได้) เช่น งานขนาด A3 ส่งในกล่องแข็ง กันหักกันยับ"
                            className={`${inputCls} mt-2 text-xs`}
                          />
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => patchBox(i, { active: !on })}
                            className={`flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-xs font-bold transition ${
                              on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {on ? "เปิดอยู่" : "ปิดอยู่"}
                            <span className={`relative h-6 w-10 rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBox(i)}
                            className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50"
                          >
                            ลบกติกานี้
                          </button>
                        </div>
                      </div>

                      {/* จำนวนเงิน */}
                      <div className="mt-5 grid gap-4 sm:grid-cols-3">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">บวกเพิ่ม (บาท/กล่อง)</span>
                          <input
                            type="number"
                            min={0}
                            value={f.amount ?? 0}
                            onChange={(e) => patchBox(i, { amount: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">1 กล่องใส่ได้กี่ชิ้น</span>
                          <input
                            type="number"
                            min={0}
                            value={f.perQty ?? 0}
                            onChange={(e) => patchBox(i, { perQty: Number(e.target.value) })}
                            className={`${inputCls} text-right tabular-nums`}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">ว่าง/0 = กล่องเดียวต่อออเดอร์ ไม่ว่าจะสั่งกี่ชิ้นกี่รายการ</span>
                        </label>
                        <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100 sm:self-end">
                          {per > 0
                            ? `นับจำนวนรวมของทุกรายการที่เข้าเงื่อนไข — เกิน ${per} ชิ้น คิดกล่องเพิ่ม (ปัดขึ้น) เช่น รวม ${per * 2 + 1} ชิ้น = 3 กล่อง`
                            : "คิดค่ากล่องใบเดียวต่อออเดอร์ — หลายรายการเข้าเงื่อนไขก็ไม่บวกซ้ำ"}
                        </p>
                      </div>

                      {/* เงื่อนไข: หมวด/สินค้า */}
                      <div className="mt-5">
                        <span className="mb-2 block text-xs font-semibold text-slate-700">หมวดสินค้าที่เข้าเงื่อนไข</span>
                        <div className="flex flex-wrap gap-1.5">
                          {cats.map((c) => {
                            const sel = (f.categories ?? []).includes(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() =>
                                  patchBox(i, {
                                    categories: sel
                                      ? (f.categories ?? []).filter((x) => x !== c.id)
                                      : [...(f.categories ?? []), c.id],
                                  })
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                  sel ? "bg-amber-500 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                }`}
                              >
                                {c.emoji} {c.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5">
                        <span className="mb-2 block text-xs font-semibold text-slate-700">
                          สินค้าเฉพาะตัว <span className="font-normal text-slate-400">(เช่น POSTER ที่อยู่ปนหมวดป้าย)</span>
                        </span>
                        {picked.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {picked.map((p) => (
                              <span key={p.id} className="flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100">
                                {p.name}
                                <button
                                  type="button"
                                  onClick={() => patchBox(i, { productIds: (f.productIds ?? []).filter((x) => x !== p.id) })}
                                  className="text-sky-400 hover:text-rose-500"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <ProductPicker
                          list={prodList}
                          exclude={f.productIds ?? []}
                          onPick={(id) => patchBox(i, { productIds: [...(f.productIds ?? []), id] })}
                          inputCls={inputCls}
                        />
                      </div>

                      {/* เงื่อนไขจากตัวเลือกที่ลูกค้าเลือก (เช่น ขนาด = A3) */}
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">คำในตัวเลือกที่เข้าเงื่อนไข</span>
                          <input
                            value={(f.keywords ?? []).join(", ")}
                            onChange={(e) => patchBox(i, { keywords: e.target.value.split(",").map((x) => x.trim()) })}
                            placeholder="เช่น A3, A2 (คั่นด้วยจุลภาค)"
                            className={inputCls}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">ลูกค้าเลือกตัวเลือกที่มีคำนี้ = โดนค่ากล่อง · เว้นว่าง = ไม่ดูตัวเลือก</span>
                        </label>
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-semibold text-slate-700">ดูเฉพาะกลุ่มตัวเลือกชื่อ</span>
                          <input
                            value={(f.optionGroups ?? []).join(", ")}
                            onChange={(e) => patchBox(i, { optionGroups: e.target.value.split(",").map((x) => x.trim()) })}
                            placeholder="เช่น ขนาด, ขนาดกระดาษ, แนวกระดาษ"
                            className={inputCls}
                          />
                          <span className="mt-1 block text-[11px] text-slate-400">
                            ⚠️ ควรระบุ — เว้นว่างแล้วระบบอ่านทุกกลุ่ม จะชนพวก &quot;สีเคส A3 ดำแข็ง&quot; / &quot;ขนาดสกรีนไม่เกิน A3&quot; ที่ไม่ควรคิดค่ากล่อง
                          </span>
                        </label>
                      </div>

                      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={!!f.matchAll}
                          onChange={(e) => patchBox(i, { matchAll: e.target.checked || undefined })}
                          className="mt-0.5 h-4 w-4 accent-amber-500"
                        />
                        <span>
                          ต้องเข้าเงื่อนไข<strong>ทั้งสองอย่าง</strong> (หมวด/สินค้า และ คำในตัวเลือก) ถึงคิดค่ากล่อง
                          <span className="block text-[11px] text-slate-400">ไม่ติ๊ก = เข้าอย่างใดอย่างหนึ่งก็คิด (เช่น โปสเตอร์ทุกขนาด หรือ งาน A3 ของสินค้าอื่น)</span>
                        </span>
                      </label>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addBox}
                  className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-amber-400 hover:text-amber-600"
                >
                  + เพิ่มกติกา
                </button>
              </div>

              <p className={`mt-5 text-sm ${faint}`}>
                💡 ค่ากล่องขึ้นเป็นแถบห้อยใต้รายการในตะกร้าทันที และเข้าออเดอร์เป็นบรรทัด &quot;📦 ค่ากล่อง&quot; ของตัวเอง —
                ลบกติกาออกจนหมดแล้วกดบันทึก = ปิดระบบนี้ (ไม่กลับไปใช้ค่าเริ่มต้น)
              </p>
            </section>
          )}

          {/* ══════ บทบาท & สิทธิ์ — ผู้ดูแลระบบติ๊กแก้สิทธิ์/เพิ่มบทบาทได้ ══════ */}
          {tab === "cats" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
                <p className="font-display text-[13px] font-semibold">🗂 หมวดหมู่สินค้า</p>
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
                      onClick={() => {
                        setCats((cur) => cur.filter((_, k) => k !== i));
                        setCatsDirty(true);
                      }}
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
                onClick={() => {
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
                  ]);
                  setCatsDirty(true);
                }}
                className="rounded-full border border-dashed border-amber-300 px-4 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
              >
                ＋ เพิ่มหมวดใหม่
              </button>

              {/* ไม่มีปุ่มบันทึกของแท็บนี้ — ใช้ปุ่ม "บันทึก" รวมข้างล่างที่เดียว */}
              <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                หมวดที่มีสินค้าอยู่ลบไม่ได้ — ใช้ “ซ่อน” แทน
              </p>
            </div>
          )}

          {tab === "files" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-100">
                <p className="font-display text-[13px] font-semibold">🧹 ล้างรูปของออเดอร์เก่าอัตโนมัติ</p>
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
            <section className={`p-5 ${card}`}>
              <h2 className="font-display text-[15px] font-semibold text-slate-800">🔍 เชื่อมกับ Google &amp; การค้นหา</h2>
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
              const EMOJI: Record<string, string> = { [DEPT_ADMIN]: "🧑‍💼", [DEPT_GRAPHIC]: "🎨", [DEPT_PACKING]: "📦", [DEPT_CONTENT]: "🖋️" };
              const BUILTIN = [DEPT_ADMIN, DEPT_GRAPHIC, DEPT_PACKING, DEPT_CONTENT];
              const depts = rolesMap ? Object.keys(rolesMap) : [];
              return (
                <section className={`p-5 ${card} sm:p-6`}>
                  <h2 className="font-display text-[15px] font-semibold text-slate-800">👥 บทบาทการทำงาน — แต่ละตำแหน่งทำอะไรได้บ้าง</h2>
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
                          {/* ไม่มีปุ่มบันทึกของแท็บนี้ — ใช้ปุ่ม "บันทึก" รวมข้างล่างที่เดียว */}
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

          {error && (
            <div className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-100">{error}</div>
          )}

          {/* แถบบันทึกลอยติดขอบล่าง — ไม่ต้องเลื่อนหาปุ่ม */}
          <div className="sticky bottom-3 z-20 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur">
            <p className={`text-xs ${faint}`}>บันทึกครั้งเดียวมีผลทุกแท็บ</p>
            <button type="button" onClick={save} disabled={saving} className={`${btnPrimary} ${saved ? "!bg-emerald-600" : ""}`}>
              {saving ? "กำลังบันทึก…" : saved ? "✓ บันทึกแล้ว" : "💾 บันทึก"}
            </button>
          </div>

          <p className={`mt-4 text-center text-xs ${faint}`}>
            ดูผลฝั่งลูกค้าได้ที่หน้า{" "}
            <Link href="/cart" className="font-semibold text-amber-600 hover:underline">
              ตะกร้าสินค้า
            </Link>
          </p>
        </>
      )}
        </div>
      </div>
    </PageShell>
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
