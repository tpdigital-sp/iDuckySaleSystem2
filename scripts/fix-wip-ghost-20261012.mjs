/** 🧹 12 ต.ค. 69 — เคลียร์ธงการ์ดบอร์ดกราฟฟิก 6 ใบที่เด้งซ้ำเพราะใบหลักหลุดช่วงโหลด 30 วัน (ดู graphic-app.js iduckyMainCheck)
 *  node scripts/fix-wip-ghost-20261012.mjs           # dry-run
 *  node scripts/fix-wip-ghost-20261012.mjs --apply   # เขียนจริง (cleared + ล้างธง 🚫 · ไม่แตะ date) */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");
const apply = process.argv.includes("--apply");
/* --keep-window: คืน date ธงเป็นวันของสลิปโอนเพิ่ม (ghostFix.wrongDate) — ให้ธง cleared อยู่ในช่วงโหลดเดียวกับการ์ดผี
   จำเป็นจนกว่าจะ deploy บอร์ดใหม่ (โค้ดเก่ายังเลื่อนใบเพิ่มเป็นการ์ด ถ้าธงหลุดช่วง การ์ดจะเด้งเป็นงานใหม่) */
if (process.argv.includes("--keep-window")) {
  for (const oid of ["OD-260910-1379","OD-260911-4103","OD-260910-3497","OD-260911-8026","OD-260911-4441","OD-260911-6656"]) {
    const ref = db.collection("wip_graphic_folders").doc("iducky-" + oid);
    const m = (await ref.get()).data();
    const date = m?.ghostFix?.wrongDate;
    console.log(oid, m?.date, "→", date, "cleared=" + m?.cleared);
    if (apply && date) await ref.set({ date }, { merge: true });
  }
  console.log(apply ? "APPLIED" : "dry-run");
  process.exit(0);
}
const ids = ["OD-260910-1379","OD-260911-4103","OD-260910-3497","OD-260911-8026","OD-260911-4441","OD-260911-6656"];
const now = new Date().toISOString();
for (const oid of ids) {
  const main = (await db.collection("iduckyPaidOrders").doc(oid).get()).data();
  const ref = db.collection("wip_graphic_folders").doc("iducky-" + oid);
  const m = (await ref.get()).data();
  const patch = {
    noFolder: false, noFolderBy: null, noFolderAt: null, noFolderNote: null,
    cleared: true, clearedBy: "ระบบ (ซ่อมการ์ดเด้งซ้ำ 12 ต.ค. 69)", clearedAt: now,
    ghostFix: { at: now, wrongDate: m.date, wrongSlipAmount: m.slipAmount ?? null, wrongNoFolderNote: m.noFolderNote ?? null, wrongNoFolderBy: m.noFolderBy ?? null, wrongAt: String(m.at || "").startsWith("2026-10-12") ? m.at : null },
  };
  if (String(m.at || "").startsWith("2026-10-12")) patch.at = m.folderNameAt || m.dStartedAt || m.at;
  console.log(oid, JSON.stringify(patch));
  if (apply) await ref.set(patch, { merge: true });
}
console.log(apply ? "APPLIED" : "dry-run");
