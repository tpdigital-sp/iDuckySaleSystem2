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
 *
 * 🧰 เชื่อมกับปุ่ม ♻️ ทำใหม่/เคลม ในหน้าออเดอร์ (16 ก.ย. 69):
 *   - กดจากหน้าออเดอร์ → เปิดเคสให้เอง (source "admin") หรือผูกกับเคสที่เปิดอยู่ · ขึ้นในหน้านี้ทันที
 *   - กดจากหน้านี้ (ปุ่ม "สร้างงานผลิตใหม่") → ยิง /api/admin/orders/redo ให้เอง ไม่ต้องไปกดในหน้าออเดอร์แล้วก๊อปเลขกลับมา
 *   - ปุ่ม ➕ บันทึกเคลม (NewClaimModal) ทีมงานเปิดเคสเองจากที่ลูกค้าแจ้งทาง LINE/โทร · ช่อง "ความผิดอยู่ที่ใคร" แก้ได้ในการ์ด
 *   - เปิดหน้าด้วย #CL-xxx (จากป้ายในหน้าออเดอร์) → สลับเป็น "ทั้งหมด" กางการ์ดนั้นและเลื่อนไปหา
 */

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NewClaimModal from "@/components/admin/NewClaimModal";
import { CLAIM_FAULTS, CLAIM_STATUSES, isOpenClaim, needsReply, type Claim, type ClaimFault, type ClaimStatus } from "@/lib/claims";
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
/**
 * สีป้าย/ชิปต่อสถานะ — 5 สถานะต้องได้คนละสี ไม่งั้นแถบเปลี่ยนสถานะกวาดตาแล้วแยกไม่ออก (เจ้าของร้านสั่ง 21 ก.ย. 69)
 * ปฏิเสธ = เหลืองเตือน (ต้องอธิบายลูกค้า ไม่ใช่งานที่จบสวย) · เสร็จสิ้น = ฟ้าเย็น (ปิดเคสเรียบร้อย)
 * แถบสีซ้ายการ์ด (TONE) ยังเงียบเหมือนเดิมสำหรับเคสที่ปิดแล้ว — งานค้างต้องเด่นกว่างานจบเสมอ
 */
const CHIP: Record<ClaimStatus, "coral" | "lilac" | "mint" | "yolk" | "sky"> = {
  ใหม่: "coral",
  กำลังตรวจสอบ: "lilac",
  อนุมัติเคลม: "mint",
  ปฏิเสธ: "yolk",
  เสร็จสิ้น: "sky",
};

/**
 * คำกำกับความหมายของแต่ละสถานะ — แอดมินคนใหม่จะได้ไม่ต้องเดาว่าควรกดอันไหนเมื่อไหร่ (เจ้าของร้านสั่ง 21 ก.ย. 69)
 * เขียนเป็นภาษาที่คุยกันจริงหน้าร้าน ไม่ใช่ศัพท์ระบบ · โชว์ทั้งตอนชี้เมาส์ (ทุกปุ่ม) และเป็นบรรทัดข้อความของสถานะปัจจุบัน
 */
const STATUS_HINT: Record<ClaimStatus, string> = {
  ใหม่: "ลูกค้าเพิ่งแจ้งเข้ามา ยังไม่มีใครรับเรื่อง",
  กำลังตรวจสอบ: "รับเรื่องแล้ว กำลังเช็คงาน/คุยกับลูกค้า",
  อนุมัติเคลม: "ตกลงชดเชยแล้ว (ผลิตใหม่/คืนเงิน) — รอทำงานให้จบ",
  ปฏิเสธ: "ไม่เข้าเงื่อนไขเคลม — ต้องอธิบายลูกค้าให้ชัดก่อนปิด",
  เสร็จสิ้น: "จบเรื่องแล้ว ปิดเคส — ไม่นับในป้ายจำนวนเคลมข้างเมนูอีก",
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
  const [creating, setCreating] = useState(false);
  /** เคสที่ถูกชี้มาจาก URL hash (#CL-xxx) — กางไว้และเลื่อนไปหาครั้งเดียว */
  const [focusId, setFocusId] = useState("");

  useEffect(() => {
    fetch("/api/admin/claims", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setClaims(j.claims ?? []);
        setNeedsSetup(!!j.needsSetup);
      })
      .catch(() => setClaims([]));
  }, []);

  useEffect(() => {
    if (!claims) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || !claims.some((c) => c.id === id)) return;
    setFilter("all");
    setFocusId(id);
    // รอให้การ์ดขึ้นก่อนค่อยเลื่อน
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [claims]);

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
  const noReply = openList.filter(needsReply).length;
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
        group="งานขาย"
        title="เคลมสินค้า"
        count={`${all.length} เรื่อง`}
        sub="เคสที่ลูกค้าแจ้ง + เคสที่ทีมงานเปิดเอง — เปลี่ยนสถานะหรือตอบกลับ แล้วระบบแจ้งลูกค้าทาง LINE ให้เอง"
        tools={
          !needsSetup && (
            <Btn tone="yolk" onClick={() => setCreating(true)}>
              ➕ บันทึกเคลม
            </Btn>
          )
        }
      />

      {/*
        กติกาที่ทุกคนต้องรู้ตรงกัน — "เสร็จสิ้น" ขึ้นเองตอนไหน (เจ้าของร้านสั่ง 21 ก.ย. 69)
        วางบนสุดให้เห็นทุกครั้งที่เปิดหน้า ไม่ซ่อนในกล่องพับ เพราะเป็นเรื่องที่เข้าใจผิดแล้วงานค้าง
        (เคสที่ชดเชยด้วยวิธีอื่น เช่น คืนเงิน ไม่มีใบผลิตใหม่ให้เกาะ → ต้องกดปิดเอง ต้องบอกด้วย)
      */}
      <div className="dkb-rule" title="ระบบเปลี่ยนสถานะเคสเป็น “เสร็จสิ้น” ให้เอง เมื่อใบงานผลิตใหม่ที่ผูกกับเคสเข้าสถานะ “จัดส่งแล้ว” หรือ “เสร็จสิ้น” (จดไว้ในประวัติเคสว่าปิดอัตโนมัติ)">
        <b>
          “เสร็จสิ้น” ระบบกดให้เอง เมื่อใบงานผลิตใหม่ของเคสนั้น <span className="hi">จัดส่งแล้ว</span>
        </b>
        <span className="sub">เคสที่ไม่ได้สร้างงานผลิตใหม่ (คืนเงิน / ตกลงกันได้) ต้องกด “เสร็จสิ้น” เองที่แถบสถานะ</span>
      </div>

      {creating && (
        <NewClaimModal
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setClaims((cs) => [c, ...(cs ?? [])]);
            setCreating(false);
            setFilter("open");
            setFocusId(c.id);
          }}
        />
      )}

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
                  tone={CHIP[s]}
                />
              ))}
            </TabRow>
            {/*
              คำอธิบายสถานะเป็น "ข้อมูลนิ่ง" — อ่านครั้งเดียวก็จำได้ ไม่ควรกินพื้นที่ทุกวันเหมือนตัวเลขงานค้าง
              จึงพับเก็บใต้แถบกรอง (เดิมยัดใต้หัวหน้าเป็นพรืด 2 บรรทัด รกและอ่านยาก — เจ้าของร้านทัก 21 ก.ย. 69)
            */}
            <details className="dkb-help">
              <summary>วิธีอ่านสถานะเคลม</summary>
              <div className="dkb-help-body">
                <p className="dkb-help-flow">
                  {CLAIM_STATUSES.map((s, i) => (
                    <span key={s} className="stp">
                      {i > 0 && <b className="arw">{s === "ปฏิเสธ" ? "/" : "→"}</b>}
                      <span className="dkb-schip dkb-schip-sm" data-tone={CHIP[s]}>
                        <i />
                        {s}
                      </span>
                    </span>
                  ))}
                </p>
                <ul>
                  {CLAIM_STATUSES.map((s) => (
                    <li key={s}>
                      <b>{s}</b> — {STATUS_HINT[s]}
                    </li>
                  ))}
                  <li>ป้ายเลขข้างเมนู “เคลมสินค้า” นับเคสที่ยังไม่ถึง “เสร็จสิ้น/ปฏิเสธ” — สีแดงคือยังไม่ได้ตอบลูกค้า</li>
                  <li>กด “♻️ สร้างงานผลิตใหม่” แล้วงานขึ้นบอร์ดกราฟฟิกให้เอง · เคสปิดเองเมื่อใบผลิตใหม่ “จัดส่งแล้ว”</li>
                </ul>
              </div>
            </details>
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
                <ClaimCard
                  key={c.id}
                  claim={c}
                  focus={c.id === focusId}
                  onUpdate={(u) => setClaims((cs) => cs?.map((x) => (x.id === u.id ? u : x)) ?? cs)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function ClaimCard({ claim: c, focus, onUpdate }: { claim: Claim; focus?: boolean; onUpdate: (c: Claim) => void }) {
  const [open, setOpen] = useState(isOpenClaim(c) || !!focus);
  useEffect(() => {
    if (focus) setOpen(true);
  }, [focus]);
  const [fault, setFault] = useState<ClaimFault | "">(c.fault ?? "");
  const [reply, setReply] = useState("");
  const [action, setAction] = useState(c.resolution?.action ?? "");
  const [note, setNote] = useState(c.resolution?.note ?? "");
  const [redoId, setRedoId] = useState(c.resolution?.redoOrderId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [redoBusy, setRedoBusy] = useState(false);

  const days = ageOf(c.createdAt);
  const hot = needsReply(c);
  const byAdmin = c.source === "admin";

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
    // ตอบลูกค้า/ปิดเคสแล้ว → ให้ป้ายตัวเลขข้างเมนูนับใหม่ทันที ไม่ต้องรอรอบ 90 วิ
    window.dispatchEvent(new Event("iducky:claims-changed"));
  }

  /** ♻️ สร้างงานผลิตใหม่ (ฟรี) จากเคสนี้ — เซิร์ฟเวอร์เติม redoOrderId + แนวทาง "ผลิตใหม่" กลับให้เอง */
  async function createRedo() {
    if (redoBusy || busy) return;
    const which = c.items?.length ? `${c.items.length} รายการที่เคลม` : "ทุกรายการในออเดอร์";
    if (!confirm(`สร้างออเดอร์ผลิตใหม่ให้ฟรีจาก ${c.orderId} (${which}) — ราคา ฿0 ค่าส่ง ฿0 เริ่มงานได้เลย?`)) return;
    // 📄 ใบนอกระบบไม่มีใบต้นทางให้ก๊อป — เซิร์ฟเวอร์สร้างใบจากข้อมูลในเคสแทน (ดู legacyRedo ใน orders/redo)
    const from = c.legacy ? { fromClaimId: c.id } : { fromId: c.orderId, claimId: c.id };
    setRedoBusy(true);
    setErr("");
    const res = await fetch("/api/admin/orders/redo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...from,
        mode: "claim",
        reason: `${c.id} · ${c.type}${note.trim() ? ` · ${note.trim()}` : ""}`,
        ...(c.items?.length ? { picks: c.items.map((it, i) => ({ index: c.legacy ? i : it.index, qty: it.qty })) } : {}),
      }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setRedoBusy(false);
    if (!res?.ok) return setErr(j.error ?? "สร้างงานผลิตใหม่ไม่สำเร็จ");
    if (j.claimWarn) setErr(j.claimWarn);
    if (j.claim) {
      onUpdate(j.claim as Claim);
      setAction("ผลิตใหม่");
      setRedoId(j.id);
    }
    window.dispatchEvent(new Event("iducky:claims-changed"));
  }

  return (
    <article id={c.id} className="dkb-g relative overflow-hidden p-4 pl-5 scroll-mt-4" style={{ ["--dk-tone" as string]: TONE[c.status] }}>
      <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: "var(--dk-tone)" }} />

      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0">
          <span className="dkb-who">
            <span className="nm">{c.customer}</span>
            {byAdmin && (
              <Tag tone="quiet">
                ทีมงานเปิดเคส{c.createdBy ? ` · ${c.createdBy}` : ""}
                {c.channel ? ` · ทาง ${c.channel}` : ""}
              </Tag>
            )}
            {c.legacy && <Tag tone="yolk">📄 ใบนอกระบบ</Tag>}
            {c.fault && <Tag tone={c.fault === "ร้าน" ? "coral" : c.fault === "ขนส่ง" ? "yolk" : "sky"}>ผิดที่{c.fault}</Tag>}
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
          {c.items?.length ? (
            <p className="text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              รายการ: {c.items.map((it) => `${it.name} ×${it.qty}`).join(" · ")}
            </p>
          ) : c.itemNames && c.itemNames.length > 0 ? (
            <p className="text-[13.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              รายการ: {c.itemNames.join(" · ")}
            </p>
          ) : null}
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
                className="dkb-schip"
                data-tone={CHIP[s]}
                title={`${s} — ${STATUS_HINT[s]}${s === c.status ? " (สถานะตอนนี้)" : ""}`}
                onClick={() => void patch({ status: s })}
              >
                <i />
                {s}
              </button>
            ))}
          </div>
          {/* คำกำกับสั้น ๆ ของสถานะปัจจุบัน — รายละเอียดที่เหลืออยู่ในกล่อง "วิธีอ่านสถานะเคลม" ด้านบน */}
          <p className="-mt-0.5 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
            {STATUS_HINT[c.status]}
          </p>

          {/* แนวทางชดเชย */}
          <div className="grid gap-2 sm:grid-cols-[150px_150px_1fr_170px_auto]">
            <label className="dkb-g dkb-field">
              <span className="lb">ความผิดอยู่ที่</span>
              <select value={fault} onChange={(e) => setFault(e.target.value as ClaimFault | "")}>
                <option value="">ยังไม่ระบุ…</option>
                {CLAIM_FAULTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
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
              <input value={redoId} onChange={(e) => setRedoId(e.target.value)} placeholder="กดปุ่มด้านล่างให้ระบบสร้าง หรือพิมพ์เอง" />
            </label>
            <div className="flex items-end">
              <Btn
                tone="navy"
                disabled={busy}
                onClick={() =>
                  void patch({
                    resolution: { action: action || undefined, note: note || undefined, redoOrderId: redoId || undefined },
                    ...(fault ? { fault } : {}),
                  })
                }
              >
                บันทึก
              </Btn>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px]">
            {c.legacy ? (
              c.legacyUrl ? (
                <a
                  href={c.legacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline-offset-4 hover:underline"
                  style={{ color: "var(--dk-blue-deep)" }}
                >
                  เปิดใบ {c.orderId} ในระบบเก่า ↗
                </a>
              ) : (
                <span style={{ color: "var(--dk-navy-soft)" }}>
                  ใบอ้างอิง <b>{c.orderId}</b> · ใบนอกระบบ ไม่มีหน้าออเดอร์ให้เปิด
                </span>
              )
            ) : null}
            {!c.legacy && (
              <Link
                href={`/admin/orders/${encodeURIComponent(c.orderId)}`}
                className="font-semibold underline-offset-4 hover:underline"
                style={{ color: "var(--dk-blue-deep)" }}
              >
                เปิดออเดอร์ {c.orderId}
              </Link>
            )}
            {/* ใบนอกระบบไม่มีหน้าออเดอร์ให้เปิดดูที่อยู่ — ต้องเก็บไว้ในเคสเอง ไม่งั้นส่งของชดเชยไม่ได้ */}
            {c.legacyAddress && (
              <span className="text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                📮 {c.legacyAddress}
              </span>
            )}
            {c.resolution?.redoOrderId ? (
              <Link
                href={`/admin/orders/${encodeURIComponent(c.resolution.redoOrderId)}`}
                className="font-semibold underline-offset-4 hover:underline"
                style={{ color: "var(--dk-mint-ink)" }}
              >
                ♻️ งานผลิตใหม่ {c.resolution.redoOrderId}
              </Link>
            ) : c.status !== "ปฏิเสธ" && c.status !== "เสร็จสิ้น" ? (
              <Btn tone="navy" small disabled={redoBusy || busy} onClick={() => void createRedo()}>
                {redoBusy ? "กำลังสร้าง…" : "♻️ สร้างงานผลิตใหม่ (ฟรี)"}
              </Btn>
            ) : null}
            {/* กติกาปิดเคสอัตโนมัติ = ป้ายเล็ก ๆ ตรงที่มันเกี่ยวข้อง แทนประโยคยาวในการ์ด */}
            {c.resolution?.redoOrderId && c.status !== "เสร็จสิ้น" && c.status !== "ปฏิเสธ" && (
              <Tag tone="quiet" title="ไม่ต้องกลับมากดปิดเคสเอง — ระบบเปลี่ยนเป็น “เสร็จสิ้น” ให้เมื่อใบงานผลิตใหม่เข้าสถานะ “จัดส่งแล้ว” หรือ “เสร็จสิ้น”">
                ปิดเองเมื่อจัดส่ง
              </Tag>
            )}
          </div>

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
