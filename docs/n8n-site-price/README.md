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
