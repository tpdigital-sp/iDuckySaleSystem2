/**
 * 🧾 ร่างบอทที่ยังรอส่ง (pending) → แทนภาพตารางราคาเก่าด้วยการ์ดสินค้าจากเว็บ (upgradeDraftMessages · 14 ต.ค. 69)
 *   ร่างใหม่ทำเองตอนบอทฝาก (saveBotDraft) — สคริปต์นี้ไว้ไล่ร่างที่ค้างอยู่ก่อนแก้
 *   npx tsx --conditions=react-server scripts/draft-product-cards.mts            # ดูเฉย ๆ
 *   npx tsx --conditions=react-server scripts/draft-product-cards.mts --apply    # เขียนจริง (เฉพาะร่าง pending)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#") && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getChatFirestore } = await import("../src/lib/server/firebase-admin");
const { upgradeDraftMessages, cleanLineMessages, draftSummary, cardsOfFlex } = await import("../src/lib/server/bot-drafts");
const { checkFlexMessages } = await import("../src/lib/server/notify");
const APPLY = process.argv.includes("--apply");
const db = getChatFirestore()!;
const rooms = await db.collection("line-conversations").where("draftPendingAt", ">", new Date(Date.now() - 7 * 86400e3)).get();
let n = 0, changed = 0;
for (const r of rooms.docs) {
  const q = await r.ref.collection("log").where("role", "==", "draft").where("status", "==", "pending").get();
  for (const d of q.docs) {
    n++;
    const before = cleanLineMessages(JSON.parse(String(d.get("payload") ?? "[]")));
    const after = await upgradeDraftMessages(before);
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    const errs = checkFlexMessages(after as never);
    const cards = cardsOfFlex(after);
    changed++;
    const kinds = (m: typeof before) => m.map((x) => x.type).join("+");
    console.log(`${r.id.slice(0, 9)} ${kinds(before)} → ${kinds(after)} · การ์ด: ${cards.map((c) => c.name).join(", ")}${errs.length ? ` ❌ ${errs.join(" · ")}` : ""}`);
    if (APPLY && !errs.length) await d.ref.update({ payload: JSON.stringify(after), text: draftSummary(after), cards });
  }
}
console.log(`ร่าง pending ${n} · เปลี่ยน ${changed}${APPLY ? " (เขียนแล้ว)" : " (ดูเฉย ๆ — ใส่ --apply เพื่อเขียน)"}`);
process.exit(0);
