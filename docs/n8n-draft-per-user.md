# 📝 โหมดร่างรายคน — จุดแก้ใน n8n (LINE OA Bot - AI Phase A · 7v7dy4PvnVnGzlYg)

เว็บเก็บรายชื่อไว้ที่ `settings/bot-whitelist.draftUserIds` (ปุ่ม 📝 ร่างก่อนส่ง ในหน้า /admin/chatbot/chats)
n8n ต้องอ่านรายชื่อนี้ แล้วให้คนในรายชื่อ "ร่างเสมอ" — แก้ 2 โหนด 6 จุด (หาด้วย Ctrl+F ในช่องโค้ด แล้ววางทับ)

ลำดับ: deploy เว็บก่อน → แก้ 2 โหนดนี้ → Save → Publish

---

## โหนด 1: Parse LINE Event

**จุด 1** — หา:
```js
let whitelistEnabled = false, allowedUserIds = [];
```
แทนด้วย:
```js
let whitelistEnabled = false, allowedUserIds = [];
// 📝 19 ต.ค. 69 โหมดร่างรายคน: settings/bot-whitelist.draftUserIds
let draftUserIds = [];
```

**จุด 2** — หา:
```js
    allowedUserIds = arr.map(v => v.stringValue).filter(Boolean);
```
แทนด้วย:
```js
    allowedUserIds = arr.map(v => v.stringValue).filter(Boolean);
    draftUserIds = (whitelistRes.fields.draftUserIds?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
```

**จุด 3** — หา:
```js
sdw.lastWhitelist = { enabled: whitelistEnabled, ids: allowedUserIds, at: Date.now() };
```
แทนด้วย:
```js
sdw.lastWhitelist = { enabled: whitelistEnabled, ids: allowedUserIds, drafts: draftUserIds, at: Date.now() };
```

**จุด 4** — หา:
```js
if (lw && Array.isArray(lw.ids)) { whitelistEnabled = lw.enabled !== false; allowedUserIds = lw.ids; }
```
แทนด้วย:
```js
if (lw && Array.isArray(lw.ids)) { whitelistEnabled = lw.enabled !== false; allowedUserIds = lw.ids; draftUserIds = Array.isArray(lw.drafts) ? lw.drafts : []; }
```

**จุด 5** — หา (บรรทัด `results.push` ท้ายโค้ด):
```js
whitelistEnabled, allowedUserIds, botMode, newSince, isMyIdCommand,
```
แทนด้วย:
```js
whitelistEnabled, allowedUserIds, draftUserIds, botMode, newSince, isMyIdCommand,
```

---

## โหนด 2: Build AI Request

**จุด 6** — หา:
```js
const draftMode = parseData.botMode === 'draft';
```
แทนด้วย:
```js
// 📝 19 ต.ค. 69 + โหมดร่างรายคน: uid อยู่ใน draftUserIds = ร่างเสมอ (Reply Gate ฝากเป็นร่าง ไม่ส่ง LINE)
const draftMode = parseData.botMode === 'draft' || (parseData.draftUserIds || []).includes(parseData.userId);
```

ไม่ต้องแก้ Reply Gate — มันอ่าน `draftOnly` จาก Build AI Request อยู่แล้ว

---

## ทดสอบหลัง Publish
1. หน้าแชท → ห้องบัญชี LINE ทดสอบ → 👤 ข้อมูลลูกค้า → เปิดสวิตช์ **📝 ร่างก่อนส่ง**
2. พิมพ์จาก LINE เข้ามา 1 ข้อความ
3. ต้องเห็นการ์ดร่างสีเหลืองในห้อง · ฝั่ง LINE **ต้องยังไม่ได้รับ** จนกว่าจะกดส่ง
4. ถ้าห้องนี้เพิ่งมีแอดมินตอบ (บอทพัก 30 นาที) บอทจะยังไม่ร่าง — กด ▶ ปลุก ก่อนทดสอบ
