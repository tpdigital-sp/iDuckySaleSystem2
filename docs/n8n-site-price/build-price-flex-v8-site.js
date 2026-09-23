// ============================================================
//  🎴 Build Price Flex v8 (site) — Code node ของ workflow "LINE OA Bot - AI Phase A" (7v7dy4PvnVnGzlYg)
//  แทนที่โค้ดในโหนด "Build Price Flex" (v7) — หรือวางเป็นโหนดใหม่ต่อจาก "Match Price Images"
//
//  เปลี่ยนจาก v7: ราคา/ลิงก์/รูปมาจาก iduckystore.com ทั้งหมด
//   · ราคา   = POST /api/pricing/search (เครื่องคิดเงินเดียวกับตะกร้าเว็บ) — ไม่ยิง /webhook/pricing เดิม
//   · รูป hero = product.image (ภาพปกสินค้าบนเว็บ) — ไม่ใช้ Match Price Images/Firestore price_links
//   · ปุ่ม    = "ดูราคา/สั่งเลย" → product.url (หน้าสินค้าจริง)
//   · เว็บตอบไม่ได้ → ส่งข้อความเดิม (replyText) ออกไปตามปกติ ไม่มี Flex
//
//  Input (ต่อ item): { userMessage|text|userText, replyText, messages?[] }   ← ชื่อเดิมของ v7
//  Output:           { ...item, messages: [flex, ...รูปเดิมไม่เกิน 2] }   หรือ item เดิมเมื่อไม่มี Flex
// ============================================================
const SITE_API = 'https://iduckystore.com/api/pricing/search';
const BRAND_DARK = '#1F5F5A';
const BRAND = '#2D7C76';
const BRAND_LIGHT = '#F0FBFA';
const BRAND_BORDER = '#C7E8E4';
const HL_BG = '#FFF8E1';
const HL_FG = '#B86E00';
const PLACEHOLDER_IMG = 'https://iduckystore.com/og-default.jpg';

function esc(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function trunc(s, n) { s = esc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/**
 * แปลงข้อความราคาจากเว็บเป็นบรรทัด ๆ สำหรับการ์ด
 *  【หัวเรท】 → หัวข้อสีเข้ม · "• ตัวเลือก — 100 ชิ้น: ฿12/ชิ้น (รวม ฿1,200)" → ซ้าย/ขวา · บรรทัดอื่นเป็นข้อความรอง
 * ตัดลิงก์ออก (ไปอยู่ที่ปุ่มแทน)
 */
function linesToRows(answer) {
  const rows = [];
  const lines = String(answer || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const raw of lines) {
    if (/^https?:\/\//i.test(raw)) continue;
    if (rows.length >= 14) break;
    if (/^【.+】/.test(raw)) {
      rows.push({ type: 'text', text: trunc(raw.replace(/[【】]/g, ''), 90), size: 'xs', weight: 'bold', color: BRAND_DARK, wrap: true, margin: 'md' });
      continue;
    }
    const m = raw.match(/^[•·\-]\s*(.+?)\s*[—:]\s*(.+)$/);
    if (m) {
      rows.push({
        type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'xs',
        contents: [
          { type: 'text', text: trunc(m[1], 40), size: 'xs', color: '#555555', wrap: true, flex: 5 },
          { type: 'text', text: trunc(m[2], 40), size: 'xs', color: HL_FG, weight: 'bold', wrap: true, flex: 4, align: 'end' },
        ],
      });
      continue;
    }
    rows.push({ type: 'text', text: trunc(raw, 120), size: 'xxs', color: '#8A8A8A', wrap: true });
  }
  return rows;
}

function bubble(site, product) {
  const answer = String(site.answer || site.text || '');
  const header = answer.split('\n')[0] || product.name;
  const rows = linesToRows(answer.split('\n').slice(1).join('\n'));
  return {
    type: 'bubble',
    size: 'mega',
    hero: {
      type: 'image', url: product.image || PLACEHOLDER_IMG, size: 'full', aspectRatio: '4:3', aspectMode: 'cover',
      action: { type: 'uri', label: 'ดูสินค้า', uri: product.url },
    },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', backgroundColor: '#FFFFFF',
      contents: [
        { type: 'text', text: trunc(header, 80), weight: 'bold', size: 'md', color: BRAND_DARK, wrap: true },
        { type: 'separator', margin: 'md', color: BRAND_BORDER },
        ...rows,
        { type: 'box', layout: 'vertical', margin: 'md', paddingAll: '8px', backgroundColor: HL_BG, cornerRadius: '8px',
          contents: [{ type: 'text', text: 'ราคาจากเว็บ iduckystore.com — กดปุ่มด้านล่างเลือกตัวเลือกครบทุกแบบ + สั่งได้ทันที', size: 'xxs', color: HL_FG, wrap: true }] },
      ],
    },
    footer: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', backgroundColor: BRAND_LIGHT,
      contents: [
        { type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: 'ดูราคาครบทุกแบบ / สั่งเลย', uri: product.url } },
      ],
    },
  };
}

/** เมนูหลายสินค้า (price_menu) → carousel การ์ดละสินค้า พร้อมช่วงราคา */
function carousel(products) {
  return {
    type: 'carousel',
    contents: products.slice(0, 8).map(p => ({
      type: 'bubble', size: 'kilo',
      hero: { type: 'image', url: p.image || PLACEHOLDER_IMG, size: 'full', aspectRatio: '4:3', aspectMode: 'cover', action: { type: 'uri', label: 'ดูสินค้า', uri: p.url } },
      body: {
        type: 'box', layout: 'vertical', spacing: 'xs', paddingAll: '12px',
        contents: [
          { type: 'text', text: trunc(p.name, 40), weight: 'bold', size: 'sm', color: BRAND_DARK, wrap: true },
          { type: 'text', size: 'xs', color: HL_FG, wrap: true,
            text: p.priceMin && p.priceMax && p.priceMax > p.priceMin ? `฿${p.priceMin.toLocaleString()} – ${p.priceMax.toLocaleString()}` : p.priceMin ? `เริ่ม ฿${p.priceMin.toLocaleString()}` : 'ดูราคาบนเว็บ' },
        ],
      },
      footer: { type: 'box', layout: 'vertical', paddingAll: '8px',
        contents: [{ type: 'button', style: 'primary', color: BRAND, height: 'sm', action: { type: 'uri', label: 'ดูราคา', uri: p.url } }] },
    })),
  };
}

const out = [];
for (const item of $input.all()) {
  const j = item.json || {};
  const userMsg = j.userMessage || j.text || j.userText || '';
  let site = null;
  try {
    if (userMsg && userMsg.length >= 2) {
      site = await this.helpers.httpRequest({ method: 'POST', url: SITE_API, json: true, body: { query: userMsg, noFallback: true }, timeout: 20000 });
    }
  } catch (e) { site = null; }

  const products = site && site.found ? (Array.isArray(site.products) && site.products.length ? site.products : (site.product ? [site.product] : [])) : [];
  let flexContents = null;
  try {
    // เมนู (price_menu / spec_menu) = ลูกค้าถามกว้าง → carousel ให้เลือกก่อน · สินค้าเดียว = การ์ดราคา
    if (products.length > 1 && /_menu$/.test(String(site.intent))) flexContents = carousel(products);
    else if (products.length) flexContents = bubble(site, products[0]);
  } catch (e) { flexContents = null; }

  if (flexContents) {
    const altText = trunc(String(site.answer || site.text || products[0].name).split('\n')[0], 380) || 'ราคาสินค้า';
    const flex = { type: 'flex', altText, contents: flexContents };
    const keepImgs = (Array.isArray(j.messages) ? j.messages : []).filter(m => m && m.type === 'image').slice(0, 2);
    out.push({ json: { ...j, siteAnswer: site.answer || site.text, siteProducts: products, messages: [flex, ...keepImgs] } });
  } else {
    out.push({ json: j });
  }
}
return out;
