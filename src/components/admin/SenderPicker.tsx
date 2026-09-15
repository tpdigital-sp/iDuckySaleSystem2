"use client";

/**
 * 📮 ผู้ส่งบนใบปะหน้า (ต่อออเดอร์) — งานฝากส่งของตัวแทนจำหน่าย
 *
 * ตัวแทนฝากเราผลิต+ส่งให้ลูกค้าปลายทางของเขา ปลายทางเปิดกล่องแล้วต้องเห็น "ชื่อร้านตัวแทน" ไม่ใช่ชื่อเรา
 * ตั้งช่องไหนใช้ช่องนั้น ที่เหลือตกไปใช้ข้อมูลร้าน (ดู senderOf ใน @/lib/order-sender)
 *
 * "จำไว้ใช้ครั้งหน้า" = อ่านผู้ส่งจากใบก่อน ๆ (GET /api/admin/orders/senders) ไม่มีทะเบียนแยก
 * — ชื่อ/เบอร์/ที่อยู่ตัวแทนเป็นข้อมูลส่วนตัว ห้ามลงแถว __dealers__ ที่อ่าน public ได้
 */

import { useCallback, useEffect, useState } from "react";
import type { OrderSender } from "@/lib/admin-data";
import { cleanSender, senderKey } from "@/lib/order-sender";

type SenderRow = OrderSender & { from: string; date?: string; uses: number; fromDealer?: boolean };

const EMPTY = { name: "", phone: "", address: "" };
const fill = (s: OrderSender | undefined) => ({ name: s?.name ?? "", phone: s?.phone ?? "", address: s?.address ?? "" });

export default function SenderPicker({
  orderId,
  sender,
  dealer,
  mayEdit,
  demo,
  onChange,
}: {
  orderId: string;
  sender?: OrderSender;
  /** ใบตัวแทน — เปิดช่องนี้ให้เห็นเลยโดยไม่ต้องกดหา */
  dealer?: boolean;
  mayEdit: boolean;
  demo?: boolean;
  /** undefined = กลับไปใช้ชื่อร้านเรา */
  onChange: (next: OrderSender | undefined) => void;
}) {
  const has = !!(sender?.name || sender?.phone || sender?.address);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fill(sender));
  const [book, setBook] = useState<{ recent: SenderRow[]; match?: SenderRow } | null>(null);

  // คลังผู้ส่งที่เคยใช้ — โหลดเมื่อจะได้ใช้จริงเท่านั้น (ใบตัวแทน / ใบที่ตั้งไว้แล้ว / ตอนกดเปิดช่อง)
  const wants = mayEdit && !demo && (dealer || has || open);
  const loadBook = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/orders/senders?order=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const j = (await r.json()) as { recent?: SenderRow[]; match?: SenderRow };
      setBook({ recent: j.recent ?? [], ...(j.match ? { match: j.match } : {}) });
    } catch {
      setBook({ recent: [] });
    }
  }, [orderId]);
  useEffect(() => {
    if (wants && !book) void loadBook();
  }, [wants, book, loadBook]);

  function save() {
    onChange(cleanSender(form));
    setOpen(false);
  }
  function use(row: OrderSender) {
    const next = cleanSender(row);
    setForm(fill(next));
    onChange(next);
    setOpen(false);
  }

  // คนที่แก้ออเดอร์ไม่ได้ (ฝ่ายแพ็ค/กราฟฟิก) — เห็นว่าใบนี้เป็นงานฝากส่ง แต่แก้ไม่ได้
  if (!mayEdit) {
    if (!has) return null;
    return (
      <p className="inline-flex items-start gap-1 rounded-lg bg-teal-50 px-2.5 py-1 text-[11px] font-bold leading-relaxed text-teal-800 ring-1 ring-teal-200">
        📮 ใบฝากส่ง — ผู้ส่งบนกล่อง: {sender?.name || "(ชื่อร้านเรา)"}
        {sender?.phone ? ` · ${sender.phone}` : ""}
      </p>
    );
  }

  const key = sender ? senderKey(sender) : "";
  const suggest = book?.match && senderKey(book.match) !== key ? book.match : undefined;

  return (
    <div className="space-y-1.5">
      {has && !open && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-2">
          <p className="text-[10.5px] font-bold text-teal-700">📮 ผู้ส่งบนใบปะหน้า (ใบฝากส่ง)</p>
          <p className="mt-0.5 text-[13px] font-bold text-slate-800">{sender?.name || "(ใช้ชื่อร้านเรา)"}</p>
          {sender?.phone && <p className="text-[12px] tabular-nums text-slate-600">โทร. {sender.phone}</p>}
          {sender?.address && <p className="whitespace-pre-line text-[12px] leading-snug text-slate-600">{sender.address}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setForm(fill(sender));
                setOpen(true);
              }}
              className="inline-flex min-h-[28px] items-center rounded-full border border-teal-200 bg-white px-2.5 text-[11px] font-bold text-teal-700 transition hover:bg-teal-50"
            >
              ✏️ แก้ผู้ส่ง
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(EMPTY);
                onChange(undefined);
              }}
              className="inline-flex min-h-[28px] items-center rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50"
            >
              กลับไปใช้ชื่อร้านเรา
            </button>
          </div>
        </div>
      )}

      {!has && !open && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setForm(fill(sender));
              setOpen(true);
            }}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
          >
            📮 ตั้งชื่อผู้ส่งเอง {dealer ? "(ใบฝากส่งตัวแทน)" : ""}
          </button>
          {suggest && (
            <button
              type="button"
              onClick={() => use(suggest)}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 text-[11px] font-bold text-teal-700 transition hover:bg-teal-100"
            >
              ↩️ {suggest.fromDealer ? "ใช้ผู้ส่งที่ตัวแทนตั้งไว้เอง" : "ใช้ผู้ส่งเดิมของลูกค้ารายนี้"}: {suggest.name || suggest.phone}
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="rounded-lg border border-teal-200 bg-white px-2.5 py-2">
          <p className="text-[10.5px] font-bold text-teal-700">📮 ผู้ส่งที่จะพิมพ์บนกล่อง</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            เว้นว่าง = ใช้ข้อมูลร้านช่องนั้น · ⚠️ ที่อยู่นี้คือที่อยู่ที่พัสดุ <b>ตีกลับ</b> ไปหา · ใบเสร็จ/ใบกำกับภาษียังเป็นชื่อร้านเราตามกฎหมาย
          </p>
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ชื่อร้าน/ผู้ส่ง เช่น ร้านเบนซ์ เบสท์"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-700 focus:border-teal-300 focus:outline-none"
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^\d\-+ ]/g, "") })}
              inputMode="tel"
              placeholder="เบอร์ผู้ส่ง"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] tabular-nums text-slate-700 focus:border-teal-300 focus:outline-none"
            />
          </div>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
            placeholder="ที่อยู่ผู้ส่ง (เว้นว่าง = ที่อยู่ร้านเรา — ของตีกลับมาที่ร้าน)"
            className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] text-slate-700 focus:border-teal-300 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {(book?.recent ?? []).slice(0, 6).map((r) => (
                <button
                  key={`${r.from}-${senderKey(r)}`}
                  type="button"
                  onClick={() => setForm(fill(r))}
                  title={[r.phone, r.address].filter(Boolean).join(" · ")}
                  className="inline-flex min-h-[26px] items-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {r.name || r.phone}
                  {r.uses > 1 ? ` ×${r.uses}` : ""}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setForm(fill(sender));
                  setOpen(false);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button type="button" onClick={save} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700">
                บันทึกผู้ส่ง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
