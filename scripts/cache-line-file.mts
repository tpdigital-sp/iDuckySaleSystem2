/**
 * 📎 ดึงไฟล์ที่ลูกค้าส่งใน LINE ที่ยังค้าง "ยังไม่ได้เก็บ" (ไฟล์ใหญ่เกินที่ Netlify ทำทันใน 26 วิ) เก็บขึ้น Storage จากเครื่องนี้
 *   npm run cache:line-file                 → ไล่ทุกห้อง: รายการ type file/image ที่ไม่มี imageUrl และยังไม่ imageExpired (ย้อนหลัง 14 วัน)
 *   npm run cache:line-file -- U… <logId>   → เฉพาะรายการเดียว
 *   ต้องรันด้วย .env.local (มี LINE_MESSAGING_ACCESS_TOKEN + Firebase)
 */
import { getChatFirestore } from "../src/lib/server/firebase-admin";
import { cacheLineImage } from "../src/lib/server/line-image-cache";

const db = getChatFirestore();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firestore (.env.local)");
const [uidArg, logArg] = process.argv.slice(2);
const targets: { uid: string; id: string; name: string }[] = [];
if (uidArg && logArg) targets.push({ uid: uidArg, id: logArg, name: logArg });
else {
  const since = new Date(Date.now() - 14 * 86400_000);
  const q = await db.collectionGroup("log").where("at", ">=", since).orderBy("at", "desc").get();
  for (const d of q.docs) {
    const x = d.data();
    if ((x.type !== "file" && x.type !== "image") || x.imageUrl || x.imageExpired === true || !x.messageId) continue;
    targets.push({ uid: d.ref.parent.parent!.id, id: d.id, name: String(x.fileName ?? x.type) });
  }
}
console.log(`รายการที่ต้องดึง ${targets.length}`);
for (const t of targets) {
  const t0 = Date.now();
  const r = await cacheLineImage(db, t.uid, t.id, { timeoutMs: 15 * 60_000 });
  console.log(r.ok ? `✅ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)} วิ)` : `❌ ${t.name}: ${r.reason}`);
}
