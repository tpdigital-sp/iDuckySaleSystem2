"use client";

/**
 * 🪪 ช่องชื่อลูกค้าที่ค้นคลังผู้ติดต่อได้ (ใช้ร่วมกัน: หน้าออเดอร์ · หน้าใบเสนอราคา)
 *
 * เดิมอยู่ในไฟล์หน้าออเดอร์ไฟล์เดียว หน้าอื่นเลยต้องกรอกชื่อ/เบอร์/ที่อยู่เองทั้งชุด
 * ทั้งที่ลูกค้าคนเดียวกันอยู่ในคลัง ~28,000 รายอยู่แล้ว — และแต้มก็ผูกไม่ถูกคนตั้งแต่ต้น
 */

import { useEffect, useRef, useState } from "react";
import { formatPhone, type Contact } from "@/lib/contacts";

/**
 * 🪪 ช่องชื่อลูกค้า + รายชื่อผู้ติดต่อเด้งให้เลือก (คลังเดียวกับหน้า /admin/contacts ~28,000 ราย)
 *
 * พิมพ์ชื่อ/เบอร์ ≥ 2 ตัว → ค้นฝั่งเซิร์ฟเวอร์ (หน่วง 300ms กันยิงถี่) → เลือกแล้วเติม
 * ชื่อ/เบอร์/ที่อยู่ให้ทั้งชุด + ผูก contactId ไว้กับออเดอร์ เพื่อสะสมแต้มให้ถูกคนตั้งแต่ออเดอร์แรก
 */
export function CustomerContactInput({
  value,
  onChange,
  onBlur,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onPick: (c: Contact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // ค้นรอบล่าสุดจบแล้ว — ไว้โชว์ "ไม่พบ" (ไม่ใช่แค่เงียบ)
  const seq = useRef(0);

  // ค้นเฉพาะตอนช่องยังโฟกัส + พิมพ์มาแล้วอย่างน้อย 2 ตัว ("ยังไม่ระบุชื่อ" = ค่าตั้งต้น ไม่ใช่คำค้น)
  useEffect(() => {
    const q = value.trim();
    if (!open || q.length < 2 || q === "ยังไม่ระบุชื่อ") {
      setHits([]);
      setSearching(false);
      setSearched(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/contacts?q=${encodeURIComponent(q)}&limit=10`);
        const j = (await res.json().catch(() => ({}))) as { contacts?: Contact[]; total?: number };
        if (mySeq !== seq.current) return; // มีคำค้นใหม่กว่าแซงไปแล้ว
        setHits(j.contacts ?? []);
        setTotal(j.total ?? (j.contacts?.length ?? 0));
        setSearched(true);
      } catch {
        if (mySeq === seq.current) setHits([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value, open]);

  const showList = open && value.trim().length >= 2 && value.trim() !== "ยังไม่ระบุชื่อ";

  return (
    <div className="relative min-w-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        onBlur={() => {
          // หน่วงปิดลิสต์นิดเดียว ให้คลิกรายชื่อ (mousedown) ทำงานก่อน blur
          setTimeout(() => setOpen(false), 150);
          onBlur();
        }}
        placeholder="ยังไม่ระบุชื่อ — พิมพ์ชื่อเพื่อค้นจากคลังผู้ติดต่อ"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-bold text-slate-800 focus:border-amber-300 focus:outline-none"
      />
      {showList && (searching || searched) && (
        // ยืดคลุมช่องเบอร์โทรข้าง ๆ ด้วย (คอลัมน์ w-28 + gap-2) — รายชื่อจะได้กว้างพออ่านที่อยู่ออก
        <div className="absolute left-0 right-[-7.5rem] top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {searching && hits.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">กำลังค้นจากคลังผู้ติดต่อ…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-400">ไม่พบในคลังผู้ติดต่อ — กรอกข้อมูลเองได้เลย (ลองค้นด้วยเบอร์โทรบางส่วนก็ได้)</p>
          ) : (
            <>
              <ul className="max-h-72 overflow-y-auto">
                {hits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      // ใช้ mousedown + preventDefault กัน input เสีย focus (blur จะ persist ค่าที่พิมพ์ค้างทับของที่เลือก)
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setOpen(false);
                        onPick(c);
                      }}
                      className="block w-full min-h-[44px] px-3 py-2 text-left transition hover:bg-amber-50"
                    >
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[13px] font-bold text-slate-800">{c.name || "(ไม่มีชื่อ)"}</span>
                        {c.customerType === "dealer" && (
                          <span className="shrink-0 rounded bg-violet-100 px-1 text-[10px] font-bold text-violet-700">ตัวแทน</span>
                        )}
                        {c.point > 0 && (
                          <span className="shrink-0 rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">
                            {c.point.toLocaleString("th-TH")} แต้ม
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[11px] text-slate-400">#{c.id}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-slate-500">
                        {[formatPhone(c.phone), c.address].filter(Boolean).join(" · ") || "ไม่มีเบอร์/ที่อยู่"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {total > hits.length && (
                <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
                  เจอ {total.toLocaleString("th-TH")} ราย — พิมพ์เพิ่มเพื่อกรองให้แคบลง
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 🪪 ป้ายผู้ติดต่อที่ออเดอร์ผูกอยู่ — ดึงชื่อ/แต้มจริงมาโชว์ ให้แอดมินเห็นทันทีว่าแต้มจะเข้าใคร
 * ดึงไม่สำเร็จ (เน็ตสะดุด/รายชื่อถูกลบ) โชว์รหัสไว้ก่อน ไม่ปล่อยป้ายหาย
 */
export function ContactChip({ contactId, onUnlink }: { contactId: string; onUnlink: () => void }) {
  const [c, setC] = useState<Contact | null>(null);
  useEffect(() => {
    let dead = false;
    setC(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/contacts?q=${encodeURIComponent(contactId)}&limit=10`);
        const j = (await res.json().catch(() => ({}))) as { contacts?: Contact[] };
        const hit = (j.contacts ?? []).find((x) => x.id === contactId) ?? null;
        if (!dead) setC(hit);
      } catch {
        /* โชว์รหัสแทน */
      }
    })();
    return () => {
      dead = true;
    };
  }, [contactId]);
  return (
    <span
      className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200"
      title={`ผูกผู้ติดต่อ #${contactId} — ชำระครบแล้วแต้มเข้าคนนี้`}
    >
      🪪 {c ? c.name || `#${contactId}` : `#${contactId}`}
      {c && (
        <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] tabular-nums text-emerald-600">
          {c.point.toLocaleString("th-TH")} แต้ม
        </span>
      )}
      {c?.customerType === "dealer" && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">ตัวแทน</span>}
      <button
        type="button"
        onClick={onUnlink}
        className="rounded-full px-1 text-emerald-500 transition hover:bg-emerald-100 hover:text-emerald-800"
        title="ยกเลิกการผูกผู้ติดต่อ"
        aria-label="ยกเลิกการผูกผู้ติดต่อ"
      >
        ✕
      </button>
    </span>
  );
}
