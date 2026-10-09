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

## 🧠 23 ก.ย. 69 เย็น — ต้นตอ "บอทไม่เข้าใจคำถาม" และการแก้
บอทมี 2 สมอง: agent (มีความจำ) กับเครื่องคิดราคาบนเว็บ (ไม่มีความจำ) และ PO Override1 เอาคำตอบเครื่องคิดราคาทับ agent โดยเครื่องคิดราคาไม่รู้ว่าคุยเรื่องอะไรค้างอยู่ → แก้ที่ต้นตอ: ส่ง "ข้อความก่อนหน้าของลูกค้า" (context) เข้าเครื่องคิดราคาทุกทาง และให้เว็บมีชั้นเข้าใจคำถามด้วย LLM
- เว็บ: `understand(query, context)` (intent/สินค้า/จำนวน/standalone/notInCatalog) — commit 9f47f26, 83e885c, 5974118
- ChatBot: Fetch PO1 ส่ง `{query, context}` ([chatbot-fetch-po1.expression.txt](chatbot-fetch-po1.expression.txt)) · PO Override1 รับ intent `not_in_catalog`
- pricing-search: Site Price node ส่ง `context` ต่อ ([site-price.code.js](site-price.code.js))
- LINE OA: Site Price Flex v3 ส่ง context จาก Build AI Request.previousMessages + ถามเว็บทุกข้อความ + กรณี not_in_catalog ([site-price-flex.code.js](site-price-flex.code.js))

## 🚦 24 ก.ย. 69 — พิมพ์ 3 บรรทัดได้ 3 คำตอบ (LINE)
Debounce Buffer รอ 5 วิแล้วปล่อย "ตัวล่าสุด ณ ตอนนั้น" ไปคิดคำตอบ แต่ระหว่าง AI คิด 15-25 วิ ข้อความถัดไปกลายเป็นตัวล่าสุดใหม่ → ทุกตัวตอบ
- Debounce Buffer: ไม่ล้าง pendingMessages ตอน claim + ส่ง `idToken` ออกมาใน json
- โหนดใหม่ **Reply Gate** ([reply-gate.code.js](reply-gate.code.js)) ระหว่าง Site Price Flex → Reply to LINE: เช็ค lastEventId อีกครั้งก่อนส่ง ไม่ใช่ตัวล่าสุด = ทิ้ง (ตัวใหม่รวมข้อความตอบครั้งเดียว) · ใช่ = ล้าง pending แล้วส่ง

## 📚 24 ก.ย. 69 — "เก็บข้อมูลในเว็บลง n8n" (ความรู้จากเว็บ → Pinecone)
- เว็บ: `GET /api/pricing/search?knowledge=1&offset=0&limit=25` → ถาม-ตอบต่อสินค้า (รายละเอียด/ราคา/คละลาย/ขั้นต่ำ/ตัวเลือก+ราคาเพิ่ม/FAQ) รวม ~2,050 รายการ · วนหน้าจน `next` เป็น null
- workflow ใหม่ [website-knowledge-sync.workflow.json](website-knowledge-sync.workflow.json): Schedule 04:00 / Manual → Code ดึงทุกหน้า → Pinecone insert index `adminbuddy-index768-2` **namespace `website`** + clearNamespace (เขียนทับทั้ง namespace ทุกครั้ง ไม่มีของเก่าค้าง) — วางด้วย Import from File หรือ paste JSON บนผืนผ้าใบ แล้วเลือก credential ให้ Pinecone/Embeddings
- ChatBot: tool ใหม่ `website_knowledge` (Vector Store Tool → Pinecone retrieve namespace website + Embeddings Vertex + Gemini) ต่อเข้า AI Agent1 + กติกาใน system prompt "ใช้ website_knowledge ก่อน product_knowledge" — ต้องเลือก credential ให้ 3 โหนดที่วางใหม่ (Pinecone (website) / Embeddings (website) / Gemini (website tool))

## 🖼 25 ก.ย. 69 — บอทดูรูปแล้ว "รู้ว่าทำได้ไหม เป็นสินค้าตัวไหน" (LINE OA)
เดิม Analyze Image (Gemini) รู้จักสินค้าจากรายชื่อที่พิมพ์ตายตัวในพรอมป์ต + ห้ามปฏิเสธ → บอกได้แค่ประเภทกว้าง ๆ
- โหนดใหม่ **Load Catalog (vision)** (Encode Base64 → ตัวนี้ → Analyze): ดึงรายชื่อสินค้า 228 ตัวจากเว็บ (`?catalog=1` แคช 10 นาที) ใส่ `catalogNames`
- Analyze Image: เพิ่ม part "รายชื่อสินค้าที่ร้านทำได้จริง" + JSON เพิ่ม `productMatch` (ชื่อจากรายชื่อตรงตัว) และ `canMake` yes/maybe/no · อนุญาตให้บอก "ยังไม่มีสินค้าแบบนี้ + แนะนำใกล้เคียง"
- Format Image Reply: ส่ง `productGuess`, `canMake` ต่อ · Site Price Flex: ข้อความรูป → แนบการ์ดสินค้าที่ตรง (yes/maybe) จากเครื่องคิดราคาเว็บ · no = ข้อความอย่างเดียว

## 🙋 25 ก.ย. 69 — ลูกค้าขอคุยแอดมิน (LINE OA Bot)
- Build AI Request: `HANDOFF_RE` (ขอคุยแอดมิน/ติดต่อแอดมิน/คุยกับคนจริง/ไม่เอาบอท…) → mode `handoff` + presetReply "รับทราบค่ะ แอดมินจะเข้ามาตอบ…" + PATCH `line-conversations/{userId}.botPausedUntil = +60 นาที` (ใช้ idToken จาก Debounce) · ข้อความถัดไปของลูกค้าระหว่างพัก → `return []` (บอทเงียบ ไม่แทรกแอดมิน)
- โหนด IF **Handoff?** (mode == handoff) ระหว่าง Build AI Request → true: Format Reply ตรง (ไม่เรียก AI 15 วิ) / false: Is Image? ตามเดิม
- Check Escalation: mode handoff → escalateReason `customer_requested_admin` → Leader Inbox + กลุ่มแอดมิน + Customer Task
- แอดมินสั่งเอง: หน้า /admin/line-customers ปุ่ม ⏸ พัก 1 ชม. / ▶ ปลุก (API manage action `pause` {minutes}) เขียน `botPausedUntil` ฟิลด์เดียวกัน · แชทเว็บ: เคสขอคุยแอดมิน/เคลม/ติดตามออเดอร์ → เขียน `leader-tasks` (source web) + ลิงก์ไลน์

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

## 29 ก.ย. 69 — ตอบครบทุกเรื่องในข้อความเดียว (deploy 8018d18)
- LINE รวมหลายข้อความด้วย `" / "` (Debounce Buffer: `allPending.map(p => p.text).join(' / ')`) → "อยากได้ที่ติดรถยนต์ค่ะ / ร้านมีแบบไหนบ้างคะ / เอาแบบกันฝนค่ะ" เคยได้แต่ตารางราคา
- เว็บ `/api/pricing/search`: หลังได้คำตอบราคา/ตัวเลือกของสินค้าตัวเดียว ถ้าข้อความมีเรื่องคุณสมบัติ (EXTRA_TOPICS: กันน้ำ/กันฝน/ทนแดด/ทนทาน/สะท้อนแสง/ติดแน่น/ความหนา/กี่วัน/ลายเอง/ส่วนเสริม/วัสดุ) หรือมีหลายท่อน → `extraInfo()` ถามหน้าสินค้าอีกรอบ (Gemini flash-lite, prompt โหมด extra) แล้วแปะไว้ **หัว** คำตอบ · ฟิลด์ `extra` ในผลลัพธ์
- ด่านกันตอบเรื่องอื่นแทน: หัวข้อที่รู้จักต้องมีคำของหัวข้อนั้นในคำตอบ (ถาม "ทนแดด" ห้ามได้เรื่องกันน้ำ) หัวข้ออื่นต้องมีคำร่วมกับท่อนที่ถาม ≥4 ตัวอักษร
- `pageText()` เพิ่ม `[แบบ/วัสดุที่มีให้เลือก]` = label + desc ของแต่ละเรท → ตอบ "แบบไหนกันน้ำ" แยกตามวัสดุได้
- LLM ตีเป็น `other` ทั้งที่มีสินค้า+จำนวน/คำว่าราคา → คิดราคาตามปกติ · ถามส่วนเสริมพร้อมจำนวน ("โฟโต้การ์ด 100 ใบ เคลือบฟอยล์เพิ่มเท่าไหร่") = ตารางราคา + บรรทัดส่วนเสริม (เดิม `!qty` เช็คแค่ที่ parse จากข้อความ ไม่ดู `u.qty`)
- n8n ไม่ต้องแก้: Site Price Flex ใช้ `site.answer` ตรง ๆ อยู่แล้ว

## 29 ก.ย. 69 (บ่าย) — คำถามต่อเนื่องไม่เอ่ยชื่อสินค้า (deploy 24eb824 + ร่าง n8n 2 โหนด)
- เคส: "รับทำผ้าห่มฮูดดี้ใช่มั้ยคะ" → "มีกระดุมแปะด้วยไหมคะ" → เว็บเลือก GRIPTOK MIRROR (LLM หยิบมั่ว) + agent ตอบ "ขอเช็กรายละเอียด" + การ์ดผิดตัว
- เว็บ `understand()`: ⚓ คำถามที่ไม่เอ่ยชื่อสินค้า → สินค้าต้องมาจากข้อความล่าสุดในบทสนทนาที่พูดถึงสินค้า (ไล่จากท้าย · นับคำในชื่อที่ตรง · ชื่อเต็มโผล่ = ชนะ) ไม่ใช่ที่ LLM เลือก · `fixTypos` ฮูดดี้ → hoodie · `understood.debug` {qMentions, anchor, trace}
- n8n (ร่าง รอ Save+Publish): **Site Price Flex** branch 1.5 รับ `spec|spec_menu` ใช้ข้อความเว็บ+การ์ด "ดูรายละเอียด/สั่งบนเว็บ" · **ChatBot PO Override1** regex + `spec|spec_menu` — เพราะคำตอบ spec ของเว็บมี kind "info" intent "spec" ไม่เข้าเงื่อนไขเดิม

## 1 ต.ค. 69 — ข้อ 1 ของแผน "ฉลาดเหมือน Claude/ChatGPT": บอทเห็นบทสนทนาทั้งสองฝั่งของรอบนี้
- เว็บ `/api/pricing/search` รับ `history: [{role:'user'|'assistant', text, at}]` → `understand()` แสดงเป็นบรรทัด ลูกค้า:/แอดมิน: และ `currentSession()` ตัดข้อความก่อนช่องว่าง >6 ชม. (ข้อความล่าสุดเก่ากว่า 6 ชม. = เริ่มใหม่หมด) · ด่านยึดสินค้าใช้ทั้งสองฝั่ง (เมนูที่บอทเสนอ = รายการ) · อ้างลำดับ "แบบที่ 2/ตัวแรก/อันสุดท้าย" หยิบจากรายการล่าสุดของบอทแบบตายตัว · ไม่มีสินค้าทั้งในคำถามและบทสนทนา = ห้าม LLM เดา
- n8n (ร่าง 3 โหนด รอ Save+Publish): LINE **Build AI Request** ตัดรอบสนทนา 6 ชม. ([snippet](build-ai-request.session-cut.snippet.js)) · LINE **Site Price Flex** ส่ง `history` จาก previousMessages ([site-price-flex.code.js](site-price-flex.code.js)) · ChatBot **Fetch PO1** ส่ง `history` จาก conversationHistory ทั้งสองฝั่ง ([expression](chatbot-fetch-po1.expression.txt))
- ยังไม่ทำ (ข้อ 2–3 ของแผน): โปรไฟล์/ความจำต่อลูกค้า · ยกชั้นเข้าใจคำถามเป็นโมเดลใหญ่ขึ้น

## 1 ต.ค. 69 — ข้อ 2: ความจำต่อลูกค้า (customer profile)
- เว็บ `POST /api/bot/customer-profile {userId}` (สิทธิ์ Bearer Firebase ID token ของบัญชีบอท หรือ x-cron-secret) → `src/lib/server/customer-profile.ts` รวม: ออเดอร์ที่ผูก lineUserId/customerId (3 ใบล่าสุด + ใบที่ยังไม่จบ) · ระดับสมาชิก/ตัวแทนจากการ์ดผู้ติดต่อ · สรุปแชท ≤60 ข้อความด้วย flash-lite (แคชใน line-conversations.profile · สรุปใหม่เมื่อเกิน 24 ชม. หรือมีข้อความใหม่ ≥6 · แชท <4 ข้อความไม่สรุป) → `text` ≤900 ตัวอักษร
- `/api/pricing/search` รับ `profile` (ข้อความ) → understand() ใส่หัวพรอมป์ต + ใช้เป็นข้อความยึดสินค้าอันดับแรก ("สั่งซ้ำแบบเดิม 50 ชิ้น" → สินค้าในออเดอร์เก่า)
- n8n (ร่าง): LINE **Build AI Request** เรียก API ด้วย idToken ([snippet](build-ai-request.customer-profile.snippet.js)) แปะหัว conversationHistory + output `customerProfile` · **Site Price Flex** ส่ง `profile` · ChatBot **Fetch PO1** ตัดบล็อก "== ข้อมูลลูกค้าคนนี้ ==" ออกจาก history แล้วส่งเป็น `profile`

## 1 ต.ค. 69 — ข้อ 3: ชั้นเข้าใจคำถามใช้ gemini-2.5-flash
- `understand()` เรียก gemini-2.5-flash (thinkingBudget 0) ก่อน ล้มเหลว/ช้าเกิน 9 วิ → flash-lite · env `UNDERSTAND_MODEL` เปลี่ยนได้ · ทดสอบเทียบด้วย body `understandModel`
- ผลวัด 20 เคส (dev): pro 17/20 เฉลี่ย 4.1 วิ · flash 18/20 เฉลี่ย 2.2 วิ · flash-lite 18/20 เฉลี่ย 1.8 วิ — เลือก flash เพราะตอนพลาด "ตอบไม่รู้" (ให้ agent ตอบ) ส่วน lite "หยิบสินค้ามั่ว" (ที่ติดรถยนต์ → สติ๊กเกอร์รูปทรง · "ราคาเท่าไหร่" → พวงกุญแจ)
- แถม: LLM ไม่ใส่ products ทั้งที่คำถามเอ่ยชื่อชัด ("สแตนดี้ไม้ มีไหม") → ใช้ชื่อที่ตรงแรง (≥60% ของชื่อ) · 🐛 fixTypos "สแตนดี" ชนะก่อน "สแตนดี้" → ได้ "สแตนดี้้" (วรรณยุกต์ซ้อน) ตั้งแต่ 28 ก.ย. — แก้เรียงตัวยาวก่อน
- ⚠️ 1 ต.ค. 69 (ทดสอบรอบ 3): เส้นทาง ChatBot → Fetch PO1 → **pricing-search** (1xXH53w1Yzt4ZkKQ) → เว็บ: โหนด Site Price (iduckystore) ส่งแค่ query+context ไม่ส่ง history/profile → "แบบที่ 2" ผ่าน ChatBot ตอบตัวแรก (ทดสอบตรงที่เว็บผ่าน) → เพิ่ม history/profile ใน body ([site-price.code.js](site-price.code.js)) ร่างรอ Publish

## 1 ต.ค. 69 — ตอบไวขึ้น (site-first ทั้ง LINE และแชทเว็บ)
- **แชทเว็บ** `/api/chat`: แกน `/api/pricing/search` ย้ายเป็น `src/lib/server/price-search.ts` (`priceSearch(body)`) → แชทเว็บเรียกตรง (ไม่ยิง HTTP) ควบคู่กับชั้นวิเคราะห์เดิม (Promise.all) · เว็บตอบได้ (price/spec/info/mix/not_in_catalog/draft_product) = ตอบเลยไม่เรียบเรียงซ้ำ ไม่ไป n8n → คำถามสินค้า 2-3 วิ (เดิม 11-20 วิ) · คำถามความรู้ (ส่งกี่วัน/ไฟล์) ยังไป agent ~20 วิ
- **LINE** ร่าง 4 จุด ([line-site-first.snippets.md](line-site-first.snippets.md)): Debounce 5→3 วิ · Build AI Request ถามเว็บก่อน (mode `site` + presetReply + siteResult) · Handoff? regex `^(handoff|site)$` · Site Price Flex ใช้ siteResult ซ้ำ → คาดว่า 15-35 วิ → ~6-8 วิ สำหรับคำถามสินค้า
- 1 ต.ค. 69 (เย็น) เจ้าของร้าน: "chat.html (agent) ตอบ 'แม่เหล็กติดตู้เย็น มีแบบไหนบ้าง' ถูกกว่า LINE (เว็บ)" — เว็บเคยตอบตารางราคาสินค้าตัวเดียว · แก้: understand() กฎ "มีแบบไหนบ้าง/มีกี่แบบ กับชื่อกลุ่ม → ทุกสินค้าในกลุ่ม broad=true" + `menu()` เป็น async เล่าต่อแบบ (ราคา/หน่วย · คำอธิบาย ≤80 · แบบย่อย=เรท · ลิงก์) · กลุ่มใหญ่เรียงตามความใกล้ชื่อที่ถาม เอา 4 · chat.html ตอนนี้ถามเว็บก่อนทุกคำถามสินค้า (ตรงกับ LINE) — คำตอบสองช่องทางจึงเหมือนกันและมีรายละเอียดเท่า agent

## 1 ต.ค. 69 — บอท LINE ตอบซ้ำ (ร่าง 2 โหนดใน LINE OA Bot)
- หลักฐาน: execution 840881/840894 = LINE event เดียวกัน (webhookEventId 01M3VB2Q… `deliveryContext.isRedelivery: true` ทั้งคู่) ถูกส่งซ้ำห่างกัน 1 นาที · ทั้งสองรอบ Debounce Buffer ข้าม (debounceError "auth: 400" = สมัคร Firebase anonymous ทุกข้อความโดนโควตา) → Reply Gate ไม่ทำงาน → รอบแรก reply รอบสองใช้ Push (Fallback) → ลูกค้าเห็น 2 ชุด
- แก้ **Parse LINE Event**: จำ webhookEventId ใน `$getWorkflowStaticData('global').seenEvents` 2 ชม. เห็นแล้ว = ทิ้ง (กันซ้ำโดยไม่พึ่ง Firebase)
- แก้ **Debounce Buffer**: แคช idToken ใน static data 50 นาที (fbIdToken/fbIdTokenAt) · สมัครไม่ได้ให้ใช้ token เก่าที่อายุ < 55 นาทีก่อนจะข้าม debounce

## 3 ต.ค. 69 — บอทตอบลูกค้านอกรายชื่ออนุญาต (fail-open) → ปิดประตูไว้ก่อน
- วันนี้บอทตอบลูกค้านอก whitelist 5 คน (09:48–12:36) · 14 วันก่อนหน้า 0 · ทุกครั้งตรงกับ **Read Whitelist (HTTP · googleApi service account) timeout** ("The connection timed out") ~5% ของรัน (4/85 ช่วง 12:15–12:40) และรอ timeout นานจนบอทตอบช้า ~3 นาที
- ต้นตอ: Parse LINE Event เริ่มที่ `whitelistEnabled = false` แล้วค่อยอ่านจาก Firestore → อ่านไม่ได้ = "ไม่ได้เปิดโหมดรายชื่อ" = ตอบทุกคน
- แก้ (ร่าง 3 ต.ค.): Parse LINE Event อ่านสำเร็จ = จำ `lastWhitelist` ใน static data · อ่านไม่ได้ = ใช้ตัวที่จำไว้ · ไม่มีเลย = whitelistEnabled true + รายชื่อว่าง (เงียบกับทุกคน) · Read Whitelist `options.timeout` 6000 ms + retryOnFail 2 ครั้ง ห่าง 1 วิ · ทดสอบ logic 3 กรณีผ่าน

## 3 ต.ค. 69 — คำถามขั้นต่ำตอบ "ขอเช็ก" (intent min_qty ไม่ผ่าน)
- เว็บตอบขั้นต่ำถูก (`intent: "min_qty"`, kind info) แต่ทุกด่านกรองไว้แค่ price/spec/info/mix → agent ตอบ "ขอเช็กรายละเอียด" แทน
- แก้: เว็บ `chat-answer.ts` siteVia + min_qty (deploy 044dbf6) · n8n ร่าง: LINE Build AI Request (site-first regex) + Site Price Flex (branch 1.5) + ChatBot PO Override1 เพิ่ม `min_qty`

## 3 ต.ค. 69 (บ่าย) — บอทไม่ตอบคำถามคำนวณราคา (ข้อความหลายชิ้นติดกัน)
- เคส 14:37: ลูกค้าพิมพ์คำถามยาว (พวงกุญแจอะคริลิคใส 9 แบบ 7×20 + 2×10 ราคา/ห่วง/กี่วัน) + ลิงก์ Drive 3 อัน + ไฟล์ zip 2 + "ตัวอย่างก็ประมาณนี้ค่ะ"
- รอบที่มีคำถามครบ (ลิงก์ 1-2) AI คิด 31-36 วิ แล้วถูก Reply Gate ทิ้งเพราะมีข้อความใหม่กว่า · รอบใหม่กว่าเห็นแค่ข้อความตัวเอง เพราะ **Debounce เก็บ pending แค่ 30 วิ** ข้อความเก่าหลุดหน้าต่างไปแล้ว → คำถามหลักไม่ถูกตอบเลย
- ลิงก์ 3 ค้างที่ **Read Price Links 133 วิ** (ไม่มี timeout) ก่อนเริ่มทำงาน · เว็บตีความลิงก์ Drive ล้วนเป็นคำถาม info
- "ตัวอย่างก็ประมาณนี้ค่ะ" ถูกตอบ 2 ครั้ง: LINE ส่งซ้ำ (isRedelivery, webhookEventId/messageId เดิม) · ตัวกันซ้ำใน Parse LINE Event ใช้ static data ซึ่งหลายรอบที่ทำงานพร้อมกันเขียนทับกัน → กันไม่ได้
- แก้ (ร่าง): Debounce pending 30 วิ → 10 นาที · กันซ้ำด้วย `recentMessageIds` (30 ตัวล่าสุด) ในห้องแชท Firestore ตอน Debounce · Read Price Links / Read Quick Setup / Read Memory timeout 6 วิ + retry 2 · Build AI Request ไม่ถามเว็บเมื่อข้อความมีแต่ลิงก์

## 8 ต.ค. 69 — AI Agent ของ ChatBot เปลี่ยนเป็น Claude Sonnet 5.5
- เทียบ 10 โมเดล (คำถามจริง 9 ข้อ + แต่งเพิ่ม 3 ข้อ, tool เดียวกัน): Sonnet 5.5 = 23/24 · Gemini 3.8 Flash 20 · Gemini 3.5 Flash-Lite 18 · Haiku 5.5 16–18 · Gemini 2.5 Flash (เดิม) 10 — ตัวเดิมมักไม่เรียก tool แล้วแต่งข้อมูลเอง
- ChatBot (Q9wMWpZsnQfSkpIT): โหนดใหม่ "Claude Sonnet 5.5" (lmChatAnthropic v1.5, model id `claude-sonnet-5-5`, credential "Anthropic account", thinkingMode **adaptive** effort low, maxTokens 8192) ต่อเข้า AI Agent1 — ⚠️ ห้ามปล่อย thinkingMode เป็น disabled (Sonnet 5.5 ตอบ 400) · โหนด "Google Gemini Chat Model" เดิมยังอยู่แต่ถอดสาย (rollback = ต่อสายกลับ)
- โหนด website_knowledge / Vector Store Tool1 ยังใช้ Gemini เหมือนเดิม
- PO Override1: (1) ทับด้วยข้อความ need-size ของ Fetch PO1 เฉพาะเมื่อถามราคา (`isPriceQ`) — เคยทับคำถามระยะเวลาผลิตด้วย "แผ่นอะคริลิค คิดราคาตามขนาด" (2) เอา `info` ออกจาก regex ที่ทับคำตอบ agent ด้วยข้อความเว็บ (ยังทับ not_in_catalog/draft_product/mix/spec/spec_menu/min_qty/price/price-options)
- ค่าใช้จ่ายโดยประมาณ ~฿1.2/ข้อความที่ผ่าน AI Agent (เปิด prompt caching จะเหลือ ~฿0.4–0.5) · ความช้าหลักอยู่ที่ search_pricing1 (5–13 วิ) ไม่ใช่โมเดล

## 8 ต.ค. 69 — บอทไม่รู้ = ส่งต่อแอดมิน (ไม่ตอบเองแบบแข็ง ๆ)
- ต้นเรื่อง: LINE "พวงกุญแจอะคริลิค 100 ชิ้น ใช้เวลาผลิตกี่วัน ทันวันที่ 20 ไหม" → ได้ "แอดมินร้าน iDucky ค่ะ … ข้อมูลจากหน้าสินค้าไม่ได้ระบุระยะเวลาผลิต…" (คำตอบ info ของเว็บ ทับด้วย Site Price Flex ข้อ 1.5)
- เว็บ (c150cfa): infoText ทิ้งคำตอบที่เข้า `NO_INFO_RE` (ไม่ได้ระบุ/ไม่มีข้อมูล/ไม่ทราบ…) — หลายเรื่องตัดเฉพาะบรรทัด · ตัดคำเกริ่น "แอดมินร้าน iDucky ค่ะ"
- LINE Format Reply: ถามคิวผลิต/ทันไหม หรือคำตอบเป็น "ไม่รู้/ขอเช็ก" (ไม่ใช่ preset ของเว็บ) → ข้อความส่งต่อนุ่ม ๆ "…เดี๋ยวแอดมินเข้ามาตอบในแชทนี้เลยนะคะ" (นอกเวลา จ.–ศ. 9–18 บอกเวลาทำการ) + `handoff:true` + needsHumanFollowup · ถามราคา+คิวในข้อความเดียว = ตอบราคา + ต่อท้าย "ส่วนเรื่องคิวผลิต/วันส่ง แอดมินจะเช็กคิวจริง…"
- LINE Site Price Flex: `if (j.handoff)` ส่งข้อความส่งต่ออย่างเดียว (ไม่เอาข้อความเว็บมาทับ) · การ์ดราคาพาบรรทัดคิวผลิตไปด้วย

## 8 ต.ค. 69 — บอทอ่านรูปไม่ได้มาตลอด + "รับทำงานแบบนี้ไหม" หลังส่งรูป ตอบ "รับผลิตค่ะ" ทั้งที่ร้านไม่มี
- ต้นเรื่อง: ลูกค้าส่งรูปโฆษณา "STANDY ป้ายสแตนดี้ PP Board 4 mm" (ร้านไม่มี) แล้วพิมพ์ "รับทำงานแบบนี้ไหมคะ" → บอทตอบ "รับผลิตค่ะ ส่งไฟล์ .Ai .Psd .Png…"
- สาเหตุ 1: **Analyze Image (Gemini) ล้มทุกครั้ง** (0/120 รอบ) — JSON Body เป็น expression ยาว (prompt 3.2k + base64 ~2 MB) n8n แปลงกลับเป็น JSON ไม่ผ่าน "The value in the JSON Body field is not valid JSON" → Format Image Reply ใช้ค่า canned "ได้รับรูปแล้วค่ะ" · canMake/productGuess ว่าง · บอทไม่เคยเห็นรูป
  - แก้: **Load Catalog (vision)** ประกอบ `visionBody` (object: prompt + รายชื่อสินค้า 228 + บริบทแชท + inlineData) · **Analyze Image** jsonBody = `={{ $json.visionBody }}` (object ไม่ต้อง parse) · prompt เดิมย้ายไปอยู่ในโค้ด (สำเนา: `analyze-image.prompt.txt`)
  - ทดสอบตรงกับ Gemini ด้วย body แบบเดียวกัน: รูปสแตนดี้อะคริลิคจากเว็บ → productSample/yes/"สแตนดี้อะคริลิค" 2.6 วิ
- สาเหตุ 2: ข้อความถัดมา 4 วิ "รับทำงานแบบนี้ไหมคะ" ถูกส่งไปถามเว็บ (Build AI Request ข้ามเว็บเฉพาะข้อความที่เป็นรูปเอง) → เว็บโยง "แบบนี้" ไปพวงกุญแจอะคริลิคที่คุยค้าง → infoText "รับผลิตค่ะ" → mode=site
  - แก้ Build AI Request: ข้อความเข้า IMG_REF_RE (แบบนี้/งานนี้/ตามรูป/ในภาพ/ลายนี้…) + มีรูปใน 20 นาที (hasImageInBatch / memory.lastImageAt / โน้ต "[ลูกค้าส่งรูปภาพ: …]" ในประวัติ) → ไม่ถามเว็บ (`imageRef:true`) · มีผลวิเคราะห์รูป = ส่ง agent พร้อม "[คำแนะนำระบบ: ผลวิเคราะห์รูป = … ถ้าร้านไม่มีให้บอกตรง ๆ ห้ามตอบว่ารับทำถ้าไม่แน่ใจ]" · ไม่มี = handoff "ได้รับรูปแล้วค่ะ 🙏 เดี๋ยวแอดมินดูรูปแล้วตอบกลับ…" + needsHumanFollowup
  - Site Price Flex: `if (j.handoff || imageRef)` ไม่ถามเว็บซ้ำ/ไม่เอาข้อความเว็บมาทับ
  - Save Image Note: โน้ตรูปเก็บ `· ร้านทำได้: yes/maybe/no (productGuess)` ด้วย ให้ข้อความถัดไปใช้ต่อได้
  - เว็บ (price-search): `IMG_REF_RE` + รอบล่าสุดของลูกค้าในประวัติเป็น "[ลูกค้าส่งรูปภาพ" (≤30 นาที) → skip `refers-to-image`
- สาเหตุ 3 (เจอตอนทดสอบ prompt กับภาพจำลองป้าย PP Board): Gemini จับคู่ "ป้ายขาตั้ง X-Stand" ว่าคล้าย → canMake yes + "รับผลิตเลยค่ะ" — กฎเดิม "คล้าย = maybe" หลวม
  - แก้ prompt (ใน Load Catalog (vision) + สำเนา analyze-image.prompt.txt): yes เฉพาะ ชนิด+วัสดุ+ขนาด ตรงรายชื่อ · โฆษณา/แคตตาล็อกร้านอื่นที่ระบุวัสดุไม่ตรง (PP Board/ฟิวเจอร์บอร์ด/โรลอัพ/ไวนิล/กล่องเหล็ก/ผ้าฝ้าย/สมุดทำมือ/ชานอ้อย) ห้าม yes · ตัวอย่าง "ป้ายสแตนดี้ PP Board ตั้งพื้น ≠ สแตนดี้อะคริลิค ≠ X-Stand → maybe" · maybe ตอบ "ร้านยังไม่มีตรง ๆ ค่ะ ที่ใกล้เคียงคือ … เดี๋ยวแอดมินเช็กให้"
  - Format Image Reply: ด่านในโค้ด — canMake ≠ yes แต่ shortReply มี "รับผลิต/รับทำ/ทำได้เลย" → แทนด้วยประโยคกลาง ๆ + แอดมินเช็ก
  - ทดสอบ 2 รอบ: ภาพจำลอง PP Board → maybe 2/2 · สแตนดี้อะคริลิค/กริ๊บต๊อกจากเว็บ → yes 4/4 (~3 วิ) · สคริปต์: scratchpad mt/vision-test.mjs (ชั่วคราว)
- ทดสอบจริง 13:43: รูป → "ป้ายสแตนดี้ PP Board ทางร้านยังไม่มีตรง ๆ ค่ะ" ✅ (Analyze สำเร็จครั้งแรก 3.2 วิ, canMake=no, guess=สแตนดี้อะคริลิค) แต่ข้อความ "รับทำงานแบบนี้ไหมคะ" ที่ตามมา **5 วิ** ยังไป mode=site + การ์ดพวงกุญแจ — Read Memory ของรอบข้อความอ่านไปก่อน Save Image Note (วิเคราะห์รูป ~10 วิ) → ไม่มีหลักฐานว่ามีรูป
  - แก้ race: **Process Image** PATCH `lastImageAt` ลง line-conversations ทันทีตอนรับรูป (token anonymous เดียวกับ Debounce, cache ใน static `fbIdToken`) · **Build AI Request** ถ้าข้อความอ้างรูปแต่ไม่มีโน้ต → GET ห้องแชทสด (idToken จาก Debounce) แล้วถ้า lastImageAt < 90 วิ รอโน้ตรูปทีละ 2 วิ สูงสุด ~10 วิ → ได้โน้ต = agent+hint / ไม่ได้ = handoff · ข้อความที่ไม่อ้างรูปไม่มีดีเลย์
  - Site Price Flex (image branch): canMake=no ก็แนบการ์ด "สินค้าใกล้เคียง" ของ productGuess (ข้อความบอกว่าใกล้เคียงคือ X แต่เดิมไม่มีการ์ด)
  - เว็บ: `refers-to-unseen` — IMG_REF + รับทำ/ทำได้ไหม/มีไหม + ไม่เอ่ยชื่อสินค้าเลย (debug.qMentions ว่าง) + ไม่มีจำนวน → skip (กันกรณีโน้ตรูปยังไม่ถูกบันทึก) · "ตัวนี้เอา 100 ชิ้น"/"ถ้า 200 ชิ้นล่ะ" ยังคิดต่อบริบทได้
- ทดสอบจริง 14:02 (หลัง publish รอบ 2): รูป ✅ + การ์ดสแตนดี้ ✅ · ข้อความตามหลัง 4 วิ ยังหลุด → agent ตอบ "ได้ค่ะ รับทำงานตามแบบ…" + ลิสต์สินค้ามั่ว + การ์ด — ขุดต่อพบ 3 ต้นตอ:
  1. **Save Image Note พังมาตลอด**: jsonBody เรียก `$('Format Reply').first()?.json` ซึ่ง *โยน error* เมื่อโหนดนั้นไม่ได้รัน (รอบรูป) → expression ล้ม → โน้ตรูป "[ลูกค้าส่งรูปภาพ: …]" ไม่เคยถูกบันทึก (ห้องแชทไม่มีโน้ตรูปเลย) · แก้: try/catch เลือก Format Image Reply ก่อน (Save Memory ก็กันแบบเดียวกัน)
  2. Process Image เขียน lastImageAt ล้มเงียบ (41-59 ms) — `$getWorkflowStaticData` ใน Code node ต้องครอบ try/catch แบบ Debounce · แก้ + เก็บ `imageMarkError` ไว้ใน json ดูได้ · ทดสอบ anonymous token PATCH/GET line-conversations จากเครื่อง = 200 (สิทธิ์ผ่าน)
  3. Save Memory (รอบข้อความ) มี updateMask lastImageAt แต่ค่ามาจาก Read Memory เก่า → ลบ lastImageAt ทิ้ง · แก้: ใส่ mask นี้เฉพาะรอบรูป · Build AI Request ใช้ประวัติสด (liveHistory) เป็น previousMessages เมื่ออ่านสดแล้ว กัน Save Memory เขียนทับโน้ตรูปด้วยสำเนาเก่า
  - ChatBot AI Agent1: กฎ "อ้างถึงสิ่งที่มองไม่เห็น" — แบบนี้/งานนี้/ตามรูป โดยไม่มีชื่อสินค้าและไม่มีผลวิเคราะห์รูป → ห้ามตอบรับทำ/ลิสต์สินค้า ให้ขอรูป/ชื่อสินค้า หรือแอดมินเช็ก
- ทดสอบจริง 14:11 (หลัง publish รอบ 3): รูป X-Stand ✅ + โน้ตรูป/lastImageAt บันทึกได้แล้ว · ข้อความ "รับทำไหม" (ไม่มีคำอ้างถึงรูป) 2 วิหลังรูป → ยังหลุด 2 ชั้น:
  1. Build AI Request จับเฉพาะ IMG_REF_RE → เพิ่ม **Part B**: คำถามสั้น ≤60 ตัว ไม่ระบุสินค้า (เว็บบอก `understood.debug.qMentions` ว่าง) ภายใน 2 นาทีหลังรูป = ถามถึงของในรูป (ยกเว้นทักทาย/ขอบคุณ/ออเดอร์/สลิป และโน้ตรูปที่เป็นสลิป/แคปหน้าจอ) · logic รูปรวมเป็น `waitForImageNote()` + `applyImageFollowup()`
  2. **PO Override1 (ChatBot)** เอาคำตอบสำรองเว็บ (`qa-brain`/`qa-brain-fb` ลิสต์สินค้าทั่วไป) ทับคำตอบ Claude ที่ถูกต้อง ("ขอดูรูป/บอกชื่อสินค้าก่อน") → ทับได้เฉพาะ `agentBail` (agent ตอบ ขอเช็ก/ไม่มีข้อมูล จริง ๆ และไม่ใช่การขอรายละเอียดเพิ่ม)
  - Format Reply `_unknown` เพิ่ม ขอดูรูป/ส่งรูปอีกครั้ง/รบกวนบอกชื่อสินค้า → needsHumanFollowup
- ทดสอบจริง 14:25 (รูป + "ที่ร้านทำได้ไหม" ติดกัน): ทุกชั้นทำงาน — ข้อความถูกโยงกับรูป Claude ตอบสอดคล้อง — แต่ลูกค้าได้คำตอบเดิม **ซ้ำ 2 ฟอง** (คำตอบรูปตอบ "ทำได้ไหม" ไปแล้ว)
  - แก้: `applyImageFollowup` ถ้าข้อความเป็นคำถาม ทำได้ไหม/รับทำไหม/มีไหม ล้วน ๆ (ไม่มี ราคา/ขนาด/จำนวน/ตัวเลข, ≤40 ตัว) และโน้ตรูปมี "ร้านทำได้:" บันทึก < 2 นาที → `mode='skip'` + `skipReply:true` → Handoff? (regex เพิ่ม skip) → Format Reply คืน replyText '' skipReply → Site Price Flex ข้าม → **Reply Gate return []** (ไม่ส่ง LINE, ไม่ Save Memory, ไม่ escalate) · ถามราคา/ขนาด/จำนวนหลังรูปยังตอบตามปกติ
- ทดสอบจริง 14:34 (รูป + "งานแบบนี้คืองานอะไร ต้องสั่งแบบไหน"): ยังได้ 2 ฟอง (ไม่ใช่คำถามทำได้ไหมล้วน กฎเงียบไม่ติด) → เปลี่ยนแนว: **รูป+ข้อความติดกัน = คำตอบเดียวจากรอบข้อความ**
  - **Reply Gate (รอบรูป)**: ก่อนส่ง GET ห้องแชท ถ้ามี `pendingMessages` ของลูกค้าภายใน 25 วิ ที่ดูเหมือนถามถึงรูป (IMG_REF หรือสั้น ≤60 ไม่มีตัวเลข ไม่ใช่ขอบคุณ/โอเค) → **ไม่ส่งคำตอบรูป** (return []) · บันทึก `imageReplyMode` sent/skipped + `imageReplyAt` (token: static fbIdToken / signUp)
  - **Build AI Request (รอบข้อความ)**: หลังได้โน้ตรูป รอจนรอบรูปตัดสินใจ (imageReplyAt ≥ โน้ต, รอเพิ่ม ≤10 วิ) → `imageCombined` = skipped: hint ให้ตอบครบ (งานอะไร · ทำได้ไหม · ตอบคำถาม) + `imageGuess/imageCanMake` ออกไปให้ Site Price Flex แนบการ์ด + forceEscalate เมื่อ canMake ≠ yes (รอบรูปที่เงียบไม่ได้แจ้งแอดมิน) · = sent: hint ตอบเฉพาะส่วนเพิ่ม (ใส่คำตอบรูปที่ส่งไปแล้วให้ดู) · feasOnly skip ใช้เฉพาะกรณี sent
  - Site Price Flex: imageRef + imageCombined + imageGuess → การ์ด "สินค้าที่ตรงกับรูป/ใกล้เคียง" · Format Reply: ด่าน `_unknown` ไม่ใช้กับ imageRef
  - ข้อจำกัด: ข้อความที่ตามรูปเกิน ~15 วิ จะได้ 2 ฟอง (รูปตอบไปแล้ว ข้อความตอบเฉพาะส่วนเพิ่ม) · ประวัติจะมี "ร่างคำตอบรูปที่ไม่ได้ส่ง" ค้างใน messages (Save Image Note บันทึกก่อน gate)

## 8 ต.ค. 69 14:43 — รูป + ข้อความตามมา 2 วิ: ข้อความถูกกลืน + รอบรูปตอบเอง "อวยเกิน" (exec 885308 / 885311)
- อาการ: ลูกค้าส่งรูปการ์ดโฮโลแกรม Spider-Man แล้วพิมพ์ "หวัดดีครับ งานแบบนี้คืองานอะไร ต้องสั่งแบบไหนเหรอครับ" ห่าง 2 วิ → ได้ฟองเดียวจากรอบรูป "รูปนี้คือลาย Spider-Man เท่มากๆ … จะนำไปทำเป็นโฟโต้การ์ด PVC ใช่ไหมคะ" ไม่ตอบคำถาม ส่วนรอบข้อความ (885311) Debounce คืน 0 item เงียบไปเลย
- ต้นตอ (ไม่ใช่ prompt อย่างเดียว): **Save Image Note** (เพิ่งแก้ให้เขียนได้วันนี้ — ก่อนหน้า throw ตลอด) PATCH `pendingMessages: []` + `lastEventId: ''` ตอน 37.47 วิ ซึ่งอยู่ *ก่อน* Reply Gate (42.09) → (1) Debounce ของรอบข้อความ (เขียน claim 34.84 รอ 3 วิ เช็ก 38.85) เห็น lastEventId ว่าง ≠ ตัวเอง → `return []` (2) Reply Gate รอบรูปอ่าน pendingMessages ว่าง → ไม่รู้ว่ามีข้อความตามมา → ส่งคำตอบรูปตามปกติ · **Save Memory** ก็ล้าง lastEventId เหมือนกัน (บั๊กเดิม: ข้อความที่เข้ามาระหว่างบอทกำลังบันทึก 1-2 วิ ถูกกลืนได้ทุกรอบ ไม่เฉพาะรูป)
- แก้ (draft LINE OA Bot รอ publish):
  - Save Image Note: ตัด pendingMessages/lastEventId ออกจาก updateMask + body
  - Save Memory: ตัด lastEventId ออกถาวร · pendingMessages ล้างเฉพาะรอบข้อความ (`isImage ? '' : '&updateMask.fieldPaths=pendingMessages'`) — Reply Gate ล้างตอนส่งจริงอยู่แล้ว
  - Load Catalog (vision) prompt (สำเนา `analyze-image.prompt.txt`): productSample = ของที่ผลิตเสร็จแล้ว (เห็นขอบตัด/วัสดุ/เงาโฮโลแกรม/ถือในมือ) แม้มีลายการ์ตูน · ห้ามชม/อวยรูป (เท่มาก สวยมาก น่ารักมาก) · ถ้าข้อความล่าสุดเป็นคำถาม (งานนี้คืองานอะไร/สั่งยังไง/ทำได้ไหม) ต้องตอบก่อน + วิธีสั่ง = ส่งไฟล์ลาย/รูปตัวอย่าง + ขนาด + จำนวน · ตัวอย่าง yes เลิกใส่ "น่ารักมากเลยนะคะ"
  - Build AI Request: hint ทั้ง 2 แบบ (combined / sent) เพิ่ม "ไม่ต้องชมลาย/ไม่ต้องอวยรูป"
- เทสต์ prompt ใหม่ (gemini-2.5-flash, บริบทมีคำถาม "งานแบบนี้คืองานอะไร ต้องสั่งแบบไหน"): รูปโฟโต้การ์ดจากแคตตาล็อก → productSample/yes "จากรูปเป็นงานการ์ด PVC ไดคัทตามทรง… รับผลิตได้เลยค่า 🥰 แค่ส่งไฟล์ลาย + แจ้งขนาดกับจำนวน" · ป้าย PP Board → maybe "ทางร้านยังไม่มีสินค้าแบบนี้เลยค่า 🥺 แต่ถ้าสนใจสแตนดี้อะคริลิค…" (ไม่มีคำอวยแล้ว)
- หมายเหตุ: ใน execution list ช่วง 14:41-14:46 ลูกค้าจริงหลายคน "ไม่ตอบ" เป็นเพราะ whitelist (Build AI Request `return []`) ไม่ใช่บั๊กนี้

## 8 ต.ค. 69 14:54 — "ในภาพเป็นโปสการ์ดกระดาษโฮโลแกรม" แต่บอทตอบโฟโต้การ์ด PVC → ให้ตัววิเคราะห์รูปอ่านความรู้สินค้าทั้งร้าน
- ผลทดสอบหลัง publish รอบก่อน: รูป + คำถามห่าง 2 วิ ได้ **ฟองเดียว** แล้ว (exec 885425 รูป Reply Gate = 0 item · 885427 ข้อความส่ง) ✅ แต่เนื้อหายังทายเป็น "โฟโต้การ์ด PVC" เพราะ Gemini เห็นแค่ *ชื่อ* 228 ชื่อ ไม่รู้วัสดุ
- เว็บ: `GET /api/pricing/search?catalog=1&detail=1` (`catalogSheet()` ใน price-answer.ts) = ProductRef + `desc` (≤150) + `variants` (เรท: label + desc ≤60, ≤8) + `options` (เฉพาะกลุ่มชื่อ วัสดุ/กระดาษ/เนื้อ/ชนิด/ผิว/บัตร/ผ้า ≤2 กลุ่ม × 5 ตัวเลือก) · ทั้งร้าน ≈ 58k ตัวอักษร (เต็ม ๆ 113k ใหญ่ไป) · deploy 9f4bdc1
- n8n Load Catalog (vision): fetch detail=1 → แคช `siteSheet/siteSheetAt` 10 นาที → ส่ง "บรรทัดละ 1 สินค้า: ชื่อ — คำอธิบาย · แบบ · ตัวเลือก" แทนรายชื่อ · prompt เพิ่ม: ใช้คำอธิบาย/วัสดุ/ขนาดเทียบ ไม่ใช่แค่ชื่อ + กติกาการ์ดกระดาษ (โปสการ์ด 4×6/5×7 · โฟโต้การ์ด 5.5×8.5 กระดาษเนื้อพิเศษ · PVC เฉพาะบัตรพลาสติกแข็ง) + shortReply บอกวัสดุที่เห็น
- เทสต์ (gemini-2.5-flash + sheet, บริบทถาม "งานแบบนี้คืองานอะไร สั่งยังไง"): การ์ด Spider-Man โฮโลแกรม → productSample/yes/**โปสการ์ด** "แบบนี้เป็นงานโปสการ์ดกระดาษโฮโลแกรมเลยค่า ทางร้านรับผลิตได้เลยนะคะ 🥰 สั่งง่าย ๆ แค่ส่งไฟล์ลาย + บอกขนาดกับจำนวน" (ชื่ออย่างเดียวทายเป็น "การ์ดบอร์ดโฟม") · โฟโต้การ์ด PVC → PVC ✓ · PP Board → maybe/สแตนดี้อะคริลิค ✓
- ต้นทุน: ~20-25k token/รูป (Gemini 2.5 Flash ≈ ฿0.25/รูป) — รูปเข้าวันละไม่กี่รูป รับได้

## 8 ต.ค. 69 15:09 — รูป PP Board + "รับทำไหม" ติดกัน: ข้อความตอบก่อน (มั่วเรื่องโฮโลแกรม) แล้วรอบรูปค่อยตอบถูก (exec 885655 / 885656)
- ลำดับจริง: รูป 09:26 → Analyze Image (Gemini) ใช้ **59 วิ** (sheet 58k ตัวอักษร ≈ 27k token · local เทสต์ปกติ 3-7 วิ แต่มี spike 30-60 วิ) → ข้อความ 09:29 รอโน้ตรูปได้ ~14 วิ หมดเวลา → `findNote` หยิบโน้ต Spider-Man (15 นาทีก่อน ยังอยู่ในหน้าต่าง 20 นาที) + imageReplyMode 'sent' ของรูปเก่า → hint "ลูกค้าหมายถึงรูปที่ส่งมาก่อนหน้า = โฮโลแกรม" → Claude ตอบ "รับทำค่ะ โฟโต้การ์ดโฮโลแกรม…" 10:13 แล้วล้าง pending → รอบรูป gate 10:36 ไม่เห็น pending → ส่งคำตอบรูป (ถูก) เป็นฟองที่ 2
- แก้ (draft รอ publish):
  - Build AI Request: `freshNote()` — โน้ตรูปต้องมี at ≥ lastImageAt − 5 วิ (ใช้ทั้งตอนอ่าน Read Memory และทุกรอบ poll สด) · รอโน้ตรูปใหม่ได้ 12 รอบ (~24 วิ) · ถ้ายังไม่มีโน้ตแต่รูปเข้ามา < 2 นาที → `mode 'skip' + imageDeferred=true` (ข้อความเงียบ ให้รอบรูปตอบฟองเดียว) · ไม่มีรูปสด ๆ เลย → handoff canned เดิม
  - Reply Gate: `skipReply && imageDeferred` → PATCH ล้าง pendingMessages ก่อน return [] (ไม่งั้นรอบรูปเห็นข้อความค้าง image-related แล้วเงียบตาม = เงียบทั้งคู่)
- bench latency (ppboard, 3 รอบ): 2.5-flash names 3.6-5.0 วิ · compact 35k 5.3-6.3 · full 58k 3.6-7.1 (27k token ≈ ฿0.27/รูป) · flash-lite full 5-15.6 วิ + ทายผิดบ้าง → คง 2.5-flash + full sheet · spike 59 วิ เป็นฝั่ง Gemini (ตอนนี้กันด้วย skip/deferred แทน)

## 8 ต.ค. 69 15:13 / 15:20 — 2 ฟอง (Claude + Gemini) · เทสหลัง publish 15:19 ได้ฟองเดียวแล้ว · Analyze Image ค้าง 30 วิ 3 ใน 4 ครั้ง
- 15:13 (exec 885692/885693): ยังเป็นโค้ดก่อน publish (workflow updatedAt 08:19:39Z) → รอบข้อความหยิบโน้ต PP Board ของรูป 15:09 มาตอบทันที (ไม่รอ) แล้วล้าง pending → รอบรูป (Gemini 39 วิ) ไม่เห็น pending → ส่งอีกฟอง = ฟองแรก Claude / ฟองสอง Gemini (เจ้าของร้านถาม "ใช้ model คนละตัวไหม" — ใช่)
- 15:20 (885756/885757 หลัง publish): รูป Reply Gate = 0 · ข้อความตอบฟองเดียว "ยังไม่รับทำค่ะ… PP Board… สแตนดี้อะคริลิค" ✅ แต่ `imageCombined=false` เพราะรอบข้อความรอ gate ตัดสินใจไม่ถึง (bar 11.8 วิ จบ 20:26 · gate รูป 20:28) → ใช้ hint แบบ "ตอบไปแล้ว" ซึ่งเสี่ยงตอบสั้น
- Analyze Image (Gemini) กับ sheet 58k: 50/59/39 วิ แล้ว 4.7 วิ — node มี timeout 30000 + retryOnFail (wait 3 วิ): 50=30+3+17, 59=30+3+26, 39=30+3+6 → รอบแรก "ค้าง" เกิน 30 วิ แล้ว retry ผ่าน (local 3 รอบ 3.6-7 วิ ไม่เคยค้าง) → draft: timeout 15000 · maxTries 3 · wait 1000 (เลวร้ายสุด ≈ 15+1+15+1+7 ≈ 40 วิ)
- draft เพิ่ม "จอง": Build AI Request เจอโน้ตรูปแต่ gate รูปยังไม่ตัดสิน → PATCH imageReplyMode=skipped เอง (`applyImageFollowup` เป็น async) → imageCombined=true ตอบรวมเต็ม · Reply Gate รอบรูป: ถ้า imageReplyMode=skipped และ imageReplyAt ≥ lastImageAt−1s → เงียบเสมอ (ไม่พึ่งหน้าต่าง pending 25 วิ)

## 8 ต.ค. 69 15:24 — "อยากให้บอทดูภาพเก่งกว่านี้ รู้เลยว่าเป็นกระดาษอะไร หรือเคลือบฟอยล์" (การ์ด Spider-Man จริง = กระดาษแดง + ฟอยล์โฮโลแกรมเฉพาะจุด)
- เทส 15:24 หลัง publish: ฟองเดียว ✅ เนื้อหาถูก (โปสการ์ด + ฟอยล์เป็นตัวเลือกเสริม) แต่ไม่ฟันธงวัสดุ
- prompt (Load Catalog (vision) + สำเนา analyze-image.prompt.txt) เพิ่มฟิลด์ `material` + "วิธีแยกวัสดุจากรูป": โฮโลแกรมทั้งแผ่น (รุ้งทั่วพื้นผิวรวมพื้นหลัง) vs ฟอยล์เฉพาะจุด (รุ้ง/เมทัลลิกเฉพาะเส้น-ตัวอักษร · สีเดียว = 1 Layer) vs กระดาษเงิน/ทอง vs Stardream/มุก vs เคลือบเงา/ด้าน vs PET vs PVC แข็ง vs อะคริลิค vs ผ้า · ไม่ชัวร์ให้บอก "(ไม่ชัวร์)" · shortReply ต้องระบุวัสดุ + จับคู่ตัวเลือกสินค้า
- เว็บ detail=1: OPT_RE เพิ่ม ฟอยล์|เคลือบ|โฮโลแกรม · 3 กลุ่ม (sheet 58k → 62.6k) เพื่อให้เห็น "เคลือบฟอยล์ (ด้านหน้า): 1/2 Layer · สีฟอยล์: เงิน/ทอง/โรสโกล/โฮโลแกรม"
- Format Image Reply ส่ง `material` · Save Image Note ต่อท้ายโน้ต "· วัสดุ: …" → Claude รอบตอบรวมเห็นด้วย
- เทส (gemini-2.5-flash, 3.7-4.1 วิ): การ์ดจริง → "กระดาษอาร์ตมัน + เคลือบฟอยล์โฮโลแกรมเฉพาะจุด 1 Layer" / โปสการ์ด ✅ · กระดาษเนื้อพิเศษ → "กระดาษโฮโลแกรมทั้งแผ่น (SeaSand/Rainbow)" ✅ · โฟโต้การ์ด PVC → "พลาสติก PVC แข็ง" ✅ · รูปแคตตาล็อกกระดาษเคลือบฟอยล์ (ภาพขาวดำ ฟอยล์ไม่เด่น) → "กระดาษอาร์ตมัน" ⚠️ ขึ้นกับรูป
- 15:30 เจ้าของร้าน: "ร้านไม่มีกระดาษสีแดง แต่กระดาษโฮโลแกรมมี" → แก้กฎวัสดุ: พื้นสีทึบ + เส้น/ตัวอักษรรุ้ง = **กระดาษโฮโลแกรมทั้งแผ่น + พิมพ์หมึกสีทับ เว้นลายให้รุ้งโชว์** (ห้ามตอบ "กระดาษสีแดง + ฟอยล์") · ฟอยล์เฉพาะจุดใช้เฉพาะพื้นกระดาษขาว/ครีม · ตัวอย่างใน prompt เปลี่ยนตาม · เทส 2 รอบ → "กระดาษโฮโลแกรม Rainbow + พิมพ์สีแดงทับ เว้นลายใยแมงมุมให้รุ้งโชว์" / โปสการ์ด ✅ (กฎร้าน: ไม่มีกระดาษสีสำเร็จรูป สีทึบ = พิมพ์ทับ)

## 8 ต.ค. 69 15:37 / 15:40 — ฝั่ง LINE ถูกหมดแล้ว แต่ ChatBot เอาราคาทับคำตอบ Claude · "กระดาษสีทอง" เว็บจับเป็น Sticker Gold
- 15:37 (LINE exec 885966/885967 · ChatBot 885970): รูป 3.9 วิ · material "กระดาษโฮโลแกรม Rainbow + พิมพ์สีแดงทับ…" · รอบรูปเงียบ · รอบข้อความ combined=true · **Claude ตอบถูกเป๊ะ** (โปสการ์ดบนกระดาษโฮโลแกรม เลือก Rainbow/SeaSand วิธีสั่ง) แต่ **Fetch PO1** ส่ง message ทั้งก้อน *รวม hint ระบบ* ไป /webhook/pricing-search → จับ "Rainbow" + "2)" เป็น "สติ๊กเกอร์ UV Red RainBow 2 ชิ้น 360 บาท" (kind price) → **PO Override1 ทับ**
- แก้ ChatBot (draft tab ChatBot รอ publish): Fetch PO1 ตัด `\n[คำแนะนำระบบ…` ออกจาก query · PO Override1: มี hint รูป → ไม่ทับคำตอบ Claude เว้นแต่ agentBail หรือลูกค้าถามราคาตรง ๆ (isPriceQ/isSpecQ คิดจากข้อความลูกค้าที่ตัด hint แล้ว)
- 15:40 "ขอดูภาพกระดาษสีทองหน่อย" → mode site/spec → Sticker Gold | Silver | RoseGold → เพิ่มกฎ price-understand: กระดาษสีทอง/สีเงิน/โฮโลแกรม/มุก/Stardream = "กระดาษเนื้อพิเศษ" ไม่ใช่ Sticker Gold/กระดาษเคลือบฟอยล์ (deploy) · dev: ทั้ง 2 คำถามได้ กระดาษเนื้อพิเศษ เป็นตัวแรก (ยังเป็น spec_menu 3-4 ตัว ไม่ใช่คำอธิบายกระดาษทองตรง ๆ)
- ข้อมูลกระดาษสีทองของร้าน (จากหน้าสินค้า): เมทัลลิกทองทั้งแผ่น หลังขาว 300 แกรม · ผิวเงา (เคลือบหน้าฟรี) / ผิวด้าน (เคลือบไม่ได้) · ใช้ได้ใน กระดาษเนื้อพิเศษ/โฟโต้การ์ด/โปสการ์ด/โพลารอยด์/การ์ดบอร์ด (250-300 แกรม)

## 8 ต.ค. 69 15:48 / 15:49 — "กระดาษสีทอง" ยังได้ Sticker Gold นำ · ป้าย PP Board แนบการ์ด Card Broad Foam ผิด
- 15:48 (exec 886040): mode site/spec_menu products = [Sticker Gold, กระดาษเนื้อพิเศษ] — กฎ prompt (09400a1) ไม่พอ เพราะประวัติแชทมีคำตอบ Sticker Gold รอบก่อน LLM เลยยึด → เพิ่มด่าน deterministic หลัง understand: ถาม "กระดาษ…" ไม่พูดถึงสติ๊กเกอร์ → ตัดสินค้า Sticker ทิ้ง · ถ้าเหลือศูนย์และถามกระดาษสีทอง/เงิน/โฮโลแกรม/มุก/Stardream/เนื้อพิเศษ → บังคับ "กระดาษเนื้อพิเศษ" (99b7788 deploy ✅ prod ทดสอบพร้อมประวัติ Sticker → ['กระดาษเนื้อพิเศษ'])
- 15:49 (886052/886053): ฝั่ง flow ถูก (ฟองเดียว combined=true) แต่ Gemini vision (มี sheet แล้ว) จับป้าย PP Board ตั้งพื้นเป็น productMatch "Card Broad Foam หนา 2 mm" (maybe) + material = ชื่อสินค้า → Claude/Flex ตามไปแนบการ์ด+ลิงก์ Card Broad Foam · เจ้าของร้าน: "ส่งภาพและลิงก์ราคาผิด" → prompt เพิ่ม: ป้าย/สแตนดี้ใหญ่ตั้งพื้น → productMatch "ป้ายขาตั้ง X-Stand" (ตั้งโต๊ะ → สแตนดี้อะคริลิค) ห้ามจับคู่ Card Broad Foam/Ultra-Hard CardBoard (การ์ดกระดาษ A7-A3) · material ต้องบรรยายของจริง ห้ามใส่ชื่อสินค้า · เทส 2 รอบ → "PP Board หนา 4 มม. พร้อมขาตั้ง" / X-Stand ✅ (draft LINE รอ publish)
- เจ้าของร้านถาม "กลับไปใช้ Gemini ดีไหม Claude ดูไม่ฉลาด": ทุกเคสที่ไล่วันนี้ Claude ตอบถูก (15:37 ตอบเป๊ะแต่ถูก engine ราคาทับ · 15:49 ตามผล vision ของ Gemini) — ปัญหาอยู่ที่ pipeline/ความรู้สินค้า ไม่ใช่โมเดล · Claude agent ~20 วิ/คำตอบ (Gemini เร็วกว่า) ถ้าจะสลับทำได้ที่โหนดเดียวใน ChatBot

## 8 ต.ค. 69 16:06 — "ขอดูภาพกระดาษสีทอง" ได้สินค้าถูกแล้วแต่ตอบ "พิมพ์รองสีขาว (2 แบบ)" + รูปโฮโลแกรม
- ต้นตอ: `spec()` เลือกกลุ่มตัวเลือกจากคำกว้าง ๆ (wantColor = มีคำ "สี") → ชื่อกลุ่ม "พิมพ์รองสีขาว" ติดมา ส่วนกลุ่ม "ชนิดกระดาษ" ที่มี "กระดาษสีทอง ผิวเงา/ผิวด้าน" ไม่ได้ถูกชี้ · การ์ดใช้รูปหลักของสินค้า (โฮโลแกรม)
- แก้ (price-answer.ts `spec()`): ถ้าคำถามเอ่ยถึง "ตัวเลือก" ตัวใดตรง ๆ (เทียบเศษชื่อตัวเลือก ≥4 ตัวอักษร ไม่นับคำทั่วไป กระดาษ/สี/ผิว/เนื้อ/หนา…) → ตอบเฉพาะตัวเลือกที่ตรง และใช้ `choice.imageSrc` ของตัวเลือกนั้นขึ้นการ์ด (13-gold-gloss.jpg) · ด่านกระดาษ: ถามกระดาษสีทอง/เงิน/โฮโลแกรม/มุก ตรง ๆ → กระดาษเนื้อพิเศษตัวเดียว ไม่กางเมนู 3 ตัว
- dev/prod: "ขอดูภาพกระดาษสีทองหน่อย" → "กระดาษเนื้อพิเศษ • ชนิดกระดาษ: กระดาษสีทอง ผิวเงา (300 แกรม) · กระดาษสีทอง ผิวด้าน (300 แกรม)" + รูปกระดาษทอง ✅ · "กระดาษโฮโลแกรมมีกี่แบบ" → SeaSand/Rainbow + รูปโฮโลแกรม ✅ · "กระดาษเนื้อพิเศษมีอะไรบ้าง" → ลิสต์ 13 ชนิดตามเดิม ✅

## 8 ต.ค. 69 16:25-16:33 — "สตก PP กันน้ำไหม" ตอบสติ๊กเกอร์เรืองแสง / Case CARD (ยึดประวัติ) → เจ้าของร้าน: "อ่านรายละเอียดในเว็บทั้งหมด ไม่ต้องมั่ว/สุ่ม"
- ต้นตอ: ตัวเลือกสินค้า (price-understand) เห็นแค่ *ชื่อ* 228 ชื่อ ไม่มีคำอธิบาย → "สติ๊กเกอร์ PP" ไม่ตรงชื่อไหน LLM เลยหยิบสินค้าจากประวัติแชท (เรืองแสง / Case CARD / ประกายรุ้ง) · 16:33 ยังเป็นโค้ดก่อน deploy (เสร็จ 16:35)
- แก้ (price-answer.ts, deploy แล้ว):
  1. `fixTypos`: "สตก" → สติ๊กเกอร์
  2. รายการสินค้าใน prompt = "ชื่อ — คำอธิบาย 90 ตัวอักษร" ทุกตัว + กฎ "ข้อความล่าสุดระบุวัสดุ/คุณสมบัติชัด (PP/PET/กันน้ำ/เรืองแสง…) → เลือกจากข้อความล่าสุด ห้ามยึดประวัติ"
  3. ด่านหมวด: เอ่ยหมวด (สติ๊กเกอร์/พวงกุญแจ/กระดาษ/หมอน/…) → LLM เห็นเฉพาะสินค้าในหมวดนั้น (คำอธิบายอย่างเดียวทำให้ "สติ๊กเกอร์ PET" หลุดไป MOBILE PHONE HANGING/แม่เหล็ก ที่คำอธิบายมี PET)
  4. ด่าน PP: "สติ๊กเกอร์ PP" ไม่ระบุแบบ → สติ๊กเกอร์ดิจิตอล (PP พรีเมี่ยม กันน้ำ) ตัวเดียว · ระบุ ทรง/บัตร/แจก → ตัวนั้น
  5. เทียบชื่อแบบตัดเครื่องหมาย: `"แท่งไฟ" (Light Stick)` เคย unknown ทุกครั้งเพราะ LLM คัดลอกไม่ครบ
- ผล (dev, ประวัติปน Case CARD/ประกายรุ้ง): สตก PP กันน้ำไหม → สติ๊กเกอร์ดิจิตอล "กันน้ำค่ะ…" ✅ · สติ๊กเกอร์ใสมีไหม → สติ๊กเกอร์ UV "มี 2 แบบ ใส-รองขาว/ใส" ✅ · แท่งไฟมีแบบไหนบ้าง → spec แท่งไฟ ✅ · พวงกุญแจ 3cm 50 ชิ้น / หมอนอุ่นมือ ราคา ✅ · "สตก PET" → สติ๊กเกอร์เรืองแสง (ร้านไม่มีสติ๊กเกอร์ PET ตรง ๆ — ดูบรรทัด PET ด้านบน)
- ต้นทุน: prompt เลือกสินค้าโต ~+12k token/ข้อความ (แต่ด่านหมวดตัดเหลือหมวดเดียวบ่อย + Gemini implicit cache)

## 8 ต.ค. 69 17:00 — บอทตอบถูกแล้ว แต่กลุ่มแอดมินได้การ์ด "🚨 AI ตอบไม่ได้" (สตก PP กันน้ำไหม · การ์ด Spider-Man 16:29)
- ต้นตอ: **Check Escalation** ตัดสินจากคำในคำตอบ — `clearBail` มี 'เดี๋ยวแอดมิน','แอดมินช่วย','ให้แอดมิน' · น้ำเสียงร้านใหม่ปิดท้ายทุกคำตอบด้วย "เดี๋ยวแอดมินคิดราคาให้เลยน้า / แอดมินดูแลให้" → escalateReason `ai_unable` ทั้งที่ตอบถูก · **Format Reply** `escalationPatterns` ก็มี 'เดี๋ยวแอดมิน','แอดมินจะ','ยังไม่มี','ขออภัย' → needsHumanFollowup=true เกือบทุกคำตอบ
- แก้ (draft LINE OA Bot รอ publish): Check Escalation ใช้ `bailRe` = โยนคำตอบให้แอดมินจริง (รอแอดมิน / แอดมิน(จะ|ขอ)?(ยืนยัน|เช็ก|ตรวจสอบ|ตอบกลับ|แจ้งกลับ|ดูให้ก่อน|ดูรูปแล้ว|เข้ามาตอบ) / ขอเช็ก / ไม่ทราบ / ไม่มีข้อมูล …) + flag จาก Format Reply.handoff และ Build AI Request.forceEscalate · Format Reply ตัด 'เดี๋ยวแอดมิน','แอดมินจะ','ทีมงาน','ยังไม่มี','ขออภัย' ออก
- เทส regex: "…เดี๋ยวแอดมินดูแลข้อมูลให้ต่อ" ❌ไม่เด้ง · "…เดี๋ยวแอดมินคิดราคาให้เลยน้า" ❌ · "ร้านยังไม่มีตรง ๆ … เดี๋ยวแอดมินเช็กให้ก่อนว่าทำได้ไหม" ✅เด้ง · handoff canned ✅เด้ง
- รูปยังเด้งการ์ด "ลูกค้าส่งรูปตัวอย่างสินค้า" เสมอ (image_received) ตามที่ออกแบบไว้เดิม — ไม่ใช่ "AI ตอบไม่ได้"

## 8 ต.ค. 69 17:05 — "พรมเช็ดเท้า • ขนาด (7 แบบ): 40x60cm · 50x80cm · …" ขึ้นไลน์ตัดบรรทัดอ่านยาก → เจ้าของร้าน "อยากให้ข้อความเรียงเรียบร้อยกว่านี้"
- `spec()` (ทั้งสาขาตัวเลือกที่ถามตรง ๆ และสาขาทั่วไป): หัวกลุ่ม "• ขนาด (7 แบบ)" แล้วบรรทัดละตัวเลือก "   - 40×60 cm" (`choiceLines` ≤16 + "…และอีก N แบบ") · `prettyChoice` จัด 40x60cm → 40×60 cm, 60cm → 60 cm · หัวข้อความ "<สินค้า> มีให้เลือกดังนี้ค่ะ" · ปิดท้าย "สนใจแบบไหน กี่ชิ้นดีคะ เดี๋ยวคิดราคาให้เลยน้า 🥰" (ไม่มีคำว่า "แอดมิน" → ไม่ชน escalation) · deploy แล้ว

## 8 ต.ค. 69 17:33 — "แนะนำสินค้าที่ราคาไม่ถึง 100 บาทหน่อย" → "มีค่ะ ร้านรับทำ 'สินค้าใหม่' แต่ราคายังไม่ขึ้นบนเว็บ…"
- ต้นตอ 2 ชั้น: (1) ไม่มี intent "แนะนำตามงบ" (2) `findDraftProduct` จับคำ "สินค้า" (6 ตัว = 60% ของ "สินค้าใหม่") กับสินค้าฉบับร่างในระบบที่ยังไม่ได้ตั้งชื่อ → draft_product
- แก้ (deploy แล้ว): `findDraftProduct` ข้ามร่างชื่อทั่วไป (สินค้า/สินค้าใหม่/ใหม่/new/test/ทดสอบ/draft/ร่าง/untitled/copy) · `parseBudgetCap` ("ไม่ถึง/ไม่เกิน/ต่ำกว่า/งบ N บาท" · "N บาทลงมา") + `budgetMenu(N)` = สินค้า priceMin ≤ N เรียงถูกสุด หยิบหมวดละ 1 ก่อน ≤8 ตัว → intent price_menu + การ์ด (ทำงานเฉพาะเมื่อ understand ไม่เจอสินค้าเจาะจง — "พวงกุญแจไม่เกิน 100" ยังไปเมนูพวงกุญแจตามเดิม)
- ผล: "สินค้าที่ราคาเริ่มต้นไม่ถึง ฿100 มีหลายตัวเลยค่ะ 🥰 • แผ่นอะคริลิค — เริ่มต้น ฿6 • สติ๊กเกอร์สูญญากาศ ฿10.5 • การ์ดสเปรย์แอลกอฮอล์ ฿15 • โปสเตอร์ ฿16 • เฟรมการ์ดใส ฿18.5 • กริ๊บต๊อก ฿20 • สแตนดี้อะคริลิคจิ๋ว ฿22 • สมุดโน๊ต ฿35" (priceMin = ราคาเริ่มต้นต่อหน่วยของแต่ละตัว ชิ้น/แผ่น ต่างกัน) · ⚠️ ถ้าเจ้าของร้านอยากคุมรายการแนะนำ (เช่น ซ่อนแผ่นอะคริลิค/การ์ดสเปรย์) ต้องมี flag "แนะนำ" ที่สินค้า

## 8 ต.ค. 69 17:36 — คำตอบ Claude แปะลิงก์สินค้าดิบ (slug ไทย %E0%B8… 8 บรรทัด) → เจ้าของร้านอยากได้เป็นการ์ดสวย ๆ แบบผลเว็บ
- ต้นตอ: Site Price Flex แนบการ์ด/ตัดลิงก์เฉพาะเส้น "ผลเว็บ" หรือ `mentioned()` (ชื่อสินค้าในข้อความ) · เส้น imageRef (ตอบรวมรูป) ไม่มี guess จากรูป → ส่งข้อความผ่านไปทั้งลิงก์
- แก้ (draft LINE OA Bot รอ publish): `urlProducts()` ดึง `iduckystore.com/products/<slug>` จากคำตอบ → เทียบ slug (decode) กับแคตตาล็อก → การ์ดสินค้าตัวนั้น · `stripUrls()` ตัดทั้งบรรทัดลิงก์ล้วนและลิงก์แทรกในประโยค · ใช้ใน: เส้น imageRef (ทั้งแบบมี guess และไม่มี) + ขั้น 2 (ลิงก์ชนะ mentioned) + cleanText
- เทส helper กับข้อความจริง 17:36: slug "พวงกุญแจอะคริลิค-acrylic-keyring" → การ์ด "พวงกุญแจอะคริลิค" · ข้อความเหลือ "ได้เลยค่ะคุณลูกค้า 🥰 … อยากได้ขนาดไหน กี่ชิ้นดีคะ" ✅

## 8 ต.ค. 69 17:45 — สินค้าใหม่ "Spinning Glow อะคริลิคหมุน มีไฟ/ไม่มีไฟ" (slug spinning-glow, id new-muzeb6rz-9639)
- สถานะ: อยู่ใน Supabase ครบ (฿75–545, ตัวเลือก ไฟ LED/พวงกุญแจ-แม่เหล็ก/ขนาด 5–15 cm/แผ่นบน/โซ่/แม่เหล็กกี่จุด, รูป 9) แต่ `data.hidden=true` → ไม่อยู่ในแคตตาล็อก (228) บอทตอบแบบ draft_product "มีค่ะ ร้านรับทำ … แต่ราคายังไม่ขึ้นเว็บ"
- เจ้าของร้านสั่ง "ปิดซ่อนให้" → PATCH hidden=false (service role) 17:50 + สั่งรัน Website Knowledge Sync (exec 887728 17:51–17:58 success) → 17:59 เจ้าของร้าน "ยังไม่ต้อง ราคายังผิด" → PATCH กลับ hidden=true ทันที · ระหว่างนั้นแคตตาล็อก prod ยังเป็น 228 ตลอด (แคช 5 นาที/CDN) → Pinecone ไม่ได้ Spinning Glow (sync อ่าน ?knowledge=1 ซึ่งใช้ catalog() ตัด hidden) · ลูกค้าไม่เคยเห็นสินค้านี้
- วิธีเปิดจริงเมื่อราคาพร้อม: ปิดซ่อนในหลังบ้าน → บอทเห็นเองใน ~5 นาที (เว็บ) + ~10 นาที (แคช n8n siteSheet/siteCatalog) · Knowledge Sync 04:00 ทุกวัน หรือสั่งรันเอง (POST /rest/workflows/deZYeIG1mvxNagEW/run จาก browser session ใช้ได้)

## 8 ต.ค. 69 18:26 — "แผ่นอะคริลิค 20 ชิ้น 5 cm" การ์ดราคาอ่านไม่รู้เรื่อง (เจ้าของร้าน: "ไม่รู้ว่า 20 ชิ้น 5cm ราคาแสดงตรงไหน")
- เดิม: หัว "แผ่นอะคริลิค — สั่ง 20 ชิ้น" · แถว "เรทที่ 1: ฿15–฿169/ชิ้น" (ช่วงของ *ทุกขนาด* ไม่ใช่ 5cm) · ตัวเลขจริงของ 5cm อยู่บรรทัดย่อย 2 เว้นวรรค (การ์ดไลน์ render เป็นตัวเทา xxs) · เรทที่ 2 ขั้นต่ำ 50 ชิ้นโชว์ราคาทั้งที่สั่ง 20
- ใหม่ (`quote()` สาขา qty): namedParts จากคอลัมน์ที่ลูกค้าระบุ (5cm) ขึ้นหัว "แผ่นอะคริลิค 5cm — สั่ง 20 ชิ้น" · หลายเรท → หัว 【เรท】 · แถว "• ถูกสุด 1mm · สกรีน 1 ด้าน (บน) · อะคริลิคใส — ฿35/ชิ้น (รวม ฿700)" (ตัดส่วนที่ระบุแล้วออก) · แถว "• 5cm แบบอื่น (ความหนา/งานสกรีน/ประเภท): ฿35–฿84/ชิ้น" (ช่วงเฉพาะคอลัมน์ 5cm) · เรท minQty > qty → "(เรทที่ 2 … ต้องสั่ง 50 ชิ้น ขึ้นไป)" ไม่คิดราคา · สินค้าคอลัมน์เดียว → "• 20 ใบ — ฿295/ใบ (รวม ฿5,900)" · ไม่ระบุแบบ → ถูกสุด + แบบอื่น (ช่วงทั้งหมด) เหมือนเดิมแต่เป็นแถว
- การ์ดไลน์ (Site Price Flex `linesToRows`): 【…】 = หัวตัวหนา · "• ซ้าย — ขวา" = 2 คอลัมน์ (ซ้าย/ขวา ตัดที่ 40 ตัวอักษร → ราคาอยู่ขวาเสมอ) · deploy แล้ว

## 8 ต.ค. 69 18:30 — การ์ดราคาตัดข้อความ "อะคริล… / ป…" (เจ้าของร้าน: ควรเห็นรายละเอียดครบ ถ้ายาวมีดูเพิ่มเติม)
- ต้นตอ: Site Price Flex `linesToRows` ตัดซ้าย/ขวาของแถว "• ซ้าย — ขวา" ที่ 40 ตัวอักษร (ตั้งไว้เองตอน 23 ก.ย.) ไม่ใช่ข้อจำกัด LINE
- แก้ (draft LINE OA Bot รอ publish): ซ้าย ≤160 wrap flex 7 · ขวา ≤60 flex 5 · หัว 【】 ≤120 · บรรทัดหมายเหตุ ≤200 — ข้อความยาวจะขึ้นบรรทัดใหม่ในการ์ดแทนการตัด · "ดูเพิ่มเติม" แบบพับ/กางไม่มีใน LINE Flex → ปุ่ม "ดูราคาครบทุกแบบ / สั่งเลย" ทำหน้าที่นั้น
- หมายเหตุ: urlProducts/stripUrls (17:36) publish แล้ว 17:47 ✅

## 8 ต.ค. 69 18:35 — ประโยคปิดหลังการ์ดราคาควร "ถามตัวเลือกที่ยังขาด" ตามกลุ่มตัวเลือกจริงของสินค้า (เจ้าของร้านเสนอ)
- เว็บ (`quote()` → `askNext`, deploy แล้ว): ตารางราคาแรกที่ยังเหลือหลายแบบ → ไล่ driverLabels ที่ลูกค้ายังไม่ระบุ (ไม่อยู่ใน namedIdx และไม่พบค่าแบบย่อในข้อความ: "ใส" = อะคริลิคใส ตัดคำนำหน้า อะคริลิค/สกรีน/กระดาษ/…) → "• ความหนาอะคริลิค: 1mm / 2mm / 3mm" (≤6 ค่า) + "(ตัวเลือกเสริม สีอะคริลิค/สกรีนด้าน/เจาะรู เลือกเพิ่มได้ที่หน้าสินค้า)" + "ตอบมาได้เลยน้า หรือกดปุ่มในการ์ดเลือกเองก็ได้ค่ะ ✨" · สินค้าคอลัมน์เดียว / ระบุครบ = ไม่มี askNext · ส่งออกใน API เป็น `askNext`
- n8n Site Price Flex (draft รอ publish พร้อมแก้ตัดข้อความ 40 ตัวอักษร): ฟองปิดหลังการ์ดราคา = `site.askNext` ถ้ามี ไม่งั้นประโยคเดิม
- ตัวอย่าง "แผ่นอะคริลิค 20 ชิ้น 5 cm": การ์ดราคา + ฟอง "ขอรายละเอียดเพิ่มอีกนิดนะคะ จะได้คิดราคาเป๊ะ ๆ ให้ค่า 🥰 • ความหนาอะคริลิค: 1mm/2mm/3mm • งานสกรีน: 1 ด้าน (บน)/(ใต้)/2 ด้าน… • ประเภทอะคริลิค: ใส/ขาวขุ่น C-02/สีพิเศษ …" · "…5cm 1mm สกรีน 1 ด้าน ใส 20 ชิ้น" → ถามเฉพาะงานสกรีน (บน/ใต้ ยังกำกวม)

## 8 ต.ค. 69 18:45 — โหมด "ลูกค้าใหม่ก่อน" + บันทึกแชทครบ + หน้า /admin/chatbot/chats (เจ้าของร้านขอ)
- ข้อมูลที่มี: line-conversations 11,019 ห้องตั้งแต่ 7 พ.ค. 69 (~2,000 ห้อง/เดือน · 561 ห้องที่บอทเคยตอบ) · customer-tasks 16,234 (lineUserId 11,116) · ออเดอร์ผูกไอดี LINE (customer-profile) · whitelist enabled=true userIds 2 (ทดสอบ)
- นิยามที่เจ้าของร้านเลือก: ใหม่ = ไม่เคยทักเลย → บอทตอบและตอบต่อเนื่อง (ติดธง) · เก่า = เงียบให้แอดมิน · เก็บแชทครบ + หน้าดู
- settings/bot-whitelist เพิ่ม `mode: "new-only"`, `newSince: 2026-10-08T13:28:57Z` (ตั้งแล้ว — มีผลเมื่อ publish)
- n8n LINE OA Bot (draft tab รอ publish):
  - Parse LINE Event อ่าน mode/newSince → ส่ง `botMode, newSince`
  - Build AI Request: (1) บันทึกขาเข้าทุกข้อความ → `line-conversations/{uid}/log` {role:user,text,at,type,messageId} (anonymous token ของ Debounce/static) ก่อนทุก return (ลูกค้าเก่าที่เงียบก็บันทึก) (2) `botScope`: ห้องไม่มีธง + mode new-only → createTime (จาก Read Memory PATCH response) ≥ newSince และ profOrders ≤ 0 → 'new' ไม่งั้น 'old' → PATCH botScope/botScopeAt (3) `newCustomerOk` เปิดประตูผ่าน whitelist (wlBlocked + welcome/return[])
  - Reply Gate: `logReply()` บันทึกคำตอบที่ส่งจริง (ข้อความ + "[การ์ด] altText") ทั้งเส้นรูปและข้อความ
  - ข้อจำกัด: แอดมินพิมพ์เองใน LINE ไม่เข้ามาที่ webhook → log มีแต่ลูกค้า+บอท · Debounce bypass (auth ล้ม) = ไม่บันทึกขาเข้า
- เว็บ (deploy แล้ว): `GET /api/admin/chatbot/chats` (reports.view · list orderBy lastSeen/ค้น nameLower · ?id= detail + log ≤1000 + fallback messages) · หน้า `/admin/chatbot/chats` (แท็บ 💬 แชท LINE): ฟิลเตอร์ ทั้งหมด/ใหม่/เก่า · ค้นชื่อ · รีเฟรช 30 วิ · bubble ลูกค้า/บอท · ห้องเก่าก่อนมี log ใช้ messages 20 ตัว
- ทดสอบ: anonymous token POST/DELETE `line-conversations/{uid}/log` ได้ (rules เปิด) · Read Memory response มี createTime (ห้องทดสอบ 2026-05-29)
- 19:05 เจ้าของร้านปรับ: **บอทยังไม่ตอบ** จนกว่าจะเปิดสิทธิ์ — แค่เก็บแชท + ติด badge "ลูกค้าใหม่" ที่ /admin/line-customers → settings/bot-whitelist `mode: "log-only"` (newSince คงเดิม 2026-10-08T13:28:57Z) · Build AI Request ติดธง botScope ทั้ง 'new-only' และ 'log-only' แต่เปิดประตู (newCustomerOk) เฉพาะ 'new-only' · เว็บ: line-chat.ts ดึง botScope/createdAt + loadWhitelist อ่าน mode/newSince · manage route `isNew` · หน้า line-customers แสดง Tag mint "🆕 ลูกค้าใหม่" (deploy แล้ว)
- 🔛 วิธีเปิดให้บอทตอบลูกค้าใหม่ในอนาคต: PATCH settings/bot-whitelist mode → "new-only" (ไม่ต้อง publish n8n อีก ถ้า draft นี้ publish แล้ว) · ลูกค้าที่ติดธง new ไว้ตั้งแต่โหมด log-only จะได้บอทตอบทันที

## 9 ต.ค. 69 09:00 — publish แล้วแต่ webhook ยังรันเวอร์ชันเก่า (ไม่มีส่วนเก็บแชท/ติดธง) → ต้องปิด-เปิด Active
- อาการ: เจ้าของร้าน Publish 20:36 (8 ต.ค.) · REST `/rest/workflows/:id` โชว์โค้ดใหม่ครบ + versionId == activeVersionId แต่ execution 890283 (08:53) `workflowData` snapshot ไม่มี LOG_URL/botMode (มี wrap160/askNext) → runtime ของ webhook ยังถือเวอร์ชันก่อนหน้า · Firestore ไม่มี botScope/log
- แก้: PATCH `/rest/workflows/:id` {active:false} แล้ว {active:true} (02:01Z) → execution ถัดไป (02:02–02:03Z) ติดธง botScope='old' + เขียน log ขาเข้า/ขาออกครบ ✅ (ผู้ใช้ที่เห็นบอทตอบ = Uf472e27… อยู่ใน whitelist ทดสอบ ไม่ใช่หลุด)
- 🔑 gotcha: หลัง Publish ให้เช็ก `execution.workflowData` ของ execution ใหม่ว่ามีโค้ดล่าสุดจริง — ถ้าไม่ ให้ toggle Active (UI หรือ PATCH)
- 9 ต.ค. 69 09:10 เจ้าของร้าน: "ถ้าให้ตอบ จะเปิดเป็นคน ๆ ไป" → ใช้สวิตช์รายคน "บอทตอบ / แอดมินตอบเอง" ใน /admin/line-customers (action toggle → settings/bot-whitelist.userIds) ตามเดิม · mode คง `log-only` (ติดธง 🆕 + เก็บแชท) · `new-only` เก็บไว้เป็นทางเลือกเปิดทั้งกลุ่มในอนาคต

## 9 ต.ค. 69 09:30 — เคสจริง "สแตมป์ทอง Eevee" (Sticker Gold รองขาว) บอทพลาด 4 ข้อจากสาเหตุเดียว: ไม่รู้จัก Sticker Gold + ไม่รู้ว่าร้านไม่มีฟอยล์บนสติ๊กเกอร์
- ภาพ 1 (รูป+"อันนี้สติกเกอร์อะไร"): "สติ๊กเกอร์ไดคัทพร้อมขอบฟอยล์ทอง" ❌ · ภาพ 2 ("ร้านฟอยล์ในสติ๊กเกอร์ได้ไหม"): Claude เอาราคา/ขั้นตอน "กระดาษเคลือบฟอยล์" มาตอบว่ารับทำ ❌ (KB มีข้อ "ฟอยล์บนสติ๊กเกอร์ → ไม่ได้" อยู่แล้ว แต่ retrieval หยิบคู่มือ Foil Stamping) · ภาพ 3 ("เป็นสติ๊กเกอร์เนื้อทองรึเปล่า"): เว็บตอบตัวเลือก สติ๊กเกอร์ดิจิตอล ❌ · ภาพ 4 ("มีสติ๊กเกอร์เนื้อสีทองไหม ราคา"): ข้อความถูกแต่การ์ด = สติ๊กเกอร์ UV/แจก ❌
- ต้นตอฝั่งเว็บ: ชื่อสินค้าเป็นอังกฤษ "Sticker Gold | Silver | RoseGold" LLM จับกับ "สติ๊กเกอร์เนื้อสีทอง" ไม่ได้ (เลือก ประกายรุ้ง/โฮโลแกรม แทน) → ด่าน deterministic ใน understand(): สติ๊กเกอร์/สแตมป์ + เนื้อทอง/เงิน/โรสโกลด์/โลหะ/เมทัลลิก (ไม่พูดถึงกระดาษ) = Sticker Gold ตัวเดียว · สติ๊กเกอร์ + ฟอยล์ = notInCatalog "สติ๊กเกอร์เคลือบฟอยล์" + alternatives [Sticker Gold] + intent spec (ไม่งั้น knowledge → unknown) · price-search not_in_catalog มีข้อความเฉพาะ "สติ๊กเกอร์ของร้านยังไม่มีแบบเคลือบ/ปั๊มฟอยล์ (ฟอยล์เฉพาะงานกระดาษ) … Sticker Gold เนื้อโลหะ พิมพ์รองขาว" (deploy แล้ว) · ผล dev/prod: 5/5 ✅ (เนื้อทอง→info Sticker Gold "เนื้อโลหะ สีทอง ไม่ใช่ฟอยล์" · ราคา→180/160/150/140 · สแตมป์ทองรองขาว→อธิบายรองขาว · ฟอยล์→not_in_catalog + การ์ด Sticker Gold · โฮโลแกรม ยังถูก)
- vision prompt (Load Catalog + สำเนา): กฎ "สติ๊กเกอร์เนื้อโลหะ (Sticker Gold)" = ขอบ/พื้นเมทัลลิกเรียบเงาไม่นูน + ลายพิมพ์ทับ (รองขาว) · ร้านไม่มีฟอยล์บนสติ๊กเกอร์ ห้ามเรียก "ขอบฟอยล์" → เทสรูปจริง 2 รอบ: material "สติ๊กเกอร์เนื้อโลหะสีทอง + พิมพ์สีทับ" / Sticker Gold / yes ✅ (draft LINE รอ publish)
- ChatBot AI Agent1 systemMessage ต่อท้าย "📌 ข้อเท็จจริงร้าน" 3 ข้อ (ฟอยล์บนสติ๊กเกอร์ไม่มี→Sticker Gold · เนื้อทอง/สแตมป์ทอง=Sticker Gold · ไม่มีกระดาษสี→พิมพ์ทับโฮโลแกรม) ใช้ทับความรู้จากคลังถ้าขัดกัน (draft ChatBot รอ publish)
- 💡 ข้อเสนอต่อเจ้าของร้าน: ตั้งชื่อไทยคู่ในชื่อสินค้า ("Sticker Gold | Silver | RoseGold (สติ๊กเกอร์เนื้อสีทอง/เงิน/โรสโกลด์)") จะช่วยทั้งลูกค้าค้นบนเว็บและบอทจับคู่ โดยไม่ต้องพึ่งกฎพิเศษ

## 9 ต.ค. 69 09:58 — รูปสแตมป์ Eevee 2 รูป + "อันนี้สติกเกอร์อะไร" → บอทเงียบ (exec 890811/890812/890813 · ChatBot 890815 · pricing-search 890819)
- ส่วนที่ถูกแล้ว: vision = "สติ๊กเกอร์เนื้อโลหะ (Sticker Gold) + พิมพ์สีทับ" canMake yes ✅ · 2 รอบรูปเงียบให้รอบข้อความตอบรวม ✅ · Claude ตอบถูกใน 15 วิ ("Sticker Gold | Silver | RoseGold เนื้อโลหะ…") ✅
- ที่พัง: ChatBot ใช้ 74 วิ เพราะ **Fetch PO1 → /webhook/pricing-search ค้าง 59 วิ** (Site Price 4 วิ ไม่เจอ → IF useLegacy → "Search Pricing" legacy 54 วิ) → LINE "Call AI" timeout 50 วิ → node error → execution ล้ม ไม่มีคำตอบสำรอง → ลูกค้าได้ความเงียบ
- แก้ (draft 2 workflow รอ publish): ChatBot Fetch PO1 timeout 12 วิ (+ continueRegularOutput) · LINE Call AI timeout 35 วิ + onError continueRegularOutput · Format Reply ตอบสำรองเมื่อ AI ไม่ตอบ: "ขอโทษนะคะคุณลูกค้า ระบบช้าแป๊บนึง 🥺 เดี๋ยวแอดมินเข้ามาตอบในแชทนี้ให้เลยค่า" (bailRe จับ "แอดมินเข้ามาตอบ" → แจ้งแอดมิน)
- 🔍 ค้าง: legacy "Search Pricing" ใน pricing-search ช้า 54 วิ (น่าจะ Gemini spike ฝั่ง server เหมือน Analyze Image) — ยังไม่ได้ใส่ timeout ในตัวมันเอง

## 9 ต.ค. 69 10:10 — รูป 2 + ข้อความ → ตอบถูกฟองเดียว แล้วอีก 1 นาทีมีฟองรูปซ้ำ 2 ฟอง (exec 890927-929 รอบแรก · 890948/951/952 รอบซ้ำ)
- รอบแรก (10:10:01-03): 2 รูปเงียบ · ข้อความตอบรวม "Sticker Gold | Silver | RoseGold เนื้อโลหะ พิมพ์รองขาว…" + การ์ด ✅ (Call AI 17.7 วิ หลังแก้ Fetch PO1 ไม่ค้าง)
- รอบซ้ำ (10:11:04-08): LINE **redelivery** — event เดิมทั้ง 3 (webhookEventId/messageId เดิม, `deliveryContext.isRedelivery=true`) ถูกส่งมาอีกรอบ ~60 วิ · ข้อความถูกกันด้วย recentMessageIds (Debounce คืน 0) แต่ **รูปข้ามด่านกันซ้ำ** (early return ก่อน GET) → วิเคราะห์ใหม่ + gate ไม่เห็น pending (ข้อความถูกทิ้ง) → ส่งคำตอบรูป 2 ฟอง
- LINE Webhook ตอบ 200 ทันทีอยู่แล้ว (responseMode onReceived) — redelivery น่าจะมาจาก n8n รับ request ช้าตอนโหลดสูง กันที่ต้นทางไม่ได้ 100% → ต้องกันซ้ำให้ครบทุกชนิด
- แก้ (draft LINE รอ publish): Debounce Buffer — รูปผ่านด่าน recentMessageIds (GET + ถ้าซ้ำ return []) แล้ว PATCH recentMessageIds อย่างเดียว ก่อน `imagePass()` · auth/GET ล้ม → รูปยังผ่านแบบ imagePass (ไม่ไปเส้น bypass ของข้อความ)

## 9 ต.ค. 69 10:51 — รูปสแตนดี้รับปริญญา (หัวคนจริง หัวดุ๊กดิ๊ก) + "งานนี้ทำได้ไหม" → ตอบ "สแตนดี้อะคริลิค" + การ์ดหมุนได้ · "ไม่ใช่ งานที่หัวมันดุ๊กดิ๊กได้" → เมนู 4 ตัว
- สินค้าที่ถูก = **อะคริลิคดุ๊กดิ๊ก (DookDik)** (ประกบ 2 ชั้น 6 มม. หัวขยับได้) · ร้านยังมี สแตนดี้โยกเยก (ทั้งตัวโยก) · สแตนดี้สปริง / จิ๋วติดสปริง · Acrylic Swinger (หัวโยกมอเตอร์) · หมุนได้ / จุกใส
- เว็บ (deploy แล้ว): ด่าน "ดุ๊กดิ๊ก/หัวโยก/หัวสั่น/bobble" = DookDik · "โยกเยก/โยกไปมา" (ไม่พูดถึงหัว/สปริง) = สแตนดี้โยกเยก · spec-not-covering + คำถาม "คืองานอะไร/ทำได้ไหม" ของสินค้าตัวเดียว → ตอบด้วยข้อมูลหน้าสินค้า (searchInfo) แทนเงียบ → "งานมันจะดุ๊กดิ๊กได้ โยกๆ ได้ เป็นงานอะไรคะ" → "สินค้าที่ขยับดุ๊กดิ๊กโยกๆ ได้ จะเป็นอะคริลิคดุ๊กดิ๊กค่ะ อะคริลิคใสประกบ 2 ชั้น ส่วนหัวใส่หมุดให้ขยับ…" ✅ · "ไม่ใช่ งานที่หัวมันดุ๊กดิ๊กได้" → spec อะคริลิคดุ๊กดิ๊ก ✅
- vision prompt (Load Catalog + สำเนา): สแตนดี้ที่ "หัวเป็นชิ้นแยกซ้อนบนตัว" (รอยต่อที่คอ หัวโต หน้าคนจริง เช่น สแตนดี้รับปริญญา) = อะคริลิคดุ๊กดิ๊ก · หัว-ตัวชิ้นเดียว = สแตนดี้อะคริลิค + ถาม "อยากให้หัวโยกได้ไหม" → เทสรูปจริง 2 รอบ → อะคริลิคดุ๊กดิ๊ก ✅ · สแตนดี้ธรรมดา → สแตนดี้อะคริลิค + ถามเรื่องหัวโยก ✅ (draft LINE รอ publish)
- 11:00 เจ้าของร้านชี้: ในรูป = **Acrylic Swinger Variety** (หัวดุ๊กดิ๊กอะคริลิค สแตนดี้ตั้งโต๊ะ โยกแกว่งอัตโนมัติ ถ่าน AAA หัว 3×4 บอดี้ 6×8 ฿250–390) "ต้องมีตัวนี้เข้ามาให้เลือกด้วย" · อะคริลิคดุ๊กดิ๊ก (DookDik) = แบบพวงกุญแจ/Griptok/แม่เหล็ก หัวขยับด้วยมือ
- แก้เว็บ (deploy): "หัวดุ๊กดิ๊ก/หัวโยก/แกว่ง" → เมนู 2 ตัว [Swinger, DookDik] · ระบุ ถ่าน/อัตโนมัติ/สแตนดี้/ตั้งโต๊ะ = Swinger · ระบุ พวงกุญแจ/griptok/แม่เหล็ก = DookDik · คำถาม "เป็นงานอะไร" คงเมนูไว้ (WHAT_IS_RE) → "มีให้เลือก 2 แบบค่ะ • Acrylic Swinger Variety ฿250-390 • อะคริลิคดุ๊กดิ๊ก ฿250-329" ✅ · "สแตนดี้หัวโยกใส่ถ่านราคา" → Swinger ✅ · "พวงกุญแจหัวดุ๊กดิ๊ก 20 ชิ้น" → DookDik ฿280 ✅
- vision prompt แก้กฎ: หัวแยกชิ้น + ตั้งโต๊ะบนฐาน (กล่องถ่าน) = Acrylic Swinger Variety · มีห่วง/ไม่มีฐาน = DookDik · หัว-ตัวชิ้นเดียว = สแตนดี้อะคริลิค + ถามเรื่องหัวโยก (draft LINE รอ publish)

## 9 ต.ค. 69 11:39 — "แล้วแบบนี้ใส่น้ำหอมได้ไหมคะ" ×2 → บอทเงียบ (exec 891885/891895)
- ลำดับ: รูป (891869) ตอบ "แผ่นหินน้ำหอม" 11:38:58 ✅ · ข้อความ "รับทำหินหอมระเหยไหม" (891872 Read Memory 11:39:04 **ก่อน** Save Image Note บันทึกโน้ตรูป) ตอบ ✅ แล้ว **Save Memory เขียน messages ทับด้วย previousMessages ที่อ่านไว้ตอนต้น** → โน้ตรูปหาย · ข้อความถัดมา "แล้วแบบนี้…" (IMG_REF) หาโน้ตไม่เจอ → เข้าเส้น imageDeferred (รูป < 2 นาที "ยังวิเคราะห์ไม่เสร็จ") → mode skip เงียบ ×2
- บั๊กซ้อน: feasOnly (คำถาม "…ได้ไหม" สั้น ≤40 ไม่มีราคา) จะ skip แม้มีโน้ต — "ใส่น้ำหอมได้ไหม" เป็นคำถามใหม่ ไม่ใช่ "ทำได้ไหม" ซ้ำ
- แก้ (draft LINE รอ publish): Reply Gate ส่ง `liveMessages` (อ่านห้องสดตอนจะส่ง) → Save Memory ใช้เป็นฐานแทน previousMessages (กันเขียนทับโน้ตรูป/ข้อความที่อีกรอบเพิ่งบันทึก) · feasOnly = ตัดคำอ้างรูป/รับทำ/ได้ไหม/คำลงท้าย แล้วต้องไม่เหลืออะไร (feasCore==='') · imageDeferred เฉพาะเมื่อรอบรูป "ยังไม่ตัดสินใจ" (imageReplyAt < lastImageAt) · รอบรูปตอบไปแล้วแต่โน้ตหาย → mode ai + hint "ตอบคำถามเพิ่มจากบริบท ไม่แน่ใจให้ส่งต่อแอดมิน" (ไม่เงียบ ไม่ทัก "ได้รับรูปแล้ว" ซ้ำ)
- เทส feasCore: "รับทำงานแบบนี้ไหมคะ"→'' (skip ได้) · "แล้วแบบนี้ใส่น้ำหอมได้ไหมคะ"→'ใส่น้ำหอม' (ตอบ) · "ที่ร้านทำได้ไหม"→'' · "แบบนี้ราคาเท่าไหร่"→'ราคาเท่าไหร่' (ตอบ)

## 9 ต.ค. 69 11:50 — ต้นทุนต่อคำตอบ + ลดค่าใช้จ่าย (เจ้าของร้านถาม "ฟองนี้ราคาเท่าไหร่")
- วัดจริงฟอง "แล้วแบบนี้ใส่น้ำหอมได้ไหมคะ" (ChatBot exec 891947): Claude Sonnet 5.5 เรียก 3 รอบ (เครื่องมือ 2 + ตอบ) prompt ≈ 13.1k+13.3k+14.7k = 41k token · completion 180 → ≈ $0.084 (฿2.9) · Gemini ฝั่งเว็บ: search_pricing (understand 12.5k + info 2.4k) $0.005 + Fetch PO1 → pricing-search → เว็บอีกรอบ $0.005 + website tool 1.2k $0.0005 → รวม ≈ **$0.095 ≈ ฿3.3/คำตอบ** (วิเคราะห์รูปแยก ~฿0.3)
- 90% = system prompt ~13k token ส่งซ้ำทุกรอบ ไม่มี prompt caching · ประมาณ 300 คำตอบ/วัน ≈ ฿1,000/วัน
- ข้อ 2 ทำแล้ว (draft ChatBot รอ publish): IF "ต้องถามเครื่องราคา?" คั่น AI Agent1 → Fetch PO1: ข้อความมี hint รูป และไม่ใช่คำถามราคา (ไม่มี ราคา/เรท/เท่าไหร่/กี่บาท/ตัวเลข) → ข้ามไป PO Override1 (try/catch ไม่มี Fetch PO1 = ไม่ทับ) · ประหยัด ~$0.005 + เร็วขึ้น ~10 วิ ต่อคำถามถึงรูป
- ข้อ 1 (prompt caching) ทำใน n8n ไม่ได้: node `lmChatAnthropic` v1.5 มีแค่ maxTokens/temperature/topK/topP/thinking/effort — ไม่มี cache_control (Anthropic ต้องใส่ breakpoint เอง: top-level `cache_control` หรือ block-level · read $0.20/M · ขั้นต่ำ cache ตามรุ่น) → ทางเลือก: (ก) ย่อ system prompt 13k→~5k (ลด ~60% ไม่แตะโครง) (ข) เรียก Messages API ตรงผ่าน HTTP + cache_control แล้วทำ tool loop เอง (ลด ~90% ส่วนซ้ำ แต่ต้องเขียน loop/เครื่องมือ 2 ตัว/memory ใหม่)

## 9 ต.ค. 69 12:55 — (ค) ย่อ system prompt ของ ChatBot + persona ฝั่ง LINE (ลดค่า Claude ~60%) — draft ทั้ง 2 workflow รอ Publish
- ChatBot `AI Agent1.systemMessage` 17,548 → 10,573 ตัวอักษร (สำเนา `chatbot-system-message.txt`) · คงครบ: น้ำเสียง · กฎ tool (search_pricing ก่อน ห้าม "ไม่มี" ก่อนค้น · price-options คัดลอกคำต่อคำ · เพดาน 2 ครั้ง · ลิงก์ product.url) · ต่อบทสนทนา (แบบ A/B · ตอบจำนวน) · รับออเดอร์ (ก)-(ง) + ข้อความรับออเดอร์เป๊ะ · แม็พชื่อ/แยกวัสดุ · ข้อเท็จจริงร้าน · [QUOTE]/[CLASSIFY] · 3 expression `{{ $json.body.personaPrompt/systemMessage/conversationHistory }}`
- LINE `Build AI Request` personaPrompt 9k → ~1.4k ตัวอักษร: priceGuard = กฎราคา/หน่วย 5 ข้อ (สำเนา `line-persona-rules.txt`) · toolDirective/priceConstraints = '' · enhancedPersona = เฉพาะ `[ข้อมูลร้าน …]` จาก Quick Setup (ตัด CUSTOMER_SYSTEM_PROMPT ที่ซ้ำกับ ChatBot) · syntax เช็คด้วย AsyncFunction ก่อน save
- ⚠️ บทเรียน: `POST /rest/workflows/:id/run` ของ n8n 2.20 **ไม่ใช้ workflowData ที่ส่งไป** รันเวอร์ชันที่ save ไว้ใน DB เสมอ (execution.workflowData ยืนยัน) → ทดสอบ draft ต้อง PATCH `/rest/workflows/:id` (= กด Save · versionId ใหม่ · activeVersionId ไม่เปลี่ยน ของจริงไม่กระทบ) แล้วค่อย /run
- วัดผล (manual run 22 เคส: 15 แชทจริง + QUOTE/CLASSIFY/อ้างรูปลอย/สั่งไม่ครบ/มีไหม/ฟอยล์): prompt รอบแรก **5.1k token** (เดิม 13.1k ใน exec 891947 · ลองแค่ย่อ persona ยังเต็ม prompt = 7.85k) · คุณภาพเท่าเดิมหรือดีกว่า (c20 มัดจำ 50% ตอบถูกเงื่อนไข ≥10,000+นิติบุคคล · c50 "3 6 9" = ขั้นต่ำ 3 A3 · s7 ฟอยล์→Sticker Gold · s4 อ้างรูปลอย→ขอรูป · s5 สั่งไม่ครบ→ถามเนื้อ/ไดคัท ไม่บอกราคา)
- แก้ระหว่างเทส 3 รอบ: คำถามนโยบาย (มัดจำ/ค่าส่ง/ไฟล์) → ต้อง search_pricing ก่อนแล้วค่อย vector store (เคย wk×2 แล้วยอม "ขอเช็ก") · 🚫 อ้างสิ่งที่มองไม่เห็น ใช้เฉพาะคำถามที่ต้องรู้สินค้า ("อันนี้ใช้ไฟล์ ai ไหม" ต้องตอบ) · ประวัติแอดมินขัดกับเว็บ → ห้ามบอกว่าแอดมินตอบผิด · [QUOTE] เคยตอบ 0 ทั้งที่ tool ให้ช่วงราคา → ให้เลือกแบบที่ตรงสุด × จำนวน ห้าม 0 (รัน 3 ครั้ง: 2500/2500/2750)
- เคส "ตัวจุ๊บ ดึงเข้า-ออก ติดใหม่ได้ไหม" (c80) บอทจับ GRIPTOK PUSH-PULL → แก้ที่เว็บ: ด่าน "จุ๊บ" = สติ๊กเกอร์สูญญากาศ / ตะขอ+จุ๊บ = ตะขอแขวนสูญญากาศ (commit 85a1510 [deploy])
- 💰 คาดต้นทุน/คำตอบ: 3 รอบ × ~5–9k = ~20k prompt token (เดิม 41k) ≈ $0.045 ≈ ฿1.6 (เดิม ฿3.3) · ยังไม่ทำ (ข) direct API + cache_control
- 13:10 ต่อเนื่อง: "ตัวจุ๊บ ดึงเข้า-ออก ย้ายตำแหน่งได้ไหม" ยังเงียบหลังด่านจุ๊บ — ด่านเปลี่ยนสินค้าแล้วแต่ `standalone` ที่ LLM เขียนยังเอ่ย GRIPTOK PUSH-PULL → searchInfo อ่านหน้าสติ๊กเกอร์สูญญากาศด้วยคำถามเรื่อง Griptok = ไม่พบ · แก้ใน understand(): ด่านเปลี่ยนสินค้า + standalone เอ่ยสินค้าอื่น → ใช้ข้อความลูกค้าเดิม และเติมชื่อสินค้าที่เลือกนำหน้า ("สติ๊กเกอร์สูญญากาศ: ตัวจุ๊บ …") · spec-fallback รับ "…ได้ไหม/ใช่ไหม/ได้มั้ย" ด้วย (เดิมเฉพาะ ทำได้ไหม/มีไหม) · วิธีเรียก understand() ตรง ๆ นอก Next: `node --env-file=.env.local --require shim.cjs --import tsx x.mts` โดย shim ใส่ `require.cache[require.resolve('server-only')]` ไว้ก่อน

## 9 ต.ค. 69 13:40 — การ์ดราคาตัด "…หนา 1 ซ…" ทั้งที่ไม่มีปุ่มอ่านต่อ + คำถามขอรายละเอียด "งง" (แผ่นหินน้ำหอม 500 แผ่น)
- การ์ด (LINE Site Price Flex · draft รอ Publish): คำตอบเว็บขึ้นต้นด้วยบรรทัดข้อมูลเสริม "• สามารถเลือกทรง…" (extra-info) → เคยถูกหยิบเป็นหัวการ์ดแล้วตัดที่ 80 ตัวอักษร · แก้: หัวการ์ด = บรรทัดแรกที่ไม่ใช่ "•" (ชื่อสินค้า — สั่ง 500 แผ่น) · บรรทัด "•" ที่ไม่ใช่ราคา = ตัวอักษรปกติเต็มบรรทัด (เดิมเทาเล็ก) · trunc() ตัดที่ช่องว่าง/คำลงท้าย ไม่ใส่ … เพดานขยาย 160/400/120
- askNext (เว็บ · deploy): เดิม "• ถุงบรรจุ: ก / ข / ค / ง (ตัวเลือกเสริม ทรง/เนื้อผ้า/สีไหม เลือกเพิ่มได้ที่หน้าสินค้า)" → ใหม่ "ขอถามเพิ่ม 1 ข้อ … ถุงบรรจุ เลือกแบบไหนดีคะ 1. ไม่ใส่ถุง — ฿85/แผ่น 2. ถุงผ้า 10×10 ซม. — ฿170/แผ่น …" (บรรทัดละแบบ + ราคาต่อหน่วยที่จำนวนนี้ · หลายกลุ่ม = เลขต่อเนื่อง + "เริ่ม ฿x") · ตัดวงเล็บตัวเลือกเสริมทิ้ง · askFrom เก็บ units ต่อคอลัมน์
- สถานะ publish: ChatBot เวอร์ชัน prompt ย่อ (10,573) และ LINE persona ย่อ **เผยแพร่แล้ว** (activeVersionId ตรง draft ที่ PATCH) · การ์ด Flex ยังเป็น draft ใหม่
- 13:55 เจ้าของร้านถาม "ถ้าเป็นคำถามอื่นจะเป็นยังไง" → เจอช่องโหว่: ลูกค้าตอบ "2" ตามข้อ = ระบบ/prompt ตีเป็นจำนวน 2 ชิ้น · แก้ price-search: ข้อความสั้น/ตัวเลขข้อ + ข้อความล่าสุดของบอทมีรายการ "1. … — ฿" → หาบรรทัดข้อนั้น (เลข หรือชื่อแบบที่พิมพ์ "ถุงผ้า 11x13"/"เอาถุงหูรูด") + หัว "สินค้า — สั่ง N หน่วย" → ประกอบ "แผ่นหินน้ำหอม ถุงผ้า 10x10 ซม. 500 แผ่น ราคาเท่าไหร่" (คืน × → x, "3 mm" → 3mm ให้ตรงคอลัมน์) · norm() ถือ × = x · ไม่มีรายการข้อในประวัติ = ตัวเลขยังเป็นจำนวนตามเดิม ("20" → 20 ชิ้น ✅) · "ขอบคุณค่ะ" ไม่โดนจับ ✅ · ChatBot prompt เพิ่มบรรทัด "ตอบเลขตรงเลขข้อ = เลือกข้อ ไม่ใช่จำนวน" (draft 10,770 รอ Publish)
- 14:00 ภาพจริง 12:42 (ก่อน deploy askNext ใหม่ 12:47): ลูกค้าถาม 3 ข้อในข้อความเดียว "500ชิ้น ราคาเท่าไรค่ะ 2.สามารถเลือกขนาดแบบไหนได้บ้าง3.ลายสามารถใส่ลายเองได้ไหมค่ะ" → ได้แค่ราคา (parts แยกเฉพาะ " / " กับขึ้นบรรทัด) → แยกที่เลขข้อ "2." "3." ด้วย (lookbehind กันทศนิยม 12.5/3.5 cm) → extra-info ตอบเรื่องใส่ลายเองแปะหัวการ์ด ✅ (เรื่อง "ขนาด" หน้าสินค้าไม่มีข้อมูลขนาด มีแต่ทรง 4 แบบ → ไม่ตอบ)
