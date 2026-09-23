# 🌐 แชทบอททุกช่องทางดึงราคา/ลิงก์/รูปจาก iduckystore.com (23 ก.ย. 69)

เป้าหมาย: **ราคาเจ้าเดียว** = `POST https://iduckystore.com/api/pricing/search`
(เครื่องคิดเงินตัวเดียวกับตะกร้า) และ **ลิงก์/รูปทุกจุดเป็นของเว็บจริง** (`product.url` / `product.image`)
แทนคลัง `price_links` ใน Firestore + Code node 50k ตัวอักษรใน n8n + ตาราง `pricing` ใน Firestore

## ✅ ทำแล้ว (โค้ด)

| ที่ | อะไร |
|---|---|
| เว็บ `src/lib/server/price-answer.ts` | คำตอบทุกแบบแนบ `product {id,name,url,image}` + `products[]` (เมนู/หลายสินค้า/ขั้นต่ำ) · `catalogRefs()` |
| เว็บ `src/app/api/pricing/search/route.ts` | CORS (OPTIONS) · `GET ?catalog=1` แคตตาล็อกทั้งร้าน · เดาโหมด ราคา/สเปก/ขั้นต่ำ ให้เอง (`mode` บังคับได้) · ตอบเพิ่ม `found, products, links[], images[], site` |
| AdminBuddy `shared/app.js` (chat.html) | ถามราคา/สเปก/ขั้นต่ำ → ยิงเว็บก่อน ตอบพร้อมรูป+ลิงก์เว็บ · ลิงก์/รูปที่แชทแปะทุกจุดใช้แคตตาล็อกเว็บ (`chatPriceLinks()`) · Firestore price_links เหลือเป็น fallback |


## ✅ สถานะ 23 ก.ย. 69 — ทำครบแล้วทั้ง 3 workflow (Publish แล้ว ทดสอบผ่าน)

| workflow | สิ่งที่แก้จริง | ผลทดสอบ |
|---|---|---|
| `pricing-search` (1xXH53w1Yzt4ZkKQ) | Webhook → **Site Price (iduckystore)** → **IF useLegacy** → true: Search Pricing เดิม / false: Respond Site | ราคา/เมนู/ขั้นต่ำ ตอบ `source: iduckystore:` พร้อม links+images ใน 1-3 วิ · ค่าส่ง/ส่งไฟล์ ตกไป qa-brain เดิม |
| `ChatBot` (Q9wMWpZsnQfSkpIT) | System Message ต่อท้ายกติกาลิงก์ (14,141→14,912) + คำอธิบาย tool `search_pricing` · URL คงที่ `/webhook/pricing-search` (ถามเว็บก่อนแล้ว) · `get_master_pricing` ถูกถอดสายอยู่ก่อนแล้ว | ตอบพร้อมลิงก์ iduckystore.com ทั้ง 2 คำถามทดสอบ (9-14 วิ) |
| `LINE OA Bot` (7v7dy4PvnVnGzlYg) | แทรก **Site Price Flex (iduckystore)** ระหว่าง Build Price Flex → Reply to LINE (โค้ด [site-price-flex.code.js](site-price-flex.code.js)) · ไม่ปิด Match Price Images (เป็นตัวสำรอง) | โค้ดรันจำลองกับ API จริง: การ์ดเดี่ยว hero=รูปเว็บ · ถามกว้าง=carousel · ทักทาย=ไม่สร้างการ์ด (ยังไม่ได้ส่ง LINE จริง) |

วิธีที่ใช้แก้: หน้า n8n ที่ล็อกอินแล้ว → วางโหนดด้วย paste JSON + ต่อสายผ่าน store (`workflowDocuments/<id>@latest`.addConnection) → เจ้าของร้านกด Save/Publish เอง (ระบบสิทธิ์ไม่ให้ Claude กด)

## 📝 แผนเดิม (อ้างอิง) — 3 workflow

### 1) `pricing-search` (1xXH53w1Yzt4ZkKQ) — webhook `/webhook/pricing-search`
บอท LINE + agent เรียกตัวนี้ → ให้เว็บตอบก่อน ไม่ได้ค่อยใช้สมองเดิม

1. เพิ่ม **Code node** ชื่อ `Site Price (iduckystore)` ต่อจาก Webhook → วางโค้ดจาก [`site-price.code.js`](site-price.code.js)
2. เพิ่ม **IF node** เงื่อนไข `{{ $json.useLegacy }}` is true
   - **true** → ต่อเข้า Code node เดิม (สมองราคา 50k) → Respond เดิม
   - **false** → ต่อเข้า Respond to Webhook (ตอบ `{{ $json }}` ทั้งก้อน — มี answer/result/response/text/kind/source/intent + product/products/links/images)
3. ทดสอบ: `POST /webhook/pricing-search {"query":"พวงกุญแจอะคริลิค 100 ชิ้น"}` → `source` ต้องขึ้นต้น `iduckystore:`

### 2) `ChatBot` (Q9wMWpZsnQfSkpIT) — AI Agent1
1. tool **`search_pricing`** (HTTP Request Tool): เปลี่ยน URL เป็น `https://iduckystore.com/api/pricing/search`
   body ตาม [`search_pricing-tool.snippet.json`](search_pricing-tool.snippet.json) (ส่ง `query` ทั้งประโยค + `qty`)
2. tool **`get_master_pricing`** (Firestore getAll ทั้ง collection `pricing`): **ปิด/ถอดออก** — เป็นตัวถ่วงเวลาหลัก และราคาไม่ตรงเว็บ
3. System Message: ต่อท้ายด้วยข้อความใน [`system-prompt-addendum.txt`](system-prompt-addendum.txt)
   (บังคับใช้ `product.url` ของเว็บเป็นลิงก์ · ห้ามโดเมนเก่า · ห้ามย่อขั้นบันได)
4. ถ้ามีโหนดท้าย (Fetch PO1 / PO Override1) ที่แปะลิงก์จาก Firestore `settings/price_links` → เปลี่ยนให้อ่าน `product.url`/`links[]` จากผล tool แทน

### 3) `LINE OA Bot - AI Phase A` (7v7dy4PvnVnGzlYg)
1. โหนด **`Build Price Flex`**: แทนโค้ดทั้งหมดด้วย [`build-price-flex-v8-site.js`](build-price-flex-v8-site.js)
   - hero = `product.image` (ภาพปกสินค้าบนเว็บ) · ปุ่ม = `product.url` · ถามกว้าง = carousel หลายสินค้า
   - ไม่ยิง `/webhook/pricing` เดิมอีก (Pricing Engine ตัวเก่า)
2. โหนด **`Match Price Images`** (จับรูปจาก Firestore price_links): **ปิด** — รูปมาจาก `product.image` แล้ว
3. ⚠️ ชุดสำเนา (ชื่อลงท้าย 1/2) ที่ปิดไว้ 76 โหนด ไม่ต้องแตะ แก้เฉพาะชุดที่ไม่มีเลขต่อท้าย

## 🔍 เช็คหลัง deploy เว็บ
```bash
curl -s "https://iduckystore.com/api/pricing/search?catalog=1" | head -c 400
curl -s -X POST https://iduckystore.com/api/pricing/search -H 'content-type: application/json' \
  -d '{"query":"สแตนดี้อะคริลิค 50 ชิ้น","noFallback":true}' | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['found'],d['product'])"
```
เว็บจริงต้อง deploy ก่อน AdminBuddy/n8n ถึงจะได้ `found/products/images` (ก่อนหน้านั้น AdminBuddy จะตกไปเส้นเดิมเอง)
ทดสอบ AdminBuddy กับ dev: `localStorage.setItem('site_price_api','http://localhost:3016/api/pricing/search')`
