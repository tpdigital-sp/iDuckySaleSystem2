"use client";

import { useState } from "react";
import Portal from "@/components/Portal";
import { CLAIM_CHANNELS, CLAIM_FAULTS, type ClaimFault } from "@/lib/claims";
import { FOLLOW_UP_REASONS, proofUnit, proofsOf, type Order } from "@/lib/admin-data";

/** ของที่ตกค้าง 1 บรรทัดที่ส่งกลับให้หน้าออเดอร์ (ตรงกับ body ของ POST /api/admin/orders/follow-up) */
export interface FollowUpPick {
  item: number;
  proof?: number;
  qty: number;
  unit?: string;
}

export interface FollowUpForm {
  items: FollowUpPick[];
  reason: string;
  fault: ClaimFault;
  note?: string;
  channel?: string;
  cost?: number;
}

/**
 * 📦 เปิดรอบ "ส่งตามให้" — ใบส่งออกไปแล้วแต่ของในกล่องไม่ครบ
 * (พนักงานแจ้ง 24 ก.ย. 69 · ดู FollowUpRound ใน admin-data.ts)
 *
 * ฟอร์มสั้นที่สุดเท่าที่พอเก็บสถิติได้: ของที่ตกค้าง + สาเหตุ + ความผิดของใคร
 * ⚠️ ไม่มีช่อง "แจ้งลูกค้า" — เจ้าของร้านเคาะว่าไลน์ออกตอนยิงเลขกล่องส่งตามเท่านั้น (ช่วงนี้แอดมินคุยเองในแชท)
 */
export default function FollowUpModal({ order, busy, onCancel, onSave }: { order: Order; busy?: boolean; onCancel: () => void; onSave: (f: FollowUpForm) => void }) {
  /** คีย์ "item:proof" (proof = -1 คือทั้งรายการ เมื่อรายการนั้นยังไม่มีรูปแบบงาน) → จำนวนที่ตกค้าง */
  const [sel, setSel] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState<ClaimFault>("ร้าน");
  const [channel, setChannel] = useState("");
  const [note, setNote] = useState("");
  const [cost, setCost] = useState("");

  const rows: { key: string; item: number; proof?: number; name: string; index?: number; unit: string; max: number; url?: string }[] = [];
  order.items.forEach((it, i) => {
    const ps = proofsOf(it);
    if (!ps.length) {
      rows.push({ key: `${i}:-1`, item: i, name: it.name, unit: "ชิ้น", max: Math.max(1, it.qty), url: it.artworkUrls?.[0] });
      return;
    }
    ps.forEach((p, j) => rows.push({ key: `${i}:${j}`, item: i, proof: j, name: it.name, index: j + 1, unit: proofUnit(p), max: Math.max(1, p.qty ?? it.qty), url: p.url }));
  });

  const toggle = (r: (typeof rows)[number]) =>
    setSel((cur) => {
      const next = new Map(cur);
      if (next.has(r.key)) next.delete(r.key);
      else next.set(r.key, 1); // ของที่ลืมมักขาดไม่กี่ชิ้น — เริ่มที่ 1 แล้วกด ＋ เอา
      return next;
    });
  const bump = (r: (typeof rows)[number], d: number) =>
    setSel((cur) => {
      const next = new Map(cur);
      const q = Math.max(0, Math.min((next.get(r.key) ?? 0) + d, r.max));
      if (q > 0) next.set(r.key, q);
      else next.delete(r.key);
      return next;
    });

  const qty = [...sel.values()].reduce((s, q) => s + q, 0);
  const ready = sel.size > 0 && !!reason.trim() && !busy;
  const submit = () => {
    if (!ready) return;
    onSave({
      items: rows.filter((r) => sel.has(r.key)).map((r) => ({ item: r.item, ...(r.proof !== undefined ? { proof: r.proof } : {}), qty: sel.get(r.key)!, unit: r.unit })),
      reason: reason.trim(),
      fault,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(channel ? { channel } : {}),
      ...(Number(cost) > 0 ? { cost: Number(cost) } : {}),
    });
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-4" onClick={onCancel}>
        <div
          className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
          style={{ maxHeight: "clamp(360px, 92dvh, 1000px)" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-sky-50 px-5 pb-3 pt-4 ring-1 ring-inset ring-sky-100">
            <p className="text-lg font-extrabold text-slate-900">📦 ส่งไม่ครบ — เปิดรอบส่งตาม</p>
            <p className="mt-0.5 text-xs text-slate-500">
              ใบนี้ส่งออกไปแล้วแต่ของในกล่องไม่ครบ · ติ๊กของที่ตกค้างแล้วใบจะกลับเข้าคิวปริ้นใบปะหน้า + คิวแพ็คให้เอง
              <br />
              <b className="text-sky-800">ยังไม่แจ้งลูกค้า</b> — ไลน์จะออกตอนยิงเลขกล่องส่งตาม (ช่วงนี้คุยกับลูกค้าในแชทเอง)
            </p>
          </div>

          <div className="px-5 pt-3">
            <p className="text-[11px] font-bold text-slate-700">ของที่ตกค้าง (ไม่ได้ไปกับกล่องแรก)</p>
            <ul className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {rows.map((r) => {
                const on = sel.has(r.key);
                const q = sel.get(r.key) ?? 0;
                return (
                  <li key={r.key} className={`rounded-xl p-1.5 ring-2 transition ${on ? "bg-sky-50 ring-sky-400" : "bg-slate-50 ring-slate-200"}`}>
                    <button type="button" onClick={() => toggle(r)} className="flex w-full items-center gap-2 text-left">
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                        {r.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.url} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-lg">📦</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-[11px] leading-tight">
                        <span className="block truncate font-bold text-slate-800">{r.name}</span>
                        <span className="text-slate-500">
                          {r.index ? `รูปที่ ${r.index} · ` : ""}สั่งไว้ {r.max.toLocaleString("th-TH")} {r.unit}
                        </span>
                        {on && <span className="block font-bold text-sky-700">✓ ตกค้าง {q} {r.unit}</span>}
                      </span>
                    </button>
                    {on && (
                      <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 ring-1 ring-sky-200">
                        <span className="text-[11px] font-bold text-sky-800">ขาด</span>
                        <button type="button" onClick={() => bump(r, -1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sky-100 text-sm font-extrabold text-sky-900">
                          −
                        </button>
                        <span className="w-10 text-center text-sm font-extrabold tabular-nums text-slate-800">{q}</span>
                        <button type="button" onClick={() => bump(r, 1)} className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sky-100 text-sm font-extrabold text-sky-900">
                          ＋
                        </button>
                        <span className="text-[11px] text-slate-500">/ {r.max} {r.unit}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-[11px] font-bold text-slate-700">ทำไมของถึงไม่ได้ไปกับกล่องแรก</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FOLLOW_UP_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${reason === r ? "bg-sky-600 text-white ring-sky-600" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="หรือพิมพ์เอง เช่น แพ็คสองใบพร้อมกันแล้วสลับกล่อง"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            />

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-700">ความผิดอยู่ที่ใคร (เข้าสมุดเคลม)</span>
                <select
                  value={fault}
                  onChange={(e) => setFault(e.target.value as ClaimFault)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                >
                  {CLAIM_FAULTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-700">ลูกค้าแจ้งมาทางไหน</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
                >
                  <option value="">— ร้านเจอเอง —</option>
                  {CLAIM_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block">
              <span className="text-[11px] font-bold text-slate-700">รายละเอียดเพิ่มเติม (ไม่บังคับ)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-[11px] font-bold text-slate-700">ค่าส่งกล่องนี้ที่ร้านออกเอง (บาท · ไม่บังคับ)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="เช่น 50"
                className="mt-1 w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums focus:border-sky-400 focus:outline-none"
              />
            </label>
          </div>

          <div className="sticky bottom-0 mt-3 flex items-center gap-2 border-t border-slate-100 bg-white px-5 py-3">
            <p className="mr-auto text-xs font-bold text-slate-600">
              {sel.size ? `ตกค้าง ${qty.toLocaleString("th-TH")} ชิ้น · ${sel.size} รายการ` : "ยังไม่ได้เลือกของที่ตกค้าง"}
            </p>
            <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={submit}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            >
              {busy ? "⏳ กำลังเปิดรอบ…" : "📦 เปิดรอบส่งตาม"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
