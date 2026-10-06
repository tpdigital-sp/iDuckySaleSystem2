"use client";

/**
 * 🧾 ใบหัก ณ ที่จ่าย /admin/wht — เมนูกลุ่มงานขาย (พนักงานบัญชีขอ 6 ต.ค. 69)
 *
 * ทุกใบกำกับภาษี INV ของเดือน (ดึงจาก FlowAccount Open API อัตโนมัติทุก 5 นาที · หน้าเว็บรีเฟรชเองทุก 1 นาที) + สถานะใบหัก 50 ทวิ
 *   หัก · ยังไม่ส่งใบหัก → ปุ่ม 📣 ทวงทางไลน์ (1 ไลน์หลายใบ = ข้อความเดียวสรุปทุกเลข INV)
 *   หัก · ได้รับใบหักแล้ว (แนบรูป/PDF ได้)
 *   ไม่หัก → ลูกค้าขอหักย้อนหลัง: แนบใบหัก + เลขบัญชีโอนคืน → แนบสลิป = โอนคืนแล้ว
 * ข้อมูล/กติกา: src/lib/wht.ts · เซิร์ฟเวอร์: src/lib/server/wht-db.ts
 */

import RequirePerm from "@/components/RequirePerm";
import { usePolling } from "@/lib/use-polling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { shrinkImageForUpload } from "@/lib/image-shrink";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Row,
  RowMain,
  RowSide,
  Rows,
  SearchBox,
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";
import {
  WHT_STATUS_LABEL,
  canRemind,
  thMonth,
  thShortDate,
  whtAmountOf,
  whtStatusOf,
  type WhtCertView,
  type WhtStatus,
} from "@/lib/wht";

type Filter = "attn" | WhtStatus | "all";

const baht = (n: number) =>
  `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thTime = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && isFinite(d.getTime())
    ? d.toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
};

const TAG: Record<WhtStatus, "coral" | "yolk" | "lilac" | "mint" | "quiet"> = {
  pending: "coral",
  todo: "yolk",
  retro: "lilac",
  received: "mint",
  refunded: "mint",
  none: "quiet",
  void: "quiet",
};
const BAR: Record<WhtStatus, string> = {
  pending: "var(--dk-coral-deep)",
  todo: "var(--dk-yolk)",
  retro: "var(--dk-lilac)",
  received: "var(--dk-mint)",
  refunded: "var(--dk-mint)",
  none: "var(--dk-faint)",
  void: "var(--dk-faint)",
};
/** ใบที่ต้องลงมือ: ยังไม่รู้ว่าหักไหม · หักแล้วยังไม่ได้ใบหัก · หักย้อนหลังที่ยังไม่โอนคืน */
const ATTN: WhtStatus[] = ["todo", "pending", "retro"];
const ORDER: WhtStatus[] = [
  "pending",
  "todo",
  "retro",
  "received",
  "refunded",
  "none",
  "void",
];

function WhtInner() {
  const [certs, setCerts] = useState<WhtCertView[] | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [filter, setFilter] = useState<Filter>("attn");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { confirm, dialog } = useConfirm();
  /** เดือนที่เปิดอยู่ + กำลังทำงานไหม — ให้ตัวรีเฟรชอัตโนมัติอ่านค่าล่าสุดโดยไม่ต้องสร้าง callback ใหม่ */
  const monthRef = useRef("");
  const busyRef = useRef("");
  const [lastSync, setLastSync] = useState<{ at: string; by: string; error?: string } | null>(null);
  /** สำเนาของ kept (ประกาศด้านล่าง) ให้ shown อ่านได้ — แถวที่เพิ่งกดยังค้างในกองเดิม */
  const keptRef = useRef<Map<string, WhtStatus>>(new Map());

  const load = useCallback(async (m?: string) => {
    setLoadErr("");
    try {
      const r = await fetch(`/api/admin/wht${m ? `?month=${m}` : ""}`, {
        cache: "no-store",
      });
      const j = (await r.json().catch(() => null)) as {
        certs?: WhtCertView[];
        months?: string[];
        month?: string;
        needsSetup?: boolean;
        apiReady?: boolean;
        lastSync?: { at: string; by: string; error?: string } | null;
        error?: string;
      } | null;
      if (!r.ok) throw new Error(j?.error ?? `โหลดไม่สำเร็จ (${r.status})`);
      setCerts(j?.certs ?? []);
      setMonths(j?.months ?? []);
      setMonth(j?.month ?? "");
      setNeedsSetup(!!j?.needsSetup);
      setApiReady(!!j?.apiReady);
      setLastSync(j?.lastSync ?? null);
      monthRef.current = j?.month ?? "";
    } catch (e) {
      setLoadErr((e as Error).message);
      setCerts((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    // ลิงก์จากหน้าออเดอร์: /admin/wht?month=2026-10&q=INV007671 → เปิดเดือนนั้น + ค้นเลขใบให้เลย
    const p = new URLSearchParams(window.location.search);
    const m = p.get("month");
    if (p.get("q")) setQ(p.get("q")!);
    void load(m && /^\d{4}-\d{2}$/.test(m) ? m : undefined);
  }, [load]);
  busyRef.current = busy;
  // 🔁 ระบบดึงจาก FlowAccount เองทุก 5 นาที (cron wht-sync) → หน้าเว็บอ่านฐานใหม่ทุก 1 นาที (ไม่ยิง FlowAccount) · ข้ามรอบที่กำลังกดอะไรอยู่
  usePolling(
    () => {
      if (!busyRef.current) void load(monthRef.current || undefined);
    },
    { intervalMs: 60_000 },
  );

  const replace = (list: WhtCertView[]) =>
    setCerts((cur) =>
      (cur ?? []).map((c) => list.find((x) => x.id === c.id) ?? c),
    );

  /** 🔄 ดึงใบกำกับทั้งเดือนจาก FlowAccount API — รู้หัก/ไม่หักจากการรับชำระ ไม่ต้องลากไฟล์ */
  async function syncMonth(m: string) {
    setBusy("sync");
    setMsg(null);
    try {
      const r = await fetch("/api/admin/wht/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month: m }) });
      const j = (await r.json().catch(() => null)) as {
        error?: string;
        total?: number;
        added?: number;
        updated?: number;
        matched?: number;
        wht?: number;
        noWht?: number;
      } | null;
      if (!r.ok) throw new Error(j?.error ?? `ดึงไม่สำเร็จ (${r.status})`);
      setMsg({
        ok: true,
        text: j?.total
          ? `ดึงจาก FlowAccount เดือน${thMonth(m)} ${j.total} ใบ (ใหม่ ${j.added} · อัปเดต ${j.updated}) · ลูกค้าหัก ${j.wht} · ไม่หัก ${j.noWht} (ตามที่บันทึกรับชำระ) · จับคู่ใบงานได้ ${j.matched}`
          : `FlowAccount ยังไม่มีใบกำกับภาษีเดือน${thMonth(m)}`,
      });
      await load(m);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/wht", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const j = (await r.json().catch(() => null)) as {
        cert?: WhtCertView;
        error?: string;
      } | null;
      if (!r.ok || !j?.cert)
        throw new Error(j?.error ?? `บันทึกไม่สำเร็จ (${r.status})`);
      replace([j.cert]);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: `${id}: ${(e as Error).message}` });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function attach(id: string, kind: "cert" | "slip", f: File) {
    setBusy(id);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("kind", kind);
      fd.append(
        "file",
        f.type.startsWith("image/") ? await shrinkImageForUpload(f) : f,
      );
      const r = await fetch("/api/admin/wht/file", {
        method: "POST",
        body: fd,
      });
      const j = (await r.json().catch(() => null)) as {
        cert?: WhtCertView;
        error?: string;
      } | null;
      if (!r.ok || !j?.cert)
        throw new Error(j?.error ?? `แนบไฟล์ไม่สำเร็จ (${r.status})`);
      replace([j.cert]);
    } catch (e) {
      setMsg({ ok: false, text: `${id}: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function remind(ids: string[]) {
    const list = (certs ?? []).filter(
      (c) => ids.includes(c.id) && canRemind(c),
    );
    if (!list.length) return;
    // รวมตามลูกค้า (groupKey) — 1 กลุ่ม = 1 ข้อความไลน์
    const byGroup = new Map<string, { company: string; ids: string[]; sum: number }>();
    for (const c of list) {
      const k = c.groupKey ?? c.id;
      const g = byGroup.get(k) ?? { company: c.company, ids: [], sum: 0 };
      g.ids.push(c.id);
      g.sum += whtAmountOf(c);
      byGroup.set(k, g);
    }
    const groups = [...byGroup.values()];
    const total = groups.reduce((s, g) => s + g.sum, 0);
    const recent = list.filter((c) => {
      const last = c.reminders?.filter((x) => x.ok).at(-1);
      return last && Date.now() - new Date(last.at).getTime() < 24 * 3600_000;
    });
    const MAX = 6;
    const lines = groups
      .slice(0, MAX)
      .map(
        (g) =>
          `• ${g.company || "(ไม่มีชื่อลูกค้า)"} — ${g.ids.length} ใบ · ${baht(g.sum)}`,
      );
    if (groups.length > MAX) lines.push(`…และอีก ${groups.length - MAX} ลูกค้า`);
    const ok = await confirm({
      icon: recent.length ? "⚠️" : "💬",
      title: `ส่งไลน์ทวงใบหัก ${list.length} ใบ?`,
      detail: [
        `จะส่ง ${groups.length} ข้อความ (ลูกค้าเดียวกันรวมเป็นข้อความเดียว) · ยอดหักรวม ${baht(total)}`,
        "",
        ...lines,
        ...(recent.length
          ? [
              "",
              `⚠️ ${recent.length} ใบเพิ่งทวงไปภายใน 24 ชม.: ${recent.map((c) => c.id).join(", ")}`,
            ]
          : []),
      ].join("\n"),
      confirmLabel: `ส่งไลน์ ${groups.length} ข้อความ`,
    });
    if (!ok) return;
    setBusy("remind");
    setMsg(null);
    try {
      const r = await fetch("/api/admin/wht/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: list.map((c) => c.id) }),
      });
      const j = (await r.json().catch(() => null)) as {
        sent?: number;
        sentTo?: string[];
        failed?: { ids: string[]; reason: string }[];
        certs?: WhtCertView[];
        error?: string;
      } | null;
      if (!r.ok) throw new Error(j?.error ?? `ส่งไม่สำเร็จ (${r.status})`);
      replace(j?.certs ?? []);
      setSel(new Set());
      const f = j?.failed ?? [];
      setMsg({
        ok: !f.length,
        text: `ส่งทวงแล้ว ${j?.sent ?? 0} ข้อความ${j?.sentTo?.length ? ` ถึง LINE ${j.sentTo.map((n) => `"${n}"`).join(", ")}` : ""} (ข้อความที่ระบบส่งจะไม่ขึ้นในห้องแชท LINE OA Manager — ดูประวัติในใบงานได้)${f.length ? ` · ส่งไม่ได้ ${f.length} รายการ: ${f.map((x) => `${x.ids.join(",")} (${x.reason})`).join(" · ")}` : ""}`,
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  /** "· อัปเดตอัตโนมัติ · ล่าสุด 11:40 (3 นาทีที่แล้ว)" — ให้รู้ว่าข้อมูลสดแค่ไหน */
  const syncNote = (() => {
    if (!apiReady) return "";
    if (lastSync?.error) return ` · ⚠️ ดึงล่าสุดไม่สำเร็จ: ${lastSync.error.slice(25, 120)}`;
    if (!lastSync?.at) return " · อัปเดตจาก FlowAccount อัตโนมัติทุก 5 นาที";
    const mins = Math.max(0, Math.round((Date.now() - new Date(lastSync.at).getTime()) / 60_000));
    return ` · อัปเดตอัตโนมัติทุก 5 นาที · ล่าสุด ${thTime(lastSync.at)} (${mins < 1 ? "เมื่อสักครู่" : `${mins} นาทีที่แล้ว`})`;
  })();

  /** เดือนที่มีข้อมูลแล้ว + 6 เดือนล่าสุด (ดึงจาก FlowAccount ได้ทั้งที่ยังไม่เคยดึง) */
  const monthOptions = useMemo(() => {
    const set = new Set(months);
    if (apiReady) {
      const d = new Date();
      for (let i = 0; i < 6; i++) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        set.add(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
      }
    }
    if (month) set.add(month);
    return [...set].sort().reverse();
  }, [months, apiReady, month]);

  const all = useMemo(() => certs ?? [], [certs]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<
      WhtStatus,
      number
    >;
    for (const x of all) c[whtStatusOf(x)]++;
    return c;
  }, [all]);
  const pendingList = all.filter((c) => whtStatusOf(c) === "pending");
  const pendingSum = pendingList.reduce((s, c) => s + whtAmountOf(c), 0);
  const remindable = pendingList.filter(canRemind);
  const retroDue = all
    .filter((c) => whtStatusOf(c) === "retro")
    .reduce((s, c) => s + (c.retro?.amount ?? 0), 0);
  const whtTotal = counts.pending + counts.received;
  const groupSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of pendingList)
      if (c.groupKey) m.set(c.groupKey, (m.get(c.groupKey) ?? 0) + 1);
    return m;
  }, [pendingList]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = all;
    if (needle)
      list = list.filter((c) =>
        [c.id, c.company, c.taxId, c.refDoc, c.depositRef, ...c.orderIds].some(
          (v) => (v ?? "").toLowerCase().includes(needle),
        ),
      );
    else if (filter === "attn")
      list = list.filter((c) => ATTN.includes(whtStatusOf(c)) || keptRef.current.has(c.id));
    else if (filter !== "all")
      list = list.filter((c) => whtStatusOf(c) === filter || keptRef.current.has(c.id));
    // ลูกค้าเดียวกันติดกัน (ทวงทีเดียวหลายใบ) · ภายในกลุ่มสถานะ: ใบเก่าก่อน (ค้างนานกว่า)
    return [...list].sort(
      (a, b) =>
        ORDER.indexOf(whtStatusOf(a)) - ORDER.indexOf(whtStatusOf(b)) ||
        (a.groupKey ?? "").localeCompare(b.groupKey ?? "") ||
        a.id.localeCompare(b.id),
    );
  }, [all, needle, filter]);
  /** แถวที่เพิ่งกดเปลี่ยนสถานะ — ค้างไว้ในกองเดิมจนกว่าจะเปลี่ยนชิป/เดือน/คำค้น (กดผิดจะได้เห็นแล้วกดเลิกทำทัน) */
  const [kept, setKept] = useState<Map<string, WhtStatus>>(new Map());
  useEffect(() => setKept(new Map()), [filter, month, needle]);
  keptRef.current = kept;
  /** จำสถานะก่อนกด (ใบละครั้งแรก) — ปุ่ม ↩ เลิกทำ ย้อนกลับไปสถานะนี้ */
  const keep = (ids: string[]) =>
    setKept((m) => {
      const n = new Map(m);
      for (const id of ids) {
        const c = all.find((x) => x.id === id);
        if (c && !n.has(id)) n.set(id, whtStatusOf(c));
      }
      return n;
    });

  /** แก้หลายใบพร้อมกัน (ทีละ 4 คำขอ) — ใช้กับปุ่มในแถบเลือกหลายใบ */
  async function patchMany(ids: string[], body: Record<string, unknown>, label: string) {
    if (!ids.length) return;
    setBusy("bulk");
    setMsg(null);
    keep(ids);
    const done: WhtCertView[] = [];
    const fail: string[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(
        ids.slice(i, i + 4).map(async (id) => {
          const r = await fetch("/api/admin/wht", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }).catch(() => null);
          const j = (await r?.json().catch(() => null)) as { cert?: WhtCertView } | null;
          if (r?.ok && j?.cert) done.push(j.cert);
          else fail.push(id);
        })
      );
    }
    replace(done);
    setSel(new Set());
    setBusy("");
    setMsg({ ok: !fail.length, text: `${label} ${done.length} ใบ${fail.length ? ` · ไม่สำเร็จ ${fail.join(", ")}` : ""}` });
  }

  const quick = (c: WhtCertView, body: Record<string, unknown>) => {
    keep([c.id]);
    void patch(c.id, body);
  };

  const rowFile = useRef<HTMLInputElement>(null);
  const [rowFileId, setRowFileId] = useState("");

  const selectable = (c: WhtCertView) => ["pending", "todo"].includes(whtStatusOf(c));
  const selected = shown.filter((c) => sel.has(c.id));
  const selPending = selected.filter((c) => whtStatusOf(c) === "pending");
  const selRemindable = selected.filter(canRemind);
  const selTodo = selected.filter((c) => whtStatusOf(c) === "todo");

  function rowOf(c: WhtCertView) {
    const st = whtStatusOf(c);
    const amt = whtAmountOf(c);
    const last = c.reminders?.at(-1);
    const same = c.groupKey ? (groupSize.get(c.groupKey) ?? 0) : 0;
    const open = openId === c.id;
    const rowBusy = busy === c.id || busy === "bulk";
    const before = kept.get(c.id);
    const justDone = !!before && before !== st;
    return (
      <div key={c.id}>
        <Row tone={BAR[st]} done={!ATTN.includes(st)}>
          <span className="flex min-w-0 items-start gap-1" style={{ gridArea: "main" }}>
            {selectable(c) ? (
              <label className="grid h-11 w-9 shrink-0 cursor-pointer place-items-center" title="เลือกหลายใบแล้วทำพร้อมกันที่แถบด้านล่าง">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={sel.has(c.id)}
                  onChange={(e) =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(c.id);
                      else n.delete(c.id);
                      return n;
                    })
                  }
                />
              </label>
            ) : (
              <span className="w-9 shrink-0" />
            )}
            <button type="button" onClick={() => setOpenId(open ? null : c.id)} className="min-w-0 flex-1 text-left" aria-expanded={open} title="กดดูรายละเอียด / แก้ไขเพิ่มเติม">
              <RowMain
                name={c.company || "ไม่ระบุชื่อ"}
                tags={
                  <>
                    <Tag tone={TAG[st]}>{WHT_STATUS_LABEL[st]}</Tag>
                    {st === "todo" && c.hintWht && (
                      <Tag tone="coral" title="ใบงานอื่นของลูกค้าเดียวกัน (เลขผู้เสียภาษี/ชื่อ) เคยหัก ณ ที่จ่าย — น่าจะหักใบนี้ด้วย">
                        ใบก่อนๆ ลูกค้านี้เคยหัก
                      </Tag>
                    )}
                    {st === "pending" && same > 1 && (
                      <Tag tone="sky" title="ไลน์ลูกค้าเดียวกัน — ทวงทีเดียวได้ข้อความเดียว">
                        ลูกค้าเดียวกัน {same} ใบ
                      </Tag>
                    )}
                  </>
                }
                meta={
                  <>
                    <span>
                      <b className="font-semibold tabular-nums">{c.id}</b> · {thShortDate(c.date)}
                      {c.refDoc ? ` · อ้าง ${c.refDoc}` : ""}
                      {c.orderIds.length ? ` · ${c.orderIds.join(", ")}` : " · ไม่มีใบงานในระบบ"}
                    </span>
                    {c.lineTo ? (
                      <LineChip to={c.lineTo} />
                    ) : (
                      st === "pending" && (
                        <Tag tone="quiet" title={c.lineOrderId ? `ผูก LINE ที่หน้าออเดอร์ ${c.lineOrderId} แล้วกลับมาทวงได้เลย` : "ไม่มีใบงานในระบบ — ผูกใบงานเองในรายละเอียด"}>
                          {c.lineOrderId ? `ยังไม่มีไลน์ · ผูกที่ ${c.lineOrderId}` : "ยังไม่มีไลน์"}
                        </Tag>
                      )
                    )}
                    {last && (
                      <span style={{ color: last.ok ? "var(--dk-navy-soft)" : "var(--dk-coral-ink)" }}>
                        📣 ทวง {c.reminders!.length} ครั้ง · ล่าสุด {thTime(last.at)}
                        {last.ok ? "" : " (ไม่สำเร็จ)"}
                      </span>
                    )}
                    {c.certFiles?.length ? <span>📎 ใบหัก {c.certFiles.length} ไฟล์</span> : null}
                    {c.faWht?.sure && st !== "void" && (
                      <span title="หัก/ไม่หัก ตามที่บันทึกรับชำระใน FlowAccount" style={{ color: "var(--dk-mint-ink)" }}>
                        ✓ {c.faWht.amount > 0 ? `หัก ${c.faWht.rate}%` : "ไม่หัก"} ตาม FlowAccount
                      </span>
                    )}
                  </>
                }
              />
            </button>
          </span>
          <RowSide>
            <span className="text-right">
              <span className="block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                ยอด {baht(c.total)}
              </span>
              {st === "retro" || st === "refunded" ? (
                <span className="dkb-num block text-[15px] font-bold" style={{ color: "var(--dk-lilac-ink)" }}>
                  คืน {baht(c.retro!.amount)}
                </span>
              ) : (
                <span className="dkb-num block text-[15px] font-bold" style={st === "pending" ? { color: "var(--dk-coral-ink)" } : undefined}>
                  {st === "none" || st === "void" ? "—" : st === "todo" ? <span style={{ color: "var(--dk-faint)" }}>ถ้าหัก {baht(amt)}</span> : `หัก ${baht(amt)}`}
                </span>
              )}
            </span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {justDone && (
                <Btn
                  small
                  disabled={rowBusy}
                  title="กดผิด — ย้อนกลับเป็นสถานะเดิม"
                  onClick={() => void patch(c.id, before === "todo" ? { mode: null, received: false } : { received: false })}
                >
                  ↩ เลิกทำ
                </Btn>
              )}
              {st === "todo" && (
                <>
                  <span className="w-full text-right text-[11.5px]" style={{ color: "var(--dk-yolk-ink)" }}>
                    ลูกค้าหักไหม?
                  </span>
                  <Btn small tone="navy" disabled={rowBusy} onClick={() => quick(c, { mode: "wht" })} title={`ลูกค้าโอนมาขาด 3% — ต้องตามใบหัก${c.lineTo ? " · เลือกแล้วปุ่ม 📣 ทวง จะขึ้น" : ""}`}>
                    หัก {c.rate}%
                  </Btn>
                  <Btn small disabled={rowBusy} onClick={() => quick(c, { mode: "none" })} title="ลูกค้าโอนเต็มยอด ไม่ต้องตามใบหัก">
                    ไม่หัก
                  </Btn>
                </>
              )}
              {st === "pending" && (
                <>
                  <Btn small disabled={rowBusy} onClick={() => quick(c, { received: true })} title="กดเมื่อลูกค้าส่งใบหักมาแล้ว — สถานะจะเปลี่ยนเป็น “ได้รับใบหักแล้ว”">
                    บันทึกว่าได้รับใบหัก
                  </Btn>
                  <Btn
                    small
                    disabled={rowBusy}
                    title="แนบรูป/PDF ใบหัก — แนบแล้วติ๊กได้รับให้เอง"
                    onClick={() => {
                      setRowFileId(c.id);
                      rowFile.current?.click();
                    }}
                  >
                    📎 แนบใบหัก
                  </Btn>
                  {canRemind(c) && (
                    <Btn small tone="navy" disabled={!!busy} onClick={() => void remind([c.id])}>
                      📣 ทวง
                    </Btn>
                  )}
                </>
              )}
              {st === "none" && !justDone && (
                <Btn small disabled={rowBusy} onClick={() => setOpenId(c.id)} title="ลูกค้าขอหักย้อนหลัง → แนบใบหัก + เลขบัญชีโอนคืน">
                  ↩ หักย้อนหลัง
                </Btn>
              )}
              {st === "retro" && (
                <Btn small tone="yolk" disabled={rowBusy} onClick={() => setOpenId(c.id)}>
                  💸 โอนคืน / แนบสลิป
                </Btn>
              )}
            </span>
          </RowSide>
        </Row>
        {open && <Detail c={c} busy={busy === c.id} patch={patch} attach={attach} />}
      </div>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="งานขาย"
        title="ใบหัก ณ ที่จ่าย"
        count={all.length ? `${all.length} ใบ` : undefined}
        sub={
          month
            ? `ใบกำกับภาษี FlowAccount เดือน${thMonth(month)}${syncNote}`
            : apiReady
              ? `ดึงจาก FlowAccount อัตโนมัติทุก 5 นาที${syncNote}`
              : "ยังไม่ได้ใส่รหัส FlowAccount"
        }
        tools={
          <>
            {monthOptions.length > 0 && (
              <select
                value={month}
                onChange={(e) => {
                  setSel(new Set());
                  setOpenId(null);
                  // ล้างรายการเดิมทันที → ขึ้น "กำลังโหลด…" แทนการค้างเดือนเก่าไว้จนดูเหมือนกดไม่ติด
                  setCerts(null);
                  setMonth(e.target.value);
                  void load(e.target.value);
                }}
                className="h-11 rounded-full border border-slate-200 bg-white px-4 text-[14px]"
                aria-label="เลือกเดือน"
              >
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {thMonth(m)}
                    {months.includes(m) ? "" : " (ยังไม่ได้ดึง)"}
                  </option>
                ))}
              </select>
            )}
            {apiReady && (
              <Btn
                tone="yolk"
                disabled={!!busy}
                onClick={() => {
                  const m = month || monthOptions[0];
                  if (m) void syncMonth(m);
                }}
                title="ระบบดึงเองทุก 5 นาทีอยู่แล้ว — กดเมื่อเพิ่งออกใบ/บันทึกรับเงินใน FlowAccount แล้วอยากเห็นทันที"
              >
                {busy === "sync" ? "กำลังดึง…" : "🔄 ดึงตอนนี้"}
              </Btn>
            )}
          </>
        }
      />

      {needsSetup && (
        <div
          className="dkb-g mt-4 p-4 text-[14px]"
          style={{ borderLeft: "4px solid var(--dk-coral-deep)" }}
        >
          <b>ยังไม่ได้สร้างตารางในฐานข้อมูล</b> — เปิด Supabase → SQL Editor
          แล้วรันไฟล์ <code>supabase/wht-certs.sql</code> ครั้งเดียว
        </div>
      )}
      {loadErr && (
        <div
          className="dkb-g mt-4 p-4 text-[14px]"
          style={{ color: "var(--dk-coral-ink)" }}
        >
          โหลดข้อมูลไม่สำเร็จ: {loadErr} —{" "}
          <button className="underline" onClick={() => void load(month)}>
            ลองใหม่
          </button>
        </div>
      )}
      {msg && (
        <div
          className="dkb-g mt-4 p-3 text-[14px]"
          style={{
            color: msg.ok ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)",
          }}
          role="status"
        >
          {msg.text}
        </div>
      )}

      {all.length > 0 && (
        <Stats cols={4}>
          <HeroStat
            n={counts.pending}
            label="ยังไม่ส่งใบหัก"
            detail={`หักรวม ${baht(pendingSum)} · ทวงไลน์ได้ ${remindable.length} ใบ`}
            pct={whtTotal ? (counts.received / whtTotal) * 100 : 0}
            onClick={() => setFilter("pending")}
            active={filter === "pending"}
          />
          <Stat
            label="ได้รับใบหักแล้ว"
            value={`${counts.received}/${whtTotal}`}
            hint="ของใบที่ลูกค้าหัก"
            onClick={() => setFilter("received")}
            active={filter === "received"}
          />
          <Stat
            label="ยังไม่ระบุ หัก/ไม่หัก"
            value={counts.todo}
            hint="ไม่มีใบงานในระบบ — เลือกเอง"
            tone={counts.todo ? "due" : undefined}
            onClick={() => setFilter("todo")}
            active={filter === "todo"}
          />
          <Stat
            label="หักย้อนหลัง รอโอนคืน"
            value={counts.retro}
            hint={
              counts.retro
                ? `ต้องโอนคืน ${baht(retroDue)}`
                : `โอนคืนแล้ว ${counts.refunded} ใบ`
            }
            onClick={() => setFilter("retro")}
            active={filter === "retro"}
          />
        </Stats>
      )}

      {all.length > 0 && (
        <FilterCard>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="ค้นหาชื่อบริษัท · เลข INV / QT / OD · เลขผู้เสียภาษี"
          />
          <TabRow divider>
            <FChip
              on={filter === "attn"}
              onClick={() => setFilter("attn")}
              label="ต้องจัดการ"
              count={counts.todo + counts.pending + counts.retro}
            />
            {ORDER.map((s) => (
              <FChip
                key={s}
                on={filter === s}
                onClick={() => setFilter(s)}
                label={WHT_STATUS_LABEL[s]}
                count={counts[s]}
                tone={TAG[s]}
              />
            ))}
            <FChip
              on={filter === "all"}
              onClick={() => setFilter("all")}
              label="ทั้งหมด"
              count={all.length}
            />
          </TabRow>
        </FilterCard>
      )}

      {certs === null ? (
        <div className="mt-6">
          <Empty title="กำลังโหลด…" body={month ? `ใบกำกับภาษีเดือน${thMonth(month)}` : "ใบกำกับภาษีเดือนล่าสุด"} />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-6">
          <Empty
            title="ยังไม่มีใบกำกับภาษี"
            body={
              apiReady
                ? `ยังไม่มีใบกำกับภาษีเดือน${month ? thMonth(month) : "นี้"} ใน FlowAccount — ระบบดึงให้เองทุก 5 นาที หรือกด "🔄 ดึงตอนนี้"`
                : "ยังไม่ได้ใส่รหัส FlowAccount Open API — แจ้งผู้ดูแลระบบ"
            }
          />
        </div>
      ) : (
        <section>
          <ListHead
            title={
              needle
                ? `ผลค้นหา "${q.trim()}"`
                : filter === "attn"
                  ? "ต้องจัดการ"
                  : filter === "all"
                    ? "ทั้งหมด"
                    : WHT_STATUS_LABEL[filter]
            }
            note={
              <>
                {shown.length} ใบ
                {shown.some(selectable) && (
                  <>
                    {" · "}
                    <button
                      className="underline"
                      onClick={() => setSel(new Set(shown.filter(selectable).map((c) => c.id)))}
                    >
                      เลือกทั้งหมดในกองนี้
                    </button>
                  </>
                )}
              </>
            }
          />
          {shown.length ? (
            <Rows>{shown.map(rowOf)}</Rows>
          ) : (
            <Empty
              title="ไม่มีใบในกองนี้"
              body={
                filter === "attn"
                  ? "เคลียร์ครบแล้ว 🎉 — ดูใบทั้งหมดได้ที่ชิป “ทั้งหมด”"
                  : "ลองเลือกชิปอื่น หรือล้างคำค้น"
              }
            />
          )}
        </section>
      )}
      {selected.length > 0 && (
        <div
          className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-lg"
          style={{ background: "var(--dk-navy)" }}
        >
          <span className="text-[14px]">
            เลือก {selected.length} ใบ · {new Set(selected.map((c) => c.groupKey ?? c.id)).size} ลูกค้า
          </span>
          <span className="flex flex-wrap gap-2">
            <Btn small onClick={() => setSel(new Set())}>
              ล้าง
            </Btn>
            {selTodo.length > 0 && (
              <>
                <Btn small disabled={!!busy} onClick={() => void patchMany(selTodo.map((c) => c.id), { mode: "none" }, "ตั้งไม่หักแล้ว")}>
                  ไม่หัก ({selTodo.length})
                </Btn>
                <Btn small tone="yolk" disabled={!!busy} onClick={() => void patchMany(selTodo.map((c) => c.id), { mode: "wht" }, "ตั้งหัก ณ ที่จ่ายแล้ว")}>
                  หัก 3% ({selTodo.length})
                </Btn>
              </>
            )}
            {selPending.length > 0 && (
              <Btn small tone="yolk" disabled={!!busy} onClick={() => void patchMany(selPending.map((c) => c.id), { received: true }, "ติ๊กได้รับใบหักแล้ว")}>
                บันทึกว่าได้รับใบหัก ({selPending.length})
              </Btn>
            )}
            {selRemindable.length > 0 && (
              <Btn small tone="yolk" disabled={!!busy} onClick={() => void remind(selRemindable.map((c) => c.id))}>
                {busy === "remind" ? "กำลังส่ง…" : `📣 ทวง (${selRemindable.length})`}
              </Btn>
            )}
          </span>
        </div>
      )}

      <input
        ref={rowFile}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && rowFileId) {
            keep([rowFileId]);
            void attach(rowFileId, "cert", f);
          }
          e.target.value = "";
        }}
      />
      {dialog}
    </PageShell>
  );
}

/** แผงรายละเอียดใต้แถว — หัก/ไม่หัก · ใบหัก · หักย้อนหลัง · ผูกออเดอร์ · ประวัติทวง */
function Detail({
  c,
  busy,
  patch,
  attach,
}: {
  c: WhtCertView;
  busy: boolean;
  patch: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  attach: (id: string, kind: "cert" | "slip", f: File) => Promise<void>;
}) {
  const st = whtStatusOf(c);
  const amt = whtAmountOf(c);
  const [retroOpen, setRetroOpen] = useState(!!c.retro);
  const [rf, setRf] = useState({
    amount: String(c.retro?.amount ?? amt),
    bank: c.retro?.bank ?? "",
    account: c.retro?.account ?? "",
    accountName: c.retro?.accountName ?? c.company,
  });
  const [orderId, setOrderId] = useState("");
  const [note, setNote] = useState(c.note ?? "");
  const certInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();
  const slipInput = useRef<HTMLInputElement>(null);

  const files = (paths?: string[]) =>
    (paths ?? []).map((p, i) => (
      <span
        key={p}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px]"
      >
        {c.files?.[p] ? (
          <a
            href={c.files[p]}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {p.endsWith(".pdf") ? "📄" : "🖼"} ไฟล์ {i + 1}
          </a>
        ) : (
          `ไฟล์ ${i + 1}`
        )}
        <button
          type="button"
          className="ml-1 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100"
          title="ลบไฟล์"
          disabled={busy}
          onClick={async () => {
            if (
              await confirm({
                icon: "🗑",
                title: "ลบไฟล์นี้?",
                detail: `ไฟล์ ${i + 1} ของใบ ${c.id} จะถูกลบออก`,
                confirmLabel: "ลบไฟล์",
                danger: true,
              })
            )
              void patch(c.id, { removeFile: p });
          }}
        >
          ✕
        </button>
      </span>
    ));
  const input =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px]";
  const label = "mb-1 block text-[12px]";

  return (
    <div
      className="dkb-g -mt-1 mb-2 space-y-4 p-4 text-[14px]"
      style={{
        borderTop: "1px dashed var(--dk-hair)",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        <KV k="มูลค่าก่อน VAT" v={baht(c.base)} />
        <KV k="VAT" v={baht(c.vat)} />
        <KV k="ยอดรวม" v={baht(c.total)} />
        <KV
          k={`หัก ณ ที่จ่าย ${c.rate}%`}
          v={`${baht(amt)} → โอนจริง ${baht(c.total - amt)}`}
        />
        <KV
          k="เลขผู้เสียภาษี"
          v={`${c.taxId ?? "—"}${c.branch ? ` (${c.branch})` : ""}`}
        />
        <KV k="สถานะใน FlowAccount" v={c.faStatus ?? "—"} />
        <KV
          k="ใบกำกับภาษี/ใบเสร็จรับเงิน"
          v={
            <>
              <a
                href={`/api/admin/wht/doc?id=${encodeURIComponent(c.id)}`}
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-4"
                style={{ color: "var(--dk-blue-deep)" }}
                title="เปิดเอกสารใน FlowAccount (แท็บใหม่)"
              >
                {c.id} ↗
              </a>
              {(c.refDoc || c.depositRef) && (
                <span className="block text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  อ้างอิง {[c.refDoc, c.depositRef && `มัดจำ ${c.depositRef}`].filter(Boolean).join(" · ")}
                </span>
              )}
            </>
          }
        />
        <KV
          k="ใบงานในระบบ"
          v={
            c.orderIds.length ? (
              <>
                {c.orderIds.map((id) => (
                  <Link
                    key={id}
                    href={`/admin/orders/${encodeURIComponent(id)}`}
                    className="mr-2 underline"
                  >
                    {id}
                  </Link>
                ))}
                {c.matchedBy && c.matchedBy !== "ref" && (
                  <span style={{ color: "var(--dk-faint)" }}>
                    (
                    {c.matchedBy === "manual"
                      ? "ผูกเอง"
                      : c.matchedBy === "taxId"
                        ? "เดาจากเลขผู้เสียภาษี+ยอด"
                        : "เดาจากชื่อ+ยอด"}
                    )
                  </span>
                )}
              </>
            ) : (
              "ไม่พบ"
            )
          }
        />
      </div>

      {/* หัก / ไม่หัก */}
      {!c.retro && st !== "void" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-semibold">ลูกค้า:</span>
          <Btn
            small
            tone={c.mode === "wht" ? "navy" : "ghost"}
            disabled={busy}
            onClick={() => void patch(c.id, { mode: "wht" })}
          >
            หัก ณ ที่จ่าย {c.rate}%
          </Btn>
          <Btn
            small
            tone={c.mode === "none" ? "navy" : "ghost"}
            disabled={busy}
            onClick={() => void patch(c.id, { mode: "none", received: false })}
          >
            ไม่หัก
          </Btn>
          {c.modeBy && (
            <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
              ตั้งโดย {c.modeBy}
            </span>
          )}
        </div>
      )}

      {/* ใบหัก (กรณีหักตอนจ่าย) */}
      {c.mode === "wht" && !c.retro && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={!!c.received}
              disabled={busy}
              onChange={(e) => void patch(c.id, { received: e.target.checked })}
            />
            ได้รับใบหักแล้ว
          </label>
          {c.received && (
            <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
              {c.received.by} · {thTime(c.received.at)}
            </span>
          )}
          {files(c.certFiles)}
          <input
            ref={certInput}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] &&
              void attach(c.id, "cert", e.target.files[0])
            }
          />
          <Btn small disabled={busy} onClick={() => certInput.current?.click()}>
            📎 แนบใบหัก
          </Btn>
        </div>
      )}

      {/* หักย้อนหลัง */}
      {(c.mode === "none" || c.retro) && st !== "void" && (
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--dk-lilac-wash)" }}
        >
          {!retroOpen ? (
            <Btn small disabled={busy} onClick={() => setRetroOpen(true)}>
              ↩ ลูกค้าขอหักย้อนหลัง
            </Btn>
          ) : (
            <div className="space-y-3">
              <p
                className="font-semibold"
                style={{ color: "var(--dk-lilac-ink)" }}
              >
                หักย้อนหลัง — ร้านโอนคืนส่วนต่างให้ลูกค้า
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <label>
                  <span className={label}>ยอดโอนคืน (บาท)</span>
                  <input
                    className={input}
                    inputMode="decimal"
                    value={rf.amount}
                    onChange={(e) => setRf({ ...rf, amount: e.target.value })}
                  />
                </label>
                <label>
                  <span className={label}>ธนาคาร</span>
                  <input
                    className={input}
                    value={rf.bank}
                    onChange={(e) => setRf({ ...rf, bank: e.target.value })}
                    placeholder="เช่น กสิกรไทย"
                  />
                </label>
                <label>
                  <span className={label}>เลขที่บัญชี</span>
                  <input
                    className={input}
                    inputMode="numeric"
                    value={rf.account}
                    onChange={(e) => setRf({ ...rf, account: e.target.value })}
                  />
                </label>
                <label>
                  <span className={label}>ชื่อบัญชี</span>
                  <input
                    className={input}
                    value={rf.accountName}
                    onChange={(e) =>
                      setRf({ ...rf, accountName: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Btn
                  small
                  tone="navy"
                  disabled={busy}
                  onClick={() =>
                    void patch(c.id, {
                      retro: { ...rf, amount: Number(rf.amount) },
                    })
                  }
                >
                  {c.retro ? "บันทึกข้อมูลโอนคืน" : "ตั้งหักย้อนหลัง"}
                </Btn>
                {c.retro && !c.retro.refundedAt && (
                  <Btn
                    small
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm({
                          icon: "↩️",
                          title: "ยกเลิกหักย้อนหลังของใบนี้?",
                          detail: `ข้อมูลโอนคืน ${baht(c.retro!.amount)} ของใบ ${c.id} จะถูกล้าง`,
                          confirmLabel: "ยกเลิกหักย้อนหลัง",
                          danger: true,
                        })
                      )
                        void patch(c.id, { retro: null }).then(
                          (ok) => ok && setRetroOpen(false),
                        );
                    }}
                  >
                    ยกเลิกหักย้อนหลัง
                  </Btn>
                )}
                {!c.retro && (
                  <Btn
                    small
                    disabled={busy}
                    onClick={() => setRetroOpen(false)}
                  >
                    ปิด
                  </Btn>
                )}
              </div>
              {c.retro && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">ใบหักตัวจริง:</span>
                    {files(c.certFiles)}
                    <input
                      ref={certInput}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        void attach(c.id, "cert", e.target.files[0])
                      }
                    />
                    <Btn
                      small
                      disabled={busy}
                      onClick={() => certInput.current?.click()}
                    >
                      📎 แนบใบหัก
                    </Btn>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">สลิปโอนคืน:</span>
                    {files(c.refundSlips)}
                    <input
                      ref={slipInput}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        void attach(c.id, "slip", e.target.files[0])
                      }
                    />
                    <Btn
                      small
                      tone={c.retro.refundedAt ? "ghost" : "yolk"}
                      disabled={busy}
                      onClick={() => slipInput.current?.click()}
                    >
                      📎 แนบสลิปโอนคืน
                    </Btn>
                    {c.retro.refundedAt ? (
                      <>
                        <Tag tone="mint">
                          โอนคืนแล้ว {thTime(c.retro.refundedAt)} ·{" "}
                          {c.retro.refundedBy}
                        </Tag>
                        <button
                          className="text-[12px] underline"
                          disabled={busy}
                          onClick={() => void patch(c.id, { refunded: false })}
                        >
                          ยังไม่ได้โอนคืน
                        </button>
                      </>
                    ) : (
                      !c.certFiles?.length && (
                        <span
                          className="text-[12px]"
                          style={{ color: "var(--dk-coral-ink)" }}
                        >
                          ยังไม่ได้แนบใบหักตัวจริง
                        </span>
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ผูกออเดอร์เอง + หมายเหตุ */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex gap-2">
          <input
            className={input}
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="ผูกใบงานเอง เช่น OD-260915-1234"
          />
          <Btn
            small
            disabled={busy || !orderId.trim()}
            onClick={() =>
              void patch(c.id, { orderId }).then((ok) => ok && setOrderId(""))
            }
          >
            ผูก
          </Btn>
        </div>
        <div className="flex gap-2">
          <input
            className={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ"
          />
          <Btn
            small
            disabled={busy || note === (c.note ?? "")}
            onClick={() => void patch(c.id, { note })}
          >
            บันทึก
          </Btn>
        </div>
      </div>

      {!!c.reminders?.length && (
        <div className="text-[13px]" style={{ color: "var(--dk-navy-soft)" }}>
          <b>ประวัติทวง:</b>{" "}
          {c.reminders
            .slice()
            .reverse()
            .map(
              (r) =>
                `${thTime(r.at)} ${r.by} ${r.ok ? `✓ ส่งถึง LINE ${r.to ? `"${r.to}"` : "ลูกค้า"}` : `✗ ${r.reason ?? "ไม่สำเร็จ"}`}`,
            )
            .join(" · ")}
        </div>
      )}
      {dialog}
    </div>
  );
}

const LINE_VIA: Record<string, string> = {
  bound: "พนักงานผูกไว้ที่ใบงาน",
  inherited: "จำจากออเดอร์เก่าของลูกค้าคนเดียวกัน",
  login: "บัญชี LINE ที่ลูกค้าใช้ล็อกอินตอนสั่ง",
};

/** 💬 LINE ที่การ์ดทวงจะไปถึง — รูป+ชื่อ ให้พนักงานเห็นก่อนกดทวงว่าส่งเข้าใคร */
function LineChip({ to }: { to: NonNullable<WhtCertView["lineTo"]> }) {
  return (
    <span
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold"
      style={{ background: "var(--dk-mint-wash)", color: "var(--dk-mint-ink)" }}
      title={`ทวงแล้วจะส่งเข้า LINE นี้ · ${LINE_VIA[to.via] ?? ""}`}
    >
      {to.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={to.picture} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] text-white" style={{ background: "var(--dk-mint-ink)" }}>
          L
        </span>
      )}
      <span className="truncate">LINE {to.name ?? "ลูกค้า"}</span>
      {to.via !== "bound" && <span className="font-normal">· {to.via === "login" ? "ล็อกอิน" : "ออเดอร์เก่า"}</span>}
    </span>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0 py-0.5">
      <span className="block text-[12px]" style={{ color: "var(--dk-faint)" }}>
        {k}
      </span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

export default function WhtPage() {
  return (
    <RequirePerm perm="orders.money">
      <WhtInner />
    </RequirePerm>
  );
}
