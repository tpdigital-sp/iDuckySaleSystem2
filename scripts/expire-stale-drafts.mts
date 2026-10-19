/**
 * ⏳ ล้างร่างบอทที่ค้าง "รอส่ง" แต่หมดอายุแล้ว (เกิน 24 ชม. หรือร้านตอบไปแล้ว — lib/draft-live.ts)
 *   ต้นเรื่อง 19 ต.ค. 69: โหมดร่างทั้งร้านช่วง 14–15 ต.ค. ทิ้งร่างค้าง ~390 ห้อง (แอดมินตอบใน OA Manager → ร่างไม่ถูกปิด)
 *   ทิ้งด้วย closePendingDrafts(reason "expired") = status discarded + ตามแก้ความจำบอท + ลบธง draftPendingAt
 *   npx tsx --conditions=react-server scripts/expire-stale-drafts.mts            # ดูเฉย ๆ
 *   npx tsx --conditions=react-server scripts/expire-stale-drafts.mts --apply    # เขียนจริง
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#") && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getChatFirestore } = await import("../src/lib/server/firebase-admin");
const { closePendingDrafts } = await import("../src/lib/server/bot-drafts");
const { isDraftLive } = await import("../src/lib/draft-live");
const APPLY = process.argv.includes("--apply");
const db = getChatFirestore()!;
const iso = (v: unknown): string => {
  const t = (v as { toDate?: () => Date })?.toDate?.();
  return t ? t.toISOString() : typeof v === "string" ? v : "";
};
// ธงอาจเป็น Timestamp หรือสตริง (ทางสำรองของ n8n) → ไล่ทั้งคลังแบบดึงเฉพาะ 2 ฟิลด์
const snap = await db.collection("line-conversations").select("draftPendingAt", "lastAdminAt").get();
const flagged = snap.docs.filter((d) => d.get("draftPendingAt"));
const stale = flagged.filter((d) => !isDraftLive(iso(d.get("draftPendingAt")), iso(d.get("lastAdminAt"))));
console.log(`ห้องทั้งหมด ${snap.size} · มีธงร่าง ${flagged.length} · หมดอายุ ${stale.length} · ยังสด ${flagged.length - stale.length}`);
if (!APPLY) {
  console.log("(ดูเฉย ๆ — ใส่ --apply เพื่อทิ้งร่างที่หมดอายุ)");
  process.exit(0);
}
let rooms = 0, drafts = 0;
for (const d of stale) {
  drafts += await closePendingDrafts(db, d.id, "ระบบ (ร่างหมดอายุ)", "expired");
  rooms++;
  if (rooms % 50 === 0) console.log(`… ${rooms}/${stale.length}`);
}
console.log(`ทิ้งร่างหมดอายุแล้ว ${drafts} ร่าง ใน ${rooms} ห้อง`);
process.exit(0);
