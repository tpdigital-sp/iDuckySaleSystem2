"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * ➕ บันทึกเคลม — ฟอร์มให้ทีมงานเปิดเคสเอง (ลูกค้าแจ้งทาง LINE/โทร/หน้าร้าน)
 *
 * ทำไมต้องมี: ออเดอร์เกือบทั้งหมดสั่งโดยไม่ล็อกอิน ลูกค้ายื่นเคลมจากหน้าบัญชีไม่ได้ เคสจริงมาทางแชท
 * ของที่ต่างจากฟอร์มลูกค้า: ค้นออเดอร์จากเลข/ชื่อ/เบอร์ · ติ๊กรายการ+จำนวนชิ้นที่เสีย · "ความผิดอยู่ที่ใคร" · ช่องทางที่แจ้ง
 * · วางรูปจากคลิปบอร์ด (ก๊อปจากแชท LINE มาแปะได้เลย ไม่ต้องเซฟไฟล์ก่อน) · ติ๊กแจ้งลูกค้าทาง LINE
 * ไม่บังคับกรอบ 7 วัน/สถานะจัดส่งแล้ว — แต่ขึ้นป้ายเตือนให้เห็น · ออเดอร์เดียวมีเคสเปิดได้ทีละใบ (เซิร์ฟเวอร์ตอบ 409 พร้อมเลขเคสเดิม)
 *
 * 🎨 รื้อผังใหม่ (23 ก.ย. 69) — ของเดิมทุกช่องหน้าตาน้ำหนักเท่ากัน ชิป "แจ้งมาทาง: Facebook" กลายเป็นของที่เด่นที่สุดบนจอ
 * ทั้งที่เป็นแค่สถิติ · ผังใหม่เรียงตามที่คนพูดกันจริงเวลารับเรื่อง: ① ใบไหน → ② เรื่องอะไร → ③ บันทึกไว้ให้ทีม
 *   · ปุ่มบันทึกตรึงท้ายกล่อง ไม่เลื่อนหายไปกับฟอร์ม · มือถือเป็นแผ่นชิดขอบล่าง ปุ่มอยู่ในระยะนิ้วโป้ง
 *   · ท้ายกล่องบอก "ยังขาดอะไร" ตลอดเวลา ไม่ใช่รอให้กดแล้วค่อยเด้ง error ที่อยู่คนละที่กับช่องที่ผิด
 *   · กรอกไว้แล้วกดพื้นหลัง/Esc = ไม่ปิดทันที (รูปที่อัปขึ้นไปแล้วหายฟรี) ต้องกด ✕ หรือ ยกเลิก
 * ชิ้นส่วนภาพทั้งหมด (.dkb-modal / .dkb-step / .dkb-ochip / .dkb-mchip / .dkb-drop) อยู่ใน dashboard.css ใช้ซ้ำกับกล่องอื่นได้
 */

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import Link from "next/link";
import { CLAIM_CHANNELS, CLAIM_FAULTS, CLAIM_TYPES, parseLegacyOrderPaste, parseLegacyOrderRef, type Claim, type ClaimFault } from "@/lib/claims";
import { uploadClaimPhotoAdmin } from "@/lib/claims-repo";
import type { Order } from "@/lib/admin-data";
import { Btn } from "@/components/admin/ui";

type LiteOrder = { id: string; customer?: string; phone?: string; status?: string; date?: string };

/** วันที่ของออเดอร์มาเป็น "23 ก.ย. 2569 14:36" — แถวผลค้นเอาแค่วัน (ของเดิม split(" ")[0] ได้ "23" เฉย ๆ) */
const dayOnly = (d?: string) => (d ?? "").replace(/\s+\d{1,2}:\d{2}$/, "");

/** หัวท่อน: เลขลำดับ → ชื่อท่อน → ป้าย "ต้องกรอก" → คำใบ้ · เลขเปลี่ยนเป็นเขียวเมื่อท่อนนั้นครบ */
function Step({ n, title, done, need, hint }: { n: number; title: string; done: boolean; need?: boolean; hint?: string }) {
  return (
    <div className="dkb-step" data-done={done ? "1" : "0"}>
      <i>{done ? "✓" : n}</i>
      <span className="t">{title}</span>
      {need && <span className="dkb-need">ต้องกรอก</span>}
      {hint && <span className="h">{hint}</span>}
    </div>
  );
}

/** ชุดตัวเลือกค่าเดียว — size "lg" = ของที่ต้องกรอก · "sm" = ของที่บันทึกไว้ดูสถิติ (ต้องเงียบกว่าเสมอ) */
function Chips<T extends string>({
  value,
  options,
  onPick,
  size = "sm",
}: {
  value: T | "";
  options: readonly T[];
  onPick: (v: T) => void;
  size?: "lg" | "sm";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} className={size === "lg" ? "dkb-ochip" : "dkb-mchip"} onClick={() => onPick(o)}>
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
  /** กรอกไว้แล้วแต่กดพื้นหลัง/Esc — ย้ำที่ปุ่มปิดก่อน ไม่ทิ้งงานทันที */
  const [warnClose, setWarnClose] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const legNameRef = useRef<HTMLInputElement | null>(null);

  // ── 📄 ใบนอกระบบ (ระบบเก่า / ขายหน้าร้าน) — ไม่มีใบให้ค้น ทีมงานพิมพ์เอง ──
  const [legacy, setLegacy] = useState(false);
  const [legId, setLegId] = useState("");
  const [legCustomer, setLegCustomer] = useState("");
  const [legPhone, setLegPhone] = useState("");
  const [legItems, setLegItems] = useState("");
  const [legAddress, setLegAddress] = useState("");
  /** รายการที่แกะได้จากใบเก่าที่ก๊อปมาวาง — ติ๊กเลือกได้เหมือนใบในระบบ */
  const [legRows, setLegRows] = useState<{ index: number; name: string; detail?: string; qty: number }[]>([]);
  const [legPicks, setLegPicks] = useState<Record<number, number>>({});
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const [legLoading, setLegLoading] = useState(false);
  /** ♻️ เปิดใบผลิตใหม่ ฿0 ให้เลยตอนกดบันทึก (ไม่ต้องไปกดปุ่มในการ์ดอีกรอบ) */
  const [makeRedo, setMakeRedo] = useState(false);
  /** 📦 ใบที่จะเอาใบผลิตใหม่ไปใส่กล่องรวมด้วย ("" = ส่งแยกตามปกติ) */
  const [shipWithId, setShipWithId] = useState("");
  /** ขั้นที่กำลังทำอยู่ตอนกดบันทึก — งานมี 3 ท่อน ต้องบอกว่าค้างตรงไหนถ้าพัง */
  const [step, setStep] = useState("");
  const [done, setDone] = useState<string[]>([]);
  /** สถานะ/วันที่/เลขพัสดุ ของใบเก่า — ดึงมาโชว์ให้ยืนยันว่าเปิดถูกใบ */
  const [legInfo, setLegInfo] = useState<{ status?: string; date?: string; tracking?: string; shipBy?: string } | null>(null);

  /** วางข้อความทั้งหน้าจาก backoffice → เติมชื่อ/เบอร์/ที่อยู่ + ตั้งรายการให้ติ๊ก */
  function applyPaste(text: string) {
    setPaste(text);
    if (text.trim().length < 40) return setPasteMsg("");
    const r = parseLegacyOrderPaste(text);
    if (!r.customer && !r.items.length) return setPasteMsg("อ่านไม่ออก — ลองก๊อปใหม่ทั้งหน้า (Ctrl/⌘+A แล้ว Ctrl/⌘+C) หรือกรอกเองข้างล่างก็ได้");
    if (r.customer) setLegCustomer(r.customer);
    if (r.phone) setLegPhone(r.phone);
    if (r.address) setLegAddress(r.address);
    setLegRows(r.items);
    setLegPicks({});
    setPasteMsg(`✓ อ่านได้: ${r.customer ?? "ไม่เจอชื่อ"}${r.phone ? ` · ${r.phone}` : ""} · ${r.items.length} รายการ`);
  }

  /** วางลิงก์ backoffice มาก็ได้ — ถอดเป็นเลขใบ (#81541) + เก็บลิงก์ไว้ให้กดเปิดจากการ์ดเคลม */
  const legRef = useMemo(() => parseLegacyOrderRef(legId), [legId]);

  /**
   * 🔄 วางลิงก์/พิมพ์เลขใบเสร็จ → ดึงจากระบบเก่าให้เลย ไม่ต้องให้คนไปก๊อปมาวางเอง
   * (หน้า review-order ของระบบนั้นเปิดสาธารณะ เซิร์ฟเวอร์เราเรียกแทนได้ — ยิงผ่าน route ของเราเพราะคนละโดเมน)
   * ล้มเหลวเมื่อไหร่ค่อยตกไปใช้ช่อง "ก๊อปทั้งหน้ามาวาง" เป็นทางสำรอง
   */
  const legacyId = legacy ? (legRef.ref.match(/^#?(\d{3,12})$/) ?? [])[1] : undefined;
  useEffect(() => {
    if (!legacyId) return;
    let dead = false;
    const t = setTimeout(async () => {
      setLegLoading(true);
      setPasteMsg("");
      try {
        const r = await fetch(`/api/admin/claims/legacy-order?id=${legacyId}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (dead) return;
        if (!r.ok || !j.order) {
          setPasteMsg(j.error ?? "ดึงใบจากระบบเก่าไม่ได้ — ก๊อปทั้งหน้ามาวางข้างล่างแทนได้");
          return;
        }
        const o = j.order as {
          customer: string;
          phone: string;
          address: string;
          status?: string;
          date?: string;
          tracking?: string;
          shipBy?: string;
          items: { index: number; name: string; detail?: string; qty: number }[];
        };
        if (o.customer) setLegCustomer(o.customer);
        if (o.phone) setLegPhone(o.phone);
        if (o.address) setLegAddress(o.address);
        setLegRows(o.items ?? []);
        setLegPicks({});
        setLegInfo({ status: o.status, date: o.date, tracking: o.tracking, shipBy: o.shipBy });
        setPasteMsg(`✓ ดึงจากระบบเก่าแล้ว — ${o.customer || "ไม่มีชื่อในใบ"} · ${o.items?.length ?? 0} รายการ`);
      } catch {
        if (!dead) setPasteMsg("ต่อระบบเก่าไม่ได้ — ก๊อปทั้งหน้ามาวางข้างล่างแทนได้");
      } finally {
        if (!dead) setLegLoading(false);
      }
    }, 350);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [legacyId]);

  /**
   * ใบอื่นของลูกค้าคนนี้ที่ยังไม่ส่งออกไป — เอาไว้เสนอให้ส่งรวมกล่องโดยไม่ต้องให้คนไปพิมพ์เลขเอง
   * จับจากเบอร์ก่อน (ตรงที่สุด) ไม่มีเบอร์ค่อยใช้ชื่อ · ใบที่จัดส่ง/ยกเลิก/เสร็จสิ้นแล้วคัดทิ้ง
   */
  const sameCustomerOrders = useMemo(() => {
    const phone = (legacy ? legPhone : (order?.phone ?? "")).replace(/\D/g, "");
    const name = (legacy ? legCustomer : (order?.customer ?? "")).trim();
    if (!lite || (!phone && !name)) return [];
    return lite
      .filter((o) => o.id !== order?.id)
      .filter((o) => !["จัดส่งแล้ว", "ยกเลิก", "เสร็จสิ้น"].includes(o.status ?? ""))
      .filter((o) => (phone ? (o.phone ?? "").replace(/\D/g, "") === phone : (o.customer ?? "").trim() === name))
      .slice(0, 5);
  }, [lite, legacy, legPhone, legCustomer, order]);

  /** ท่อน ① ครบแล้วหรือยัง — ใบจริงต้องเลือกมา · ใบนอกระบบต้องมีเลขอ้างอิง + ชื่อลูกค้า */
  const orderReady = legacy ? !!legRef.ref && !!legCustomer.trim() : !!order;
  /** ใบนอกระบบยิง LINE เองไม่ได้ (ไม่มีใบ = ไม่มีช่องทางของลูกค้า) */
  const canNotify = !legacy;

  const dirty = !!order || !!type || !!detail.trim() || photos.length > 0 || !!legId.trim() || !!legCustomer.trim() || legRows.length > 0;

  // ปิดด้วย Esc + ล็อกไม่ให้หน้าข้างหลังเลื่อนตาม (มือถือเลื่อนทะลุกล่องตลอด)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dirty) setWarnClose(true);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [dirty, onClose]);

  useEffect(() => {
    if (!warnClose) return;
    const t = setTimeout(() => setWarnClose(false), 6000);
    return () => clearTimeout(t);
  }, [warnClose]);

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

  /** สิ่งที่ยังขาดก่อนกดบันทึกได้ — โชว์ที่ท้ายกล่องตลอด ไม่ใช่รอให้กดแล้วค่อยบอก */
  const missing = [
    !legacy && !order && "เลือกใบออเดอร์",
    legacy && !legRef.ref && "ลิงก์หรือเลขใบเก่า",
    legacy && !legCustomer.trim() && "ชื่อลูกค้า",
    !type && "ประเภทปัญหา",
    !detail.trim() && "รายละเอียดที่ลูกค้าแจ้ง",
  ].filter(Boolean) as string[];

  /**
   * บันทึกครั้งเดียวจบ 3 ท่อน: เปิดเคส → เปิดใบผลิตใหม่ ฿0 → ผูกส่งรวมกล่อง
   * ทำเรียงกันฝั่งหน้าจอ (ไม่ใช่ทีเดียวในเซิร์ฟเวอร์) เพราะแต่ละท่อนมี API ของตัวเองที่มีกฎของมันอยู่แล้ว
   * ⚠️ ท่อนหลังพังไม่ล้มท่อนหน้า — เคสที่เปิดไปแล้วยังอยู่ บอกให้ไปกดปุ่มในการ์ดต่อเอาเอง ไม่ใช่เงียบ
   */
  async function submit() {
    if (busy || uploading || !orderReady || missing.length) return;
    setBusy(true);
    setErr("");
    setExistingId("");
    setDone([]);

    // ── ① เปิดเคส ──
    setStep("กำลังบันทึกเคลม…");
    const res = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: legacy ? legRef.ref : order!.id,
        ...(legacy
          ? {
              legacy: true,
              legacyUrl: legRef.url,
              customer: legCustomer.trim(),
              phone: legPhone.trim(),
              address: legAddress.trim(),
              itemsText: legItems.trim(),
              legacyItems: Object.entries(legPicks).map(([i, qty]) => ({ name: legRows[Number(i)]?.name, qty })),
            }
          : { items: Object.entries(picks).map(([i, qty]) => ({ index: Number(i), qty })) }),
        type,
        fault: fault || undefined,
        channel: channel || undefined,
        detail: detail.trim(),
        photoPaths: photos.map((p) => p.path),
        notify: canNotify && notify,
      }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !j.claim) {
      setBusy(false);
      setStep("");
      setErr(j.error ?? "บันทึกไม่สำเร็จ");
      if (j.existingId) setExistingId(j.existingId);
      return;
    }
    const claim = j.claim as Claim;
    const madeList = [`เปิดเคส ${claim.id}`];
    let failed = ""; // state setErr ยังไม่อัปเดตทันในฟังก์ชันนี้ — ต้องจำไว้เองว่าพังไหม

    // ── ② ใบผลิตใหม่ ฿0 ──
    let redoId = "";
    if (makeRedo) {
      setStep("กำลังเปิดใบผลิตใหม่…");
      const pickRows = legacy
        ? Object.entries(legPicks).map(([i], k) => ({ index: k, qty: legPicks[Number(i)] }))
        : Object.entries(picks).map(([i, qty]) => ({ index: Number(i), qty }));
      const r = await fetch("/api/admin/orders/redo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(legacy ? { fromClaimId: claim.id } : { fromId: claim.orderId, claimId: claim.id }),
          mode: "claim",
          reason: `${claim.id} · ${type}`,
          ...(pickRows.length ? { picks: pickRows } : {}),
          notify: canNotify && notify,
        }),
      }).catch(() => null);
      const rj = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok || !rj.id) {
        failed = `เปิดเคสแล้ว (${claim.id}) แต่สร้างใบผลิตใหม่ไม่สำเร็จ: ${rj.error ?? "ลองกดปุ่ม ♻️ ในการ์ดเคสอีกครั้ง"}`;
        setErr(failed);
      } else {
        redoId = String(rj.id);
        madeList.push(`ใบผลิตใหม่ ${redoId} (฿0)`);
      }
    }

    // ── ③ ผูกส่งรวมกล่อง ──
    if (redoId && shipWithId.trim()) {
      setStep("กำลังผูกส่งรวมกล่อง…");
      const r = await fetch("/api/admin/orders/ship-with", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainId: shipWithId.trim(), riderId: redoId }),
      }).catch(() => null);
      const sj = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) {
        failed = `สร้างใบ ${redoId} แล้ว แต่ผูกส่งรวมกล่องไม่สำเร็จ: ${sj.error ?? "ลองผูกเองในหน้าใบนั้น"}`;
        setErr(failed);
      } else madeList.push(`ส่งรวมกล่องกับ ${shipWithId.trim()}`);
    }

    setBusy(false);
    setStep("");
    setDone(madeList);
    window.dispatchEvent(new Event("iducky:claims-changed"));
    // มีอะไรพังระหว่างทาง = ค้างหน้าต่างไว้ให้อ่าน · ราบรื่นหมดค่อยปิด
    if (!failed) onCreated(claim);
  }

  const shipped = order && ["จัดส่งแล้ว", "เสร็จสิ้น"].includes(order.status);
  const pickedCount = Object.keys(picks).length;

  return (
    <div
      className="dkb-mwrap"
      onClick={() => {
        if (dirty) setWarnClose(true);
        else onClose();
      }}
    >
      <div className="dkb-modal" onClick={(e) => e.stopPropagation()} onPaste={onPaste} role="dialog" aria-modal="true" aria-label="บันทึกเคลม">
        {/* ── หัวกล่อง (ตรึง) ── */}
        <div className="dkb-mhead">
          <div className="min-w-0 flex-1">
            <p className="ti">🧰 บันทึกเคลม</p>
            <p className="sub">ลูกค้าแจ้งมาทาง LINE/โทร แล้วทีมงานจดลงระบบ — ก๊อปรูปจากแชทมาวาง (Ctrl/⌘+V) ตรงไหนก็ได้ในหน้าต่างนี้</p>
          </div>
          <button type="button" onClick={onClose} className="dkb-x" data-warn={warnClose ? "1" : "0"} aria-label="ปิดโดยไม่บันทึก">
            ✕
          </button>
        </div>

        {/* ── เนื้อหา (เลื่อนเฉพาะตรงนี้) ── */}
        <div className="dkb-mbody">
          {/* ① ใบไหน */}
          <section>
            <Step
              n={1}
              title="เคลมใบไหน"
              done={orderReady}
              need={!orderReady}
              hint={
                orderReady
                  ? undefined
                  : legacy
                    ? "ก๊อปลิงก์ใบจาก backoffice มาวางได้เลย — ระบบถอดเลขใบให้เอง (หรือพิมพ์คำอ้างอิงเองก็ได้)"
                    : "พิมพ์เลขออเดอร์ ชื่อลูกค้า หรือเบอร์โทร แล้วกดเลือกจากรายการ"
              }
            />

            {legacy ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  className="dkb-inp"
                  value={legId}
                  onChange={(e) => setLegId(e.target.value)}
                  placeholder="วางลิงก์ใบจากระบบเก่า หรือพิมพ์เลขใบ / คำอ้างอิงเอง"
                />
                {(legRef.url || legacyId) && (
                  <p className="-mt-0.5 px-1 text-[12px]" style={{ color: legLoading ? "var(--dk-navy-soft)" : "var(--dk-mint-ink)" }}>
                    {legLoading ? (
                      <>⏳ กำลังดึงใบ {legRef.ref} จากระบบเก่า…</>
                    ) : (
                      <>
                        ✓ ใบ <b>{legRef.ref}</b>
                        {legInfo?.status ? ` · ${legInfo.status}` : ""}
                        {legInfo?.date ? ` · ${legInfo.date}` : ""}
                        {legInfo?.tracking ? ` · ${legInfo.shipBy || "พัสดุ"} ${legInfo.tracking}` : ""}
                      </>
                    )}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    ref={legNameRef}
                    className="dkb-inp flex-1"
                    value={legCustomer}
                    onChange={(e) => setLegCustomer(e.target.value)}
                    placeholder="ชื่อลูกค้า (ต้องกรอก)"
                  />
                  <input className="dkb-inp flex-1" value={legPhone} onChange={(e) => setLegPhone(e.target.value)} placeholder="เบอร์โทร (ถ้ามี)" />
                </div>
                <input className="dkb-inp" value={legAddress} onChange={(e) => setLegAddress(e.target.value)} placeholder="ที่อยู่ลูกค้า (ไว้ส่งของชดเชย ถ้ามี)" />

                {/* 📋 ก๊อปทั้งหน้าใบจาก backoffice มาวาง — ระบบแกะชื่อ/เบอร์/ที่อยู่/รายการให้
                    (เรียก API ของระบบนั้นตรง ๆ ไม่ได้ อยู่หลังประตูล็อกอินของเขา แต่คนทำงานเปิดใบค้างอยู่แล้ว) */}
                {legRows.length === 0 ? (
                  !legLoading && (
                    <label className="block">
                      <span className="mb-1 block px-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                        📋 ทางสำรอง ถ้าดึงอัตโนมัติไม่ได้ — เปิดใบใน backoffice → Ctrl/⌘+A → Ctrl/⌘+C → วางทั้งก้อนตรงนี้
                      </span>
                      <textarea rows={2} className="dkb-inp" value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder="วางข้อความทั้งหน้าจากใบเก่าที่นี่" />
                    </label>
                  )
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px]" style={{ color: "var(--dk-mint-ink)" }}>
                      {pasteMsg}
                    </p>
                    <button
                      type="button"
                      className="dkb-mchip"
                      onClick={() => {
                        setLegRows([]);
                        setLegPicks({});
                        setPaste("");
                        setPasteMsg("");
                        setLegInfo(null);
                      }}
                    >
                      ล้างรายการ
                    </button>
                  </div>
                )}
                {legRows.length === 0 && pasteMsg && (
                  <p className="px-1 text-[12px]" style={{ color: pasteMsg.startsWith("✓") ? "var(--dk-mint-ink)" : "var(--dk-coral-ink)" }}>
                    {pasteMsg}
                  </p>
                )}

                {legRows.length > 0 ? (
                  <div className="dkb-obar">
                    <p className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                      ชิ้นไหนเสีย{" "}
                      {Object.keys(legPicks).length === 0 && <span style={{ color: "var(--dk-faint)" }}>· ไม่ติ๊ก = เคลมทั้งใบ</span>}
                    </p>
                    <div className="mt-1">
                      {legRows.map((it) => {
                        const on = legPicks[it.index] !== undefined;
                        return (
                          <label key={it.index} className="dkb-pick" data-on={on ? "1" : "0"} title={it.detail}>
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) =>
                                setLegPicks((cur) => {
                                  const next = { ...cur };
                                  if (e.target.checked) next[it.index] = it.qty;
                                  else delete next[it.index];
                                  return next;
                                })
                              }
                            />
                            <span className="nm">
                              {it.index + 1}. {it.name}
                            </span>
                            {on ? (
                              <span className="qty">
                                เสีย
                                <input
                                  type="number"
                                  min={1}
                                  max={it.qty}
                                  value={legPicks[it.index]}
                                  onChange={(e) =>
                                    setLegPicks((cur) => ({ ...cur, [it.index]: Math.max(1, Math.min(it.qty, Number(e.target.value) || 1)) }))
                                  }
                                />
                                / {it.qty}
                              </span>
                            ) : (
                              <span className="qty" style={{ color: "var(--dk-faint)" }}>
                                ×{it.qty}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <input
                    className="dkb-inp"
                    value={legItems}
                    onChange={(e) => setLegItems(e.target.value)}
                    placeholder="รายการที่เสีย ถ้าระบุได้ — คั่นหลายรายการด้วย ,"
                  />
                )}
                <p className="rounded-[13px] px-3 py-2 text-[12px] leading-relaxed" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                  ใบนอกระบบ: ระบบ <b>ไม่ส่ง LINE ให้เอง</b> (ไม่มีใบ = ไม่รู้ว่าลูกค้าอยู่ห้องแชทไหน) ตอบลูกค้าในแชทที่คุยอยู่ได้เลย ·
                  ในหน้าเคลมจะ<b>ไม่มีปุ่มสร้างงานผลิตใหม่</b> ถ้าต้องผลิตซ่อมให้เปิดใบงานพิเศษเองแล้วใส่เลขไว้ในช่องแนวทางชดเชย
                </p>
                <button type="button" className="dkb-mchip self-start" onClick={() => setLegacy(false)}>
                  ← กลับไปค้นใบในระบบ
                </button>
              </div>
            ) : !order ? (
              <>
                <label className="dkb-search flat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.2-3.2" />
                  </svg>
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => {
                      // วางลิงก์ใบระบบเก่าลงช่องค้นหา = สลับไปโหมดใบนอกระบบให้เลย
                      // (ค้นยังไงก็ไม่เจอ ถ้าไม่ทำให้ คนวางต้องกดปุ่มแล้วกลับไปก๊อปมาวางใหม่รอบสอง)
                      const v = e.target.value;
                      if (/^https?:\/\//i.test(v.trim())) {
                        setLegacy(true);
                        setLegId(v.trim());
                        setQ("");
                        setTimeout(() => legNameRef.current?.focus(), 0);
                        return;
                      }
                      setQ(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && matches[0]) void pickOrder(matches[0].id);
                    }}
                    placeholder="OD-260923-1234 / ชื่อลูกค้า / เบอร์โทร · หรือวางลิงก์ใบระบบเก่า"
                  />
                </label>
                {q.trim() && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {lite === null ? (
                      <p className="px-3 py-2 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                        กำลังโหลดรายชื่อออเดอร์…
                      </p>
                    ) : matches.length === 0 ? (
                      <p className="px-3 py-2 text-[12.5px]" style={{ color: "var(--dk-faint)" }}>
                        ไม่พบออเดอร์ที่ตรงกับ “{q.trim()}” — ลองเลขใบเต็ม หรือเบอร์ 10 หลัก · ถ้าเป็นใบจากระบบเก่าให้กดปุ่มข้างล่าง
                      </p>
                    ) : (
                      matches.map((o) => (
                        <button key={o.id} type="button" disabled={loadingOrder} onClick={() => void pickOrder(o.id)} className="dkb-hit">
                          <span className="who">
                            <span className="dkb-oid">{o.id}</span> · {o.customer}
                            {o.phone && <span style={{ color: "var(--dk-faint)" }}> · {o.phone}</span>}
                          </span>
                          <span className="when">
                            {o.status} · {dayOnly(o.date)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {/* 📄 ใบที่ไม่มีในระบบ (ระบบเก่า/ขายหน้าร้าน) — ค้นยังไงก็ไม่เจอ ต้องมีทางออกให้ ไม่ใช่ตันอยู่ตรงนี้ */}
                <button
                  type="button"
                  className="dkb-mchip mt-2"
                  onClick={() => {
                    setLegacy(true);
                    if (q.trim() && !legId.trim()) setLegId(q.trim()); // ยกคำที่ค้นค้างไว้ไปเป็นเลขอ้างอิง
                    setQ("");
                  }}
                >
                  📄 ใบนี้ไม่มีในระบบ (ระบบเก่า / ขายหน้าร้าน)
                </button>
              </>
            ) : (
              <div className="dkb-obar">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px]">
                      <span className="dkb-oid text-[15px]">{order.id}</span> · {order.customer}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                      {order.phone} · {order.status} · {order.date}
                    </p>
                  </div>
                  <button type="button" className="dkb-mchip" onClick={() => setOrder(null)}>
                    เปลี่ยนใบ
                  </button>
                </div>

                {!shipped && (
                  <p className="mt-2 rounded-[13px] px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--dk-yolk-wash)", color: "var(--dk-yolk-ink)" }}>
                    ใบนี้ยังไม่ถึง “จัดส่งแล้ว” (ตอนนี้ {order.status}) — เปิดเคสได้ แต่เช็คให้แน่ว่าเป็นใบที่ถูกต้อง
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                    ชิ้นไหนเสีย {pickedCount === 0 && <span style={{ color: "var(--dk-faint)" }}>· ไม่ติ๊ก = เคลมทั้งใบ</span>}
                  </p>
                  {pickedCount > 0 && (
                    <button type="button" className="dkb-mchip" onClick={() => setPicks({})}>
                      ล้างที่ติ๊ก ({pickedCount})
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  {order.items.map((it, i) => {
                    const on = picks[i] !== undefined;
                    return (
                      <label key={i} className="dkb-pick" data-on={on ? "1" : "0"}>
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
                        />
                        <span className="nm">
                          {i + 1}. {it.name}
                        </span>
                        {on ? (
                          <span className="qty">
                            เสีย
                            <input
                              type="number"
                              min={1}
                              max={it.qty}
                              value={picks[i]}
                              onChange={(e) => setPicks((cur) => ({ ...cur, [i]: Math.max(1, Math.min(it.qty, Number(e.target.value) || 1)) }))}
                            />
                            / {it.qty}
                          </span>
                        ) : (
                          <span className="qty" style={{ color: "var(--dk-faint)" }}>
                            ×{it.qty}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ② เรื่องอะไร */}
          <section>
            <Step n={2} title="ลูกค้าเจอปัญหาอะไร" done={!!type && !!detail.trim()} need={!type || !detail.trim()} />
            <Chips value={type} options={CLAIM_TYPES} onPick={setType} size="lg" />

            <textarea
              rows={3}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="dkb-inp mt-2.5"
              placeholder="เขียนตามที่ลูกค้าแจ้งมาเลย เช่น “สแตนดี้แตกตรงฐาน 2 ตัว จาก 10 ตัว ส่งรูปมาทางไลน์”"
            />

            {/* รูป — อยู่ใต้รายละเอียดเพราะเป็นของคู่กัน (ข้อความที่ลูกค้าพิมพ์ + รูปที่ลูกค้าส่ง) */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className="dkb-drop mt-2"
              data-over={dragOver ? "1" : "0"}
            >
              {photos.map((p, i) => (
                <span key={p.path} className="dkb-shot">
                  <img src={p.preview} alt={`รูปเคลม ${i + 1}`} />
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x.path !== p.path))} aria-label={`เอารูป ${i + 1} ออก`}>
                    ✕
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span className="dkb-shot text-[11px]" style={{ color: "var(--dk-navy-soft)" }}>
                  อัป {uploading}…
                </span>
              )}
              <button type="button" className="dkb-mchip" onClick={() => fileInput.current?.click()}>
                📎 แนบรูป
              </button>
              <span className="cap">
                {photos.length > 0 ? `${photos.length}/10 รูป · วาง ⌘V เพิ่มได้อีก` : "หรือวาง ⌘V / ลากไฟล์มาที่นี่ · JPG PNG WEBP ไม่เกิน 10 รูป"}
              </span>
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
          </section>

          {/* ③ บันทึกไว้ให้ทีม — ไม่บังคับ จึงต้องเงียบกว่าสองท่อนบน */}
          <section>
            <Step n={3} title="บันทึกไว้ให้ทีม" done={false} hint="ไม่กรอกก็บันทึกได้ — ใช้ดูย้อนหลังว่าเคลมส่วนใหญ่มาจากอะไร" />
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                  ความผิดอยู่ที่ใคร
                </p>
                <Chips value={fault} options={CLAIM_FAULTS} onPick={setFault} />
              </div>
              <div>
                <p className="mb-1.5 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                  ลูกค้าแจ้งมาทาง
                </p>
                <Chips value={channel} options={CLAIM_CHANNELS} onPick={setChannel} />
              </div>
            </div>

            {canNotify ? (
              <button type="button" className="dkb-swbox mt-3" onClick={() => setNotify((v) => !v)} aria-pressed={notify}>
                <span className="tx">
                  แจ้งลูกค้าทาง LINE ว่ารับเรื่องแล้ว
                  <small>ปิดได้ถ้าตอบในแชทไปแล้ว</small>
                </span>
                <span className="dkb-sw" data-off={notify ? "0" : "1"} />
              </button>
            ) : (
              <p className="mt-3 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                ใบนอกระบบไม่มีช่องทาง LINE ของลูกค้า — ตอบในแชทที่คุยอยู่แทน
              </p>
            )}
          </section>

          {/* ④ ทำงานต่อให้เลย — เดิมต้องกดบันทึก แล้วไปหาการ์ด กดปุ่ม ♻️ แล้วเปิดใบใหม่ไปผูกส่งรวมอีกหน้า (3 หน้าจอ) */}
          <section>
            <Step n={4} title="ทำต่อให้เลยไหม" done={false} hint="ติ๊กไว้แล้วกดบันทึกครั้งเดียวจบ — ไม่ติ๊กก็กดทีหลังในการ์ดเคสได้" />

            <button type="button" className="dkb-swbox" onClick={() => setMakeRedo((v) => !v)} aria-pressed={makeRedo}>
              <span className="tx">
                ♻️ เปิดใบผลิตใหม่ให้ฟรีเลย
                <small>ใบ ฿0 ค่าส่ง ฿0 · สถานะชำระแล้ว · ขึ้นบอร์ดกราฟฟิกทันที · ปริ้นใบงานได้เลย</small>
              </span>
              <span className="dkb-sw" data-off={makeRedo ? "0" : "1"} />
            </button>

            {makeRedo && (
              <div className="mt-2">
                <p className="mb-1.5 px-1 text-[12px]" style={{ color: "var(--dk-navy-soft)" }}>
                  📦 เอาใบผลิตใหม่ใส่กล่องไปกับใบอื่นด้วยไหม (ไม่เลือก = ส่งแยกกล่องตามปกติ)
                </p>
                {sameCustomerOrders.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {sameCustomerOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="dkb-mchip"
                        aria-pressed={shipWithId.trim() === o.id}
                        onClick={() => setShipWithId(shipWithId.trim() === o.id ? "" : o.id)}
                      >
                        <i />
                        <span className="dkb-oid">{o.id}</span>
                        <span style={{ fontWeight: 400, opacity: 0.75 }}>· {o.status}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  className="dkb-inp"
                  value={shipWithId}
                  onChange={(e) => setShipWithId(e.target.value)}
                  placeholder={sameCustomerOrders.length ? "หรือพิมพ์เลขใบอื่นเอง" : "พิมพ์เลขใบที่จะส่งรวมกล่อง เช่น OD-260923-3171"}
                />
                <p className="mt-1 px-1 text-[12px]" style={{ color: "var(--dk-faint)" }}>
                  บิลยังแยกกัน ยอดเงินทั้งสองใบไม่เปลี่ยน · ใบที่มีพัสดุเป็นใบหลัก (ยิงเลข+ใบปะหน้า) อีกใบขึ้นป้าย “ห้ามส่งแยก”
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ── ท้ายกล่อง (ตรึง) — บอกว่ายังขาดอะไร แล้วค่อยเป็นปุ่ม ── */}
        <div className="dkb-mfoot">
          <p className="msg" data-bad={err || warnClose ? "1" : "0"}>
            {step ? (
              <span style={{ color: "var(--dk-navy-soft)" }}>⏳ {step}</span>
            ) : done.length && !err ? (
              <span style={{ color: "var(--dk-mint-ink)" }}>✓ {done.join(" · ")}</span>
            ) : err ? (
              <>
                {err}
                {existingId && (
                  <>
                    {" "}
                    <Link href={`/admin/claims#${existingId}`} className="underline underline-offset-4" onClick={onClose}>
                      เปิดเคส {existingId}
                    </Link>
                  </>
                )}
              </>
            ) : warnClose ? (
              <>กรอกไว้แล้ว — กด ✕ หรือ ยกเลิก ถ้าจะทิ้งทั้งหมด</>
            ) : missing.length ? (
              <>ยังขาด: {missing.join(" · ")}</>
            ) : (
              <>พร้อมบันทึก · เคสจะขึ้นในสมุดเคลมทันที{canNotify && notify ? " และส่ง LINE หาลูกค้า" : ""}</>
            )}
          </p>
          <Btn onClick={onClose}>ยกเลิก</Btn>
          <Btn tone="navy" disabled={busy || uploading > 0 || missing.length > 0} onClick={() => void submit()}>
            {busy ? "กำลังบันทึก…" : uploading > 0 ? `รอรูป ${uploading}…` : makeRedo ? "บันทึก + เปิดใบผลิตใหม่" : "บันทึกเคลม"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
