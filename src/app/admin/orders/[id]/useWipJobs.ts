"use client";

import { useCallback, useEffect, useState } from "react";
import type { WipJob } from "@/lib/server/wip-production";

/**
 * 🏭 งานของออเดอร์บนบอร์ดผลิต TP — ใช้ร่วมกันระหว่างกล่อง "สถานะผลิต" กับบรรทัดใต้ป้ายสถานะ (12 ต.ค. 69)
 *   หน้าเดียวเรียก /api/admin/orders/wip ครั้งเดียว (แชร์คำขอที่กำลังวิ่ง + จำผล 30 วิ) · reload() = ดูบอร์ดใหม่ทุกจุดพร้อมกัน
 */
export type WipResp = { jobs: WipJob[]; folders: string[]; tp: string; error?: string };

const TTL = 30_000;
const cache = new Map<string, { at: number; data: WipResp }>();
const inflight = new Map<string, Promise<WipResp>>();
const listeners = new Map<string, Set<(d: WipResp) => void>>();

function fetchWip(orderId: string, force = false): Promise<WipResp> {
  const c = cache.get(orderId);
  if (!force && c && Date.now() - c.at < TTL) return Promise.resolve(c.data);
  const running = inflight.get(orderId);
  if (running) return running;
  const p = (async () => {
    const res = await fetch(`/api/admin/orders/wip?id=${encodeURIComponent(orderId)}`, { cache: "no-store" });
    const j = (await res.json().catch(() => null)) as WipResp | null;
    if (!res.ok || !j) throw new Error(j?.error || `HTTP ${res.status}`);
    cache.set(orderId, { at: Date.now(), data: j });
    listeners.get(orderId)?.forEach((fn) => fn(j));
    return j;
  })().finally(() => inflight.delete(orderId));
  inflight.set(orderId, p);
  return p;
}

export function useWipJobs(orderId: string) {
  const [data, setData] = useState<WipResp | null>(() => cache.get(orderId)?.data ?? null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setErr("");
      try {
        setData(await fetchWip(orderId, force));
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    let set = listeners.get(orderId);
    if (!set) listeners.set(orderId, (set = new Set()));
    set.add(setData);
    void run(false);
    return () => {
      set!.delete(setData);
    };
  }, [orderId, run]);

  return { data, err, loading, reload: () => run(true) };
}

/** งานที่ช้าที่สุด (ขั้นน้อยสุด) ของใบ = ตัวที่บอกว่า "ใบนี้ถึงไหน" */
export function slowestJob(jobs: WipJob[]): WipJob | null {
  const active = jobs.filter((j) => j.status === "active");
  if (!active.length) return null;
  return [...active].sort((a, b) => a.stageIndex / (a.stageTotal || 1) - b.stageIndex / (b.stageTotal || 1) || String(a.enteredAt).localeCompare(String(b.enteredAt)))[0];
}
