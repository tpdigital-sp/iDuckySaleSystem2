// ============================================================
//  🚦 Reply Gate — โหนดใน LINE OA Bot (7v7dy4PvnVnGzlYg) วางระหว่าง "Site Price Flex (iduckystore)" → "Reply to LINE" · 24 ก.ย. 69
//
//  ปัญหา: ลูกค้าพิมพ์ 3 บรรทัดติดกัน ได้ 3 คำตอบ — Debounce Buffer รอแค่ 5 วิแล้วปล่อยตัวที่ "ล่าสุด ณ ตอนนั้น" ไปคิดคำตอบ
//  แต่ระหว่างที่ AI คิด (15-25 วิ) ข้อความถัดไปเข้ามาแล้วกลายเป็นตัวล่าสุดใหม่ → ทั้งสองตัวตอบ
//  แก้: ก่อนส่งคำตอบ เช็คอีกครั้งว่า "ยังเป็นข้อความล่าสุดของลูกค้าคนนี้ไหม" (lastEventId ใน Firestore)
//   · ไม่ใช่ → ทิ้งคำตอบนี้เงียบ ๆ (ตัวใหม่กว่าจะตอบแบบรวมข้อความให้เอง เพราะ Debounce ไม่ล้าง pending แล้ว)
//   · ใช่   → ล้าง pendingMessages แล้วส่งตามปกติ
//  รูป/กรณี bypass ของ Debounce ปล่อยผ่านเสมอ · ต้องแก้ Debounce Buffer คู่กัน: (1) ไม่ล้าง pending ตอน claim (2) ส่ง idToken ออกมาใน json
// ============================================================
const j = $input.first().json || {};
let deb = {};
try { deb = $('Debounce Buffer').first().json || {}; } catch (e) {}
if (deb.isImageOnly || deb.debounceBypass || !deb.myEventId || !deb.userId) return [{ json: j }];

// ใช้ idToken ที่ Debounce Buffer ขอไว้แล้ว (ส่งมาใน output) — ไม่ต้องมีคีย์ในโหนดนี้
const idToken = deb.idToken;
if (!idToken) return [{ json: j }];
const docUrl = `https://firestore.googleapis.com/v1/projects/tpdigital-iducky/databases/ordersure/documents/line-conversations/${deb.userId}`;
try {
  const doc = await this.helpers.httpRequest({ method: 'GET', url: docUrl, headers: { Authorization: `Bearer ${idToken}` }, json: true, timeout: 8000 });
  const latest = doc && doc.fields && doc.fields.lastEventId && doc.fields.lastEventId.stringValue;
  if (latest && latest !== deb.myEventId) {
    // มีข้อความใหม่กว่าเข้ามาระหว่างคิดคำตอบ → ตัวนั้นจะตอบรวมให้ ไม่ส่งซ้ำ
    return [];
  }
  try {
    await this.helpers.httpRequest({ method: 'PATCH', url: `${docUrl}?updateMask.fieldPaths=pendingMessages`, headers: { Authorization: `Bearer ${idToken}` }, body: { fields: { pendingMessages: { arrayValue: { values: [] } } } }, json: true, timeout: 8000 });
  } catch (e) {}
} catch (e) {
  // เช็คไม่ได้ = ส่งตามปกติ ดีกว่าเงียบ
}
return [{ json: j }];
