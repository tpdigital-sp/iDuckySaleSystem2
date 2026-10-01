# ⚡ LINE ตอบไวขึ้น (1 ต.ค. 69) — 4 จุดใน LINE OA Bot (7v7dy4PvnVnGzlYg)

เดิม: Debounce 5 วิ → Build AI Request (โปรไฟล์) → Call AI (agent 10-30 วิ: tool + Fetch PO1 + Pinecone) → Format Reply → Site Price Flex (ยิงเว็บอีกรอบ 2-3 วิ) → Reply
ใหม่: Debounce 3 วิ → Build AI Request (โปรไฟล์ + **ถามเว็บเลย** 2-3 วิ) → เว็บตอบได้ (price/spec/info/mix/not_in_catalog/draft_product) = mode `site` + presetReply → Handoff? (regex `^(handoff|site)$`) → Format Reply → Site Price Flex (ใช้ `siteResult` ซ้ำ ไม่ยิงอีก) → Reply · เว็บตอบไม่ได้ = เส้น agent ตามเดิม

1. **Debounce Buffer**: `setTimeout(resolve, 5000)` → `3000`
2. **Build AI Request** (ก่อน `const priceGuard =`): ดู block `let siteResult = null; if (mode === 'ai') { … siteResult = await this.helpers.httpRequest({ … body: { query: siteQuery, context, history: hist, profile: customerProfile, noFallback: true }, timeout: 9000 }) … if (found && /^(price|spec|info|mix|not_in_catalog|draft_product)/.test(intent)) { mode = 'site'; presetReply = text; } }` และ return เพิ่ม `siteResult` · ข้ามเมื่อเป็นรูป หรือข้อความเรื่องออเดอร์/สลิป/พัสดุ/ไฟล์/ขอคุยแอดมิน/เคลม
3. **Handoff?** IF: operator regex `^(handoff|site)$` บน `{{ $json.mode }}` (เดิม equals `handoff`)
4. **Site Price Flex**: ก่อนยิง SITE_API อ่าน `$('Build AI Request').first().json.siteResult` ถ้ามี (`'found' in pre`) ใช้แทน

ผลข้างเคียงที่ตั้งใจ: คำตอบ not_in_catalog ของเว็บมีคำว่า "ยังไม่มี" → Format Reply ตั้ง needsHumanFollowup = true → แอดมินได้รับแจ้ง (ลูกค้าถามของที่ร้านไม่มี ควรให้คนตีราคา)
