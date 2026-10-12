/**
 * 🏭🛒 ติดเลข OD (iduckyOrderId) ให้งานบนบอร์ดผลิต TP ที่สร้างก่อนบอร์ดติดให้เอง (12 ต.ค. 69)
 *   เทียบ folderName ของงานกับการ์ดกราฟฟิก wip_graphic_folders/iducky-<OD> แบบตัดวงเล็บ/ขีด (normFolder)
 *   เฉพาะงาน 90 วันหลัง ที่ยังไม่ archived และยังไม่มี iduckyOrderId · เขียนฟิลด์เดียว ไม่แตะอย่างอื่น
 *   npm run wip:backfill-od            → ลองจับคู่ให้ดู (ไม่เขียน)
 *   npm run wip:backfill-od -- --apply → เขียนจริง
 */
import { getFirestoreAdmin } from "../src/lib/server/firebase-admin";
import { normFolder } from "../src/lib/production-match";
import { WIP_DEPTS } from "../src/lib/server/wip-production";

const apply = process.argv.includes("--apply");
const db = getFirestoreAdmin();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firebase (.env.local)");
const G = "wip_graphic_folders";
const g = await db.collection(G).where("__name__", ">=", db.collection(G).doc("iducky-")).where("__name__", "<", db.collection(G).doc("iducky-")).get();
const byNorm = new Map<string, string>();
for (const d of g.docs) {
  const fn = normFolder(String(d.data().folderName ?? ""));
  const m = /^iducky-(OD-\d{6}-\d{4})/.exec(d.id);
  if (fn && m && !byNorm.has(fn)) byNorm.set(fn, m[1]);
}
console.log(`การ์ดกราฟฟิกของเว็บ ${g.size} ใบ · มีชื่อโฟลเดอร์ ${byNorm.size}`);
const since = new Date(Date.now() - 90 * 86400_000);
let total = 0;
for (const dept of WIP_DEPTS) {
  const snap = await db.collection(dept.jobs).where("createdAt", ">=", since).get();
  let n = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const d of snap.docs) {
    const x = d.data() as { folderName?: string; status?: string; iduckyOrderId?: string };
    if (x.status === "archived" || x.iduckyOrderId) continue;
    const od = byNorm.get(normFolder(String(x.folderName ?? "")));
    if (!od) continue;
    n++;
    if (apply) {
      batch.update(d.ref, { iduckyOrderId: od, iduckyOrderIdBy: "backfill-2026-10-12" });
      if (++inBatch >= 400) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }
  }
  if (apply && inBatch) await batch.commit();
  total += n;
  console.log(`${dept.name}: งาน 90 วัน ${snap.size} · จับคู่ได้ ${n}${apply ? " · เขียนแล้ว" : ""}`);
}
console.log(apply ? `✅ ติดเลข OD ให้ ${total} งาน` : `(ยังไม่เขียน) จับคู่ได้ ${total} งาน — รันด้วย --apply เพื่อเขียน`);
