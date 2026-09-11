/**
 * 📦 คิวแพ็คบนมือถือ — ลำดับใบที่คนแพ็คจะไล่ทำต่อกันโดยไม่ต้องสแกนกระดาษทีละใบ
 *
 * เก็บในเครื่องของคนแพ็ค (localStorage) ไม่ใช่ใน DB: คิวเป็นเรื่องของ "มือถือเครื่องนี้ กำลังไล่ใบไหน"
 * สองคนแบ่งกองกันได้โดยไม่ตีกัน · หมดอายุเอง 12 ชั่วโมง (กองงานเมื่อวานไม่ควรโผล่มาเช้านี้)
 *
 * ที่มา 2 ทาง (source):
 *  - "queue" = กดจากรายการในสถานีแพ็ค–ส่ง (เรียงตามความเร่งด่วนที่หน้านั้นเรียงไว้)
 *  - "batch" = สแกนกองใบงานทีเดียว (เรียงตามลำดับที่สแกน)
 *
 * ใช้ที่: /admin/orders/scan (สร้างคิว) · โหมดแพ็คในหน้าออเดอร์ (แถบคิว + เด้งใบถัดไปหลังยิงเลขพัสดุ)
 */

export type PackQueueSource = "queue" | "batch";

export type PackQueue = {
  /** ลำดับใบในคิว (เลขออเดอร์ตัวพิมพ์ใหญ่) */
  ids: string[];
  /** ใบที่ยิงเลขพัสดุไปแล้วในรอบนี้ */
  done: string[];
  source: PackQueueSource;
  createdAt: string;
};

const KEY = "iducky.packQueue.v1";
const TTL_MS = 12 * 60 * 60 * 1000;
/** event ในแท็บเดียวกัน — storage event ของเบราว์เซอร์ยิงเฉพาะแท็บอื่น */
export const PACK_QUEUE_EVENT = "iducky:packqueue";

const norm = (id: string) => id.trim().toUpperCase();

function emitChange() {
  try {
    window.dispatchEvent(new Event(PACK_QUEUE_EVENT));
  } catch {
    /* นอกเบราว์เซอร์ */
  }
}

export function loadPackQueue(): PackQueue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const q = JSON.parse(raw) as PackQueue;
    if (!q || !Array.isArray(q.ids) || q.ids.length === 0) return null;
    if (Date.now() - new Date(q.createdAt).getTime() > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return { ids: q.ids.map(norm), done: (q.done ?? []).map(norm), source: q.source === "batch" ? "batch" : "queue", createdAt: q.createdAt };
  } catch {
    return null;
  }
}

export function savePackQueue(q: PackQueue) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* localStorage เต็ม/ปิดไว้ — คิวแค่หายไป ไม่กระทบการแพ็ค */
  }
  emitChange();
}

export function clearPackQueue() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ข้าม */
  }
  emitChange();
}

/** เริ่มคิวใหม่ทับของเดิม — ตัดเลขซ้ำ คงลำดับแรกที่เจอ */
export function startPackQueue(ids: string[], source: PackQueueSource): PackQueue {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of ids) {
    const id = norm(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
  }
  const q: PackQueue = { ids: clean, done: [], source, createdAt: new Date().toISOString() };
  savePackQueue(q);
  return q;
}

/** ติ๊กว่าใบนี้ยิงเลขพัสดุแล้ว — ไม่ได้อยู่ในคิวก็ไม่เป็นไร คืน null */
export function markPackDone(id: string): PackQueue | null {
  const q = loadPackQueue();
  if (!q) return null;
  const n = norm(id);
  if (!q.ids.includes(n)) return q;
  if (!q.done.includes(n)) q.done = [...q.done, n];
  savePackQueue(q);
  return q;
}

/** ตำแหน่งในคิว (เริ่ม 1) · 0 = ไม่อยู่ในคิว */
export function packQueuePos(q: PackQueue, id: string): number {
  return q.ids.indexOf(norm(id)) + 1;
}

export function packQueueLeft(q: PackQueue): number {
  return q.ids.filter((id) => !q.done.includes(id)).length;
}

/**
 * ใบถัดไปที่ยังไม่เสร็จ — นับต่อจากใบปัจจุบัน แล้ววนกลับไปต้นคิว (ใบที่ข้ามไว้เพราะรอของจะกลับมาเจอ)
 * ไม่มีเหลือ = null
 */
export function packQueueNext(q: PackQueue, currentId: string): string | null {
  const cur = q.ids.indexOf(norm(currentId));
  const n = q.ids.length;
  for (let k = 1; k <= n; k++) {
    const id = q.ids[(cur + k) % n];
    if (id !== norm(currentId) && !q.done.includes(id)) return id;
  }
  return null;
}

/** ใบก่อนหน้าในคิว (ไม่สนว่าเสร็จหรือยัง — ไว้ย้อนกลับไปดู) */
export function packQueuePrev(q: PackQueue, currentId: string): string | null {
  const cur = q.ids.indexOf(norm(currentId));
  if (cur <= 0) return null;
  return q.ids[cur - 1];
}

/** เลขสั้นบนชิป: OD-260911-4120 → 4120 */
export const shortOrderId = (id: string) => id.replace(/^OD-\d{6}-/i, "");
