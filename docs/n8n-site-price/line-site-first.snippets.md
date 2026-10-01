# ⚡ LINE ตอบไวขึ้น (1 ต.ค. 69) — 4 จุดใน LINE OA Bot (7v7dy4PvnVnGzlYg)

เดิม: Debounce 5 วิ → Build AI Request (โปรไฟล์) → Call AI (agent 10-30 วิ: tool + Fetch PO1 + Pinecone) → Format Reply → Site Price Flex (ยิงเว็บอีกรอบ 2-3 วิ) → Reply
ใหม่: Debounce 3 วิ → Build AI Request (โปรไฟล์ + **ถามเว็บเลย** 2-3 วิ) → เว็บตอบได้ (price/spec/info/mix/not_in_catalog/draft_product) = mode `site` + presetReply → Handoff? (regex `^(handoff|site)$`) → Format Reply → Site Price Flex (ใช้ `siteResult` ซ้ำ ไม่ยิงอีก) → Reply · เว็บตอบไม่ได้ = เส้น agent ตามเดิม

1. **Debounce Buffer**: `setTimeout(resolve, 5000)` → `3000`
2. **Build AI Request** (ก่อน `const priceGuard =`): ดู block `let siteResult = null; if (mode === 'ai') { … siteResult = await this.helpers.httpRequest({ … body: { query: siteQuery, context, history: hist, profile: customerProfile, noFallback: true }, timeout: 9000 }) … if (found && /^(price|spec|info|mix|not_in_catalog|draft_product)/.test(intent)) { mode = 'site'; presetReply = text; } }` และ return เพิ่ม `siteResult` · ข้ามเมื่อเป็นรูป หรือข้อความเรื่องออเดอร์/สลิป/พัสดุ/ไฟล์/ขอคุยแอดมิน/เคลม
3. **Handoff?** IF: operator regex `^(handoff|site)$` บน `{{ $json.mode }}` (เดิม equals `handoff`)
4. **Site Price Flex**: ก่อนยิง SITE_API อ่าน `$('Build AI Request').first().json.siteResult` ถ้ามี (`'found' in pre`) ใช้แทน

ผลข้างเคียงที่ตั้งใจ: คำตอบ not_in_catalog ของเว็บมีคำว่า "ยังไม่มี" → Format Reply ตั้ง needsHumanFollowup = true → แอดมินได้รับแจ้ง (ลูกค้าถามของที่ร้านไม่มี ควรให้คนตีราคา)

## เพิ่มเติม (บ่าย 1 ต.ค. 69 หลังวัดจริง 13.8 วิ: Debounce 4.4 + Build AI Request 5.1 + โหนดเล็ก ๆ ~4)
5. **Build AI Request** อ่านโปรไฟล์จาก Read Memory ก่อน (`fields.profile.mapValue.fields.text/textAt` — เว็บแคชไว้ทุกครั้งที่ API ถูกเรียก) อายุ < 6 ชม. = ไม่เรียก API (ประหยัด 1-2 วิ)
6. **Build AI Request** `KNOWLEDGE_RE` (กี่วัน/ส่งของ/จัดส่ง/ค่าส่ง/ชำระ/โอนเงิน/มัดจำ/ผลิตนาน/ใช้เวลา/ไฟล์/วิธีสั่ง/นโยบาย/รับประกัน/เปลี่ยน/คืนเงิน): ถ้าเว็บตอบเป็น `info` กับคำถามพวกนี้ → ไม่ short-circuit ให้ agent+คลังความรู้ตอบ (เจอจริง: "ส่งของกี่วันถึง" ได้ FAQ กว้าง ๆ ของแม่เหล็ก) · ฝั่งเว็บก็เพิ่ม on-topic guard ใน infoText แล้ว (c8b1a86)
- ผลวัดจริงหลัง Publish รอบแรก: "แม่เหล็กติดตู้เย็น มีแบบไหนบ้าง" 13.8 วิ (mode site, ไม่เรียก agent) · "แบบที่ 2 ราคาเท่าไหร่ 50 ชิ้น" ได้ทั้ง 2 เรท → แก้เว็บให้ตอบเรทที่ 2 (SET-KIT) อย่างเดียว
