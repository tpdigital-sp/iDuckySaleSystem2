/**
 * 📚 ชุด 3 (เจ้าของร้านตอบ 14 ข้อ 12 ต.ค. 69 · คัดจากคำถามลูกค้าจริง 10 วัน) → knowledge-base type "policy"
 *   แก้ข้อเดิม 4 ข้อ (เคลมนับจากวันที่ได้รับของ · อีเมลส่งไฟล์ · ทำเส้นไดคัทเองได้ · ผ้าซักเครื่องได้) เก็บ prevContent ไว้ย้อน
 *   รันซ้ำได้ · ใส่ --apply เพื่อบันทึก
 */
import { getChatFirestore } from "../src/lib/server/firebase-admin";
import { pushKnowledge } from "../src/lib/server/bot-kb";
import { SHOP } from "../src/lib/shop-info";

const apply = process.argv.includes("--apply");
const db = getChatFirestore();
if (!db) throw new Error("ยังไม่ได้ตั้งค่า Firestore");
const col = db.collection("knowledge-base");

const EMAIL = "iduckyshop03@gmail.com";
const ADDRESS = [SHOP.legalName, ...SHOP.addressLines].join(" ");
const MAPS = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ADDRESS)}`;

const ADD: { title: string; content: string }[] = [
  { title: "รับทำงานที่ไม่มีบนเว็บไหม ตุ๊กตา พัด ที่เปิดขวด คีย์แคป สายคาดกล่อง สกรีนผ้า", content: "งานที่ยังไม่มีบนเว็บ บางงานร้านอาจทำได้ค่ะ รบกวนส่งรายละเอียด ขนาด จำนวน และรูปตัวอย่างไว้ในแชท เดี๋ยวแอดมินตรวจสอบและตอบกลับนะคะ 🙏 (บอทห้ามตอบเองว่าไม่รับ ให้ส่งต่อแอดมินเสมอ)" },
  { title: "ใช้ฟอนต์ของลูกค้าได้ไหม ระบุฟอนต์เองได้ไหม", content: "ใช้ฟอนต์ของลูกค้าได้ค่ะ แจ้งชื่อฟอนต์ หรือแนบไฟล์ฟอนต์มาทางลิงก์ Google Drive หรืออีเมลร้านได้เลยนะคะ" },
  { title: "ร้านทำแบบให้ดูก่อนสั่งได้ไหม ทำลายให้ดูก่อนโอนได้ไหม", content: "ร้านเริ่มทำแบบหลังจากลูกค้าสั่งซื้อและโอนเงินค่าสินค้าแล้วค่ะ จากนั้นแอดมินจะส่งแบบให้ลูกค้าตรวจและยืนยันก่อนผลิตทุกครั้ง แก้แบบได้ไม่เกิน 3 ครั้งนะคะ" },
  { title: "ขอดูผลงานเก่า ขอสั่งชิ้นทดลองดูคุณภาพก่อนได้ไหม", content: "เรื่องผลงานตัวอย่างและการสั่งชิ้นทดลอง เดี๋ยวแอดมินตรวจสอบและตอบกลับนะคะ 🙏" },
  { title: "สั่งผ่านแชทหรือสั่งผ่านแอดมินได้ไหม ต้องกดสั่งบนเว็บไหม", content: "รบกวนสั่งซื้อผ่านหน้าเว็บ iduckystore.com ก่อนนะคะ สั่งเสร็จแล้วแจ้งเลขออเดอร์ (OD-…) ในแชท แอดมินจะดูแลต่อให้ค่ะ ถ้าติดขั้นตอนไหนบนเว็บ ทักแอดมินได้เลยนะคะ" },
  { title: "สินค้ามีของไหม มีสต๊อกไหม มีพอ 100 ชิ้นไหม", content: "เรื่องของในสต๊อก เดี๋ยวแอดมินตรวจสอบและตอบกลับนะคะ 🙏" },
  { title: "มีค่าบล็อกไหม ค่าเพลท ค่าแม่พิมพ์", content: "ไม่มีค่าบล็อกค่ะ งานของร้านเป็นงานพิมพ์ดิจิทัล ไม่ต้องทำบล็อกหรือเพลทนะคะ (งานปักที่ไม่มีไฟล์ปัก อาจมีค่าตีลายตามหน้าสินค้า)" },
  { title: "เคยสมัครตัวแทนในระบบเก่า ต้องสมัครใหม่ไหม", content: "ต้องสมัครใหม่ในเว็บนี้ค่ะ สมัครได้ที่ iduckystore.com/dealer ต้องล็อกอินหรือสร้างบัญชีก่อน แล้วรอร้านอนุมัติ หลังอนุมัติบัญชีนั้นจะเห็นราคาตัวแทนทันที ตอนสั่งต้องล็อกอินบัญชีตัวแทนทุกครั้งนะคะ" },
  { title: "เบอร์โทรร้าน ที่อยู่ร้าน แผนที่ โลเคชัน", content: `โทร ${SHOP.phone} ค่ะ ที่อยู่ ${ADDRESS} แผนที่ ${MAPS} ถ้าจะมารับของเอง รอแอดมินแจ้งว่าแพ็คเสร็จก่อนนะคะ มีที่จอดรถค่ะ` },
  { title: "ลูกค้าพิมพ์ภาษาอังกฤษ ตอบภาษาอะไร English customer", content: "ตอบเป็นภาษาเดียวกับที่ลูกค้าพิมพ์มา ลูกค้าพิมพ์อังกฤษให้ตอบอังกฤษ (ร้านไม่ส่งของไปต่างประเทศ) / Reply in the customer's language. We ship within Thailand only." },
];

// ชุดนี้แก้ข้อเก่าที่ขัดกันอีก 6 ข้อ: เคลมนับจากวันส่ง 2 ข้อ · "ไม่รับงานนอกเว็บ" · "ไม่มีบริการออกแบบ" 3 ข้อ (ขัดกับชุด 2 ที่เจ้าของร้านตอบว่าค่าออกแบบแอดมินตีราคา)
const CLAIM = "เคลมได้ภายใน 7 วันนับจากวันที่ได้รับสินค้าค่ะ • ก่อนแกะพัสดุรบกวนถ่ายวิดีโอตอนแกะกล่องแบบคลิปเดียวจบ ไม่ตัดต่อ • ถ้ากล่องชำรุด ฉีกขาด ให้ถ่ายทุกมุมของกล่องไว้ก่อน (ร้านจะใช้แจ้งเคลมกับไปรษณีย์) • ถ้าแกะแล้วพบว่าสินค้าแตก เสียหาย หรือไม่ครบ ส่งคลิปหลักฐานมาทางแชท ร้านจะตรวจสอบและเคลมให้ตามขั้นตอนค่ะ • กรณีต้องส่งของกลับมาตรวจที่ร้าน ถ้าตรวจแล้วสินค้าปกติ ลูกค้าเสียค่าส่งกลับเองนะคะ";
const DESIGN = "ร้านออกแบบให้ได้ค่ะ ค่าออกแบบแอดมินประเมินตามความยากง่ายของงาน ส่วนการจัดวางไฟล์ลงขนาดงานและทำเส้นไดคัทจากไฟล์ที่ลูกค้าส่งมา กราฟิกของร้านดูแลให้ และส่งแบบให้ตรวจก่อนผลิตทุกงานนะคะ ร้านเริ่มทำแบบหลังลูกค้าสั่งซื้อและโอนเงินค่าสินค้าแล้วค่ะ";
const NOT_MADE = "ร้านไม่รับงานโลหะ/เหล็ก (กล่องเหล็ก เข็มกลัดโลหะ) งาน 3D (ตุ๊กตา 3D สติ๊กเกอร์นูน) พวงกุญแจหนังปัก อาร์มไหมพรม และกระดาษชานอ้อย (เปลี่ยนเป็นการ์ดบอร์ด) ค่ะ ส่วนงานอื่นที่ยังไม่มีบนเว็บ บางงานร้านอาจทำได้ รบกวนส่งรายละเอียดและรูปตัวอย่างไว้ในแชท เดี๋ยวแอดมินตรวจสอบและตอบกลับนะคะ 🙏\n\nลูกค้ามักพิมพ์ถามว่า: \"รับทำกล่องเหล็กไหมคะ\" / \"รับทำเข็มกลัดโลหะไหมคะ\" / \"รับทำอาร์มไหมพรมไหมคะ\"";
const FIX: { id: string; content: string; note: string }[] = [
  { id: "nHXSBvjj1rur4RAQ8VL1", note: "เคลมนับจากวันที่ได้รับของ", content: CLAIM },
  { id: "8MycW1ZQ5spu7DyPtmEe", note: "เคลมนับจากวันที่ได้รับของ", content: CLAIM },
  { id: "WEV6sIVfkqQ0a8zeNj45", note: "เคลมนับจากวันที่ได้รับของ", content: CLAIM },
  { id: "39wmKr5KyirhUzPROw85", note: "งานนอกเว็บบางงานอาจทำได้ ส่งต่อแอดมิน", content: NOT_MADE },
  { id: "6LQ5MhXA7IiQHlhQFqBv", note: "ร้านออกแบบให้ได้ ค่าออกแบบแอดมินตีราคา", content: DESIGN },
  { id: "ZVBzA4uAy1GSgoAVjArf", note: "ร้านออกแบบให้ได้ ค่าออกแบบแอดมินตีราคา", content: DESIGN },
  { id: "yDZYpn0YMD7aFkH8qgK2", note: "ร้านออกแบบให้ได้ ค่าออกแบบแอดมินตีราคา", content: DESIGN },
  { id: "j4DluwnsExQFzCvIlpzo", note: "ส่งไฟล์ทางลิงก์ Drive หรืออีเมลร้าน", content: `ส่งไฟล์งานเป็น .AI, .PSD หรือ .PNG (พื้นหลังใส) ได้ค่ะ ส่งได้ 2 ทาง: แชร์ลิงก์ Google Drive ในแชท (เปิดสิทธิ์ให้ทุกคนที่มีลิงก์ดูได้) หรือส่งอีเมลมาที่ ${EMAIL} แล้วแจ้งเลขออเดอร์ในแชทนะคะ` },
  { id: "uJ3fTUuhxD4Lzlnih8aA", note: "ทำเส้นไดคัทมาเองหรือให้ร้านทำ", content: "ลูกค้าทำเส้นไดคัทมาเองก็ได้ หรือให้ร้านทำให้ก็ได้ค่ะ ถ้าให้ร้านทำ ส่งไฟล์ภาพพื้นหลังใสมาได้เลย ก่อนส่งฝ่ายผลิต ร้านจะส่งแบบให้ลูกค้ายืนยันก่อนทุกครั้งค่ะ" },
  { id: "dLTsFnL92dBLf9Lsv0jk", note: "ผ้าซักเครื่องได้ สีไม่ตก", content: "ผ้าซักเครื่องได้ สีไม่ตกค่ะ ถ้าอยากให้ลายสวยอยู่นาน แนะนำกลับด้านผ้าก่อนซัก ใช้ผงซักฟอกอ่อน ๆ ไม่ใช้น้ำยาฟอกขาว ไม่รีดทับลายโดยตรง และไม่อบแห้งด้วยความร้อนสูงนะคะ" },
];

const existing = await col.get();
const titles = new Set(existing.docs.map((d) => String(d.data().title ?? "").trim()));
let added = 0, fixed = 0, pushed = 0;
const now = new Date();
for (const it of ADD) {
  if (titles.has(it.title)) { console.log("มีแล้ว ข้าม:", it.title); continue; }
  console.log(apply ? "เพิ่ม:" : "(จะเพิ่ม)", it.title);
  if (!apply) continue;
  await col.add({ title: it.title, content: it.content, type: "policy", source: "owner-2026-10-12-c", createdBy: "owner-policy", createdByName: "เจ้าของร้าน (12 ต.ค. 69 ชุด 3)", createdAt: now, timestamp: now });
  added++;
  if (await pushKnowledge({ question: it.title, answer: it.content, type: "policy" })) pushed++;
}
for (const f of FIX) {
  const ref = col.doc(f.id);
  const x = (await ref.get()).data();
  if (!x) { console.log("ไม่พบ", f.id); continue; }
  if (x.content === f.content) { console.log("ตรงแล้ว ข้าม:", f.id); continue; }
  console.log(apply ? "แก้:" : "(จะแก้)", f.id, f.note);
  if (!apply) continue;
  await ref.update({ content: f.content, [x.prevContent ? "prevContent2" : "prevContent"]: x.content, policyFix: `เจ้าของร้าน 12 ต.ค. 69: ${f.note}`, updatedAt: now, timestamp: now });
  fixed++;
  if (await pushKnowledge({ question: String(x.title), answer: f.content, type: String(x.type || "policy") })) pushed++;
}
console.log(apply ? `✅ เพิ่ม ${added} · แก้ ${fixed} · ส่งเข้า n8n ${pushed}` : "(ลองดูเฉย ๆ — ใส่ --apply)");
