import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/server/firebase-admin";
import { leafName, normFolder } from "@/lib/production-match";

/**
 * 🏭 งานบนบอร์ดผลิต TP (TP-Leader/TP-WIP) ของออเดอร์ — อ่านอย่างเดียว (เจ้าของร้าน 12 ต.ค. 69 "เชื่อม WIP ผลิตกับหน้าคำสั่งซื้อ · ทำ 1+2")
 *
 * บอร์ด 4 แผนก เก็บงานคนละตารางในฐาน tp-fixflow (ฐานเดียวกับ employees2/iduckyPaidOrders):
 *   กระดาษ/สตก. wip_jobs · ซับ/เย็บ wip_sew_jobs · UV acrylic wip_uv_acrylic_jobs · UV goods wip_uv_goods_jobs (+ *_stages = ชื่อขั้นตอน)
 * งานแต่ละใบ: { jobNo, name(ชื่อไฟล์), folderName(โฟลเดอร์กราฟฟิก), route[stageId], currentIndex, currentStageId, status active|done|archived,
 *   enteredCurrentAt, stageBy, doneAt, isUrgent, jobType daily|bulk, dueDate, imageUrl, iduckyOrderId (ขั้นที่ 1: บอร์ดติดให้ตอนสร้างงาน 12 ต.ค. 69) }
 *
 * วิธีหา: 1) iduckyOrderId == เลข OD (ชัวร์)  2) folderName ตรงกับโฟลเดอร์ของใบนี้ (productionSent.folder / การ์ดกราฟฟิก wip_graphic_folders/iducky-<OD>)
 *         3) งาน active ที่ชื่อโฟลเดอร์เทียบแบบตัดวงเล็บ/ขีด (normFolder) — สำหรับงานที่สร้างก่อนมีขั้นที่ 1
 */
export type WipDeptKey = "paper" | "sew" | "uv_acrylic" | "uv_goods";
export const WIP_DEPTS: { key: WipDeptKey; name: string; emoji: string; page: string; jobs: string; stages: string }[] = [
  { key: "paper", name: "กระดาษ/สตก.", emoji: "📄", page: "board.html", jobs: "wip_jobs", stages: "wip_stages" },
  { key: "sew", name: "ซับ/เย็บ", emoji: "🧵", page: "sew.html", jobs: "wip_sew_jobs", stages: "wip_sew_stages" },
  { key: "uv_acrylic", name: "UV (Acrylic)", emoji: "🔷", page: "uv-acrylic.html", jobs: "wip_uv_acrylic_jobs", stages: "wip_uv_acrylic_stages" },
  { key: "uv_goods", name: "UV (Goods)", emoji: "🎁", page: "uv-goods.html", jobs: "wip_uv_goods_jobs", stages: "wip_uv_goods_stages" },
];
export const TP_LEADER_URL = (process.env.TP_LEADER_URL || "https://tpdigital-performance.netlify.app").replace(/\/+$/, "");
const GRAPHIC_COLL = "wip_graphic_folders";

export type WipJob = {
  id: string;
  dept: WipDeptKey;
  deptName: string;
  deptEmoji: string;
  jobNo: string;
  name: string;
  folderName: string;
  status: "active" | "done" | "archived";
  stage: string; // ชื่อขั้นปัจจุบัน
  stageIndex: number; // 1-based
  stageTotal: number;
  route: string[]; // ชื่อขั้นทั้งเส้นทาง
  enteredAt: string | null;
  stageBy: string; // คนที่ปิดขั้นก่อนหน้า (ส่งงานเข้าขั้นปัจจุบัน) — บอร์ดเก็บ stageBy เป็น map stageId → ชื่อ
  createdAt: string | null;
  doneAt: string | null;
  isUrgent: boolean;
  jobType: string;
  dueDate: string | null;
  imageUrl: string | null;
  url: string; // เปิดการ์ดบนบอร์ด
  matchedBy: "orderId" | "folder" | "folderNorm";
};

type Ts = { toDate?: () => Date } | Date | string | null | undefined;
const iso = (v: Ts): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  const d = v.toDate?.();
  return d ? d.toISOString() : null;
};

// ชื่อขั้นตอนต่อแผนก — เปลี่ยนไม่บ่อย cache 5 นาทีต่ออินสแตนซ์
const stageCache = new Map<string, { at: number; map: Map<string, string> }>();
async function stageNames(db: Firestore, coll: string): Promise<Map<string, string>> {
  const c = stageCache.get(coll);
  if (c && Date.now() - c.at < 5 * 60_000) return c.map;
  const map = new Map<string, string>();
  try {
    const snap = await db.collection(coll).get();
    for (const d of snap.docs) map.set(d.id, String((d.data() as { name?: string }).name ?? d.id));
  } catch (e) {
    console.warn(`[wip] stages ${coll}:`, (e as Error).message);
  }
  stageCache.set(coll, { at: Date.now(), map });
  return map;
}

/** ชื่อโฟลเดอร์ที่ "น่าจะ" เป็นของใบนี้ — จากที่แอดมินโยนเข้าคิวปริ้น + ที่บอร์ดกราฟฟิกตั้งไว้ (ใบหลัก/-final/การ์ดสั่งเพิ่ม) */
export async function folderCandidates(db: Firestore, orderId: string, productionFolder?: string): Promise<string[]> {
  const out = new Set<string>();
  const pf = leafName(productionFolder ?? "").trim();
  if (pf) out.add(pf);
  try {
    const snap = await db
      .collection(GRAPHIC_COLL)
      .where("__name__", ">=", db.collection(GRAPHIC_COLL).doc(`iducky-${orderId}`))
      .where("__name__", "<", db.collection(GRAPHIC_COLL).doc(`iducky-${orderId}`))
      .get();
    for (const d of snap.docs) {
      const fn = String((d.data() as { folderName?: string }).folderName ?? "").trim();
      if (fn) out.add(fn);
    }
  } catch (e) {
    console.warn("[wip] graphic folders:", (e as Error).message);
  }
  return [...out];
}

/** opts.exactOnly = ข้ามรอบสแกนเทียบชื่อแบบตัดวงเล็บ (~4 วิ) — หน้าลูกค้าใช้ ต้องเร็วและไม่เดา */
export async function wipJobsForOrder(orderId: string, productionFolder?: string, opts: { exactOnly?: boolean } = {}): Promise<{ jobs: WipJob[]; folders: string[] }> {
  const db = getFirestoreAdmin();
  if (!db) return { jobs: [], folders: [] };
  const folders = await folderCandidates(db, orderId, productionFolder);
  const normSet = new Set(folders.map(normFolder).filter(Boolean));
  type Row = { id: string; d: Record<string, unknown>; by: WipJob["matchedBy"] };
  const found = new Map<WipDeptKey, Row[]>();
  const seen = new Set<string>();
  const take = (dept: WipDeptKey, docs: FirebaseFirestore.QueryDocumentSnapshot[], by: WipJob["matchedBy"]) => {
    for (const d of docs) {
      const k = `${dept}/${d.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      let arr = found.get(dept);
      if (!arr) found.set(dept, (arr = []));
      arr.push({ id: d.id, d: d.data() as Record<string, unknown>, by });
    }
  };
  // รอบ 1: จับแบบชัวร์ (เลข OD · ชื่อโฟลเดอร์ตรงเป๊ะ) ทุกแผนกพร้อมกัน — คิวรีละ ~50ms
  await Promise.all(
    WIP_DEPTS.map(async (dept) => {
      const col = db.collection(dept.jobs);
      try {
        const [byId, byFolder] = await Promise.all([col.where("iduckyOrderId", "==", orderId).get(), folders.length ? col.where("folderName", "in", folders.slice(0, 10)).get() : null]);
        take(dept.key, byId.docs, "orderId");
        if (byFolder) take(dept.key, byFolder.docs, "folder");
      } catch (e) {
        console.warn(`[wip] ${dept.jobs}:`, (e as Error).message);
      }
    })
  );
  // รอบ 2 (เฉพาะไม่เจอเลยทุกแผนก): งานที่สร้างก่อนบอร์ดติดเลข OD / ชื่อโฟลเดอร์ถูกเติมคำนำหน้า → เทียบแบบตัดวงเล็บ
  //   สแกนเฉพาะงาน 45 วันหลัง (บอร์ดกระดาษมีงาน active 2,400+ ใบ · 12 ต.ค. 69 เคยสแกนทุกแผนกทุกครั้ง = 9 วิ)
  if (!seen.size && normSet.size && !opts.exactOnly) {
    const since = new Date(Date.now() - 45 * 86400_000);
    await Promise.all(
      WIP_DEPTS.map(async (dept) => {
        try {
          const recent = await db.collection(dept.jobs).where("createdAt", ">=", since).get();
          const hit = recent.docs.filter((d) => {
            const x = d.data() as { folderName?: string; status?: string };
            return x.status !== "archived" && normSet.has(normFolder(String(x.folderName ?? "")));
          });
          take(dept.key, hit, "folderNorm");
        } catch (e) {
          console.warn(`[wip] ${dept.jobs} scan:`, (e as Error).message);
        }
      })
    );
  }
  const jobs: WipJob[] = [];
  await Promise.all(
    WIP_DEPTS.map(async (dept) => {
      const rows = found.get(dept.key);
      if (!rows?.length) return;
      const names = await stageNames(db, dept.stages);
      for (const r of rows) {
        const x = r.d;
        const route = (Array.isArray(x.route) ? (x.route as string[]) : []).map((id) => names.get(id) ?? id);
        const idx = Number(x.currentIndex ?? 0) || 0;
        const byMap = (x.stageBy && typeof x.stageBy === "object" ? (x.stageBy as Record<string, unknown>) : {}) as Record<string, unknown>;
        const routeIds = Array.isArray(x.route) ? (x.route as string[]) : [];
        const lastId = x.status === "done" ? routeIds[routeIds.length - 1] : routeIds[idx - 1];
        const lastBy = lastId ? String(byMap[lastId] ?? "") : "";
        const status = x.status === "done" ? "done" : x.status === "archived" ? "archived" : "active";
        jobs.push({
          id: r.id,
          dept: dept.key,
          deptName: dept.name,
          deptEmoji: dept.emoji,
          jobNo: String(x.jobNo ?? ""),
          name: String(x.name ?? ""),
          folderName: String(x.folderName ?? ""),
          status,
          stage: status === "done" ? "เสร็จแล้ว" : names.get(String(x.currentStageId ?? "")) ?? String(x.currentStageId ?? "—"),
          stageIndex: Math.min(route.length, idx + 1),
          stageTotal: route.length,
          route,
          enteredAt: iso(x.enteredCurrentAt as Ts),
          stageBy: lastBy,
          createdAt: iso(x.createdAt as Ts),
          doneAt: iso(x.doneAt as Ts),
          isUrgent: x.isUrgent === true,
          jobType: String(x.jobType ?? "daily"),
          dueDate: iso(x.dueDate as Ts),
          imageUrl: typeof x.imageUrl === "string" ? x.imageUrl : null,
          url: `${TP_LEADER_URL}/TP-WIP/${dept.page}?job=${encodeURIComponent(r.id)}`,
          matchedBy: r.by,
        });
      }
    })
  );
  // งานที่ยังทำอยู่ก่อน · เร่งก่อน · แล้วเรียงตามเวลาสร้าง
  jobs.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || Number(b.isUrgent) - Number(a.isUrgent) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return { jobs, folders };
}

/** งานที่ช้าที่สุด (สัดส่วนขั้นน้อยสุด) ของใบ = ตัวบอกว่า "ใบนี้ถึงไหน" · ไม่มีงานที่ยังทำ = null */
export function slowestActive(jobs: WipJob[]): WipJob | null {
  const active = jobs.filter((j) => j.status === "active");
  if (!active.length) return null;
  return [...active].sort((a, b) => a.stageIndex / (a.stageTotal || 1) - b.stageIndex / (b.stageTotal || 1) || String(a.enteredAt).localeCompare(String(b.enteredAt)))[0];
}
