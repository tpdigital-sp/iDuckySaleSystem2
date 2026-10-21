// ============================================================
//  👥 Group Log (iduckystore) — โหนด Code ใน LINE OA Bot (7v7dy4PvnVnGzlYg) · 21 ต.ค. 69
//  ต่อเป็น "สาขาข้าง" จาก LINE Webhook (LINE Webhook → Group Log · ขนานกับ Read Whitelist / HTTP Request) ไม่ขวางสายหลัก
//
//  ปัญหา: ข้อความใน "ไลน์กลุ่ม" (source.type = group · รหัส C…) / ห้องรวม (room · R…) ไม่ถูกจดเป็นห้องของกลุ่ม
//  เพราะ Parse LINE Event/Debounce ตั้งคีย์ห้องจาก source.userId (= คนพิมพ์) → ข้อความไปโผล่ห้องส่วนตัวของคนพิมพ์
//  แก้ 2 จุดคู่กัน:
//   1) โหนดนี้: event กลุ่ม/ห้องรวม → POST /api/bot/group-log ให้เว็บจด (เว็บถามชื่อกลุ่ม/ชื่อคนพิมพ์จาก LINE เอง · เขียน line-conversations/{groupId})
//   2) Parse LINE Event: ในลูป `for (const event of events) {` บรรทัดแรกเพิ่ม
//        if (event && event.source && event.source.type && event.source.type !== 'user') continue; // 👥 กลุ่ม → Group Log จดให้ บอทไม่ตอบในกลุ่ม
//      (Parse อ่าน $('LINE Webhook') ตรง ๆ — กรอง item ที่โหนดอื่นไม่มีผล ต้องข้ามในนั้นเอง)
//
//  สิทธิ์เรียกเว็บ: Firebase anonymous ID token ตัวเดียวกับ Debounce Buffer (fbIdToken/fbIdTokenAt ใน static data global)
//  หมดอายุ = สมัคร anonymous ใหม่ด้วย apiKey สาธารณะ (ตัวเดียวกับใน Debounce) — ไม่ต้องวาง CRON_SECRET
//  ⚠️ LINE OA Manager → ตั้งค่า → ตั้งค่าบัญชี → "เข้าร่วมในแชท: อนุญาตให้เข้าร่วมกลุ่ม" ต้องเปิด แล้วเชิญบัญชีร้านเข้ากลุ่มใหม่อีกครั้ง
// ============================================================
const SITE = 'https://iduckystore.com';
const apiKey = 'AIzaSyDTmN0PjG3_0odovnNietLKfNXuyqqz_CQ'; // Firebase web API key (สาธารณะ · ตัวเดียวกับ Debounce Buffer)

const j = $input.first().json || {};
const body = j.body && typeof j.body === 'object' ? j.body : j;
const events = Array.isArray(body.events) ? body.events : [];
const grp = events.filter((e) => e && e.source && (e.source.type === 'group' || e.source.type === 'room'));
if (!grp.length) return [{ json: { groupLogged: 0 } }];

let sd = null;
try { sd = $getWorkflowStaticData('global'); } catch (e) {}
let idToken = sd && sd.fbIdToken && sd.fbIdTokenAt && (Date.now() - sd.fbIdTokenAt < 50 * 60 * 1000) ? sd.fbIdToken : null;
if (!idToken) {
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, body: { returnSecureToken: true }, json: true, timeout: 8000 });
    idToken = r && r.idToken;
    if (sd && idToken) { sd.fbIdToken = idToken; sd.fbIdTokenAt = Date.now(); }
  } catch (e) {}
}
if (!idToken) return [{ json: { groupLogged: 0, groupLogError: 'no idToken' } }];

try {
  const res = await this.helpers.httpRequest({ method: 'POST', url: SITE + '/api/bot/group-log', headers: { Authorization: 'Bearer ' + idToken }, body: { events: grp }, json: true, timeout: 20000 });
  return [{ json: { groupLogged: grp.length, results: res && res.results } }];
} catch (e) {
  // จดไม่ได้ = ดูสาเหตุที่นี่ (401 = token ใช้ไม่ได้ · 5xx = เว็บ) — สาขาข้างล้มไม่กระทบสายหลัก
  return [{ json: { groupLogged: grp.length, groupLogError: String((e && e.message) || e).slice(0, 200) } }];
}
