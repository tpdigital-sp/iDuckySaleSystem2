// ============================================================
//  👥 Group Log (iduckystore) — โหนด Code ใน LINE OA Bot (7v7dy4PvnVnGzlYg) วางระหว่าง "Webhook (LINE)" → "Parse LINE Event" · 21 ต.ค. 69
//
//  ปัญหา: ข้อความใน "ไลน์กลุ่ม" (source.type = group · รหัส C…) / ห้องรวม (room · R…) ไม่ถูกจดเป็นห้องของกลุ่ม
//  เพราะ Debounce/Build AI Request ตั้งคีย์ห้องจาก source.userId (= คนพิมพ์) อย่างเดียว → หน้า /admin/chatbot/chats?id=C… ไม่มีอะไรให้ดู
//  แก้: event ของกลุ่ม/ห้องรวม → ส่งให้เว็บจดเอง (POST /api/bot/group-log: ถามชื่อกลุ่ม/ชื่อคนพิมพ์จาก LINE · เขียน line-conversations/{groupId})
//        แล้ว "ตัดทิ้ง" จากสายหลัก → บอทไม่ตอบในกลุ่ม (เก็บแชทอย่างเดียว · แอดมินตอบจากหน้าแชทได้)
//        event ของลูกค้าเดี่ยว (user) ผ่านไป Parse LINE Event ตามเดิมทุกตัว
//
//  สิทธิ์เรียกเว็บ: ใช้ fbIdToken ที่ Debounce Buffer แคชไว้ใน static data (อายุ < 50 นาที) · ไม่มี/หมดอายุ → x-cron-secret
//  ⚠️ ต้องวาง CRON_SECRET (ค่าเดียวกับ env ของเว็บบน Netlify) ในบรรทัดด้านล่างก่อน Publish — ไม่งั้นข้อความกลุ่มช่วงที่ token หมดอายุจะหาย (401)
//  ⚠️ LINE Developers → Messaging API → "Allow bot to join group chats" ต้องเปิด ไม่งั้นบัญชีร้านเข้ากลุ่มไม่ได้ตั้งแต่แรก
// ============================================================
const SITE = 'https://iduckystore.com';
const CRON_SECRET = ''; // ← วาง CRON_SECRET ของเว็บที่นี่

const out = [];
for (const item of $input.all()) {
  const j = item.json || {};
  // n8n Webhook node ให้ body ใน $json.body · บางเวอร์ชัน/การตั้งค่าให้ตรง ๆ ที่ $json
  const hasBody = j.body && typeof j.body === 'object';
  const body = hasBody ? j.body : j;
  const events = Array.isArray(body.events) ? body.events : [];
  const isGroup = (e) => !!(e && e.source && (e.source.type === 'group' || e.source.type === 'room'));
  const grp = events.filter(isGroup);
  if (!grp.length) { out.push(item); continue; }

  let token = '';
  try {
    const st = $getWorkflowStaticData('global') || {};
    const at = st.fbIdTokenAt ? new Date(st.fbIdTokenAt).getTime() : 0;
    if (st.fbIdToken && at && Date.now() - at < 50 * 60 * 1000) token = st.fbIdToken;
  } catch (e) {}
  const headers = token ? { Authorization: `Bearer ${token}` } : { 'x-cron-secret': CRON_SECRET };
  let groupLogError = '';
  try {
    await this.helpers.httpRequest({ method: 'POST', url: `${SITE}/api/bot/group-log`, headers, body: { events: grp }, json: true, timeout: 15000 });
  } catch (e) {
    // จดไม่ได้ก็ปล่อย — ห้ามให้สายหลัก (ลูกค้าเดี่ยว) ล้มเพราะกลุ่ม · ดูสาเหตุได้ใน json.groupLogError
    groupLogError = String((e && e.message) || e).slice(0, 200);
  }

  // ส่งต่อเฉพาะ event ที่ไม่ใช่กลุ่ม (ว่างก็ส่ง item ไป — Parse LINE Event วนลูป events เองแล้วจบเงียบ)
  const rest = events.filter((e) => !isGroup(e));
  const json = hasBody ? { ...j, body: { ...body, events: rest } } : { ...j, events: rest };
  if (groupLogError) json.groupLogError = groupLogError;
  json.groupLogged = grp.length;
  out.push({ json });
}
return out;
