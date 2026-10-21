/**
 * 🎴 คลังความรู้บอท: "รับทำการ์ดเกม/การ์ดสะสม/ไพ่ แบบหุ้มฟอยล์/โฮโลแกรมไหม" (21 ต.ค. 69)
 *   ที่มา: ลูกค้าถามในไลน์ "ที่ร้านรับทำการ์ดเกมแบบหุ้มฟอยมั้ยครับ" → บอท n8n ตอบ "แอดมินขอเช็กให้ก่อน"
 *   ทั้งที่ร้านมี "โฟโต้การ์ด" (photocard-digital) ปั๊มฟอยล์ 4 สี / กระดาษโฮโลแกรม / เคลือบฟิล์มโฮโลแกรม ครบ
 *   เว็บแก้ให้ตอบเองแล้ว (gate game-card-foil ใน price-answer.ts) — ข้อนี้เป็นสำรองให้ ChatBot n8n (Pinecone) ตอบได้เมื่อเว็บตก
 *
 *   npx tsx --conditions=react-server scripts/kb-game-card-foil-2026-10-21.mts            # ดูเฉย ๆ
 *   npx tsx --conditions=react-server scripts/kb-game-card-foil-2026-10-21.mts --apply    # เขียนจริง + ส่ง n8n
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trim().startsWith("#") && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const { getChatFirestore } = await import("../src/lib/server/firebase-admin");
const { pushKnowledge } = await import("../src/lib/server/bot-kb");

const apply = process.argv.includes("--apply");
const db = getChatFirestore();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firestore");
const col = db.collection("knowledge-base");

const ADD: { title: string; content: string }[] = [
  {
    title: "รับทำการ์ดเกม การ์ดสะสม ไพ่ แบบหุ้มฟอยล์ / โฮโลแกรม ไหม",
    content:
      "รับค่ะ ✨ การ์ดเกม/การ์ดสะสมแบบหุ้มฟอยล์ ร้านทำเป็น \"โฟโต้การ์ด\" ขนาด 5.5×8.5 ซม. ขายเป็นเซ็ต เซ็ตละ 20 ใบ (https://iduckystore.com/products/photocard-digital) ลุคฟอยล์เลือกได้ 3 แบบ: " +
      "1. ปั๊มฟอยล์เฉพาะจุด สีเงิน/ทอง/โรสโกลด์/โฮโลแกรม พิมพ์ 1-2 เลเยอร์ ทำได้ทั้ง 2 ด้าน " +
      "2. กระดาษโฮโลแกรมทั้งใบ (โฮโลแกรม SeaSand / Rainbow) " +
      "3. เคลือบฟิล์มโฮโลแกรมทับลาย (ลายรุ้ง ดาว หิมะ หัวใจ เหลี่ยม จุด Dust Stardust) " +
      "ขนาดอื่นที่ไม่ใช่ 5.5×8.5 ซม. สั่งเป็น \"กระดาษเคลือบฟอยล์\" กำหนดขนาดเองได้ (https://iduckystore.com/products/paper-foil) " +
      "ส่งแบบ/ลายการ์ดกับจำนวนที่ต้องการมาได้เลยค่ะ เดี๋ยวแอดมินเช็คสเปคและคิดราคาให้\n\n" +
      "💬 ลูกค้ามักถามว่า: ที่ร้านรับทำการ์ดเกมแบบหุ้มฟอยมั้ยครับ · รับทำการ์ดสะสมแบบโฮโลไหม · ทำการ์ด TCG ฟอยล์ได้ไหม · รับปริ้นไพ่แบบเงา ๆ วิบวับไหม",
  },
];

const existing = await col.get();
const titles = new Set(existing.docs.map((d) => String(d.data().title ?? "").trim()));
let added = 0, pushed = 0;
const now = new Date();
for (const it of ADD) {
  if (titles.has(it.title)) { console.log("มีแล้ว ข้าม:", it.title); continue; }
  console.log(apply ? "เพิ่ม:" : "(จะเพิ่ม)", it.title, "\n", it.content);
  if (!apply) continue;
  await col.add({ title: it.title, content: it.content, type: "chat-experience", source: "owner-2026-10-21-game-card-foil", createdBy: "claude", createdByName: "Claude (21 ต.ค. 69 การ์ดเกมหุ้มฟอยล์)", createdAt: now, timestamp: now });
  added++;
  if (await pushKnowledge({ question: it.title, answer: it.content, type: "chat-experience" })) pushed++;
}
console.log(apply ? `✅ เพิ่ม ${added} · ส่งเข้า n8n ${pushed}` : "(ลองดูเฉย ๆ — ใส่ --apply)");
