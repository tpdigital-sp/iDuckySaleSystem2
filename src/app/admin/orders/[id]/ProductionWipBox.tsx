"use client";

import { useCallback, useEffect, useState } from "react";
import type { WipJob } from "@/lib/server/wip-production";

/**
 * 🏭 กล่อง "สถานะผลิต" หน้าออเดอร์ — งานของใบนี้บนบอร์ดผลิต TP (4 แผนก) อ่านอย่างเดียว (12 ต.ค. 69)
 *   โชว์ต่องาน: แผนก · ไฟล์/โฟลเดอร์ · ขั้นปัจจุบัน + ความคืบหน้า · เข้าขั้นนี้เมื่อไหร่ ใคร · เสร็จแล้ว · ปุ่มเปิดการ์ดบนบอร์ด
 *   ไม่พบงาน = ผลิตยังไม่รับเข้าบอร์ด (หรือชื่อโฟลเดอร์ไม่ตรง) — บอกตรง ๆ ไม่เดา
 */
type Resp = { jobs: WipJob[]; folders: string[]; tp: string; error?: string };
const SHOW_FOR = new Set(["อนุมัติแบบ", "กำลังผลิต", "จัดส่งแล้ว", "เสร็จสิ้น", "ชำระแล้ว", "ชำระแล้ว (รอผลิต)"]);

const ago = (isoStr: string | null) => {
  if (!isoStr) return "";
  const s = (Date.now() - new Date(isoStr).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีก่อน`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ก่อน`;
  return `${Math.floor(s / 86400)} วันก่อน`;
};
const thDate = (isoStr: string | null) => (isoStr ? new Date(isoStr).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "");

export default function ProductionWipBox({ orderId, status, hasFolder }: { orderId: string; status: string; hasFolder: boolean }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const relevant = SHOW_FOR.has(status) || hasFolder;

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/orders/wip?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as Resp | null;
      if (!res.ok || !j) throw new Error(j?.error || `HTTP ${res.status}`);
      setData(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (relevant) void load();
  }, [relevant, load]);

  if (!relevant && !data?.jobs.length) return null;
  const jobs = data?.jobs ?? [];
  const active = jobs.filter((j) => j.status === "active");
  const done = jobs.filter((j) => j.status === "done");
  const headline = loading && !data ? "กำลังดูบอร์ด…" : !jobs.length ? "ยังไม่พบงานบนบอร์ดผลิต" : active.length ? `${active.length} งานกำลังทำ${done.length ? ` · เสร็จแล้ว ${done.length}` : ""}` : `เสร็จแล้วทั้ง ${done.length} งาน`;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-slate-800">🏭 สถานะผลิต (บอร์ด TP)</p>
          <p className="mt-0.5 text-[12px] text-slate-500">{headline}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="ดูบอร์ดใหม่">
          {loading ? "…" : "↻"}
        </button>
      </div>

      {err && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">อ่านบอร์ดไม่ได้: {err}</p>}

      {data && !jobs.length && !err && (
        <p className="mt-2 text-[12px] text-slate-500">
          ฝ่ายผลิตยังไม่รับงานใบนี้เข้าบอร์ด หรือชื่อโฟลเดอร์บนบอร์ดไม่ตรงกับของใบนี้
          {data.folders.length ? ` (ค้นด้วย: ${data.folders.join(" · ")})` : " (ใบนี้ยังไม่มีชื่อโฟลเดอร์ผลิต)"}
        </p>
      )}

      {jobs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {(open ? jobs : jobs.slice(0, 4)).map((j) => {
            const pct = j.stageTotal ? Math.round((100 * (j.status === "done" ? j.stageTotal : j.stageIndex - 1)) / j.stageTotal) : 0;
            return (
              <li key={`${j.dept}-${j.id}`} className="rounded-xl border border-slate-200/70 bg-slate-50/60 p-2.5">
                <div className="flex items-center gap-2">
                  {j.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={j.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-lg">{j.deptEmoji}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-bold text-slate-800" title={j.folderName || j.name}>
                      {j.isUrgent && <span className="mr-1">🔥</span>}
                      {j.name || j.folderName || j.jobNo}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500">
                      {j.deptEmoji} {j.deptName} · {j.jobNo}
                      {j.jobType === "bulk" && j.dueDate ? ` · กำหนด ${thDate(j.dueDate)}` : ""}
                    </p>
                  </div>
                  <a href={j.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-100" title="เปิดการ์ดบนบอร์ดผลิต">
                    เปิดบอร์ด ↗
                  </a>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className={`font-bold ${j.status === "done" ? "text-emerald-700" : "text-sky-800"}`}>
                      {j.status === "done" ? "✅ เสร็จแล้ว" : `▶ ${j.stage}`}
                      {j.status === "active" && j.stageTotal ? <span className="ml-1 font-normal text-slate-500">ขั้น {j.stageIndex}/{j.stageTotal}</span> : null}
                    </span>
                    <span className="text-slate-500">
                      {j.status === "done" ? `${j.doneAt ? `เสร็จ ${ago(j.doneAt)}` : ""}${j.stageBy ? ` · ${j.stageBy}` : ""}` : j.enteredAt ? `เข้าขั้นนี้ ${ago(j.enteredAt)}${j.stageBy ? ` · จาก ${j.stageBy}` : ""}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
                    <div className={`h-full rounded-full ${j.status === "done" ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                  {j.route.length > 0 && j.status === "active" && (
                    <p className="mt-1 truncate text-[11px] text-slate-400" title={j.route.join(" → ")}>
                      {j.route.map((s, i) => (i + 1 < j.stageIndex ? `✓${s}` : i + 1 === j.stageIndex ? `[${s}]` : s)).join(" → ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {jobs.length > 4 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[12px] font-semibold text-sky-700 hover:underline">
          {open ? "ย่อ" : `ดูทั้งหมด ${jobs.length} งาน`}
        </button>
      )}
    </section>
  );
}
