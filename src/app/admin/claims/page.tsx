"use client";

import RequirePerm from "@/components/RequirePerm";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { btnSmNeutral, cardPad, faint, h1, input, muted, pillActive, pillIdle } from "@/lib/admin-ui";
import { CLAIM_STATUS_STYLES, CLAIM_STATUSES, isOpenClaim, type Claim, type ClaimStatus } from "@/lib/claims";

/**
 * เคลมสินค้า (หลังบ้าน) — เคสที่ลูกค้ายื่นจากหน้าบัญชี
 * เปลี่ยนสถานะ/ตอบกลับที่นี่ → ระบบแจ้งลูกค้าทาง LINE ให้เอง (ช่องทางเดียวกับแจ้งสถานะออเดอร์)
 * อนุมัติเคลมแล้วจะเปิดงานผลิตใหม่ → ใช้ปุ่ม "ผลิตใหม่ (Redo)" ในหน้าออเดอร์เดิม แล้วกรอกเลขไว้ในเคส
 */

const RESOLUTION_ACTIONS = ["ผลิตใหม่", "คืนเงิน", "ส่วนลด/ชดเชย", "อื่นๆ"] as const;

const thTime = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
};

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

  const shown = useMemo(() => {
    const cs = claims ?? [];
    if (filter === "all") return cs;
    if (filter === "open") return cs.filter(isOpenClaim);
    return cs.filter((c) => c.status === filter);
  }, [claims, filter]);

  const openCount = (claims ?? []).filter(isOpenClaim).length;

  if (claims === null) return <p className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className={h1}>🧰 เคลมสินค้า</h1>
      <p className={`mt-1 ${muted}`}>
        เคสจากหน้า &quot;แจ้งปัญหา / เคลมสินค้า&quot; ของลูกค้า — เปลี่ยนสถานะ/ตอบกลับแล้วระบบแจ้งลูกค้าทาง LINE ให้เอง
      </p>

      {needsSetup ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          ยังไม่มีตาราง <code className="font-mono">claims</code> — รัน <code className="font-mono">supabase/claims.sql</code> ใน Supabase SQL
          Editor หนึ่งครั้ง
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={filter === "open" ? pillActive : pillIdle} onClick={() => setFilter("open")}>
              กำลังดำเนินการ {openCount > 0 && <span className="ml-1 tabular-nums">({openCount})</span>}
            </button>
            <button type="button" className={filter === "all" ? pillActive : pillIdle} onClick={() => setFilter("all")}>
              ทั้งหมด ({claims.length})
            </button>
            {CLAIM_STATUSES.map((s) => (
              <button key={s} type="button" className={filter === s ? pillActive : pillIdle} onClick={() => setFilter(s)}>
                {s}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className={`mt-5 p-10 text-center ${cardPad}`}>
              <span className="text-4xl">🧰</span>
              <p className={`mt-3 text-sm ${muted}`}>{filter === "open" ? "ไม่มีเคลมค้างอยู่ — เยี่ยมมาก 🎉" : "ไม่มีเคลมในกลุ่มนี้"}</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {shown.map((c) => (
                <ClaimRow key={c.id} claim={c} onUpdate={(u) => setClaims((cs) => cs?.map((x) => (x.id === u.id ? u : x)) ?? cs)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClaimRow({ claim: c, onUpdate }: { claim: Claim; onUpdate: (c: Claim) => void }) {
  const [open, setOpen] = useState(isOpenClaim(c));
  const [reply, setReply] = useState("");
  const [action, setAction] = useState(c.resolution?.action ?? "");
  const [note, setNote] = useState(c.resolution?.note ?? "");
  const [redoId, setRedoId] = useState(c.resolution?.redoOrderId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    <article className={cardPad}>
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((v) => !v)}>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">
            {c.id} <span className={faint}>· {thTime(c.createdAt)}</span>
          </p>
          <p className="mt-0.5 truncate text-sm text-slate-600">
            {c.customer} · {c.phone} · ออเดอร์ {c.orderId} · {c.type}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CLAIM_STATUS_STYLES[c.status]}`}>{c.status}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {c.itemNames && c.itemNames.length > 0 && <p className="text-sm text-slate-600">รายการ: {c.itemNames.join(" · ")}</p>}
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-800">{c.detail}</p>

          {(c.photoUrls?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.photoUrls!.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-xl ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`รูปเคลม ${i + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}

          {/* บทสนทนา */}
          {(c.messages?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {c.messages.map((m, i) => (
                <p key={i} className="text-sm">
                  <b className={m.by === "admin" ? "text-sky-700" : "text-slate-700"}>{m.by === "admin" ? m.name || "ทีมงาน" : "ลูกค้า"}:</b>{" "}
                  <span className="text-slate-700">{m.text}</span> <span className={`text-[11px] ${faint}`}>{thTime(m.at)}</span>
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              className={input}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && reply.trim() && patch({ message: reply.trim() }).then(() => setReply(""))}
              placeholder="ตอบลูกค้า (ส่งเข้า LINE ให้ด้วย)…"
            />
            <button
              type="button"
              className={btnSmNeutral}
              disabled={busy || !reply.trim()}
              onClick={() => patch({ message: reply.trim() }).then(() => setReply(""))}
            >
              ส่ง
            </button>
          </div>

          {/* สถานะ + แนวทางชดเชย */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold ${muted}`}>สถานะ:</span>
            {CLAIM_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || s === c.status}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  s === c.status ? CLAIM_STATUS_STYLES[s] : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
                onClick={() => patch({ status: s })}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-[160px_1fr_180px_auto]">
            <select className={input} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">แนวทางชดเชย…</option>
              {RESOLUTION_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="รายละเอียด เช่น ผลิตใหม่เฉพาะชิ้นที่แตก 2 ชิ้น" />
            <input className={input} value={redoId} onChange={(e) => setRedoId(e.target.value)} placeholder="เลขออเดอร์ผลิตใหม่ (ถ้ามี)" />
            <button
              type="button"
              className={btnSmNeutral}
              disabled={busy}
              onClick={() => patch({ resolution: { action: action || undefined, note: note || undefined, redoOrderId: redoId || undefined } })}
            >
              บันทึก
            </button>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Link href={`/admin/orders/${encodeURIComponent(c.orderId)}`} className="font-semibold text-sky-700 hover:underline">
              เปิดออเดอร์ {c.orderId} → (สร้างงานผลิตใหม่ได้จากปุ่ม Redo ในนั้น)
            </Link>
          </div>

          {err && <p className="text-sm font-semibold text-rose-600">{err}</p>}
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
