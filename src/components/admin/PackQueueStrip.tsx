"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PACK_QUEUE_EVENT,
  clearPackQueue,
  loadPackQueue,
  markPackDone,
  packQueueLeft,
  packQueueNext,
  packQueuePos,
  packQueuePrev,
  shortOrderId,
  type PackQueue,
} from "@/lib/pack-queue";

/** อ่านคิวจากเครื่อง + ตามการเปลี่ยนแปลง (แท็บนี้และแท็บอื่น) */
function usePackQueue(): PackQueue | null {
  const [q, setQ] = useState<PackQueue | null>(null);
  useEffect(() => {
    const read = () => setQ(loadPackQueue());
    read();
    window.addEventListener(PACK_QUEUE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(PACK_QUEUE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return q;
}

/**
 * แถบคิวบนหัวโหมดแพ็ค — บอกว่ากำลังทำใบที่เท่าไรจากกี่ใบ แตะชิปเพื่อกระโดดไปใบไหนก็ได้
 * ไม่มีคิว (เปิดจาก QR ใบงานตรง ๆ / จากหน้ารายการ) = แถบบางมีปุ่ม “📋 คิวแพ็ค” ไปสถานี — กระดาษใบเดียวก็พาเข้าคิวได้
 */
export function PackQueueStrip({ currentId, onGo }: { currentId: string; onGo: (id: string) => void }) {
  const q = usePackQueue();
  const curRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    curRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentId, q]);
  // ยังไม่มีคิว (เปิดจาก QR ใบงาน / หน้ารายการ) → แถบบางบอกทางไปคิว จะได้ไล่ใบอื่นต่อโดยไม่ต้องสแกนกระดาษทุกใบ
  if (!q)
    return (
      <Link
        href="/admin/orders/scan"
        className="flex items-center gap-2 bg-slate-950 px-3 py-2 text-white"
        title="เปิดคิวแพ็ค — เลือกกองใบที่จะไล่ทำต่อ หรือสแกนกองใบงานทีเดียว"
      >
        <span className="rounded-lg bg-amber-400 px-2 py-1 text-[11px] font-extrabold text-slate-900">📋 คิวแพ็ค</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">ไล่ใบถัดไปจากมือถือ ไม่ต้องสแกนกระดาษทุกใบ</span>
        <span className="text-slate-400">›</span>
      </Link>
    );

  const pos = packQueuePos(q, currentId);
  const left = packQueueLeft(q);
  const next = packQueueNext(q, currentId);
  const prev = packQueuePrev(q, currentId);
  const label = q.source === "batch" ? "ชุดงาน" : "คิวแพ็ค";

  return (
    <div className="bg-slate-950 px-2 py-1.5 text-white">
      <div className="flex items-center gap-1.5">
        {/* ชื่อคิวกดกลับไปสถานี (ดูกองทั้งหมด / สแกนเพิ่ม) */}
        <Link href="/admin/orders/scan" className="shrink-0 pl-1 text-[11px] font-bold text-slate-300" title="กลับหน้าคิวแพ็ค">
          {label}
          <span className="ml-1 font-mono text-white">{pos ? `${pos}/${q.ids.length}` : `${q.ids.length} ใบ`}</span>
        </Link>
        {/* ชิปเลขใบ — เลื่อนแนวนอนได้ ใบปัจจุบันสีเหลือง ใบเสร็จแล้วสีเขียวมีติ๊ก */}
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {q.ids.map((id) => {
            const isCur = id === currentId.toUpperCase();
            const isDone = q.done.includes(id);
            return (
              <button
                key={id}
                ref={isCur ? curRef : undefined}
                type="button"
                onClick={() => !isCur && onGo(id)}
                title={id}
                aria-current={isCur ? "true" : undefined}
                className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-bold ${
                  isCur ? "bg-amber-400 text-slate-900" : isDone ? "bg-white/10 text-emerald-300" : "bg-white/10 text-slate-200"
                }`}
              >
                {isDone && !isCur ? "✓" : ""}
                {shortOrderId(id)}
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!prev}
            onClick={() => prev && onGo(prev)}
            className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-sm font-bold disabled:opacity-30"
            aria-label="ใบก่อนหน้า"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onGo(next)}
            className="grid h-8 min-w-8 place-items-center rounded-lg bg-white/10 px-2 text-sm font-bold disabled:opacity-30"
            aria-label="ใบถัดไป"
            title={next ? `ถัดไป ${next}` : "ไม่มีใบถัดไป"}
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`ล้าง${label}ทั้งหมด ${q.ids.length} ใบ? (ออเดอร์ไม่หาย แค่เลิกไล่ตามลำดับ)`)) clearPackQueue();
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-sm text-slate-400"
            aria-label={`ล้าง${label}`}
            title={`ล้าง${label}`}
          >
            ✕
          </button>
        </div>
      </div>
      {!pos && (
        <p className="px-1 pt-1 text-[10.5px] text-amber-300">
          ใบนี้ไม่อยู่ใน{label} · เหลืออีก {left} ใบ{next ? ` — แตะ › เพื่อไปใบถัดไป` : ""}
        </p>
      )}
    </div>
  );
}

/**
 * เด้งไปใบถัดไปหลังยิงเลขพัสดุ — โผล่เมื่อ trackingSaved เปลี่ยนจากยังไม่บันทึกเป็นบันทึกแล้ว "ในครั้งนี้" เท่านั้น
 * (เปิดใบที่ยิงไปแล้วมาดู ไม่เด้ง) · นับถอยหลัง 3 วิ กด "อยู่ต่อ" หยุดได้ · ไม่มีคิว = ไม่ทำอะไร
 */
export function PackNextToast({
  currentId,
  trackingSaved,
  onGo,
}: {
  currentId: string;
  trackingSaved: boolean;
  onGo: (id: string) => void;
}) {
  const prevSaved = useRef(trackingSaved);
  const [state, setState] = useState<{ next: string | null; left: number } | null>(null);
  const [sec, setSec] = useState(3);

  useEffect(() => {
    // เปลี่ยนใบ = เริ่มนับใหม่ (ค่าเริ่มของใบใหม่ต้องไม่ถูกมองว่าเป็น "เพิ่งบันทึก")
    prevSaved.current = trackingSaved;
    setState(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  useEffect(() => {
    if (trackingSaved && !prevSaved.current) {
      const q = markPackDone(currentId);
      if (q) {
        setState({ next: packQueueNext(q, currentId), left: packQueueLeft(q) });
        setSec(3);
      }
    }
    prevSaved.current = trackingSaved;
  }, [trackingSaved, currentId]);

  const go = useCallback(() => {
    if (state?.next) onGo(state.next);
    setState(null);
  }, [state, onGo]);

  useEffect(() => {
    if (!state?.next) return;
    if (sec <= 0) {
      go();
      return;
    }
    const t = window.setTimeout(() => setSec((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [state, sec, go]);

  if (!state) return null;
  return (
    <div className="fixed inset-x-0 bottom-[7.25rem] z-40 mx-auto max-w-[480px] px-3">
      <div className="rounded-2xl bg-emerald-700 p-3 text-white shadow-[0_10px_24px_rgba(0,0,0,0.3)]">
        {state.next ? (
          <>
            <p className="text-sm font-extrabold">✅ ใบนี้เสร็จแล้ว · ไปใบถัดไป {state.next}</p>
            <p className="text-xs text-emerald-100">
              เหลืออีก {state.left} ใบ · เด้งเองใน <span className="font-mono">{sec}</span> วิ
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setState(null)}
                className="flex-1 rounded-xl bg-white/15 py-2.5 text-sm font-bold"
              >
                อยู่ต่อ
              </button>
              <button type="button" onClick={go} className="flex-1 rounded-xl bg-white py-2.5 text-sm font-extrabold text-emerald-800">
                ไปเลย →
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-extrabold">🎉 ครบทุกใบในคิวแล้ว</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setState(null)} className="flex-1 rounded-xl bg-white/15 py-2.5 text-sm font-bold">
                ปิด
              </button>
              <Link
                href="/admin/orders/scan"
                onClick={() => clearPackQueue()}
                className="flex-1 rounded-xl bg-white py-2.5 text-center text-sm font-extrabold text-emerald-800"
              >
                กลับสถานีแพ็ค
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
