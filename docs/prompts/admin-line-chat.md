# Prompt: ช่องพิมพ์ตอบลูกค้า LINE จากหน้า /admin/chatbot/chats (แบบผสม ไม่แทน OA Manager ทั้งหมด)

คัดลอกข้อความใต้เส้นไปวางใน session ใหม่ได้เลย

---

ทำฟีเจอร์ "แอดมินตอบลูกค้า LINE จากเว็บ" ในรีโป `/Users/iduckshop/Desktop/iDuckySaleSystem2` (Next.js) โดยต่อยอดหน้า `src/app/admin/chatbot/chats/page.tsx` และ API `src/app/api/admin/chatbot/chats/route.ts` ที่มีอยู่แล้ว (หน้านี้แสดงห้องแชท LINE รายคนจาก Firestore `ordersure` คอลเลกชัน `line-conversations/{lineUserId}` + ข้อความครบใน subcollection `log` ที่บอท n8n เขียน) อ่านไฟล์พวกนี้ก่อนเริ่ม: `src/lib/server/line-chat.ts` (ChatRow, botScope, needsHumanFollowup, isWaitingForAdmin), `src/lib/server/notify.ts` (ส่งข้อความ LINE ผ่าน Messaging API มีอยู่แล้ว ใช้ env เดิม ห้ามสร้าง token ใหม่), `src/lib/server/line-alert.ts`, `src/app/api/admin/line-customers/manage/route.ts` (สวิตช์ "บอทตอบ/แอดมินตอบเอง" รายคน = `settings/bot-whitelist.userIds`), `docs/n8n-site-price/README.md` ส่วน 8–9 ต.ค. 69 (โหมด log-only, ธง botScope, บันทึก log)

## เป้าหมาย (แบบผสม)
แอดมินใช้หน้านี้ตอบเฉพาะเคสที่บอทส่งต่อหรือลูกค้าที่เปิดบอทไว้ แชททั่วไปยังตอบใน LINE OA Manager ตามเดิม (OA Manager ฟรีไม่จำกัด แต่ส่งจากเว็บ = push นับโควตา 35,000/เดือน ของ @iduckyofficial ดู `npm run check:line-quota`)

## สิ่งที่ต้องทำ
1. **ช่องพิมพ์ + ปุ่มส่ง** ท้ายห้องแชทที่เลือก (ข้อความ + แนบรูป 1 รูปได้) ใช้งานบนมือถือได้ (ปุ่มสูง ≥ 40px, ช่องพิมพ์ติดขอบล่าง)
2. **API `POST /api/admin/chatbot/chats/reply`** `{ id, text, imageUrl? }` สิทธิ์ใหม่ `chat.reply` (เพิ่มใน `src/lib/server/role-perms.ts` ให้ owner/admin ได้ค่าเริ่มต้น) ทำตามลำดับ:
   - ส่งเข้า LINE ด้วย Messaging API push (ใช้ helper/ env เดิมใน notify.ts) ถ้า LINE ตอบ 429/quota ให้คืน error ภาษาไทยชัด ๆ "โควตา LINE เดือนนี้หมด ไปตอบใน OA Manager แทน"
   - เขียน `line-conversations/{id}/log` 1 เอกสาร `{ role: "admin", text, imageUrl?, at: serverTimestamp, by: <ชื่อ/อีเมลแอดมินที่ล็อกอิน>, mode: "web" }` และอัปเดตเอกสารห้อง: `lastSeen`, `needsHumanFollowup: false`, `adminActiveUntil: now + 30 นาที`, `lastAdminAt`
   - ตอบ `{ ok: true, entry }` ให้หน้าเว็บต่อท้ายทันทีโดยไม่ต้องโหลดใหม่
3. **บอทต้องหลบแอดมิน**: ใน n8n workflow "LINE OA Bot - AI Phase A" (id `7v7dy4PvnVnGzlYg`) โหนด `Reply Gate` ให้เพิ่มเงื่อนไข: ถ้าเอกสารห้องมี `adminActiveUntil` > ตอนนี้ → ไม่ตอบ (บันทึก log ตามเดิม) · แก้ผ่าน pinia store ของแท็บ n8n ที่เปิดอยู่หรือ REST `PATCH /rest/workflows/:id` (= Save draft) แล้วให้เจ้าของร้านกด Publish เอง (ห้ามแตะ token ใน Parse LINE Event ห้ามพิมพ์ token ลงแชท/โค้ด)
4. **หน้าแชทต้องโชว์ข้อความแอดมินด้วย**: `log` role "admin" แสดงฝั่งซ้ายสีต่างจากบอท ติดชื่อคนส่ง · รายการห้องเรียงล่าสุด · โพลทุก 10 วิเฉพาะห้องที่เปิด (ทั้งหน้ายังทุก 30 วิ) · แท็บ "รอแอดมิน" = `needsHumanFollowup && lastSeen ใน 48 ชม.` ขึ้นก่อน
5. **มิเตอร์โควตา LINE** มุมบนหน้า (ใช้ตรรกะเดียวกับ `scripts/check-line-quota` หรือ API ใหม่ `GET /api/admin/chatbot/chats/quota` แคช 10 นาที) ถ้าเหลือ < 3,000 ให้แถบเหลือง < 500 ปุ่มส่งเป็นสีเทาพร้อมคำอธิบาย
6. **ปุ่มลัดในช่องพิมพ์**: "ส่งการ์ดสินค้า" (ค้นชื่อสินค้า → Flex card แบบเดียวกับ Site Price Flex: รูป ชื่อ ช่วงราคา ปุ่มลิงก์) และ "เปิด/ปิดบอทให้คนนี้" (เรียก action เดิมของ line-customers/manage)

## ข้อห้าม/กติกาของรีโปนี้
- ห้ามเขียนตาราง orders ตรง ๆ (ไม่เกี่ยวกับงานนี้ แต่กฎรีโป) · ห้าม auto-commit/auto-push · deploy เฉพาะ commit ที่มี `[deploy]` และ push แยกจาก commit เอกสาร (push ติดกัน Netlify จะยกเลิก build) · Node อยู่ที่ `export PATH="$HOME/.local/node-v22.23.1-darwin-arm64/bin:$PATH"` · typecheck `node_modules/.bin/tsc --noEmit -p tsconfig.json` (ข้าม error ใต้ .next/) · dev server ของผู้ใช้อยู่ที่ localhost:3016 (recompile ~8 วิ) ห้ามรัน build ทับ `.next`
- โหมดบอทต้องคง `settings/bot-whitelist.mode = "log-only"` (บอทตอบเฉพาะ userIds ที่เจ้าของร้านเปิดรายคน) ห้ามเปลี่ยน
- ข้อความที่ส่งถึงลูกค้าใช้น้ำเสียงร้าน: คุณลูกค้า / ค่ะ นะคะ / emoji 1–2 ตัว (ใช้กับข้อความที่ระบบสร้างเอง เช่น การ์ดสินค้า ไม่แก้ข้อความที่แอดมินพิมพ์)
- Firestore `ordersure` ใช้ firebase-admin ผ่าน `getChatFirestore()` ใน `src/lib/server/firebase-admin.ts` (env `FIREBASE_SERVICE_ACCOUNT_B64` ใน .env.local) อย่าสร้าง client ใหม่
- ดีไซน์หลังบ้านใช้คลาส `dkb-*` และ component ใน `src/components/admin/ui` (Btn, Tag, PageHead, SearchBox, Empty) ตามหน้าที่มีอยู่

## เกณฑ์เสร็จ (ทดสอบให้ดูด้วย)
- ส่งข้อความจากหน้าเว็บไปหาไอดีทดสอบ (อยู่ใน bot-whitelist.userIds) → ถึง LINE ภายใน 3 วิ, ขึ้นในห้องแชททันที, log role admin มี `by`
- ลูกค้าทดสอบพิมพ์กลับภายใน 30 นาที → บอทไม่ตอบ (Reply Gate หลบ) แต่ข้อความถูกบันทึกและห้องขยับขึ้นบนสุด · หลัง 30 นาที บอทตอบตามปกติ
- สิทธิ์: บัญชีที่ไม่มี `chat.reply` เห็นห้องได้แต่ไม่มีช่องพิมพ์ (RequirePerm `reports.view` ยังใช้ดูได้)
- มิเตอร์โควตาแสดงเลขตรงกับ `npm run check:line-quota`
- `tsc` ผ่าน · เขียนบันทึกไว้ท้าย `docs/n8n-site-price/README.md` (หัวข้อใหม่ลงวันที่) และไฟล์ memory ใหม่สั้น ๆ
- ก่อน commit ให้สรุปให้เจ้าของร้านดูก่อนว่าแก้ไฟล์อะไรบ้าง แล้วค่อย commit เฉพาะไฟล์ของงานนี้ (ไม่รวม `kb-chat-draft.html` และไฟล์อื่นที่ค้างอยู่)
