/**
 * 🙋🧹 ล้างธง "รอแอดมิน" (line-conversations.needsHumanFollowup) ที่ค้าง — เจ้าของร้าน 19 ต.ค. 69
 *
 * ธงนี้บอท n8n ยกตอนส่งต่องานให้คน แล้วลบได้ทางเดียวคือแอดมินตอบจากเว็บ (reply route / ส่งร่าง)
 *   → แอดมินตอบใน LINE OA Manager ธงไม่หาย ค้างเป็นร้อยห้อง (วัด 19 ต.ค. 69: 567 ห้อง · บอทเงียบตั้งแต่ 15 ต.ค. โหมด log-only)
 *   ตอนนี้ oa-chat-sync ล้างให้แล้วเมื่อเห็นแอดมินตอบหลังรอบบอท — สคริปต์นี้เก็บกวาดของเก่า
 *
 * ล้างเมื่อ (อย่างใดอย่างหนึ่ง):
 *   · แอดมินตอบ (log role admin หรือ lastAdminAt) หลังรอบบอทล่าสุด (ตอบ/ร่าง) = รับงานไปแล้ว
 *   · รอบบอทล่าสุดเก่ากว่า 48 ชม. หรือไม่มีใน log เลย (ยกก่อนเริ่มเก็บ log 8 ต.ค.) = งานเก่า ไม่ใช่คิวที่รออยู่
 *
 *   npm run clear:followup            → dry-run นับ + แสดงตัวอย่าง ไม่เขียน
 *   npm run clear:followup -- --write → เขียนจริง + เก็บรายชื่อห้องที่ล้างไว้ที่ backups/followup-clear-<เวลา>.json (คืนค่าได้)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { getChatFirestore } from "../src/lib/server/firebase-admin";
import { isBotTurn } from "../src/lib/server/oa-chat-sync";

const WRITE = process.argv.includes("--write");
const STALE_MS = 48 * 3600_000;
const LOG_SCAN = 200;

const db = getChatFirestore();
if (!db) throw new Error("ต่อ Firestore ordersure ไม่ได้ — เช็ค FIREBASE_SERVICE_ACCOUNT_B64 ใน .env.local");

const ms = (v: unknown): number => {
  const t = v as { toMillis?: () => number } | string | null | undefined;
  if (!t) return 0;
  if (typeof t === "string") return Date.parse(t) || 0;
  return typeof t.toMillis === "function" ? t.toMillis() : 0;
};
const iso = (t: number) => (t ? new Date(t).toISOString().slice(0, 16) : "-");

const snap = await db.collection("line-conversations").where("needsHumanFollowup", "==", true).select("displayName", "lastSeen", "lastAdminAt").get();
console.log(`ห้องที่ติดธงรอแอดมิน: ${snap.size}`);

type Row = { id: string; name: string; lastSeen: number; lastBot: number; lastAdmin: number; why: "admin-replied" | "stale" | "keep" };
const now = Date.now();
const rows: Row[] = [];
const docs = snap.docs;
for (let i = 0; i < docs.length; i += 25) {
  await Promise.all(
    docs.slice(i, i + 25).map(async (d) => {
      const log = await d.ref.collection("log").orderBy("at", "desc").limit(LOG_SCAN).select("role", "mode", "at").get();
      let lastBot = 0;
      let lastAdmin = ms(d.get("lastAdminAt"));
      for (const e of log.docs) {
        const t = ms(e.get("at"));
        if (e.get("role") === "admin") lastAdmin = Math.max(lastAdmin, t);
        else if (isBotTurn(e.get("role"), e.get("mode"))) lastBot = Math.max(lastBot, t);
      }
      const why: Row["why"] = lastBot && lastAdmin >= lastBot ? "admin-replied" : !lastBot || now - lastBot > STALE_MS ? "stale" : "keep";
      rows.push({ id: d.id, name: String(d.get("displayName") ?? ""), lastSeen: ms(d.get("lastSeen")), lastBot, lastAdmin, why });
    })
  );
}

const clear = rows.filter((r) => r.why !== "keep");
const keep = rows.filter((r) => r.why === "keep");
console.log(`ล้าง: ${clear.length} (แอดมินตอบหลังบอท ${clear.filter((r) => r.why === "admin-replied").length} · บอทส่งต่อนานเกิน 48 ชม./ไม่มีใน log ${clear.filter((r) => r.why === "stale").length}) · คงไว้: ${keep.length}`);
for (const r of keep) console.log(`  คงไว้ ${r.name} (${r.id}) บอทล่าสุด ${iso(r.lastBot)} · แอดมินล่าสุด ${iso(r.lastAdmin)}`);
for (const r of [...clear].sort((a, z) => z.lastSeen - a.lastSeen).slice(0, 10)) console.log(`  ล้าง ${r.why} ${r.name} · ทักล่าสุด ${iso(r.lastSeen)} · บอท ${iso(r.lastBot)} · แอดมิน ${iso(r.lastAdmin)}`);

if (!WRITE) {
  console.log("\n(dry-run — ยังไม่เขียน · ใส่ --write เพื่อล้างจริง)");
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const backup = new URL(`../backups/followup-clear-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(backup, JSON.stringify(clear, null, 1));
console.log(`เก็บรายชื่อไว้ที่ ${backup.pathname} (คืนค่า = ตั้ง needsHumanFollowup: true ให้ id ในไฟล์นี้)`);

for (let i = 0; i < clear.length; i += 400) {
  const batch = db.batch();
  for (const r of clear.slice(i, i + 400)) batch.set(db.collection("line-conversations").doc(r.id), { needsHumanFollowup: false }, { merge: true });
  await batch.commit();
}
console.log(`✅ ล้างธงแล้ว ${clear.length} ห้อง`);
