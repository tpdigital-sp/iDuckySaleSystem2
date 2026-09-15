#!/usr/bin/env node
/**
 * ➕ ซ่อมย้อนหลัง: ออเดอร์ที่ลูกค้า "สั่งเพิ่มในออเดอร์เดิม" หลังกราฟฟิกสร้างโฟลเดอร์ไปแล้ว
 *    แต่ไม่มีการ์ดงานบนบอร์ด WIP (เงินก้อนใหม่เข้าช่องสลิปใบเพิ่มซึ่งบอร์ดข้ามทุกใบ)
 *
 *   node scripts/tp-addon-backfill.mjs           # ดูอย่างเดียว
 *   node scripts/tp-addon-backfill.mjs --apply   # เขียนจริง
 *
 * เขียน 2 อย่าง (ของใหม่ระบบทำให้เองแล้ว — ดู order-write.ts / tp-report.ts):
 *   1) OrderItem.addedAt ของรายการที่เพิ่มทีหลังและยังไม่มีแบบ (เวลาจาก log "สั่งเพิ่มในออเดอร์เดิม")
 *   2) newWorkItems ในเรคอร์ดสลิปใบเพิ่มที่รับเงินของรอบนั้น → บอร์ดขึ้นการ์ด "➕ ลูกค้าสั่งเพิ่มในออเดอร์เดิม"
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const svc = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"));
const db = getFirestore(initializeApp({ credential: cert(svc) }), env.FIREBASE_DATABASE_ID || "tp-fixflow");

/** รายการที่ "ยังไม่มีแบบให้ลูกค้าตรวจ" — กติกาเดียวกับ proofMissing ฝั่งเว็บ */
const proofMissing = (i) => !(i.proofs?.length || i.proofUrl) && !i.noProof;
const tpItem = (i, addedAt) => ({
  name: i.name,
  qty: i.qty,
  unit: i.unitYield?.unit || "ชิ้น",
  pieces: i.qty * Math.max(1, i.unitYield?.per ?? 1),
  piece: i.unitYield?.piece || "ชิ้น",
  addedAt,
});

const { data: rows, error } = await sb.from("orders").select("id,data");
if (error) throw error;

// การ์ดกราฟฟิก + เรคอร์ดสะพาน อ่านทีเดียวทั้งคอลเลกชัน (ใบละไม่กี่พัน)
const marks = {};
(await db.collection("wip_graphic_folders").get()).forEach((d) => (marks[d.id] = d.data() || {}));
const bridge = new Map(); // orderId → [{ id, d }]
(await db.collection("iduckyPaidOrders").get()).forEach((d) => {
  const x = d.data() || {};
  const oid = String(x.orderId || d.id).replace(/-final$/, "").replace(/-p[0-9a-z]{6,}$/, "");
  if (!bridge.has(oid)) bridge.set(oid, []);
  bridge.get(oid).push({ id: d.id, d: x });
});

/** เวลาที่กราฟฟิกเริ่มใช้การ์ดของออเดอร์นี้ (กด ✓ สร้าง Folder / ใส่ชื่อ / เริ่มงาน) — ยังไม่สร้าง = "" */
function folderStart(orderId) {
  return ["", "-final"]
    .map((sfx) => marks[`iducky-${orderId}${sfx}`])
    .filter((m) => m && m.done)
    .map((m) => [m.at, m.folderNameAt, m.dStartedAt].filter(Boolean).sort()[0])
    .filter(Boolean)
    .sort()[0] || "";
}

let hit = 0, fixedOrders = 0, fixedRecs = 0;
for (const { id, data: o } of rows) {
  if (!o?.items?.length) continue;
  const started = folderStart(id);
  if (!started) continue; // กราฟฟิกยังไม่เริ่ม — การ์ดหลักยังอยู่ในคิว ครอบคลุมของที่เพิ่มอยู่แล้ว
  const addAt = (o.log ?? [])
    .filter((l) => String(l.action || "").includes("สั่งเพิ่มในออเดอร์เดิม") && String(l.at || "") > started)
    .map((l) => l.at)
    .sort()
    .pop();
  if (!addAt) continue;
  const pending = o.items.filter(proofMissing);
  if (!pending.length) continue; // ทำแบบครบแล้ว ไม่มีงานค้าง
  const recs = (bridge.get(id) ?? []).filter(
    (r) => (r.d.installment === "extra" || /-p[0-9a-z]{6,}$/.test(r.id)) && r.d.partial !== true && String(r.d.createdAt || "") >= addAt
  );
  hit++;
  const has = recs.some((r) => Array.isArray(r.d.newWorkItems) && r.d.newWorkItems.length);
  console.log(
    `${has ? "✓" : APPLY ? "✍" : "→"} ${id}  ${o.customer || ""}  สั่งเพิ่ม ${addAt.slice(0, 16)} (สร้าง folder ${started.slice(0, 16)})\n` +
      `     ยังไม่มีแบบ: ${pending.map((i) => `${i.name} ×${i.qty}`).join(", ")}\n` +
      `     สลิปใบเพิ่มที่รับเงินรอบนั้น: ${recs.map((r) => r.id).join(", ") || "— ไม่มี (ยังไม่จ่าย/รับยอดคนละทาง)"}`
  );
  if (has || !recs.length || !APPLY) continue;

  const items = o.items.map((i) => (proofMissing(i) && !i.addedAt ? { ...i, addedAt: addAt } : i));
  const { error: upErr } = await sb.from("orders").update({ data: { ...o, items } }).eq("id", id);
  if (upErr) { console.error("   ⛔ เขียนออเดอร์ไม่สำเร็จ:", upErr.message); continue; }
  fixedOrders++;
  const newWorkItems = pending.map((i) => tpItem(i, addAt));
  for (const r of recs) {
    await db.collection("iduckyPaidOrders").doc(r.id).update({ newWorkItems, itemsUpdatedAt: new Date().toISOString() });
    fixedRecs++;
  }
}
console.log(
  `\nออเดอร์ทั้งหมด ${rows.length} · เข้าข่าย "สั่งเพิ่มหลังสร้าง folder และยังไม่มีแบบ" ${hit} ใบ` +
    (APPLY ? ` · ซ่อมแล้ว ${fixedOrders} ใบ / ${fixedRecs} เรคอร์ด` : "\n(ใส่ --apply เพื่อเขียนจริง)")
);
process.exit(0);
