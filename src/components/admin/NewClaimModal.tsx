"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * ➕ บันทึกเคลม — ฟอร์มให้ทีมงานเปิดเคสเอง (ลูกค้าแจ้งทาง LINE/โทร/หน้าร้าน)
 *
 * ทำไมต้องมี: ออเดอร์เกือบทั้งหมดสั่งโดยไม่ล็อกอิน ลูกค้ายื่นเคลมจากหน้าบัญชีไม่ได้ เคสจริงมาทางแชท
 * ของที่ต่างจากฟอร์มลูกค้า: ค้นออเดอร์จากเลข/ชื่อ/เบอร์ · ติ๊กรายการ+จำนวนชิ้นที่เสีย · "ความผิดอยู่ที่ใคร" · ช่องทางที่แจ้ง
 * · วางรูปจากคลิปบอร์ด (ก๊อปจากแชท LINE มาแปะได้เลย ไม่ต้องเซฟไฟล์ก่อน) · ติ๊กแจ้งลูกค้าทาง LINE
 * ไม่บังคับกรอบ 7 วัน/สถานะจัดส่งแล้ว — แต่ขึ้นป้ายเตือนให้เห็น · ออเดอร์เดียวมีเคสเปิดได้ทีละใบ (เซิร์ฟเวอร์ตอบ 409 พร้อมเลขเคสเดิม)
 */

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import Link from "next/link";
import { CLAIM_CHANNELS, CLAIM_FAULTS, CLAIM_TYPES, type Claim, type ClaimFault } from "@/lib/claims";
import { uploadClaimPhotoAdmin } from "@/lib/claims-repo";
import type { Order } from "@/lib/admin-data";
import { Btn } from "@/components/admin/ui";

type LiteOrder = { id: string; customer?: string; phone?: string; status?: string; date?: string };

/** ปุ่มชิปเลือกค่าเดียว — สไตล์เดียวกับชิปกรองของหน้า (dkb-fchip) */
function Chips<T extends string>({ value, options, onPick }: { value: T | ""; options: readonly T[]; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} className="dkb-fchip" onClick={() => onPick(o)}>
          <i />
          {o}
        </button>
      ))}
    </div>
  );
}

export default function NewClaimModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Claim) => void }) {
  // ── ค้นออเดอร์ ──
  const [q, setQ] = useState("");
  const [lite, setLite] = useState<LiteOrder[] | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);

  useEffect(() => {
    if (lite !== null) return;
    fetch("/api/admin/orders?lite=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setLite((j.orders ?? []) as LiteOrder[]))
      .catch(() => setLite([]));
  }, [lite]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !lite) return [];
    return lite.filter((o) => `${o.id} ${o.customer ?? ""} ${o.phone ?? ""}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, lite]);

  async function pickOrder(id: string) {
    setLoadingOrder(true);
    setErr("");
    try {
      const j = await fetch(`/api/admin/orders?id=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.json());
      const o = (j.orders ?? [])[0] as Order | undefined;
      if (!o) throw new Error(`ไม่พบออเดอร์ ${id}`);
      setOrder(o);
      setPicks({});
      setQ("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "โหลดออเดอร์ไม่ได้");
    }
    setLoadingOrder(false);
  }

  // ── รายละเอียดเคส ──
  /** index → จำนวนชิ้นที่เสีย (ไม่มี key = ไม่ติ๊ก) */
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [type, setType] = useState<(typeof CLAIM_TYPES)[number] | "">("");
  const [fault, setFault] = useState<ClaimFault | "">("");
  const [channel, setChannel] = useState<(typeof CLAIM_CHANNELS)[number] | "">("LINE");
  const [detail, setDetail] = useState("");
  const [notify, setNotify] = useState(true);
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [existingId, setExistingId] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    if (photos.length + list.length > 10) return setErr("แนบรูปได้ไม่เกิน 10 รูป");
    setErr("");
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const path = await uploadClaimPhotoAdmin(f);
        setPhotos((ps) => [...ps, { path, preview: URL.createObjectURL(f) }]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ");
      }
      setUploading((n) => n - 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault(); // รูปจากคลิปบอร์ด — ไม่ให้ไปโผล่เป็นข้อความในช่องรายละเอียด
    void addFiles(files);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (busy || uploading) return;
    if (!order) return setErr("เลือกออเดอร์ก่อน");
    if (!type) return setErr("เลือกประเภทปัญหา");
    if (!detail.trim()) return setErr("พิมพ์รายละเอียดที่ลูกค้าแจ้ง");
    setBusy(true);
    setErr("");
    setExistingId("");
    const res = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        items: Object.entries(picks).map(([i, qty]) => ({ index: Number(i), qty })),
        type,
        fault: fault || undefined,
        channel: channel || undefined,
        detail: detail.trim(),
        photoPaths: photos.map((p) => p.path),
        notify,
      }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok || !j.claim) {
      setErr(j.error ?? "บันทึกไม่สำเร็จ");
      if (j.existingId) setExistingId(j.existingId);
      return;
    }
    onCreated(j.claim as Claim);
    window.dispatchEvent(new Event("iducky:claims-changed"));
  }

  const shipped = order && ["จัดส่งแล้ว", "เสร็จสิ้น"].includes(order.status);

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="dkb-g max-h-[90vh] w-full max-w-2xl overflow-y-auto !bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="dkb-display text-[1.25rem]">➕ บันทึกเคลม</p>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--dk-navy-soft)" }}>
              ลูกค้าแจ้งทาง LINE/โทร แล้วทีมงานจดลงระบบ — ก๊อปรูปจากแชทมาวาง (Ctrl/⌘+V) ในหน้าต่างนี้ได้เลย
            </p>
          </div>
          <button type="button" onClick={onClose} className="dkb-fchip" aria-label="ปิด">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* ออเดอร์ */}
          {!order ? (
            <div>
              <label className="dkb-search !min-h-[42px]">
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches[0]) void pickOrder(matches[0].id);
                  }}
                  placeholder="เลขออเดอร์ / ชื่อลูกค้า / เบอร์โทร…"
                />
              </label>
              {q.trim() && (
                <div className="mt-2 grid gap-1">
                  {lite === null ? (
                    <p className="px-2 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                      กำลังโหลดรายชื่อออเดอร์…
                    </p>
                  ) : matches.length === 0 ? (
                    <p className="px-2 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                      ไม่พบออเดอร์ที่ตรงกับ “{q.trim()}”
                    </p>
                  ) : (
                    matches.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={loadingOrder}
                        onClick={() => void pickOrder(o.id)}
                        className="flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-left text-[13.5px] transition hover:bg-[var(--dk-sky)]"
                      >
                        <span className="min-w-0 truncate">
                          <b className="id">{o.id}</b> · {o.customer} {o.phone && <span style={{ color: "var(--dk-faint)" }}>· {o.phone}</span>}
                        </span>
                        <span className="shrink-0 text-[11.5px]" style={{ color: "var(--dk-navy-soft)" }}>
                          {o.status} · {o.date?.split(" ")[0]}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[16px] px-4 py-3" style={{ background: "var(--dk-sky)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
                <span>
                  <b className="id">{order.id}</b> · {order.customer} · {order.phone}
                  <span className="ml-2 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                    {order.status} · {order.date}
                  </span>
                </span>
                <button type="button" className="dkb-fchip" onClick={() => setOrder(null)}>
                  เปลี่ยนออเดอร์
                </button>
              </div>
              {!shipped && (
                <p className="mt-1 text-[12px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
                  ⚠️ ออเดอร์นี้ยังไม่ถึงสถานะจัดส่งแล้ว ({order.status}) — เปิดเคสได้ แต่เช็คให้แน่ใจว่าเป็นใบที่ถูกต้อง
                </p>
              )}
              <p className="mt-2 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                รายการที่มีปัญหา (ไม่ติ๊ก = ทั้งออเดอร์) · ใส่จำนวนชิ้นที่เสีย
              </p>
              <div className="mt-1 space-y-1">
                {order.items.map((it, i) => {
                  const on = picks[i] !== undefined;
                  return (
                    <label key={i} className="flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/70 px-2.5 py-1.5 text-[13px]">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setPicks((cur) => {
                            const next = { ...cur };
                            if (e.target.checked) next[i] = it.qty;
                            else delete next[i];
                            return next;
                          })
                        }
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {i + 1}. {it.name}
                      </span>
                      {on ? (
                        <span className="flex shrink-0 items-center gap-1 text-[12px]">
                          เสีย
                          <input
                            type="number"
                            min={1}
                            max={it.qty}
                            value={picks[i]}
                            onChange={(e) => setPicks((cur) => ({ ...cur, [i]: Math.max(1, Math.min(it.qty, Number(e.target.value) || 1)) }))}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-0.5 text-right"
                          />
                          / {it.qty}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                          ×{it.qty}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
              ประเภทปัญหา *
            </p>
            <Chips value={type} options={CLAIM_TYPES} onPick={setType} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                ความผิดอยู่ที่ใคร
              </p>
              <Chips value={fault} options={CLAIM_FAULTS} onPick={setFault} />
            </div>
            <div>
              <p className="mb-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                แจ้งมาทาง
              </p>
              <Chips value={channel} options={CLAIM_CHANNELS} onPick={setChannel} />
            </div>
          </div>

          <label className="dkb-g dkb-field">
            <span className="lb">รายละเอียดที่ลูกค้าแจ้ง *</span>
            <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="เช่น สแตนดี้แตกตรงฐาน 2 ตัว จาก 10 ตัว ลูกค้าส่งรูปมาทางไลน์" />
          </label>

          {/* รูป */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className="rounded-[16px] border-2 border-dashed px-4 py-3 transition"
            style={{ borderColor: dragOver ? "var(--dk-blue-deep)" : "var(--dk-hair)", background: dragOver ? "var(--dk-sky)" : "transparent" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((p, i) => (
                <span key={p.path} className="dkb-thumb relative !h-20 w-20">
                  <img src={p.preview} alt={`รูปเคลม ${i + 1}`} />
                  <button
                    type="button"
                    onClick={() => setPhotos((ps) => ps.filter((x) => x.path !== p.path))}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-bold text-slate-600 shadow"
                    aria-label="เอารูปออก"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span className="dkb-thumb !h-20 w-20 text-[11px]" style={{ color: "var(--dk-navy-soft)" }}>
                  อัป {uploading}…
                </span>
              )}
              <button type="button" className="dkb-fchip" onClick={() => fileInput.current?.click()}>
                📎 แนบรูป
              </button>
              <span className="text-[12px]" style={{ color: "var(--dk-faint)" }}>
                หรือวาง (⌘V) / ลากรูปมาที่นี่ · JPG/PNG/WEBP ไม่เกิน 10 รูป
              </span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[13.5px]">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
            แจ้งลูกค้าทาง LINE ว่ารับเรื่องเคลมแล้ว (ปิดได้ถ้าตอบในแชทไปแล้ว)
          </label>

          {err && (
            <p className="text-[13px] font-semibold" style={{ color: "var(--dk-coral-ink)" }}>
              {err}
              {existingId && (
                <>
                  {" "}
                  <Link href={`/admin/claims#${existingId}`} className="underline underline-offset-4" onClick={onClose}>
                    เปิดเคส {existingId}
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onClose}>ยกเลิก</Btn>
          <Btn tone="navy" disabled={busy || uploading > 0 || !order} onClick={() => void submit()}>
            {busy ? "กำลังบันทึก…" : "บันทึกเคลม"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
