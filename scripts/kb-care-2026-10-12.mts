/**
 * 🧴 วิธีดูแลสินค้า (เจ้าของร้าน 12 ต.ค. 69: ร่างจาก Claude + แก้ "กระดาษไม่กันน้ำ · สติ๊กเกอร์ส่วนใหญ่กันน้ำ ยกเว้นวาชิ") → knowledge-base type "policy"
 *   + แก้ข้อเดิม e4VqTX14 ("งานกระดาษทุกตัวกันน้ำได้") ให้ตรง (เก็บ prevContent)
 *   รันซ้ำได้ · ใส่ --apply เพื่อบันทึก
 */
import { getChatFirestore } from "../src/lib/server/firebase-admin";
import { pushKnowledge } from "../src/lib/server/bot-kb";

const apply = process.argv.includes("--apply");
const db = getChatFirestore();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firestore");
const col = db.collection("knowledge-base");
const WATER = "งานกระดาษไม่กันน้ำ โดนน้ำไม่ได้นะคะ ส่วนสติ๊กเกอร์ของร้านส่วนใหญ่กันน้ำได้ ยกเว้นสติ๊กเกอร์วาชิที่ไม่กันน้ำ เพราะเนื้อเป็นกระดาษค่ะ ถ้าต้องการงานที่โดนน้ำบ่อย แนะนำเลือกสติ๊กเกอร์แบบกันน้ำนะคะ";
const ADD: { title: string; content: string }[] = [
  { title: "วิธีดูแลงานพิมพ์ UV อะคริลิค Griptok เคส พวงกุญแจ", content: "งานพิมพ์ UV ห้ามโดนสเปรย์แอลกอฮอล์ ทินเนอร์ หรือน้ำยาล้างเล็บนะคะ ลายอาจลอกหรือด่าง ทำความสะอาดด้วยผ้านุ่มชุบน้ำหมาด ๆ เลี่ยงการเสียดสีกับกุญแจหรือของมีคม และไม่ควรตากแดดจัดหรือทิ้งไว้ในรถนาน ๆ ค่ะ" },
  { title: "วิธีทำความสะอาดอะคริลิค ไม่ให้เป็นรอย", content: "ล้างอะคริลิคด้วยน้ำเปล่าผสมสบู่อ่อน แล้วเช็ดด้วยผ้าไมโครไฟเบอร์ค่ะ ไม่ควรใช้กระดาษทิชชู่ถูแรง ๆ เพราะทำให้เกิดรอยขนแมวได้ และห้ามใช้แอลกอฮอล์หรือน้ำยาเคมีแรง ๆ นะคะ" },
  { title: "วิธีดูแลงานเรซิ่นเคลือบนูน Griptok เคลือบนูน", content: "งานเรซิ่นเคลือบนูนแข็งตัวสมบูรณ์แล้ว โดนแดดได้และไม่นิ่มลงค่ะ แต่ไม่ควรวางไว้กลางแดดทั้งวัน และผิวเรซิ่นเป็นรอยขนแมวได้ง่าย ควรเลี่ยงการเสียดสีกับกุญแจหรือของแข็ง และระวังของแหลมกดลงบนผิวนะคะ" },
  { title: "วิธีซักผ้าสกรีนซับลิเมชั่น ผ้าห่ม ผ้าขนหนู หมอน เสื้อ", content: "กลับด้านผ้าก่อนซัก ใช้น้ำเย็นหรือน้ำธรรมดากับผงซักฟอกอ่อน ๆ ห้ามใช้น้ำยาฟอกขาว ไม่ควรแช่น้ำนาน ไม่รีดทับลายโดยตรง และไม่อบแห้งด้วยความร้อนสูงนะคะ ลายจะสวยอยู่ได้นานค่ะ" },
  { title: "กระดาษกันน้ำไหม สติ๊กเกอร์กันน้ำไหม วาชิกันน้ำไหม", content: WATER },
  { title: "วิธีเก็บรักษางานกระดาษ โปสการ์ด การ์ด", content: "งานกระดาษไม่กันน้ำ โดนน้ำไม่ได้นะคะ เก็บให้พ้นความชื้นและแดดจัด จะช่วยให้สีไม่ซีดและกระดาษไม่บวมค่ะ" },
];
const existing = await col.get();
const titles = new Set(existing.docs.map((d) => String(d.data().title ?? "").trim()));
let added = 0, pushed = 0;
const now = new Date();
for (const it of ADD) {
  if (titles.has(it.title)) { console.log("มีแล้ว ข้าม:", it.title); continue; }
  console.log(apply ? "เพิ่ม:" : "(จะเพิ่ม)", it.title);
  if (!apply) continue;
  await col.add({ title: it.title, content: it.content, type: "policy", source: "owner-2026-10-12-care", createdBy: "owner-policy", createdByName: "เจ้าของร้าน (12 ต.ค. 69 วิธีดูแลสินค้า)", createdAt: now, timestamp: now });
  added++;
  if (await pushKnowledge({ question: it.title, answer: it.content, type: "policy" })) pushed++;
}
const ref = col.doc("e4VqTX14Vlm5y3qVAdoC");
const x = (await ref.get()).data();
if (x && !x.policyFix) {
  console.log(apply ? "แก้:" : "(จะแก้)", "e4VqTX14 กระดาษกันน้ำ");
  if (apply) {
    await ref.update({ content: WATER, prevContent: x.content, policyFix: "เจ้าของร้าน 12 ต.ค. 69: กระดาษไม่กันน้ำ · สติ๊กเกอร์ส่วนใหญ่กันน้ำ ยกเว้นวาชิ", updatedAt: now, timestamp: now });
    if (await pushKnowledge({ question: String(x.title), answer: WATER, type: String(x.type || "tip") })) pushed++;
  }
}
console.log(apply ? `✅ เพิ่ม ${added} · ส่งเข้า n8n ${pushed}` : "(ลองดูเฉย ๆ — ใส่ --apply)");
