"use client";

import { slowestJob, useWipJobs } from "./useWipJobs";

/**
 * 🏭 บรรทัดสถานะผลิตใต้ป้ายสถานะหัวหน้าออเดอร์ (เจ้าของร้าน 12 ต.ค. 69 "อยากให้มันแจ้งที่สถานะด้วย")
 *   บอกขั้นปัจจุบันบนบอร์ด TP ของงานที่ช้าที่สุด เช่น "🏭 ซับ/เย็บ · QC/แพ็ค 5/5 · 2 วันก่อน" · เสร็จหมด = "ผลิตเสร็จแล้ว"
 *   ไม่มีงานบนบอร์ด = ไม่โชว์ · กดแล้วเลื่อนไปกล่อง "สถานะผลิต" · แสดงอย่างเดียว ไม่เปลี่ยนสถานะออเดอร์ให้
 */
const ago = (iso: string | null) => {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} นาทีก่อน`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ก่อน`;
  return `${Math.floor(s / 86400)} วันก่อน`;
};

export default function WipStatusLine({ orderId }: { orderId: string }) {
  const { data } = useWipJobs(orderId);
  const jobs = data?.jobs ?? [];
  if (!jobs.length) return null;
  const slow = slowestJob(jobs);
  const active = jobs.filter((j) => j.status === "active").length;
  const done = jobs.filter((j) => j.status === "done").length;
  const go = () => document.getElementById("production-wip-box")?.scrollIntoView({ behavior: "smooth", block: "center" });

  if (!slow) {
    return (
      <button type="button" onClick={go} title="ทุกงานบนบอร์ดผลิตปิดครบแล้ว — กดดูรายละเอียด" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
        <span aria-hidden>🏭</span>
        ผลิตเสร็จแล้ว{done > 1 ? ` ${done} งาน` : ""}
      </button>
    );
  }
  const others = active - 1;
  return (
    <button
      type="button"
      onClick={go}
      title={`งานบนบอร์ดผลิต: ${active} กำลังทำ${done ? ` · เสร็จ ${done}` : ""} — แสดงงานที่ช้าที่สุด · กดดูทุกงาน`}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
    >
      <span aria-hidden>🏭</span>
      <span className="truncate">
        {slow.deptName} · {slow.stage}
        {slow.stageTotal ? ` ${slow.stageIndex}/${slow.stageTotal}` : ""}
        {slow.enteredAt ? ` · ${ago(slow.enteredAt)}` : ""}
        {others > 0 ? ` · +${others} งาน` : ""}
      </span>
    </button>
  );
}
