"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/products";
import { fetchProductsByIds } from "@/lib/product-repo";
import { defaultSpecText } from "@/lib/product-spec";
import type { OrderItem } from "@/lib/admin-data";
import { uploadArtworkFile } from "@/lib/artwork-upload";

export interface ItemAdderProps {
  /** เพิ่มรายการเข้าออเดอร์/ใบเสนอราคา */
  onAdd: (item: OrderItem) => void;
  /** คีย์เก็บร่างในเครื่อง — ต้องไม่ซ้ำกันต่อออเดอร์/ต่อใบ เช่น `order.OD-xxx` */
  draftKey: string;
  /** กด "หยิบจากหน้าร้าน" — เปิดหน้าร้านให้แอดมินเลือกสินค้าจริง (ได้ตัวเลือก/ราคาขั้นบันได) */
  onShopAdd: () => void;
  /** คำเรียกปลายทาง เช่น "ออเดอร์" หรือ "ใบเสนอราคา" */
  target?: string;
}

/**
 * 🛠️ ตัวเพิ่มรายการกลาง — ใช้ร่วมกันระหว่างหน้าออเดอร์กับหน้าใบเสนอราคา
 * 2 ทาง: กรอกเอง (สินค้าในเว็บ / งานพิเศษ + คลังสินค้าพิเศษ + แนบภาพลาย) หรือหยิบจากหน้าร้านจริง
 */
export default function ItemAdder({ onAdd, draftKey, onShopAdd, target = "ออเดอร์" }: ItemAdderProps) {
  const [open, setOpen] = useState(false);
  /** เพิ่มได้ 2 แบบ — สินค้าที่มีในเว็บ (ผูก productId จริง) หรืองานพิเศษที่ไม่มีหน้าเว็บ */
  const [mode, setMode] = useState<"web" | "special">("web");
  const [webList, setWebList] = useState<{ id: string; name: string; price: number }[]>([]);
  const [webPick, setWebPick] = useState<{ id: string; name: string; price: number } | null>(null);
  const [webQuery, setWebQuery] = useState("");
  /** กำลังดึงสเปคของสินค้าที่เพิ่งเลือกอยู่ */
  const [specBusy, setSpecBusy] = useState(false);
  /** สเปคที่แอดมินพิมพ์เองก่อนถูกสเปคของสินค้าเขียนทับ — ไว้กดคืน */
  const [specUndo, setSpecUndo] = useState<string | null>(null);
  useEffect(() => {
    if (!open || mode !== "web" || webList.length) return;
    fetch("/api/admin/products-lite", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setWebList(j.list ?? []))
      .catch(() => {});
  }, [open, mode, webList.length]);
  const [name, setName] = useState("");
  const [spec, setSpec] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [err, setErr] = useState("");
  /** สเปคชุดล่าสุดที่ระบบเติมให้ (ไม่ใช่ที่แอดมินพิมพ์เอง) — ใช้ตัดสินว่าเขียนทับได้ไหม */
  const [specAuto, setSpecAuto] = useState("");
  // เก็บเงาไว้ในอ้างอิงด้วย: ตัวเติมสเปครออ่านค่า "ล่าสุด" หลัง await (แอดมินพิมพ์แทรกระหว่างนั้นได้)
  const autoSpecRef = useRef("");
  const specRef = useRef("");
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);
  const rememberAutoSpec = (text: string) => {
    autoSpecRef.current = text;
    setSpecAuto(text);
  };
  // ภาพลายที่ลูกค้าส่งมาทางแชท — แอดมินแนบให้กราฟฟิกดูตอนสั่งงานพิเศษ
  const [art, setArt] = useState<string[]>([]);
  // ── กันกรอกเสร็จแล้วรีเฟรชทิ้ง: เก็บร่างไว้ในเครื่อง จนกว่าจะกด "เพิ่มเข้าออเดอร์" หรือยกเลิก ──
  const DRAFT_KEY = `admin.${draftKey}.specialDraft`;
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { name?: string; spec?: string; qty?: string; price?: string; art?: string[] };
        if (d.name || d.spec || d.price || (d.art?.length ?? 0)) {
          setName(d.name ?? "");
          setSpec(d.spec ?? "");
          setQty(d.qty ?? "1");
          setPrice(d.price ?? "");
          setArt(d.art ?? []);
          setOpen(true);
        }
      }
    } catch {}
    setDraftLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const dirty = open && Boolean(name.trim() || spec.trim() || price.trim() || art.length);
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      if (dirty) localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, spec, qty, price, art }));
      else localStorage.removeItem(DRAFT_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, dirty, name, spec, qty, price, art]);
  // เตือนก่อนปิด/รีเฟรชหน้าทั้งที่ยังไม่ได้กดเพิ่มเข้าออเดอร์
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [artBusy, setArtBusy] = useState(false);
  const [artDrag, setArtDrag] = useState(false);
  // คลังสินค้าพิเศษ (นำเข้าจากระบบเดิม/เพิ่มเอง) — โหลดครั้งเดียวตอนเปิดฟอร์ม
  const [catalog, setCatalog] = useState<{ name: string; detail: string }[]>([]);
  const [showSug, setShowSug] = useState(false);
  useEffect(() => {
    if (!open || catalog.length) return;
    fetch("/api/admin/special-products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCatalog(j.list ?? []))
      .catch(() => {});
  }, [open, catalog.length]);
  const kw = name.trim().toLowerCase();
  const suggestions = kw ? catalog.filter((p) => p.name.toLowerCase().includes(kw)).slice(0, 8) : [];

  /**
   * เติมสเปคตามตัวเลือกจริงของสินค้าที่เลือกจากหน้าเว็บ (ค่าเริ่มต้นเหมือนหน้าสินค้า)
   * เดิมเลือกสินค้าแล้วเติมให้แค่ชื่อ/ราคา ช่องสเปคเลยค้างข้อความของรายการก่อนหน้า = สเปคไม่ตรงสินค้า
   * ที่แอดมินพิมพ์เองจะไม่หายเงียบ ๆ — เก็บไว้ให้กด "คืนสเปคเดิม" ได้
   */
  async function fillSpecFromWeb(id: string) {
    setSpecBusy(true);
    try {
      const [full] = await fetchProductsByIds([id]);
      const text = full ? defaultSpecText(full) : "";
      const prev = specRef.current;
      const wasAuto = prev === autoSpecRef.current;
      if (!text) {
        // สินค้าไม่มีกลุ่มตัวเลือก — ล้างเฉพาะสเปคที่ระบบเติมจากสินค้าตัวก่อน ไม่แตะที่พิมพ์เอง
        if (wasAuto && prev) setSpec("");
        rememberAutoSpec("");
        setSpecUndo(null);
        return;
      }
      setSpecUndo(prev.trim() && !wasAuto ? prev : null);
      rememberAutoSpec(text);
      setSpec(text);
    } catch {
      // ดึงสินค้าไม่ได้ = ปล่อยช่องสเปคไว้ตามเดิม ให้แอดมินพิมพ์เอง
    } finally {
      setSpecBusy(false);
    }
  }

  function submit() {
    const n = name.trim();
    const q = Math.max(1, Math.floor(Number(qty) || 0));
    const p = Math.max(0, Number(price) || 0);
    if (!n) return setErr("ใส่ชื่องานก่อน");
    if (!Number(qty) || Number(qty) < 1) return setErr("จำนวนต้องอย่างน้อย 1");
    onAdd({
      productId: mode === "web" && webPick ? webPick.id : "special-item",
      name: n,
      selections: spec.trim(),
      qty: q,
      unitPrice: p,
      ...(art.length ? { artworkUrls: art } : {}),
    });
    setWebPick(null);
    setWebQuery("");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setOpen(false);
    setName("");
    setSpec("");
    setQty("1");
    setPrice("");
    setArt([]);
    setErr("");
    rememberAutoSpec("");
    setSpecUndo(null);
  }

  // ฟอร์มเปิดอยู่ → รับรูปจากคลิปบอร์ด (⌘/Ctrl+V) และกันเบราว์เซอร์เปิดไฟล์ที่โยนพลาดนอกกรอบ
  useEffect(() => {
    if (!open) return;
    const stop = (e: DragEvent) => e.preventDefault();
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      void uploadArt(dt.files);
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
      window.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, art.length]);

  async function uploadArt(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    setArtBusy(true);
    for (const f of Array.from(files).slice(0, 5 - art.length)) {
      try {
        // ยิงตรงเข้า Supabase — รูปจากมือถือใหญ่เกินเพดาน body ของ Netlify ประจำ
        const url = await uploadArtworkFile(f);
        setArt((cur) => [...cur, url]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "อัปโหลดภาพไม่สำเร็จ");
        break;
      }
    }
    setArtBusy(false);
  }

  const inp =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";

  if (!open)
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700"
        >
          ＋ เพิ่มรายการเอง (กรอกชื่อ/ราคาเอง)
        </button>
        {/* เลือกจากหน้าร้านจริง — ได้ตัวเลือกครบ (ขนาด/เคลือบ/ราคาขั้นบันได) เหมือนลูกค้าสั่งเอง */}
        <button
          type="button"
          onClick={onShopAdd}
          title={`เปิดหน้าร้าน แล้วหยิบสินค้าใส่ตะกร้า — ระบบจะเพิ่มเข้า${target}นี้ให้เอง`}
          className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/40 px-4 py-2.5 text-sm font-bold text-teal-700 transition hover:bg-teal-50"
        >
          🛍️ หยิบจากหน้าร้าน (ได้ตัวเลือกครบ)
        </button>
      </div>
    );

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-slate-800">＋ เพิ่มรายการเข้า{target}</p>
        <div className="flex overflow-hidden rounded-full ring-1 ring-slate-200">
          {(
            [
              ["web", "🏷 สินค้าในเว็บ"],
              ["special", "🛠 งานพิเศษ (ไม่มีหน้าเว็บ)"],
            ] as ["web" | "special", string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={`px-3 py-1 text-xs font-bold transition ${
                mode === k ? "bg-amber-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "web" && (
        <div className="mb-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
            เลือกสินค้าจากหน้าเว็บ
            <input
              value={webQuery}
              onChange={(e) => {
                setWebQuery(e.target.value);
                setWebPick(null);
              }}
              placeholder="พิมพ์ชื่อสินค้า เช่น สติกเกอร์ · เสื้อยืด"
              className={`${inp} mt-1 font-semibold normal-case tracking-normal`}
            />
          </label>
          {!webPick && webQuery.trim() && (
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-200">
              {webList
                .filter((p) => p.name.toLowerCase().includes(webQuery.trim().toLowerCase()))
                .slice(0, 12)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setWebPick(p);
                      setWebQuery(p.name);
                      setName(p.name);
                      setPrice(String(p.price));
                      void fillSpecFromWeb(p.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 text-left text-sm last:border-0 hover:bg-amber-50"
                  >
                    <span className="truncate text-slate-700">{p.name}</span>
                    <span className="shrink-0 text-xs font-bold text-slate-500">{formatPrice(p.price)}</span>
                  </button>
                ))}
              {webList.filter((p) => p.name.toLowerCase().includes(webQuery.trim().toLowerCase())).length === 0 && (
                <p className="px-3 py-2 text-xs text-slate-400">ไม่พบสินค้าชื่อนี้ — สลับไปแท็บ “งานพิเศษ” ได้</p>
              )}
            </div>
          )}
          {webPick && (
            <p className="mt-1.5 text-[11px] font-bold text-emerald-700">
              ✓ เลือกแล้ว: {webPick.name} · ราคาเว็บ {formatPrice(webPick.price)} (แก้ราคา/สเปคด้านล่างได้)
            </p>
          )}
        </div>
      )}
      {/* วางเป็นแถวเดียวกับตารางรายการ: รูป · ชื่อ/สเปค · จำนวน · ราคา/ชิ้น */}
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] lg:grid-cols-[8rem_minmax(0,1fr)_5.5rem_9rem]">
        {/* 🎨 ภาพลายจากลูกค้า (แชท/อีเมล) — ให้กราฟฟิกใช้เป็นแนวทางทำแบบ */}
        <div className="sm:row-span-2 lg:row-span-1">
          {art.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {art.map((u, i) => (
                <div key={u} className="relative">
                  <a href={u} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt={`ภาพลาย ${i + 1}`} className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setArt((cur) => cur.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white"
                    aria-label="ลบภาพ"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {art.length < 5 && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setArtDrag(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setArtDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setArtDrag(false);
                void uploadArt(e.dataTransfer.files);
              }}
              title="ลากรูปมาวาง · คลิกเลือกไฟล์ · หรือ ⌘/Ctrl+V วางรูปที่ก๊อปจากแชท"
              className={`flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-2 text-center transition ${
                artDrag ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-white hover:border-amber-300"
              }`}
            >
              {artBusy ? (
                <span className="text-[11px] font-bold text-slate-500">กำลังอัปโหลด…</span>
              ) : artDrag ? (
                <span className="text-xs font-extrabold text-amber-700">⬇️ ปล่อยตรงนี้</span>
              ) : (
                <>
                  <span className="text-xl leading-none">🖼️</span>
                  <span className="text-[10px] font-bold leading-tight text-slate-500">แนบภาพลาย
                    <br />ลาก · คลิก · ⌘V</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={artBusy}
                onChange={(e) => {
                  void uploadArt(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        {/* ชื่องาน + สเปค */}
        <div className="space-y-2">
          <div className="relative">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              className={`${inp} font-semibold`}
              placeholder="ชื่องาน — พิมพ์แล้วมีคลังสินค้าพิเศษขึ้นให้เลือก"
            />
            {showSug && suggestions.length > 0 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setName(p.name);
                      setSpec(p.detail);
                      setShowSug(false);
                    }}
                    className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50"
                  >
                    <span className="block text-sm font-semibold text-slate-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">{p.detail.split("\n")[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            rows={3}
            className={`${inp} resize-y`}
            placeholder="สเปค/รายละเอียด (ไม่บังคับ) เช่น หนา 5 มม. · พิมพ์ UV 2 ด้าน"
          />
          {/* สเปคมาจากตัวเลือกจริงของสินค้าที่เลือก — บอกให้ชัดว่าเป็นค่าเริ่มต้นที่ต้องแก้ให้ตรงที่ลูกค้าสั่ง */}
          {specBusy && <p className="text-[11px] font-semibold text-slate-400">⏳ กำลังดึงสเปคของสินค้าที่เลือก…</p>}
          {!specBusy && webPick && spec !== "" && spec === specAuto && (
            <p className="text-[11px] leading-relaxed text-slate-500">
              📋 สเปคตั้งต้นจากตัวเลือกของ <span className="font-bold">“{webPick.name}”</span> (ค่าเริ่มต้นเหมือนหน้าสินค้า) — แก้ให้ตรงที่ลูกค้าสั่งได้
              <span className="block text-slate-400">อยากได้ตัวเลือกครบ + ราคาขั้นบันไดอัตโนมัติ ให้กด “🛍️ หยิบจากหน้าร้าน” แทน</span>
            </p>
          )}
          {specUndo && (
            <button
              type="button"
              onClick={() => {
                setSpec(specUndo);
                rememberAutoSpec("");
                setSpecUndo(null);
              }}
              className="text-[11px] font-bold text-amber-600 hover:underline"
            >
              ↩︎ คืนสเปคเดิมที่พิมพ์ไว้ (ก่อนเลือกสินค้า)
            </button>
          )}
        </div>

        {/* จำนวน */}
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
          จำนวน
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={`${inp} mt-1 text-center text-sm font-bold`}
          />
        </label>

        {/* ราคา/ชิ้น + ยอดรวมที่คิดได้ */}
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
          ราคา/ชิ้น (บาท)
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`${inp} mt-1 text-right text-sm font-bold`}
            placeholder="เช่น 1500"
          />
          <span className="mt-1 block text-right text-[11px] font-bold normal-case tracking-normal text-slate-500">
            {Number(price) > 0
              ? `รวม ${formatPrice(Math.max(1, Math.floor(Number(qty) || 0)) * Number(price))}`
              : "0 = รอตีราคา"}
          </span>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
        🎨 ภาพลาย: เก็บไฟล์ตามต้นฉบับที่เลือก ไม่บีบอัดซ้ำ — ภาพจากแชทมักถูกลดคุณภาพมาแล้ว ใช้เป็นแนวทางให้กราฟฟิก ไฟล์งานพิมพ์จริงขอลิงก์/อีเมลจากลูกค้าเพิ่ม
      </p>
      {err && <p className="mt-2 text-xs font-semibold text-rose-600">{err}</p>}
      {dirty && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
          ⚠️ ยังไม่ได้เพิ่มเข้า{target} — ต้องกดปุ่ม “✅ เพิ่มเข้า{target}” ด้านล่างก่อน ข้อมูลถึงจะบันทึกลงฐาน
          <span className="block font-semibold text-rose-600">(ถ้าเผลอปิดหน้าไป ระบบจำร่างไว้ให้ เปิดหน้านี้ใหม่จะเห็นที่กรอกค้างไว้)</span>
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className={`rounded-full px-5 py-1.5 text-xs font-bold text-white transition ${
            dirty ? "bg-emerald-600 shadow-sm hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"
          }`}
        >
          ✅ เพิ่มเข้า{target}
        </button>
        <button
          type="button"
          onClick={() => {
            if (dirty && !confirm(`ทิ้งข้อมูลที่กรอกไว้ใช่ไหม? (ยังไม่ได้เพิ่มเข้า${target})`)) return;
            try {
              localStorage.removeItem(DRAFT_KEY);
            } catch {}
            setName("");
            setSpec("");
            setQty("1");
            setPrice("");
            setArt([]);
            setOpen(false);
            setErr("");
            setWebPick(null);
            setWebQuery("");
            rememberAutoSpec("");
            setSpecUndo(null);
          }}
          className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          ยกเลิก
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        รายการจะเข้า{target}นี้ทันที (มีบันทึกว่าใครเพิ่ม) ·{" "}
        <Link href="/admin/special-products" className="font-semibold text-amber-600 hover:underline">
          จัดการรูปแบบการสินค้าสั่งพิเศษ →
        </Link>
      </p>
    </div>
  );
}
