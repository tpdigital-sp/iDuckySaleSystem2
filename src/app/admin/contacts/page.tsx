"use client";

/**
 * ข้อมูลผู้ติดต่อ /admin/contacts  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * คลังรายชื่อลูกค้า/ตัวแทน ~28,000 ราย ที่นำเข้าจากหลังบ้านระบบเดิม (backoffice.casedesign2u.com)
 * ค้นหา · ดูรายละเอียด · แก้ไข/เพิ่ม/ลบ · นำเข้าซ้ำได้ (upsert ตามรหัส ไม่ล้าง note ที่แก้ในระบบนี้)
 *
 * รายการเยอะมาก → ค้นหา/แบ่งหน้าฝั่งเซิร์ฟเวอร์ทั้งหมด หน้าจอถือแค่หน้าละ 50 ราย
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCan } from "@/lib/perm-context";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { formatPhone, normalizeContact, ORIGIN_LABEL, type Contact, type ContactOrigin, type PointLog } from "@/lib/contacts";
import { fetchShopPayment, readStoredShopPayment, tiersConfigOf } from "@/lib/shop-settings";
import { tierColor, tierForSpend, tiersOf, type Tier } from "@/lib/tiers";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  KV,
  PageHead,
  PageShell,
  SearchBox,
  Stat,
  Stats,
  Tab,
  TabRow,
  Tag,
} from "@/components/admin/ui";

type Stats = { total: number; withPhone: number; withPoint: number; dealers: number; legacy: number; member: number; adminOrder: number; guestOrder: number };
type Filter = "" | "phone" | "point" | "dealer";
type SortKey = "id" | "name" | "point" | "rankStatus" | "rankExpiry" | "phone" | "address";

/** คอลัมน์ตาราง — ลำดับ/ชื่อเหมือนตารางระบบเดิม ให้ทีมย้ายมาใช้ได้โดยไม่ต้องเรียนรู้ใหม่ */
const COLS: { key: SortKey | "rank" | "actions"; label: string; sortable?: boolean; w?: string }[] = [
  { key: "id", label: "รหัสผู้ติดต่อ", sortable: true, w: "w-[5.75rem]" },
  { key: "name", label: "ชื่อผู้ติดต่อ", sortable: true, w: "min-w-[9.5rem]" },
  { key: "point", label: "Point", sortable: true, w: "w-[4.75rem]" },
  { key: "rank", label: "Rank", w: "w-[6.5rem]" },
  { key: "rankStatus", label: "สถานะ Rank", sortable: true, w: "w-[5.5rem]" },
  { key: "rankExpiry", label: "วันหมดอายุ", sortable: true, w: "w-[6rem]" },
  { key: "phone", label: "เบอร์โทร", sortable: true, w: "w-[7.25rem]" },
  { key: "address", label: "ที่อยู่", sortable: true, w: "min-w-[20rem]" },
  { key: "actions", label: "ตัวเลือก", w: "w-[8.25rem]" },
];

type Form = { id?: string; name: string; phone: string; address: string; email: string; note: string; customerType: "" | "customer" | "dealer"; point: string };
const EMPTY: Form = { name: "", phone: "", address: "", email: "", note: "", customerType: "", point: "" };

const fmtN = (n: number) => n.toLocaleString("th-TH");

/**
 * ระดับสมาชิก 🏅 (ตั้งค่าที่ /admin/settings › ระดับสมาชิก) — คิดจากยอดสะสม
 * ผู้ติดต่อจากระบบเดิมยังไม่มีออเดอร์ในระบบนี้ → ใช้ "แต้มสะสมระบบเดิม" เป็นยอดสะสมตั้งต้น (1 แต้ม = 1 บาท)
 */
function TierPill({ tiers, spend, small }: { tiers: Tier[]; spend: number; small?: boolean }) {
  const list = tiersOf(tiers);
  const t = tierForSpend(spend, list);
  const { gradient } = tierColor(t, list.indexOf(t));
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold text-white shadow-sm ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-[12px]"}`}
      style={{ background: gradient }}
      title={`${t.name} · ยอดสะสม ฿${fmtN(Math.round(spend))}${t.discountPct ? ` · ลด ${t.discountPct}%` : ""}`}
    >
      <span aria-hidden>{t.icon}</span>
      {t.name}
    </span>
  );
}

export default function AdminContactsPage() {
  const can = useCan();
  const canEdit = can("orders.edit");
  const { confirm, dialog } = useConfirm();
  // แถบแจ้งผลมุมล่าง — แทน alert() ของเบราว์เซอร์ (ขึ้น "localhost บอกว่า" ดูไม่ใช่ระบบเรา)
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad"; action?: { label: string; onClick: () => void } } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.tone === "bad" ? 6000 : 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  /** แท็บที่มา — "" = ทุกคน · ที่เหลือกรองตาม origins ของผู้ติดต่อ (คนเดียวอยู่ได้หลายแท็บ) */
  const [origin, setOrigin] = useState<"" | ContactOrigin>("");
  /** ซิงก์สมาชิกเว็บ + ลูกค้าจากออเดอร์เข้าคลังให้เองตอนเปิดหน้า — ไม่ต้องมีปุ่ม "เพิ่มเข้าคลัง" */
  const [syncing, setSyncing] = useState(true);
  const [syncNote, setSyncNote] = useState("");
  // ประวัติคะแนนของรายที่เปิดดูอยู่
  const [logs, setLogs] = useState<PointLog[] | null>(null);
  // ระดับสมาชิกจากหน้าตั้งค่า — เริ่มจากสำเนาในเครื่อง แล้วค่อยดึงของจริง
  const [tiers, setTiers] = useState<Tier[]>(() => tiersConfigOf(typeof window === "undefined" ? null : readStoredShopPayment()));
  useEffect(() => {
    fetchShopPayment()
      .then((v) => setTiers(tiersConfigOf(v)))
      .catch(() => {});
  }, []);
  const [sort, setSort] = useState<SortKey>("id");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [stats, setStats] = useState<Stats | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState<Contact | null>(null);
  const [form, setForm] = useState<Form | null>(null); // null = ไม่ได้เปิดฟอร์ม
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const reqSeq = useRef(0);
  const load = useCallback(
    async (opts?: { stats?: boolean }) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      setErr("");
      try {
        const sp = new URLSearchParams();
        if (q.trim()) sp.set("q", q.trim());
        sp.set("page", String(page));
        sp.set("limit", String(limit));
        sp.set("sort", sort);
        sp.set("dir", dir);
        if (filter === "dealer") sp.set("type", "dealer");
        else if (filter) sp.set("has", filter);
        if (origin) sp.set("origin", origin);
        if (opts?.stats || !stats) sp.set("stats", "1");
        const res = await fetch(`/api/admin/contacts?${sp}`, { cache: "no-store" });
        const j = await res.json();
        if (seq !== reqSeq.current) return; // มีคำค้นใหม่กว่าแซงไปแล้ว
        if (!res.ok) return setErr(j.error ?? "โหลดไม่สำเร็จ");
        setRows(j.contacts ?? []);
        setTotal(j.total ?? 0);
        setPageSize(j.pageSize ?? 50);
        setNeedsSetup(!!j.needsSetup);
        if (j.stats) setStats(j.stats);
      } catch {
        if (seq === reqSeq.current) setErr("โหลดไม่สำเร็จ");
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, page, filter, limit, sort, dir, origin]
  );

  useEffect(() => {
    let live = true;
    fetch("/api/admin/contacts/sync", { method: "POST" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setSyncNote(j.error ? `ซิงก์ไม่สำเร็จ: ${j.error}` : "");
        else if (!j.skipped && (j.created || j.updated)) {
          setSyncNote(`ซิงก์แล้ว · เพิ่มใหม่ ${j.created} · อัปเดต ${j.updated}`);
          void load({ stats: true });
        }
      })
      .catch(() => {})
      .finally(() => live && setSyncing(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ค้นหาแบบหน่วง 300ms — พิมพ์ทีละตัวไม่ยิงเซิร์ฟเวอร์ทุกตัวอักษร
  useEffect(() => {
    const t = window.setTimeout(() => void load(), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  function search(v: string) {
    setQ(v);
    setPage(1);
  }
  function sortBy(k: SortKey) {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "id" || k === "point" ? "desc" : "asc");
    }
    setPage(1);
  }
  function pick(f: Filter) {
    setFilter((cur) => (cur === f ? "" : f));
    setPage(1);
  }

  useEffect(() => {
    setLogs(null);
    if (!selected) return;
    let live = true;
    fetch(`/api/admin/contacts/points?id=${encodeURIComponent(selected.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setLogs(j.logs ?? []))
      .catch(() => live && setLogs([]));
    return () => {
      live = false;
    };
  }, [selected]);

  function openEdit(c?: Contact) {
    setForm(
      c
        ? { id: c.id, name: c.name, phone: c.phone, address: c.address, email: c.email ?? "", note: c.note ?? "", customerType: c.customerType ?? "", point: String(c.point ?? 0) }
        : { ...EMPTY }
    );
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, point: Number(form.point) || 0 }),
      });
      const j = await res.json();
      if (!res.ok) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
      setToast({ text: form.id ? `บันทึก #${form.id} แล้ว` : `เพิ่มผู้ติดต่อใหม่ #${j.contact?.id} แล้ว`, tone: "ok" });
      setForm(null);
      setSelected(j.contact ?? null);
      await load({ stats: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Contact) {
    const ok = await confirm({
      icon: "🗑",
      title: `ลบผู้ติดต่อ #${c.id}?`,
      detail: `${c.name || "(ไม่มีชื่อ)"}${c.phone ? ` · ${formatPhone(c.phone)}` : ""}\nลบแล้วประวัติคะแนนของรายนี้จะหายไปด้วย — ย้อนกลับไม่ได้`,
      confirmLabel: "ลบ",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/contacts?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setToast({ text: j.error ?? "ลบไม่สำเร็จ", tone: "bad" });
    setToast({ text: `ลบ #${c.id} ${c.name || ""} แล้ว`, tone: "ok" });
    setSelected(null);
    setForm(null);
    await load({ stats: true });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const s = stats ?? { total: 0, withPhone: 0, withPoint: 0, dealers: 0 };

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="ข้อมูลผู้ติดต่อ"
        count={stats ? `${fmtN(s.total)} ราย` : undefined}
        sub="ทุกคนอยู่ที่นี่ที่เดียว — จากระบบเดิม · สมัครสมาชิกเว็บ · ลูกค้าจากออเดอร์ (ซิงก์ให้เอง) · ค้นหาด้วยชื่อ เบอร์ ที่อยู่ หรือรหัส"
        tools={
          canEdit ? (
            <>
              <Btn onClick={() => setImportOpen(true)}>📥 นำเข้าจากระบบเดิม</Btn>
              <Btn tone="yolk" onClick={() => openEdit()}>
                + เพิ่มผู้ติดต่อ
              </Btn>
            </>
          ) : undefined
        }
      />

      {needsSetup && (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่มีตาราง contacts"
            detail="เปิด Supabase SQL editor แล้วรัน supabase/contacts.sql หนึ่งครั้ง จากนั้นกด นำเข้าจากระบบเดิม"
          />
        </div>
      )}
      {err && (
        <div className="mt-4">
          <Banner tone="hot" title={err} />
        </div>
      )}

      <Stats cols={4}>
        <HeroStat
          n={<span className={s.total >= 10000 ? "text-[1rem]" : undefined}>{fmtN(s.total)}</span>}
          label="ผู้ติดต่อทั้งหมด"
          detail={s.total ? `มีเบอร์โทร ${Math.round((s.withPhone / s.total) * 100)}% — ติดต่อกลับได้ ${fmtN(s.withPhone)} ราย` : "ยังไม่มีข้อมูล — กดนำเข้าจากระบบเดิม"}
          pct={s.total ? (s.withPhone / s.total) * 100 : 0}
        />
        <Stat label="มีเบอร์โทร" value={fmtN(s.withPhone)} hint="ราย" onClick={() => pick("phone")} active={filter === "phone"} />
        <Stat label="มีแต้มสะสม" value={fmtN(s.withPoint)} hint="ราย — แต้มจากระบบเดิม" onClick={() => pick("point")} active={filter === "point"} />
      </Stats>

      <FilterCard>
        <TabRow>
          <Tab on={origin === ""} onClick={() => { setOrigin(""); setPage(1); }} label="ทุกคน" count={stats?.total} />
          <Tab on={origin === "legacy"} onClick={() => { setOrigin("legacy"); setPage(1); }} label="จากระบบเดิม" count={stats?.legacy} />
          <Tab on={origin === "member"} onClick={() => { setOrigin("member"); setPage(1); }} label="สมัครเองจากเว็บ" count={stats?.member} />
          <Tab on={origin === "admin-order"} onClick={() => { setOrigin("admin-order"); setPage(1); }} label="แอดมินกรอกตอนสั่ง" count={stats?.adminOrder} />
          <Tab on={origin === "guest-order"} onClick={() => { setOrigin("guest-order"); setPage(1); }} label="สั่งแบบไม่สมัคร" count={stats?.guestOrder} />
          <span className="ml-auto self-center whitespace-nowrap pl-2 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
            {syncing ? "กำลังซิงก์สมาชิก/ออเดอร์…" : syncNote || "ซิงก์สมาชิกเว็บและออเดอร์เข้าคลังให้เองทุกครั้งที่เปิด"}
          </span>
        </TabRow>
        <div className="mt-2.5 border-t pt-2.5" style={{ borderColor: "var(--dk-hair)" }}>
          <SearchBox value={q} onChange={search} placeholder="ค้นหาชื่อ · เบอร์โทร · อีเมล · ที่อยู่ · รหัสผู้ติดต่อ…" />
        </div>
        <TabRow divider>
          <FChip on={filter === ""} onClick={() => pick("")} label="ทั้งหมด" count={stats?.total} />
          <FChip on={filter === "phone"} onClick={() => pick("phone")} label="มีเบอร์โทร" count={stats?.withPhone} />
          <FChip on={filter === "point"} onClick={() => pick("point")} label="มีแต้มสะสม" count={stats?.withPoint} />
          <FChip on={filter === "dealer"} onClick={() => pick("dealer")} label="ตัวแทนจำหน่าย" count={stats?.dealers} />
        </TabRow>
      </FilterCard>


      <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2 pt-5">
        <h2 className="dkb-h2 text-[1.06rem]">
          {q.trim() ? `ผลค้นหา “${q.trim()}”` : origin ? ORIGIN_LABEL[origin] : "รายชื่อทุกคน"}
          {total > 0 && (
            <span className="ml-2 text-[12.5px] font-normal" style={{ color: "var(--dk-faint)" }}>
              {fmtN(total)} ราย · หน้า {page}/{fmtN(pages)}
            </span>
          )}
        </h2>
        <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
          แสดง
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="dkb-g px-2 py-1 text-[12.5px] outline-none"
            style={{ color: "var(--dk-navy)" }}
          >
            {[10, 25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          แถว
        </label>
      </div>

      {loading && rows.length === 0 ? (
        <Empty title="กำลังโหลด…" body="ดึงรายชื่อจากเซิร์ฟเวอร์" />
      ) : rows.length === 0 ? (
        <Empty
          title={q.trim() || filter ? "ไม่พบผู้ติดต่อที่ตรงเงื่อนไข" : "ยังไม่มีผู้ติดต่อ"}
          body={q.trim() || filter ? "ลองคำค้นสั้นลง หรือค้นด้วยเบอร์โทรบางส่วน" : "กด นำเข้าจากระบบเดิม เพื่อดึงรายชื่อทั้งหมดจาก backoffice.casedesign2u.com"}
        />
      ) : (
        <div className="dkb-g overflow-x-auto" style={loading ? { opacity: 0.6, transition: "opacity .2s" } : undefined}>
          <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--dk-hair)" }}>
                {COLS.map((c) => {
                  const on = c.key === sort;
                  return (
                    <th key={c.key} className={`px-3 py-3 text-left align-bottom font-semibold ${c.w ?? ""}`} style={{ color: "var(--dk-navy)" }}>
                      {c.sortable ? (
                        <button type="button" onClick={() => sortBy(c.key as SortKey)} className="inline-flex items-center gap-1.5 hover:underline underline-offset-4" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                          {c.label}
                          <span className="inline-flex flex-col leading-none" style={{ color: "var(--dk-faint)" }} aria-hidden>
                            <span className="text-[9px]" style={on && dir === "asc" ? { color: "var(--dk-navy)" } : undefined}>▲</span>
                            <span className="text-[9px]" style={on && dir === "desc" ? { color: "var(--dk-navy)" } : undefined}>▼</span>
                          </span>
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="cursor-pointer align-top transition-colors hover:bg-[rgba(87,182,232,0.08)]"
                  style={{ borderBottom: "1px solid var(--dk-hair)", background: i % 2 ? "rgba(23,58,107,0.025)" : undefined }}
                >
                  <td className="dkb-num-sm px-3 py-3 whitespace-nowrap">{c.id}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-2">
                      {c.picture && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.picture} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      )}
                      <span className="font-medium">{c.name || <span style={{ color: "var(--dk-faint)" }}>(ไม่มีชื่อ)</span>}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {c.memberId && <Tag tone={c.channel === "line" ? "mint" : "sky"}>{c.channel === "line" ? "สมาชิก LINE" : "สมาชิกอีเมล"}</Tag>}
                      {c.origins?.includes("admin-order") && <Tag tone="yolk">แอดมินกรอก</Tag>}
                      {c.origins?.includes("guest-order") && <Tag tone="quiet">สั่งแบบ guest</Tag>}
                      {c.orders?.count ? (
                        <Link href={`/admin/orders/${c.orders.lastId}`} onClick={(e) => e.stopPropagation()} className="dkb-num-sm text-[11.5px] hover:underline" style={{ color: "var(--dk-navy-soft)" }}>
                          🧾 {c.orders.count} ออเดอร์ · ล่าสุด {fmtDate(c.orders.lastAt)}
                        </Link>
                      ) : null}
                    </span>
                    {c.customerType === "dealer" && (
                      <span className="ml-1.5">
                        <Tag tone="lilac">ตัวแทน</Tag>
                      </span>
                    )}
                    {c.note && (
                      <span className="mt-0.5 block truncate text-[12px]" style={{ color: "var(--dk-navy-soft)" }} title={c.note}>
                        📝 {c.note}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="dkb-num inline-block rounded-md px-2 py-0.5 text-[12.5px] font-bold text-white"
                      style={{ background: c.pointActive ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}
                      title={c.pointActive ? "คำนวณคะแนนสะสม" : "ไม่คำนวณคะแนนสะสม"}
                    >
                      {c.point.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <TierPill tiers={tiers} spend={c.point} small />
                  </td>
                  <td className="px-3 py-3">{c.rankStatus || "-"}</td>
                  <td className="px-3 py-3">{c.rankExpiry || "-"}</td>
                  <td className="dkb-num-sm px-3 py-3 whitespace-nowrap">{c.phone ? formatPhone(c.phone) : ""}</td>
                  <td className="px-3 py-3 leading-snug">{c.address}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <IconBtn label="นามบัตร" bg="var(--dk-blue)" onClick={() => setSelected(c)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <circle cx="8.5" cy="11" r="2" />
                          <path d="M5.5 16.5c.7-1.6 1.8-2.4 3-2.4s2.3.8 3 2.4M14 10h4M14 13h4" />
                        </svg>
                      </IconBtn>
                      {canEdit && (
                        <>
                          <IconBtn label="แก้ไข" bg="var(--dk-yolk-deep)" onClick={() => openEdit(c)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </IconBtn>
                          <IconBtn label="ลบ" bg="var(--dk-coral-deep)" onClick={() => void remove(c)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
                            </svg>
                          </IconBtn>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <Btn small disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹ ก่อนหน้า
          </Btn>
          <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
            หน้า <b className="dkb-num">{page}</b> / {fmtN(pages)}
          </span>
          <Btn small disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
            ถัดไป ›
          </Btn>
        </div>
      )}

      {/* ── ลิ้นชักรายละเอียด ── */}
      {selected && !form && (
        <Drawer title={selected.name || "(ไม่มีชื่อ)"} eyebrow={`ผู้ติดต่อ #${selected.id}`} onClose={() => setSelected(null)}>
          <div className="dkb-g px-4 py-1">
            <KV k="เบอร์โทร" v={selected.phone ? <a href={`tel:${selected.phone}`} className="hover:underline">{formatPhone(selected.phone)}</a> : "—"} />
            <KV k="อีเมล" v={selected.email || "—"} />
            <KV k="ที่มา" v={(selected.origins ?? []).map((o) => ORIGIN_LABEL[o]).join(" · ") || "—"} />
            {selected.memberId && <KV k="สมาชิกเว็บ" v={`${selected.channel === "line" ? "LINE" : "อีเมล"} · สมัคร ${fmtDate(selected.memberSince)}`} />}
            {selected.orders?.count ? (
              <KV
                k="ออเดอร์ในระบบนี้"
                v={
                  <Link href={`/admin/orders/${selected.orders.lastId}`} className="hover:underline">
                    {selected.orders.count} ใบ · ล่าสุด #{selected.orders.lastId} {fmtDate(selected.orders.lastAt)}
                  </Link>
                }
              />
            ) : null}
            {selected.orders?.placedBy && <KV k="พนักงานที่กรอก" v={selected.orders.placedBy} />}
            <KV k="ประเภท" v={selected.customerType === "dealer" ? "ตัวแทนจำหน่าย" : selected.customerType === "customer" ? "ลูกค้า" : "—"} />
            <KV k="แต้มสะสม (ระบบเดิม)" v={<span>{fmtN(selected.point ?? 0)} <Tag tone={selected.pointActive ? "mint" : "coral"}>{selected.pointActive ? "คำนวณคะแนน" : "ไม่คำนวณคะแนน"}</Tag></span>} />
            <KV k="ระดับสมาชิก 🏅" v={<TierPill tiers={tiers} spend={selected.point ?? 0} />} />
            {selected.rankStatus && <KV k="สถานะ Rank" v={selected.rankStatus} />}
            {selected.rankExpiry && <KV k="วันหมดอายุ" v={selected.rankExpiry} />}
          </div>
          <div className="dkb-g mt-3 px-4 py-3">
            <p className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
              ที่อยู่
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[0.92rem]">{selected.address || "—"}</p>
          </div>
          <div className="dkb-g mt-3 px-4 py-3">
            <p className="flex items-baseline justify-between text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
              <span>ประวัติการสะสมคะแนน</span>
              {logs && logs.length > 0 && <span>{fmtN(logs.length)} รายการ</span>}
            </p>
            {logs === null ? (
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>กำลังโหลด…</p>
            ) : logs.length === 0 ? (
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>ไม่มีประวัติคะแนน</p>
            ) : (
              <ul className="mt-1.5 max-h-72 divide-y overflow-y-auto text-[12.5px]" style={{ borderColor: "var(--dk-hair)" }}>
                {logs.map((l) => {
                  const minus = /ลบ|หัก|ใช้/.test(l.action);
                  const tone = /Fixed/i.test(l.action) ? "var(--dk-yolk-ink)" : minus ? "var(--dk-coral-ink)" : /หมายเหตุ/.test(l.action) ? "var(--dk-faint)" : "var(--dk-mint-ink)";
                  return (
                    <li key={l.id} className="flex items-start justify-between gap-3 py-1.5" style={{ borderColor: "var(--dk-hair)" }}>
                      <span className="min-w-0">
                        <span className="dkb-num-sm block" style={{ color: "var(--dk-navy-soft)" }}>{l.at.slice(0, 16)}</span>
                        <span className="block font-medium" style={{ color: tone }}>{l.action}{l.orderId ? ` · #${l.orderId}` : ""}</span>
                        {l.note && <span className="block truncate" style={{ color: "var(--dk-faint)" }} title={l.note}>{l.note}</span>}
                      </span>
                      <b className="dkb-num shrink-0" style={{ color: tone }}>{minus ? "−" : "+"}{fmtN(l.point)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected.note && (
            <div className="dkb-g mt-3 px-4 py-3">
              <p className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
                โน้ต
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[0.92rem]">{selected.note}</p>
            </div>
          )}
          <p className="mt-3 px-1 text-[11.5px]" style={{ color: "var(--dk-faint)" }}>
            {selected.source === "admin" ? "เพิ่มในระบบนี้" : "นำเข้าจากระบบเดิม"}
            {selected.importedAt ? ` · นำเข้า ${new Date(selected.importedAt).toLocaleDateString("th-TH")}` : ""}
            {selected.updatedAt ? ` · แก้ล่าสุด ${new Date(selected.updatedAt).toLocaleDateString("th-TH")}${selected.updatedBy ? ` โดย ${selected.updatedBy}` : ""}` : ""}
          </p>
          {canEdit && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Btn small onClick={() => void remove(selected)}>
                ลบ
              </Btn>
              <span className="flex gap-2">
                {selected.phone && (
                  <Btn small onClick={() => void navigator.clipboard?.writeText(selected.phone)}>
                    คัดลอกเบอร์
                  </Btn>
                )}
                <Btn tone="navy" small onClick={() => openEdit(selected)}>
                  แก้ไข
                </Btn>
              </span>
            </div>
          )}
        </Drawer>
      )}

      {/* ── ฟอร์มเพิ่ม/แก้ไข ── */}
      {form && (
        <Drawer title={form.id ? "แก้ไขผู้ติดต่อ" : "เพิ่มผู้ติดต่อ"} eyebrow={form.id ? `#${form.id}` : "รหัสจะต่อเลขจากรายล่าสุดให้เอง"} onClose={() => setForm(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <F label="ชื่อ / ชื่อร้าน">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="เช่น คุณสมชาย / ร้านกาแฟดี" autoFocus />
            </F>
            <F label="เบอร์โทร">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} placeholder="08x-xxx-xxxx" inputMode="tel" />
            </F>
            <F label="ที่อยู่">
              <textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" />
            </F>
            <F label="อีเมล — ไม่บังคับ">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
            </F>
            <div className="mb-2.5 grid grid-cols-3 gap-2">
              {(["", "customer", "dealer"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setForm({ ...form, customerType: t })} aria-pressed={form.customerType === t} className="dkb-tab justify-center">
                  {t === "" ? "ไม่ระบุ" : t === "customer" ? "ลูกค้า" : "ตัวแทน"}
                </button>
              ))}
            </div>
            <F label="แต้มสะสม (ระบบเดิม)">
              <input type="number" min={0} value={form.point} onChange={(e) => setForm({ ...form, point: e.target.value })} className={inputCls} />
            </F>
            <F label="โน้ต — ไม่บังคับ">
              <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={inputCls} placeholder="เช่น ชอบสั่งสติกเกอร์ไดคัท / ติดต่อทาง LINE @xxx" />
            </F>
            {err && (
              <p className="mb-2 text-[12.5px]" style={{ color: "var(--dk-coral-ink)" }}>
                {err}
              </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Btn onClick={() => setForm(null)}>ยกเลิก</Btn>
              <button type="submit" disabled={busy} className="dkb-btn dkb-btn-navy">
                {busy ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </form>
        </Drawer>
      )}

      {dialog}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="status" aria-live="polite">
          <div
            className="pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] text-white shadow-2xl"
            style={{ background: toast.tone === "ok" ? "var(--dk-navy)" : "var(--dk-coral-ink)" }}
          >
            <span aria-hidden>{toast.tone === "ok" ? "✅" : "⚠️"}</span>
            <span className="min-w-0">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
                className="shrink-0 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold"
                style={{ background: "var(--dk-yolk)", color: "var(--dk-navy)" }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="ปิด">
              ✕
            </button>
          </div>
        </div>
      )}
      {importOpen && (
        <ImportDrawer
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setPage(1);
            void load({ stats: true });
          }}
        />
      )}
    </PageShell>
  );
}

/* ── นำเข้าจากระบบเดิม ─────────────────────────────────── */

/**
 * รับข้อมูลได้ 2 ทาง: วาง JSON ลงช่อง หรือเลือกไฟล์ .json
 * (ไฟล์ได้จากสคริปต์ scripts/export-contacts-console.js ที่รันใน Console ของหน้า view-contact ระบบเดิม)
 * ส่งเข้า API ทีละก้อน 2,000 ราย พร้อมแถบความคืบหน้า — 28,000 ราย ≈ 14 ก้อน
 */
function ImportDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [fileText, setFileText] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<{ rows: number; valid: number; sample: Contact[]; points?: { flags: number; history: number; contacts: number } } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; inserted: number; updated: number; skipped: number } | null>(null);
  const [err, setErr] = useState("");

  /** แปลงข้อความเป็นแถว — รับ JSON array หรือ NDJSON */
  function parse(text: string): Record<string, unknown>[] {
    const t = text.trim();
    if (!t) return [];
    if (t.startsWith("[")) return JSON.parse(t);
    return t
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  function check() {
    setErr("");
    setResult(null);
    try {
      const text = fileText?.text ?? taRef.current?.value ?? "";
      const pts = asPoints(text);
      if (pts) {
        setPreview({ rows: pts.flags.length + pts.history.length, valid: pts.flags.length + pts.history.length, sample: [], points: { flags: pts.flags.filter((f) => f.pointActive).length, history: pts.history.length, contacts: new Set(pts.history.map((h) => String(h.contactId))).size } });
        return;
      }
      const raw = parse(text);
      const valid = raw.map((r) => normalizeContact(r)).filter(Boolean) as Contact[];
      if (!raw.length) return setErr("ยังไม่มีข้อมูล — วาง JSON หรือเลือกไฟล์ก่อน");
      setPreview({ rows: raw.length, valid: valid.length, sample: valid.slice(0, 3) });
    } catch {
      setErr("อ่านข้อมูลไม่ออก — ต้องเป็น JSON array เช่น [{\"id\":\"1\",\"name\":\"…\"}]");
      setPreview(null);
    }
  }

  /** ก้อนคะแนน (จาก export-contact-points-console.js): { flags: [...], history: [...] } */
  function asPoints(text: string): { flags: { id: string; pointActive: boolean }[]; history: Record<string, unknown>[] } | null {
    const t = text.trim();
    if (!t.startsWith("{")) return null;
    const o = JSON.parse(t) as { flags?: unknown; history?: unknown };
    if (!Array.isArray(o.flags) && !Array.isArray(o.history)) return null;
    return { flags: (o.flags as { id: string; pointActive: boolean }[]) ?? [], history: (o.history as Record<string, unknown>[]) ?? [] };
  }

  async function runPoints(p: { flags: { id: string; pointActive: boolean }[]; history: Record<string, unknown>[] }) {
    // ส่ง flags ทีละ 2,000 · history จัดกลุ่มตามคน ส่งทีละ ~3,000 แถว (ทั้งชุดของคนเดียวกันต้องอยู่ก้อนเดียว)
    const total = p.flags.length + p.history.length;
    let done = 0;
    const sum = { imported: 0, inserted: 0, updated: 0, skipped: 0 };
    setProgress({ done, total });
    const send = async (body: object) => {
      const res = await fetch("/api/admin/contacts/points", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "นำเข้าไม่สำเร็จ");
      return j as { flagged?: number; contacts?: number; logs?: number };
    };
    try {
      for (let i = 0; i < p.flags.length; i += 2000) {
        const j = await send({ flags: p.flags.slice(i, i + 2000) });
        sum.updated += j.flagged ?? 0;
        done += Math.min(2000, p.flags.length - i);
        setProgress({ done, total });
      }
      const byC = new Map<string, Record<string, unknown>[]>();
      for (const h of p.history) {
        const k = String(h.contactId ?? "");
        if (!byC.has(k)) byC.set(k, []);
        byC.get(k)!.push(h);
      }
      let batch: Record<string, unknown>[] = [];
      const flush = async () => {
        if (!batch.length) return;
        const j = await send({ history: batch });
        sum.imported += j.logs ?? 0;
        sum.inserted += j.contacts ?? 0;
        done += batch.length;
        setProgress({ done, total });
        batch = [];
      };
      for (const list of byC.values()) {
        batch.push(...list);
        if (batch.length >= 3000) await flush();
      }
      await flush();
      setProgress(null);
      setResult(sum);
      onDone();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setProgress(null);
    }
  }

  async function run() {
    setErr("");
    setResult(null);
    let raw: Record<string, unknown>[];
    try {
      const text = fileText?.text ?? taRef.current?.value ?? "";
      const pts = asPoints(text);
      if (pts) return await runPoints(pts);
      raw = parse(text);
    } catch {
      return setErr("อ่านข้อมูลไม่ออก");
    }
    const CHUNK = 2000;
    const sum = { imported: 0, inserted: 0, updated: 0, skipped: 0 };
    setProgress({ done: 0, total: raw.length });
    for (let i = 0; i < raw.length; i += CHUNK) {
      const body = JSON.stringify({ rows: raw.slice(i, i + CHUNK) });
      const send = () => fetch("/api/admin/contacts/import", { method: "POST", headers: { "content-type": "application/json" }, body });
      let res = await send().catch(() => null);
      // เน็ตสะดุดชั่วคราว → ลองซ้ำอีกครั้ง (upsert ซ้ำไม่เป็นไร)
      if (!res || !res.ok) res = await new Promise((r) => setTimeout(r, 1500)).then(send).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (!res || !res.ok) {
        setErr(j.error ?? `นำเข้าชุดที่เริ่ม ${i} ไม่สำเร็จ`);
        setProgress(null);
        return;
      }
      sum.imported += j.imported ?? 0;
      sum.inserted += j.inserted ?? 0;
      sum.updated += j.updated ?? 0;
      sum.skipped += j.skipped ?? 0;
      setProgress({ done: Math.min(raw.length, i + CHUNK), total: raw.length });
    }
    setProgress(null);
    setResult(sum);
    onDone();
  }

  return (
    <Drawer title="นำเข้าจากระบบเดิม" eyebrow="backoffice.casedesign2u.com › ผู้ติดต่อทั้งหมด" onClose={onClose}>
      <div className="dkb-g px-4 py-3 text-[12.5px] leading-relaxed" style={{ color: "var(--dk-navy-soft)" }}>
        <b style={{ color: "var(--dk-navy)" }}>วิธีดึงข้อมูล</b>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>เปิดหน้า ผู้ติดต่อทั้งหมด ในระบบเดิม (ล็อกอินค้างไว้)</li>
          <li>กด ⌥⌘I เปิด Console แล้ววางโค้ดจากไฟล์ <code className="dkb-code">scripts/export-contacts-console.js</code></li>
          <li>รอจนขึ้น “ดึงแล้ว 28,xxx/28,xxx” — ได้ไฟล์ contacts-casedesign2u.json</li>
          <li>เลือกไฟล์นั้นด้านล่าง (หรือวางข้อความ JSON) แล้วกด ตรวจสอบ → นำเข้า</li>
        </ol>
        <p className="mt-1.5">นำเข้าซ้ำได้ — รายที่มีอยู่แล้วจะอัปเดตตามระบบเดิม แต่ โน้ต/อีเมล/ประเภท ที่แก้ในระบบนี้จะไม่ถูกล้าง</p>
        <p className="mt-1.5">
          <b style={{ color: "var(--dk-navy)" }}>คะแนนสะสม:</b> รัน <code className="dkb-code">scripts/export-contact-points-console.js</code> ในหน้าเดียวกัน ได้ไฟล์ contact-points-casedesign2u.json แล้วนำเข้าที่ช่องเดียวกันนี้ (ธงคำนวณคะแนน + ประวัติคะแนนรายคน)
        </p>
      </div>

      <label className="dkb-g mt-3 block px-4 py-3">
        <span className="text-[0.72rem]" style={{ color: "var(--dk-navy-soft)" }}>
          ไฟล์ .json
        </span>
        <input
          type="file"
          accept=".json,.ndjson,application/json"
          className="mt-1 block w-full text-[0.9rem]"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return setFileText(null);
            setFileText({ name: f.name, text: await f.text() });
            setPreview(null);
            setResult(null);
          }}
        />
        {fileText && (
          <span className="mt-1 block text-[12px]" style={{ color: "var(--dk-mint-ink)" }}>
            ✓ {fileText.name} ({Math.round(fileText.text.length / 1024).toLocaleString()} KB)
          </span>
        )}
      </label>

      <label className="dkb-g dkb-field mt-3 block">
        <span className="lb">หรือวางข้อความ JSON ตรงนี้</span>
        <textarea ref={taRef} rows={5} placeholder='[{"id":"28473","name":"…","phone":"…","address":"…","point":"0.00","rank":""}]' spellCheck={false} data-import-json onChange={() => setPreview(null)} />
      </label>

      {preview?.points && (
        <div className="dkb-g mt-3 px-4 py-3 text-[12.5px]">
          <b>ก้อนคะแนนสะสม</b>
          <span className="block" style={{ color: "var(--dk-navy-soft)" }}>
            ติดธง “คำนวณคะแนน” {fmtN(preview.points.flags)} ราย · ประวัติคะแนน {fmtN(preview.points.history)} รายการ ของ {fmtN(preview.points.contacts)} ราย
          </span>
        </div>
      )}
      {preview && !preview.points && (
        <div className="dkb-g mt-3 px-4 py-3 text-[12.5px]">
          <b>พร้อมนำเข้า {fmtN(preview.valid)} ราย</b>
          {preview.rows !== preview.valid && <span style={{ color: "var(--dk-coral-ink)" }}> · ข้าม {fmtN(preview.rows - preview.valid)} แถวที่ไม่มีรหัส</span>}
          <ul className="mt-1.5 space-y-0.5" style={{ color: "var(--dk-navy-soft)" }}>
            {preview.sample.map((c) => (
              <li key={c.id} className="truncate">
                #{c.id} {c.name} · {formatPhone(c.phone) || "ไม่มีเบอร์"} · {c.address.slice(0, 50)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress && (
        <div className="dkb-g mt-3 px-4 py-3">
          <div className="flex justify-between text-[12.5px]">
            <span>กำลังนำเข้า…</span>
            <span className="dkb-num">
              {fmtN(progress.done)}/{fmtN(progress.total)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--dk-hair)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%`, background: "var(--dk-mint)" }} />
          </div>
        </div>
      )}

      {result && (
        <div className="dkb-g mt-3 px-4 py-3 text-[12.5px]" data-import-result>
          {preview?.points ? (
            <>
              <b style={{ color: "var(--dk-mint-ink)" }}>นำเข้าคะแนนเสร็จ ✅</b>
              <span className="block" style={{ color: "var(--dk-navy-soft)" }}>
                ประวัติ {fmtN(result.imported)} รายการ ของ {fmtN(result.inserted)} ราย · เปลี่ยนธงคำนวณคะแนน {fmtN(result.updated)} ราย
              </span>
            </>
          ) : (
            <>
              <b style={{ color: "var(--dk-mint-ink)" }}>นำเข้าเสร็จ ✅ {fmtN(result.imported)} ราย</b>
              <span className="block" style={{ color: "var(--dk-navy-soft)" }}>
                เพิ่มใหม่ {fmtN(result.inserted)} · อัปเดต {fmtN(result.updated)} · ข้าม {fmtN(result.skipped)} (ไม่มีรหัส/ซ้ำ)
              </span>
            </>
          )}
        </div>
      )}

      {err && (
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--dk-coral-ink)" }}>
          {err}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Btn onClick={onClose}>ปิด</Btn>
        <Btn onClick={check} disabled={!!progress}>
          ตรวจสอบ
        </Btn>
        <Btn tone="navy" onClick={() => void run()} disabled={!preview || !!progress}>
          นำเข้า
        </Btn>
      </div>
    </Drawer>
  );
}

/* ── วันที่แบบสั้น ── */

const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : iso;
};

/* ── ชิ้นส่วนย่อยของหน้านี้ ────────────────────────────── */

/** ลิ้นชักด้านขวา — ใช้ทั้งรายละเอียด ฟอร์ม และนำเข้า */
function Drawer({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal>
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0" style={{ background: "rgba(23,58,107,.28)", backdropFilter: "blur(2px)" }} />
      <aside className="relative flex h-full w-full max-w-[460px] flex-col overflow-y-auto px-5 py-5 shadow-2xl" style={{ background: "rgba(255,255,255,0.97)", color: "var(--dk-navy)" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="dkb-eyebrow" style={{ color: "var(--dk-faint)" }}>
                {eyebrow}
              </p>
            )}
            <h2 className="dkb-display mt-0.5 truncate text-[1.35rem] leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="dkb-btn dkb-btn-ghost dkb-btn-sm" aria-label="ปิด">
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** ปุ่มไอคอนสี่เหลี่ยมในคอลัมน์ตัวเลือก — สีเดียวกับระบบเดิม (ฟ้า=ดู · เหลือง=แก้ · ชมพู=ลบ) ให้ทีมคุ้นมือ */
function IconBtn({ label, bg, onClick, children }: { label: string; bg: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-8 w-9 items-center justify-center rounded-md text-white shadow-sm transition-transform hover:-translate-y-px active:translate-y-0 [&>svg]:h-4 [&>svg]:w-4"
      style={{ background: bg }}
    >
      {children}
    </button>
  );
}

const inputCls = "w-full border-0 bg-transparent p-0 text-[0.94rem] outline-none";

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dkb-g dkb-field mb-2.5 block">
      <span className="lb">{label}</span>
      {children}
    </label>
  );
}
