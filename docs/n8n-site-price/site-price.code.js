// ============================================================
//  🌐 Site Price (iduckystore.com) — Code node สำหรับ workflow "pricing-search" (1xXH53w1Yzt4ZkKQ)
//  วางไว้ "ระหว่าง" Webhook /pricing-search กับ Code node เดิม (สมองราคา 50k ตัวอักษร)
//
//  หน้าที่: ถาม /api/pricing/search ของเว็บจริงก่อน (ราคา = เครื่องคิดเงินเดียวกับตะกร้า
//  ลิงก์/รูป = หน้าสินค้า iduckystore.com) → เจอคำตอบ = ส่งออกรูปร่างเดิมเป๊ะ
//  (answer/result/response/text/kind/source/intent) · ไม่เจอ = ติดธง useLegacy ให้ IF node
//  ส่งต่อไป Code node เดิมตามปกติ (ความครอบคลุมไม่ลดลง)
//
//  โครง:  Webhook → [Site Price] → IF {{ $json.useLegacy }} ─true→ Code เดิม → Respond
//                                                          └false→ Respond (ตอบจาก $json เลย)
//  ทดสอบ: POST /webhook/pricing-search {"query":"พวงกุญแจอะคริลิค 100 ชิ้น"}
// ============================================================
const SITE_API = 'https://iduckystore.com/api/pricing/search';

const item = $input.first();
const j = item.json || {};
const body = j.body || j;

const query = String(body.query ?? body.message ?? body.text ?? body.q ?? body.userText ?? '').trim();
const qtyRaw = Number(body.qty ?? body.quantity ?? 0);

if (!query) {
  return [{ json: { ...body, useLegacy: true, siteError: 'no query' } }];
}

let site = null;
try {
  site = await this.helpers.httpRequest({
    method: 'POST',
    url: SITE_API,
    json: true,
    body: {
      query,
      ...(qtyRaw > 0 ? { qty: qtyRaw } : {}),
      // เว็บตอบเองไม่ได้ให้บอกตรง ๆ — ห้ามให้เว็บวนกลับมายิง webhook นี้ (จะกลายเป็นลูป)
      noFallback: true,
    },
    timeout: 20000,
  });
} catch (e) {
  return [{ json: { ...body, useLegacy: true, siteError: String(e && e.message || e) } }];
}

if (!site || !site.found || !(site.answer || site.text)) {
  return [{ json: { ...body, useLegacy: true, siteError: (site && site.source) || 'not found' } }];
}

const text = String(site.answer || site.text).trim();
const products = Array.isArray(site.products) ? site.products : (site.product ? [site.product] : []);

return [{
  json: {
    // 4 ชื่อซ้ำกันโดยตั้งใจ — โหนดปลายทางเดิมอ่านคนละฟิลด์
    answer: text,
    result: text,
    response: text,
    text,
    kind: site.kind,
    source: 'iduckystore:' + (site.source || 'web-price-engine'),
    intent: site.intent,
    // ลิงก์/รูปของเว็บจริง — ให้ Flex/การ์ดราคาใช้ชุดนี้แทน price_links ใน Firestore
    product: site.product || products[0] || null,
    products,
    links: Array.isArray(site.links) ? site.links : products.map(p => p.url).filter(Boolean),
    images: Array.isArray(site.images) ? site.images : products.map(p => p.image).filter(Boolean),
    site: 'https://iduckystore.com',
    useLegacy: false,
  },
}];
