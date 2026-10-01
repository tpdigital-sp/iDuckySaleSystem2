// โหนด Build AI Request (LINE OA Bot 7v7dy4PvnVnGzlYg) — 1 ต.ค. 69 แทนบรรทัดเดิม:
//   const recentHistory = history.filter(m => m.role === 'user' || !FALLBACK_RE.test(m.text || '')).slice(-10);
// ด้วยการตัด "รอบสนทนา": เงียบเกิน 6 ชม. = คนละรอบ ไม่เอาข้อความเก่ามาปน (ทั้ง conversationHistory ที่ agent เห็น และ previousMessages ที่ Site Price Flex ส่งให้เว็บ)
const SESSION_GAP_MS = 6 * 3600 * 1000;
const cleanHistory = history.filter(m => m.role === 'user' || !FALLBACK_RE.test(m.text || ''));
const sessionHistory = [];
let prevAt = Date.now();
for (let i = cleanHistory.length - 1; i >= 0 && sessionHistory.length < 16; i--) {
  const at = Date.parse(cleanHistory[i].at || '');
  if (prevAt != null && Number.isFinite(at) && prevAt - at > SESSION_GAP_MS) break;
  if (Number.isFinite(at)) prevAt = at;
  sessionHistory.unshift(cleanHistory[i]);
}
const recentHistory = sessionHistory;
