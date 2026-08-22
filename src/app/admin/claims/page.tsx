"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * เคลมสินค้า /admin/claims — เคสที่ลูกค้ายื่นจากหน้าบัญชี  (ดีไซน์ "รางเบนโตะกระจก")
 *
 * เปลี่ยนสถานะ/ตอบกลับที่นี่ → ระบบแจ้งลูกค้าทาง LINE ให้เอง
 * อนุมัติเคลมแล้วจะเปิดงานผลิตใหม่ → ใช้ปุ่ม "ผลิตใหม่ (Redo)" ในหน้าออเดอร์เดิม แล้วกรอกเลขไว้ในเคส
 *
 * ของที่เพิ่มจากเดิม: นับ "ค้างมากี่วัน" ต่อเคส และยกเคสที่ค้างนานสุดขึ้นก่อน —
 * เรื่องเคลมที่เงียบไปคือเรื่องที่บานปลาย ของเดิมไม่มีอะไรบอกว่าเคสไหนถูกลืม
 */

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CLAIM_STATUSES, isOpenClaim, type Claim, type ClaimStatus } from "@/lib/claims";
import {
  Banner,
  Btn,
  Empty,
  FChip,
  FilterCard,
  HeroStat,
  ListHead,
  PageHead,
  PageShell,
  Stat,
  Stats,
  TabRow,
  Tag,
} from "@/components/admin/ui";

const RESOLUTION_ACTIONS = ["ผลิตใหม่", "คืนเงิน", "ส่วนลด/ชดเชย", "อื่นๆ"] as const;

/** สีแถบซ้ายตามสถานะเคลม — แดง = ยังไม่มีใครแตะ */
const TONE: Record<ClaimStatus, string> = {
  ใหม่: "var(--dk-coral-deep)",
  กำลังตรวจสอบ: "var(--dk-lilac)",
  อนุมัติเคลม: "var(--dk-mint)",
  ปฏิเสธ: "var(--dk-quiet)",
  เสร็จสิ้น: "var(--dk-quiet)",
};
const CHIP: Record<ClaimStatus, "coral" | "lilac" | "mint" | "quiet"> = {
  ใหม่: "coral",
  กำลังตรวจสอบ: "lilac",
  อนุมัติเคลม: "mint",
  ปฏิเสธ: "quiet",
  เสร็จสิ้น: "quiet",
};

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

/** เปิดเคสมากี่วันแล้ว — เคสเคลมที่เงียบไปคือเคสที่บานปลาย */
function ageOf(iso: string): number {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return 0;
  const mid = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.max(0, Math.floor((mid(new Date()) - mid(d)) / 86400000));
}

function ClaimsPageInner() {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [filter, setFilter] = useState<"open" | "all" | ClaimStatus>("open");

  useEffect(() => {
    fetch("/api/admin/claims", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setClaims(j.claims ?? []);
        setNeedsSetup(!!j.needsSetup);
      })
      .catch(() => setClaims([]));
  }, []);

  const all = claims ?? [];
  const openList = all.filter(isOpenClaim);

  const shown = useMemo(() => {
    let cs = all;
    if (filter === "open") cs = openList;
    else if (filter !== "all") cs = all.filter((c) => c.status === filter);
    // ค้างนานสุดขึ้นก่อน
    return [...cs].sort((a, b) => ageOf(b.createdAt) - ageOf(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, filter]);

  /** เคสที่ยังไม่มีใครตอบเลย — ตัวเลขที่ต้องเป็นศูนย์ทุกวัน */
  const noReply = openList.filter((c) => !(c.messages ?? []).some((m) => m.by === "admin")).length;
  const stalest = openList.length ? Math.max(...openList.map((c) => ageOf(c.createdAt))) : 0;

  if (claims === null) {
    return (
      <PageShell>
        <Empty title="กำลังโหลด…" body="ดึงเคสเคลมจากเซิร์ฟเวอร์" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHead
        group="ลูกค้า"
        title="เคลมสินค้า"
        count={`${all.length} เรื่อง`}
        sub="เคสจากหน้า “แจ้งปัญหา / เคลมสินค้า” ของลูกค้า — เปลี่ยนสถานะหรือตอบกลับแล้วระบบแจ้งลูกค้าทาง LINE ให้เอง"
      />

      {needsSetup ? (
        <div className="mt-4">
          <Banner
            tone="warm"
            title="ยังไม่มีตาราง claims"
            detail="รัน supabase/claims.sql ใน Supabase SQL Editor หนึ่งครั้ง แล้วรีเฟรชหน้านี้"
          />
        </div>
      ) : (
        <>
          <Stats cols={4}>
            <HeroStat
              n={noReply}
              label="ยังไม่ตอบลูกค้า"
              detail={stalest ? `เคสที่ค้างนานสุด ${stalest} วัน · กำลังดำเนินการทั้งหมด ${openList.length} เรื่อง` : "เคลียร์หมดแล้ว"}
              pct={all.length ? (noReply / all.length) * 100 : 0}
            />
            <Stat label="กำลังดำเนินการ" value={openList.length} hint="ยังไม่ปิดเคส" />
            <Stat
              label="ค้างนานสุด"
              value={stalest}
              hint={stalest >= 2 ? "วัน — ควรตอบวันนี้" : "วัน"}
              tone={stalest >= 2 ? "due" : undefined}
            />
          </Stats>

          <FilterCard>
            <TabRow>
              <FChip on={filter === "open"} onClick={() => setFilter("open")} label="กำลังดำเนินการ" count={openList.length} />
              <FChip on={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={all.length} />
              {CLAIM_STATUSES.map((s) => (
                <FChip
                  key={s}
                  on={filter === s}
                  onClick={() => setFilter(s)}
                  label={s}
                  count={all.filter((c) => c.status === s).length}
                />
              ))}
            </TabRow>
          </FilterCard>

          <ListHead title="เรื่องที่แจ้ง" note="ค้างนานสุดขึ้นก่อน" />

          {shown.length === 0 ? (
            <Empty
              title={filter === "open" ? "ไม่มีเคลมค้างอยู่" : "ไม่มีเคลมในกลุ่มนี้"}
              body={filter === "open" ? "เคลียร์หมดแล้ว — เคสใหม่จะขึ้นตรงนี้ทันทีที่ลูกค้าแจ้งเข้ามา" : "ลองดูกลุ่มอื่นจากปุ่มด้านบน"}
            />
          ) : (
            <div className="grid gap-3">
              {shown.map((c) => (
                <ClaimCard key={c.id} claim={c} onUpdate={(u) => setClaims((cs) => cs?.map((x) => (x.id === u.id ? u : x)) ?? cs)} />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function ClaimCard({ claim: c, onUpdate }: { claim: Claim; onUpdate: (c: Claim) => void }) {
  const [open, setOpen] = useState(isOpenClaim(c));
  const [reply, setReply] = useState("");
  const [action, setAction] = useState(c.resolution?.action ?? "");
  const [note, setNote] = useState(c.resolution?.note ?? "");
  const [redoId, setRedoId] = useState(c.resolution?.redoOrderId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const days = ageOf(c.createdAt);
  const answered = (c.messages ?? []).some((m) => m.by === "admin");
  const hot = isOpenClaim(c) && !answered;

  async function patch(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/admin/claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, ...body }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !j.claim) return setErr(j.error ?? "บันทึกไม่สำเร็จ");
    onUpdate(j.claim as Claim);
  }

  return (
    <article className="dkb-g relative overflow-hidden p-4 pl-5" style={{ ["--dk-tone" as string]: TONE[c.status] }}>
      <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />

      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0">
          <span className="dkb-who">
            <span className="nm">{c.customer}</span>
            {hot && <Tag tone="solid">ค้าง {days} วัน ยังไม่ตอบ</Tag>}
            {!hot && isOpenClaim(c) && days >= 2 && <Tag tone="yolk">ค้าง {days} วัน</Tag>}
          </span>
          <span className="dkb-meta">
            <span className="id">{c.id}</span>
            <span className="id">{c.orderId}</span>
            <span>{c.type}</span>
            <span>{thTime(c.createdAt)}</span>
            {!open && c.detail && (
              <span className={hot ? "hot" : undefined} title={c.detail}>
                “{c.detail}”
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0">
          <Tag tone={CHIP[c.status]}>{c.status}</Tag>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: "var(--dk-hair)" }}>
          {c.itemNames && c.itemNames.length > 0 && (
            <p className="text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              รายการ: {c.itemNames.join(" · ")}
            </p>
          )}
          <p
            className="whitespace-pre-wrap rounded-[16px] px-4 py-3 text-[14px]"
            style={{ background: hot ? "var(--dk-coral-wash)" : "rgba(255,255,255,.65)", color: hot ? "var(--dk-coral-ink)" : "var(--dk-navy)" }}
          >
            {c.detail}
          </p>

          {(c.photoUrls?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.photoUrls!.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="dkb-thumb !h-24 w-24">
                  <img src={u} alt={`รูปเคลม ${i + 1}`} />
                </a>
              ))}
            </div>
          )}

          {/* บทสนทนา */}
          {(c.messages?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {c.messages.map((m, i) => (
                <p key={i} className="text-[13.5px]">
                  <b style={{ color: m.by === "admin" ? "var(--dk-blue-deep)" : "var(--dk-navy)" }}>
                    {m.by === "admin" ? m.name || "ทีมงาน" : "ลูกค้า"}:
                  </b>{" "}
                  <span style={{ color: "var(--dk-navy-soft)" }}>{m.text}</span>{" "}
                  <span className="text-[11px]" style={{ color: "var(--dk-faint)" }}>
                    {thTime(m.at)}
                  </span>
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <label className="dkb-search !min-h-[40px] flex-1">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && reply.trim()) void patch({ message: reply.trim() }).then(() => setReply(""));
                }}
                placeholder="ตอบลูกค้า (ส่งเข้า LINE ให้ด้วย)…"
              />
            </label>
            <Btn tone="navy" small disabled={busy || !reply.trim()} onClick={() => void patch({ message: reply.trim() }).then(() => setReply(""))}>
              ส่ง
            </Btn>
          </div>

          {/* สถานะ */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
              สถานะ:
            </span>
            {CLAIM_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || s === c.status}
                aria-pressed={s === c.status}
                className="dkb-fchip"
                onClick={() => void patch({ status: s })}
              >
                <i />
                {s}
              </button>
            ))}
          </div>

          {/* แนวทางชดเชย */}
          <div className="grid gap-2 sm:grid-cols-[170px_1fr_190px_auto]">
            <label className="dkb-g dkb-field">
              <span className="lb">แนวทางชดเชย</span>
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">ยังไม่ระบุ…</option>
                {RESOLUTION_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="dkb-g dkb-field">
              <span className="lb">รายละเอียด</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ผลิตใหม่เฉพาะชิ้นที่แตก 2 ชิ้น" />
            </label>
            <label className="dkb-g dkb-field">
              <span className="lb">เลขออเดอร์ผลิตใหม่</span>
              <input value={redoId} onChange={(e) => setRedoId(e.target.value)} placeholder="ถ้ามี" />
            </label>
            <div className="flex items-end">
              <Btn
                tone="navy"
                disabled={busy}
                onClick={() =>
                  void patch({ resolution: { action: action || undefined, note: note || undefined, redoOrderId: redoId || undefined } })
                }
              >
                บันทึก
              </Btn>
            </div>
          </div>

          <p className="text-[13.5px]">
            <Link
              href={`/admin/orders/${encodeURIComponent(c.orderId)}`}
              className="font-semibold underline-offset-4 hover:underline"
              style={{ color: "var(--dk-blue-deep)" }}
            >
              เปิดออเดอร์ {c.orderId} → สร้างงานผลิตใหม่ได้จากปุ่ม Redo ในนั้น
            </Link>
          </p>

          {err && (
            <p className="text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
              {err}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default function ClaimsPage() {
  return (
    <RequirePerm perm="orders.view">
      <ClaimsPageInner />
    </RequirePerm>
  );
}
