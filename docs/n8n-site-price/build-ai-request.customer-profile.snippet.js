// โหนด Build AI Request (LINE OA Bot) — 1 ต.ค. 69 ข้อ 2 "ความจำต่อลูกค้า"
// วางหลังบรรทัด `const recentHistory = sessionHistory;` : ดึงโปรไฟล์ลูกค้าจากเว็บ (ออเดอร์เก่า/ระดับสมาชิก/ตัวแทน/สรุปแชท)
// สิทธิ์ = Firebase ID token ของบัญชีบอท (debounceData.idToken ที่ Debounce Buffer ล็อกอินไว้แล้ว) ไม่ต้องฝัง secret
let customerProfile = '';
try {
  const tok = debounceData.idToken;
  if (tok && parseData.userId) {
    const prof = await this.helpers.httpRequest({ method: 'POST', url: 'https://iduckystore.com/api/bot/customer-profile', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: { userId: parseData.userId }, json: true, timeout: 6000 });
    customerProfile = String((prof && prof.text) || '').trim();
  }
} catch (e) { customerProfile = ''; }
// … แล้วตอน build conversationHistory ให้แปะหัว:
//   if (customerProfile) conversationHistory = '== ข้อมูลลูกค้าคนนี้ (จากระบบออเดอร์/แชทก่อนหน้า) ==\n' + customerProfile + '\n== จบข้อมูลลูกค้า ==\n' + conversationHistory;
// … และ return เพิ่ม field: customerProfile
