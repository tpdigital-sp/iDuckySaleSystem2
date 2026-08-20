"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Order } from "@/lib/admin-data";
import { CLAIM_TYPES, CLAIM_WINDOW_DAYS, isOpenClaim, type Claim, type ClaimStatus } from "@/lib/claims";
import { createClaim, fetchMyClaims, sendClaimMessage, uploadClaimPhoto } from "@/lib/claims-repo";
import { LINE_URL } from "@/components/LineButton";
import { AccountHead, AccountShell } from "@/components/account/AccountShell";
import { useAccountOrders } from "@/components/account/useAccountOrders";
import { Pager, usePager } from "@/components/account/Pager";

/*
 * แจ้งปัญหา / เคลมสินค้า — ยื่นเคลมในระบบ + คุยกับทีมงานในเคสเดียวกัน
 * เงื่อนไข: ออเดอร์จัดส่งแล้ว/เสร็จสิ้น ภายใน CLAIM_WINDOW_DAYS วันหลังส่ง (เซิร์ฟเวอร์ตรวจซ้ำ)
 * LINE ยังเป็นช่องทางคุยด่วนเหมือนเดิม — ระบบนี้เพิ่มการติดตามสถานะเป็นเรื่องเป็นราว
 */

/** โทนป้ายสถานะ (คลาสใน landing.css) */
const CHIP: Record<ClaimStatus, string> = { ใหม่: "new", กำลังตรวจสอบ: "work", อนุมัติเคลม: "ok", ปฏิเสธ: "no", เสร็จสิ้น: "done" };

const thDate = (iso: string) => {
  const d = new Date(iso);
  return isFinite(d.getTime()) ? d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
};

/** เวลา "จัดส่งแล้ว" จาก log ของออเดอร์ (ตรรกะเดียวกับฝั่งเซิร์ฟเวอร์) */
function shippedAtOf(o: Order): number | null {
  for (const e of [...(o.log ?? [])].reverse()) {
    if (`${e.action} ${e.detail ?? ""}`.includes("จัดส่งแล้ว")) {
      const t = Date.parse(e.at);
      if (isFinite(t)) return t;
    }
  }
  return null;
}

export default function ClaimsPage() {
  const { customer, loading, orders } = useAccountOrders();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [toast, setToast] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const pager = usePager(claims ?? [], 6);

  useEffect(() => {
    if (!customer) return;
    fetchMyClaims().then((r) => {
      setClaims(r.claims);
      setNeedsSetup(!!r.needsSetup);
    });
  }, [customer]);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast(""), 3200);
  }

  /** ออเดอร์ที่ยังยื่นเคลมได้ — ส่งแล้ว + ไม่เกินกรอบเวลา + ไม่มีเคลมค้าง */
  const claimable = useMemo(() => {
    const busy = new Set((claims ?? []).filter(isOpenClaim).map((c) => c.orderId));
    return (orders ?? []).filter((o) => {
      if (!["จัดส่งแล้ว", "เสร็จสิ้น"].includes(o.status) || busy.has(o.id)) return false;
      const t = shippedAtOf(o);
      return !t || Date.now() - t <= CLAIM_WINDOW_DAYS * 86400_000;
    });
  }, [orders, claims]);

  if (loading || !customer) {
    return (
      <AccountShell active="claims">
        <div className="acd-loading">กำลังโหลด…</div>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="claims">
      <AccountHead
        ico="claim"
        title="แจ้งปัญหา / เคลมสินค้า"
        sub={`งานมีปัญหาแจ้งได้ภายใน ${CLAIM_WINDOW_DAYS} วันหลังได้รับสินค้า — ทีมงานตอบกลับในเคสนี้เลย ไม่ต้องเล่าใหม่`}
      />

      <div className="acd-clm-bar">
        <button type="button" className="btn btn-yolk acd-btn-compact" onClick={() => setFormOpen(true)} disabled={needsSetup}>
          ＋ แจ้งเคลมใหม่
        </button>
        <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost acd-btn-compact">
          💬 คุยกับแอดมินทาง LINE
        </a>
      </div>

      {needsSetup ? (
        <div className="acd-empty small">
          <span className="acd-empty-ico">🛠️</span>
          <p>ระบบเคลมกำลังเตรียมเปิดใช้ — ระหว่างนี้แจ้งปัญหากับแอดมินทาง LINE ได้เลย</p>
        </div>
      ) : claims === null ? (
        <div className="acd-olist">
          <div className="acd-ocard" aria-label="กำลังโหลด">
            <span className="acd-skel acd-skel-line w40" />
            <span className="acd-skel acd-skel-line w60" />
          </div>
        </div>
      ) : claims.length === 0 ? (
        <div className="acd-empty">
          <span className="acd-empty-ico">🧰</span>
          <h3>ยังไม่เคยแจ้งเคลม</h3>
          <p>หวังว่าจะไม่ต้องใช้หน้านี้เลย 💙 แต่ถ้างานมีปัญหา กด &quot;แจ้งเคลมใหม่&quot; ได้ทันที</p>
        </div>
      ) : (
        <>
          <div className="acd-olist">
            {pager.slice.map((c) => (
              <ClaimCard key={c.id} claim={c} onUpdate={(u) => setClaims((cs) => cs?.map((x) => (x.id === u.id ? u : x)) ?? cs)} onToast={showToast} />
            ))}
          </div>
          <Pager {...pager} unit="เคลม" />
        </>
      )}

      {formOpen && (
        <NewClaimModal
          claimable={claimable}
          onClose={() => setFormOpen(false)}
          onDone={(c) => {
            setFormOpen(false);
            setClaims((cs) => [c, ...(cs ?? [])]);
            showToast("ยื่นเคลมแล้ว ✓ ทีมงานได้รับแจ้งทาง LINE ทันที เดี๋ยวรีบดูให้ครับ");
          }}
        />
      )}

      <div className={`acd-toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountShell>
  );
}

/** การ์ดเคลม 1 เคส — สถานะ + รูป + บทสนทนา */
function ClaimCard({ claim: c, onUpdate, onToast }: { claim: Claim; onUpdate: (c: Claim) => void; onToast: (t: string) => void }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    const r = await sendClaimMessage(c.id, text);
    setSending(false);
    if (!r.ok || !r.claim) return onToast(r.error ?? "ส่งข้อความไม่สำเร็จ");
    setReply("");
    onUpdate(r.claim);
  }

  return (
    <article className="acd-ocard">
      <div className="acd-ocard-top">
        <div className="acd-ocard-idcol">
          <div className="acd-order-id">{c.id}</div>
          <div className="acd-order-date">
            {thDate(c.createdAt)} · ออเดอร์ {c.orderId} · {c.type}
          </div>
        </div>
        <span className={`acd-clm-chip ${CHIP[c.status]}`}>{c.status}</span>
      </div>

      {c.itemNames && c.itemNames.length > 0 && <p className="acd-clm-items">รายการ: {c.itemNames.join(" · ")}</p>}
      <p className="acd-clm-detail">{c.detail}</p>

      {(c.photoUrls?.length ?? 0) > 0 && (
        <div className="acd-thumbs">
          {c.photoUrls!.map((u, i) => (
            <a key={i} href={u} target="_blank" rel="noreferrer" className="acd-thumb" title="เปิดรูปเต็ม">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt={`รูปประกอบเคลม ${i + 1}`} loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {c.status === "อนุมัติเคลม" && c.resolution?.action && (
        <div className="acd-clm-resolve">
          ✅ ทางร้านดูแลให้: <b>{c.resolution.action}</b>
          {c.resolution.note ? ` — ${c.resolution.note}` : ""}
          {c.resolution.redoOrderId ? (
            <>
              {" · "}งานผลิตใหม่: <b>{c.resolution.redoOrderId}</b>
            </>
          ) : null}
        </div>
      )}
      {c.status === "ปฏิเสธ" && c.resolution?.note && <div className="acd-clm-resolve no">ขออภัย เคสนี้เคลมไม่ได้ — {c.resolution.note}</div>}

      {/* บทสนทนา */}
      {(c.messages?.length ?? 0) > 0 && (
        <div className="acd-clm-thread">
          {c.messages.map((m, i) => (
            <div key={i} className={`acd-clm-msg ${m.by === "customer" ? "me" : "shop"}`}>
              <span className="acd-clm-msg-by">{m.by === "customer" ? "คุณ" : m.name || "ทีมงาน"}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {c.status !== "เสร็จสิ้น" && (
        <div className="acd-clm-reply">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="พิมพ์ข้อความถึงทีมงาน…"
            aria-label="ตอบกลับในเคลม"
          />
          <button type="button" className="btn btn-primary acd-btn-compact" onClick={send} disabled={sending || !reply.trim()}>
            {sending ? "…" : "ส่ง"}
          </button>
        </div>
      )}
    </article>
  );
}

/** ฟอร์มยื่นเคลมใหม่ */
function NewClaimModal({ claimable, onClose, onDone }: { claimable: Order[]; onClose: () => void; onDone: (c: Claim) => void }) {
  const [orderId, setOrderId] = useState(claimable[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [type, setType] = useState<string>(CLAIM_TYPES[0]);
  const [detail, setDetail] = useState("");
  const [photos, setPhotos] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const order = claimable.find((o) => o.id === orderId) ?? null;

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setErr("");
    setUploading(true);
    for (const f of files.slice(0, 6 - photos.length)) {
      try {
        const path = await uploadClaimPhoto(f);
        setPhotos((ps) => [...ps, { path, name: f.name }]);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "อัปโหลดไม่สำเร็จ");
        break;
      }
    }
    setUploading(false);
  }

  async function submit() {
    if (busy) return;
    setErr("");
    if (!orderId) return setErr("เลือกออเดอร์ที่มีปัญหาก่อน");
    if (detail.trim().length < 10) return setErr("ช่วยเล่ารายละเอียดปัญหาอีกสักนิด (อย่างน้อย 10 ตัวอักษร)");
    setBusy(true);
    const r = await createClaim({
      orderId,
      itemNames: order ? [...picked].map((i) => order.items[i]?.name).filter(Boolean) : undefined,
      type,
      detail: detail.trim(),
      photoPaths: photos.map((p) => p.path),
    });
    setBusy(false);
    if (!r.ok || !r.claim) return setErr(r.error ?? "ยื่นเคลมไม่สำเร็จ");
    onDone(r.claim);
  }

  return (
    <div className="acd-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="acd-modal-box acd-clm-form" role="dialog" aria-modal="true" aria-labelledby="acd-clm-h">
        <button type="button" className="acd-modal-close" aria-label="ปิด" onClick={onClose}>
          ✕
        </button>
        <h3 id="acd-clm-h">แจ้งเคลมสินค้า</h3>

        {claimable.length === 0 ? (
          <>
            <p className="acd-modal-sub">
              ไม่มีออเดอร์ที่ยื่นเคลมในระบบได้ตอนนี้ (ยื่นได้เฉพาะออเดอร์ที่จัดส่งแล้วภายใน {CLAIM_WINDOW_DAYS} วัน และไม่มีเคลมค้างอยู่)
              — แต่ทักแอดมินทาง LINE ให้ช่วยดูได้เสมอครับ
            </p>
            <div className="acd-modal-actions">
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                💬 ทักแอดมินทาง LINE
              </a>
            </div>
          </>
        ) : (
          <>
            <label className="acd-clm-label">ออเดอร์ที่มีปัญหา</label>
            <select
              className="acd-clm-select"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setPicked(new Set());
              }}
            >
              {claimable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.date} · {o.items[0]?.name ?? ""}
                  {o.items.length > 1 ? ` +${o.items.length - 1}` : ""}
                </option>
              ))}
            </select>

            {order && order.items.length > 1 && (
              <>
                <label className="acd-clm-label">รายการที่มีปัญหา (ไม่เลือก = ทั้งออเดอร์)</label>
                <div className="acd-clm-checks">
                  {order.items.map((it, i) => (
                    <label key={i}>
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={(e) => {
                          const s = new Set(picked);
                          if (e.target.checked) s.add(i);
                          else s.delete(i);
                          setPicked(s);
                        }}
                      />
                      {it.name} ×{it.qty}
                    </label>
                  ))}
                </div>
              </>
            )}

            <label className="acd-clm-label">ประเภทปัญหา</label>
            <div className="acd-clm-types">
              {CLAIM_TYPES.map((t) => (
                <button key={t} type="button" className={`acd-ttab${type === t ? " on" : ""}`} onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>

            <label className="acd-clm-label">เล่ารายละเอียดปัญหา</label>
            <textarea
              className="acd-addr-input"
              rows={4}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="เช่น เคสแตกที่มุมขวาบน 2 ชิ้นจาก 10 ชิ้น · สีที่ได้เข้มกว่าแบบที่อนุมัติมาก"
            />

            <label className="acd-clm-label">
              รูปประกอบ ({photos.length}/6){" "}
              <span className="acd-clm-hint">ถ่ายให้เห็นจุดที่มีปัญหาชัดๆ ช่วยให้อนุมัติไวขึ้นมาก</span>
            </label>
            <div className="acd-clm-photos">
              {photos.map((p, i) => (
                <span key={p.path} className="acd-clm-photo-chip">
                  📷 {p.name.length > 18 ? `${p.name.slice(0, 15)}…` : p.name}
                  <button type="button" aria-label={`ลบรูป ${p.name}`} onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </span>
              ))}
              {photos.length < 6 && (
                <button type="button" className="btn btn-ghost acd-btn-compact" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "กำลังอัปโหลด…" : "＋ เพิ่มรูป"}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPickFiles} />
            </div>

            {err && <p className="acd-clm-err">{err}</p>}

            <div className="acd-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || uploading}>
                {busy ? "กำลังส่ง…" : "ยื่นเคลม"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
