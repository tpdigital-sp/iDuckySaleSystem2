// ============================================================
//  🌐 Site Price Flex (iduckystore.com) v3 — โหนดใน LINE OA Bot (7v7dy4PvnVnGzlYg) · 23 ก.ย. 69
//  ตำแหน่ง: Build Price Flex → [โหนดนี้] → Reply to LINE
//
//  ทำ 2 อย่าง:
//   1) ลูกค้าถามราคา/จำนวน → ถาม /api/pricing/search ของเว็บจริง แล้ว "แทน" ข้อความด้วยการ์ดราคา
//      (hero = รูปสินค้าบนเว็บ · ปุ่ม = หน้าสินค้าจริง · ถามกว้าง = carousel)
//   2) คำตอบอื่น ๆ ที่พูดถึงสินค้า (agent ตอบจากคลังความรู้ ไม่มีรูป/ลิงก์) → "แนบ" การ์ดสินค้า (รูป+ช่วงราคา+ลิงก์)
//      ต่อท้ายข้อความเดิม — หาสินค้าจากผล API หรือเทียบชื่อสินค้าในแคตตาล็อกเว็บกับข้อความตอบ/ข้อความลูกค้า
//
//  ⚠️ บทเรียน 23 ก.ย. 69: ข้อความลูกค้าที่ถูกรวมโดย Debounce Buffer อยู่ที่ $('Debounce Buffer').userText
//  ("อยากได้ที่ติดรถยนต์ / มีแบบไหนบ้าง / เอาแบบกันฝน") ส่วน Parse LINE Event มีแค่ข้อความสุดท้าย → เคยอ่านผิดตัว การ์ดไม่ขึ้น
//  ไม่ใช่คำถามสินค้า/หาสินค้าไม่เจอ → ส่ง item ผ่านไปเหมือนเดิม
// ============================================================
const SITE = 'https://iduckystore.com';
const SITE_API = SITE + '/api/pricing/search';
const BRAND_DARK = '#1F5F5A', BRAND = '#2D7C76', BRAND_LIGHT = '#F0FBFA', BRAND_BORDER = '#C7E8E4', HL_BG = '#FFF8E1', HL_FG = '#B86E00';
const PLACEHOLDER_IMG = SITE + '/og-default.jpg';
// ถามราคา = แทนข้อความด้วยการ์ดราคา
const ASK_PRICE = /ราคา|เท่าไหร่|เท่าไร|กี่บาท|ก็บาท|กีบาท|กี้บาท|คิดเงิน|กี่ตังค์|เรท|quote|price|cost|ขั้นต่ำ|ขั้นตำ่|\d[\d,]*\s*(?:ชิ้น|ใบ|อัน|แผ่น|ตัว|ผืน|เซ็ต|เซต|ชุด|เล่ม|คู่|ดวง|ม้วน|กล่อง|pcs)/i;
// พูดถึงสินค้า/ตัวเลือก = แนบการ์ดสินค้าต่อท้าย
const ASK_PRODUCT = /มีแบบไหน|แบบไหนบ้าง|มีกี่แบบ|มีขนาด|ขนาดเท่าไหร่|มีสีอะไร|มีไหม|มีมั้ย|รับทำ|อยากได้|สนใจ|ต้องการ|มีอะไรบ้าง|แนะนำ/i;
const NOT_PRODUCT = /โอนเงิน|ชำระ|สลิป|เคลม|ติดตาม|พัสดุ|ค่าส่ง|ส่งไฟล์|ไฟล์งาน|เลขพัสดุ|ยกเลิก/;

function esc(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function trunc(s, n) { s = esc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function norm(s) { return String(s || '').toLowerCase().replace(/[\s​]+/g, '').replace(/[()[\]{}/,._+*'"|·–—\-]/g, ''); }
function lcs(a, b) { let best = 0; for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { let k = 0; while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++; if (k > best) best = k; } return best; }
function priceText(p) { return p.priceMin && p.priceMax && p.priceMax > p.priceMin ? ('฿' + p.priceMin.toLocaleString() + ' – ' + p.priceMax.toLocaleString()) : p.priceMin ? ('เริ่ม ฿' + p.priceMin.toLocaleString()) : 'ดูราคาบนเว็บ'; }

function linesToRows(answer) {
  const rows = [];
  const lines = String(answer || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const raw of lines) {
    if (/^https?:\/\//i.test(raw)) continue;
    if (rows.length >= 14) break;
    if (/^【.+】/.test(raw)) { rows.push({ type: 'text', text: trunc(raw.replace(/[【】]/g, ''), 90), size: 'xs', weight: 'bold', color: BRAND_DARK, wrap: true, margin: 'md' }); continue; }
    const m = raw.match(/^[•·\-]\s*(.+?)\s*[—:]\s*(.+)$/);
    if (m) { rows.push({ type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs', contents: [ { type: 'text', text: trunc(m[1], 40), size: 'xs', color: '#555555', wrap: true, flex: 5 }, { type: 'text', text: trunc(m[2], 40), size: 'xs', color: HL_FG, weight: 'bold', wrap: true, flex: 4, align: 'end' } ] }); continue; }
    rows.push({ type: 'text', text: trunc(raw, 120), size: 'xxs', color: '#8A8A8A', wrap: true });
  }
  return rows;
}
function priceBubble(site, product) {
  const answer = String(site.answer || site.text || '');
  const header = answer.split('\n')[0] || product.name;
  const rows = linesToRows(answer.split('\n').slice(1).join('\n'));
  return { type: 'bubble', size: 'mega',
    hero: { type: 'image', url: product.image || PLACEHOLDER_IMG, size: 'full', aspectRatio: '4:3', aspectMode: 'cover', action: { type: 'uri', label: 'ดูสินค้า', uri: product.url } },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', backgroundColor: '#FFFFFF', contents: [
      { type: 'text', text: trunc(header, 80), weight: 'bold', size: 'md', color: BRAND_DARK, wrap: true },
      { type: 'separator', margin: 'md', color: BRAND_BORDER },
      ...rows,
      { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '8px', backgroundColor: HL_BG, cornerRadius: '8px', contents: [ { type: 'text', text: 'ราคาจากเว็บ iduckystore.com — กดปุ่มด้านล่างเลือกตัวเลือกครบทุกแบบ + สั่งได้ทันที', size: 'xxs', color: HL_FG, wrap: true } ] } ] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', backgroundColor: BRAND_LIGHT, contents: [ { type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: 'ดูราคาครบทุกแบบ / สั่งเลย', uri: product.url } } ] } };
}
function productBubble(p, size) {
  return { type: 'bubble', size: size || 'kilo',
    hero: { type: 'image', url: p.image || PLACEHOLDER_IMG, size: 'full', aspectRatio: '4:3', aspectMode: 'cover', action: { type: 'uri', label: 'ดูสินค้า', uri: p.url } },
    body: { type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px', contents: [
      { type: 'text', text: trunc(p.name, 40), weight: 'bold', size: 'sm', color: BRAND_DARK, wrap: true },
      { type: 'text', size: 'xs', color: HL_FG, wrap: true, text: priceText(p) } ] },
    footer: { type: 'box', layout: 'vertical', paddingAll: '8px', contents: [ { type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: 'ดูราคา / สั่งเลย', uri: p.url } } ] } };
}
function productFlex(products, altPrefix) {
  const list = products.slice(0, 6);
  const contents = list.length > 1 ? { type: 'carousel', contents: list.map(p => productBubble(p, 'kilo')) } : productBubble(list[0], 'kilo');
  return { type: 'flex', altText: trunc((altPrefix || 'สินค้า') + ': ' + list.map(p => p.name).join(', '), 380), contents };
}

// แคตตาล็อกเว็บ (ชื่อ/ลิงก์/รูป/ช่วงราคา) แคช 10 นาทีใน static data — ไว้เทียบชื่อสินค้าในข้อความตอบ
async function catalog(ctx) {
  // ⚠️ ใน Code node ตัวที่มีคือ global `$getWorkflowStaticData` ไม่ใช่ this.getWorkflowStaticData (เคยพัง 23 ก.ย. 69 บอทเงียบทั้งข้อความ)
  let st = {};
  try { st = (typeof $getWorkflowStaticData === 'function' ? $getWorkflowStaticData('global') : null) || {}; } catch (e) { st = {}; }
  if (st.siteCatalog && st.siteCatalogAt && Date.now() - st.siteCatalogAt < 10 * 60 * 1000) return st.siteCatalog;
  try {
    const r = await ctx.helpers.httpRequest({ method: 'GET', url: SITE_API + '?catalog=1', json: true, timeout: 15000 });
    if (r && Array.isArray(r.items) && r.items.length) { st.siteCatalog = r.items; st.siteCatalogAt = Date.now(); return r.items; }
  } catch (e) {}
  return st.siteCatalog || [];
}
// หาสินค้าที่ "ถูกพูดถึง" ในข้อความ (ชื่อสินค้าตรงกับข้อความอย่างน้อย 6 ตัวอักษรและ ≥75% ของชื่อ — 55% เคยลาก "แม่เหล็กติดตู้เย็น" มากับ "แม่เหล็กติดรถยนต์")
function mentioned(items, text) {
  const t = norm(text);
  if (!t) return [];
  const hits = [];
  for (const it of items) {
    const n = norm(it.name);
    if (n.length < 4) continue;
    const l = lcs(n, t);
    if (l >= 6 && l >= n.length * 0.75) hits.push({ it, score: l / n.length + (t.includes(n) ? 1 : 0) });
  }
  return hits.sort((a, b) => b.score - a.score).map(h => h.it).slice(0, 6);
}

let mergedText = '';
try { mergedText = String($('Debounce Buffer').first().json.userText || ''); } catch (e) {}
let lastText = '';
try { lastText = String($('Parse LINE Event').first().json.userText || ''); } catch (e) {}

// 🧠 v3: ข้อความก่อนหน้าของลูกค้า (จาก Build AI Request.previousMessages / Read Memory) → ส่งเป็น context ให้เว็บ
// เว็บมีชั้นเข้าใจคำถามด้วย LLM: "เอาแบบกันฝนค่ะ" หลัง "ที่ติดรถยนต์" = แม่เหล็กติดรถยนต์ · "ตัวนี้ 50 ชิ้น" = สินค้าที่คุยค้าง
function prevUserMessages() {
  let raw = null;
  try { raw = $('Build AI Request').first().json.previousMessages; } catch (e) {}
  if (raw == null) { try { raw = $('Read Memory').first().json.messages || $('Read Memory').first().json.history; } catch (e) {} }
  const out = [];
  const push = (t) => { t = String(t || '').trim(); if (t && t.length <= 300) out.push(t); };
  if (typeof raw === 'string') {
    raw.split('\n').forEach(l => { const m = l.match(/^\s*(?:user|customer|ลูกค้า|u)\s*[:：]\s*(.+)$/i); if (m) push(m[1]); });
  } else if (Array.isArray(raw)) {
    for (const m of raw) {
      if (typeof m === 'string') { push(m); continue; }
      if (!m || typeof m !== 'object') continue;
      const role = String(m.role || m.from || m.sender || m.type || '').toLowerCase();
      if (role && !/user|customer|human|ลูกค้า/.test(role)) continue;
      push(m.text || m.content || m.message || m.userText);
    }
  }
  return out.slice(-5);
}
const context = prevUserMessages();

const out = [];
for (const item of $input.all()) {
  const j = item.json || {};
  // ⛑ โหนดนี้เป็น "ของแถม" — พังเมื่อไหร่ต้องส่งข้อความเดิมออกไปเสมอ ห้ามทำให้ลูกค้าไม่ได้คำตอบ
  try {
  const ut = mergedText || lastText || j.userMessage || j.userText || j.text || '';
  const replyText = String(j.replyText || '');
  if (!ut || ut.length < 2 || NOT_PRODUCT.test(ut)) { out.push({ json: j }); continue; }
  // v3: ถามเว็บทุกข้อความ (ยกเว้นเรื่องออเดอร์/ไฟล์) แล้วให้ชั้นเข้าใจคำถามของเว็บตัดสิน — regex เหลือแค่ตัวช่วย
  const askPrice = ASK_PRICE.test(ut);
  let site = null;
  try { site = await this.helpers.httpRequest({ method: 'POST', url: SITE_API, json: true, body: { query: ut, context, noFallback: true }, timeout: 20000 }); } catch (e) { site = null; }
  const siteProducts = site && site.found ? (Array.isArray(site.products) && site.products.length ? site.products : (site.product ? [site.product] : [])) : [];
  const priceIntent = site && /^price/.test(String(site.intent || ''));
  const understoodPrice = site && site.understood && site.understood.intent === 'price';
  // 1) ถามราคา (regex หรือชั้นเข้าใจคำถามบอกว่าเป็นราคา) → การ์ดราคาแทนข้อความ
  if ((askPrice || understoodPrice) && siteProducts.length && priceIntent) {
    let flexContents = null;
    try { flexContents = siteProducts.length > 1 && /_menu$/.test(String(site.intent)) ? { type: 'carousel', contents: siteProducts.slice(0, 8).map(p => productBubble(p, 'kilo')) } : priceBubble(site, siteProducts[0]); } catch (e) {}
    if (flexContents) {
      const altText = trunc(String(site.answer || site.text || siteProducts[0].name).split('\n')[0], 380) || 'ราคาสินค้า';
      const closing = /_menu$/.test(String(site.intent)) ? 'สนใจแบบไหน บอกชื่อกับจำนวนได้เลยค่ะ เดี๋ยวคิดราคาให้ 😊' : (site.intent === 'price_qty' ? 'สนใจสั่งเลยไหมคะ กดปุ่มในการ์ดสั่งได้ทันที 😊' : 'สนใจจำนวนเท่าไหร่ บอกได้เลยค่ะ เดี๋ยวคิดราคารวมให้ 😊');
      out.push({ json: { ...j, messages: [{ type: 'flex', altText, contents: flexContents }, { type: 'text', text: closing }], siteAnswer: site.answer || site.text, siteProducts, siteFlex: 'price' } });
      continue;
    }
  }

  // 1.5) ลูกค้าถามหาของที่ร้านไม่มี (เว็บบอก intent=not_in_catalog) → ข้อความจากเว็บ "ยังไม่มี… ใกล้เคียงคือ…" + การ์ดตัวใกล้เคียง
  if (site && site.found && /^(not_in_catalog|draft_product|mix|info)$/.test(String(site.intent))) {
    const t = String(site.answer || '').split('\n').filter(l => !/^\s*https?:\/\/\S+\s*$/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const msgs = [{ type: 'text', text: t || replyText }];
    if (siteProducts.length) msgs.push(productFlex(siteProducts, 'สินค้าใกล้เคียง'));
    out.push({ json: { ...j, messages: msgs, siteAnswer: site.answer, siteProducts, siteFlex: 'not-in-catalog' } });
    continue;
  }

  // 2) แนบการ์ดสินค้า (รูป+ลิงก์) ต่อท้ายข้อความเดิม — จากผล API หรือชื่อสินค้าที่ปรากฏในคำตอบ/คำถาม
  let products = siteProducts;
  if (!products.length) {
    const items = await catalog(this);
    products = mentioned(items, replyText + ' ' + ut);
  }
  if (!products.length || !replyText) { out.push({ json: j }); continue; }
  // การ์ดมีปุ่มลิงก์แล้ว → ตัดบรรทัดที่เป็น URL ล้วน (slug ไทย = %E0%B8… ยาว 5 บรรทัด) ออกจากข้อความ
  // และถ้าข้อความเป็นเมนูจากเครื่องคิดราคา ("กลุ่มนี้มีหลายแบบ") ให้ย่อเหลือประโยคเดียว เพราะ carousel แสดงครบกว่า
  const cleanText = (t) => String(t || '').split('\n').filter(l => !/^\s*https?:\/\/\S+\s*$/.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const isMenuText = products.length > 1 && /มีหลายแบบ/.test(replyText);
  const textMsgs = (Array.isArray(j.messages) ? j.messages : []).filter(m => m && m.type === 'text');
  let base = (textMsgs.length ? textMsgs.slice(0, 2) : [{ type: 'text', text: replyText }]).map(m => ({ ...m, text: cleanText(m.text) })).filter(m => m.text);
  if (isMenuText || !base.length) base = [{ type: 'text', text: 'ของกลุ่มนี้มีหลายแบบค่ะ เลือกดูรายละเอียดจากการ์ดด้านล่างได้เลย 😊\nสนใจแบบไหนกับจำนวนเท่าไหร่ แจ้งได้เลยนะคะ' }];
  out.push({ json: { ...j, messages: [...base, productFlex(products, 'ดูรายละเอียด/สั่งบนเว็บ')], siteProducts: products, siteFlex: 'attach' } });
  } catch (e) {
    out.push({ json: { ...j, siteFlexError: String(e && e.message || e) } });
  }
}
return out;
