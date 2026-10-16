/**
 * 🔌🧪 ด่านตัวดึงข้อความจาก LINE OA Manager (lib/server/line-oa-manager.ts fetchOaChatMessages + lib/server/oa-chat-sync.ts)
 *   npm run check:oa-sync
 * ไม่แตะ Firestore/เน็ต — mock fetch แทน chat.line.biz (เส้นจริงยังไม่ยืนยัน 15 ต.ค. 69) เช็ค:
 *   · ลองเส้นทาง/รหัสห้อง (มี-ไม่มีเลข 2 นำหน้า) จน 2xx แล้วจำแม่แบบ · 401 = หยุดทันที
 *   · normalize หลายรูปแบบ (source.type · timestamp ตัวเลข · message.text) + เรียงเก่า→ใหม่
 *   · รหัส entry ตรงสูตร CSV import (oa-<sha1(วินาที|Account|ผู้ส่ง|ข้อความ)>) → รัน CSV ทีหลังไม่ซ้ำ
 *   · กันซ้ำกับ log: ข้อความเดียวกันใน 5 นาที · n8n รวม "a / b" · รูปเทียบชนิดใน 2 นาที
 */
import { createHash } from "node:crypto";
import { fetchOaChatMessages, OaError, toOaMessage } from "../src/lib/server/line-oa-manager";
import { alreadyLogged, oaEntryId, type Existing } from "../src/lib/server/oa-chat-sync";

let fails = 0;
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) fails++;
};

const BOT = "U0e7cd5f6cc57338f45ddb8bade93647a";
const CHAT = "U9584198016507e100320fa1cc8fac981";
const T0 = Date.UTC(2026, 9, 15, 10, 0, 0);
const calls: string[] = [];

function mockFetch(handler: (path: string) => { status: number; body?: unknown }) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    const path = url.replace("https://chat.line.biz", "");
    calls.push(path);
    const r = handler(path);
    return new Response(r.body === undefined ? "" : typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

// ── 1. ลองเส้นทาง: v2/messages 404 ทั้งสองรหัส → v1/messages 404 → v2/chats/{2chat}/messages 200 (เฉพาะรหัสที่มีเลข 2) ──
// รูปแบบจริงของ v3 (ดูจากหน้า OA 15 ต.ค. 69): ใหม่→เก่า · messageSent มี bizId · chatRead/follow ปน · ชื่อพนักงานต้องถาม authorizedUsers
mockFetch((p) => {
  if (p.startsWith(`/api/v3/bots/${BOT}/chats/2${CHAT}/messages`))
    return {
      status: 200,
      body: {
        list: [
          { type: "chatRead", timestamp: T0 + 90_000, source: { chatId: CHAT, userId: CHAT }, read: { watermark: T0 + 90_000 } },
          { type: "messageSent", timestamp: T0 + 60_000, source: { chatId: CHAT, userId: BOT }, message: { id: "m3", type: "text", text: "สวัสดีค่ะ  ยอดรวม 500 บาท", quoteToken: "q" }, sendId: "x", bizId: "biz-a" },
          { type: "message", timestamp: T0 + 30_000, source: { chatId: CHAT, userId: CHAT }, message: { id: "m2", type: "text", text: "ขอราคาค่ะ" } },
          { type: "messageSent", timestamp: T0 + 10_000, source: { chatId: CHAT, userId: BOT }, message: { id: "m4", type: "text", text: "ขอบคุณที่ติดต่อ" }, sendId: "y", bizId: "__AUTO_RESPONSE" },
          { type: "messageSent", timestamp: T0, source: { chatId: CHAT, userId: BOT }, message: { id: "m1", type: "image", contentHash: "h" }, sendId: "z" },
          { type: "follow", timestamp: T0 - 1000, source: { chatId: CHAT, userId: CHAT } },
        ],
        backward: "cursor",
      },
    };
  if (p.startsWith(`/api/v1/bots/${BOT}/authorizedUsers`)) return { status: 200, body: { list: [{ bizId: "biz-a", name: "พนักงาน ก", linePictureUri: "" }] } };
  return { status: 404, body: {} };
});
const r = await fetchOaChatMessages(BOT, CHAT, "ses=test", 50);
const msgCalls = calls.filter((c) => c.includes("/messages"));
ok(msgCalls.length === 2, `v3 มาก่อน: ลอง 2 ครั้ง (รหัสห้องเปล่า 404 แล้วแบบมีเลข 2) ได้ ${msgCalls.length}: ${msgCalls.map((c) => c.replace(`/api/`, "").replace(BOT, "{bot}")).join(" · ")}`);
ok(calls.some((c) => c.includes("/authorizedUsers?bizIds=biz-a")), "ถามชื่อพนักงานจาก bizId (เฉพาะตัวที่ไม่ขึ้นต้น __)");
ok(r.path === `/api/v3/bots/${BOT}/chats/2${CHAT}/messages` && r.chatId === `2${CHAT}`, `จำเส้น+รหัสห้องที่ตอบ (${r.path.split("/bots/")[1]})`);
ok(r.messages.length === 4, `อ่านออก 4 (ทิ้ง chatRead/follow) ได้ ${r.messages.length}`);
ok(r.messages.map((m) => m.id).join(",") === "m1,m4,m2,m3", `เรียงเก่า→ใหม่ (${r.messages.map((m) => m.id).join(",")})`);
ok(r.messages[3].from === "account" && r.messages[3].by === "พนักงาน ก" && r.messages[3].bizId === "biz-a" && r.messages[2].from === "user", "messageSent = ฝั่งร้าน + ชื่อจาก authorizedUsers · message = ลูกค้า");
ok(r.messages[1].from === "account" && r.messages[1].by === "" && r.messages[1].bizId === "__AUTO_RESPONSE", "ตอบกลับอัตโนมัติ: ไม่ใส่ชื่อ แต่ bizId บอก");
ok(r.messages[0].type === "image" && r.messages[0].by === "" && !r.messages[0].bizId, "รูปที่ส่งผ่าน API ไม่มี bizId/ชื่อ");
ok(r.sampleKeys.join(",") === "type,timestamp,source,read", `sampleKeys = ${r.sampleKeys.join(",")}`);

// ── 2. รอบถัดไปใช้แม่แบบ+รหัสห้องที่จำไว้ก่อน (ยิงครั้งเดียว) ──
calls.length = 0;
await fetchOaChatMessages(BOT, CHAT, "ses=test", 20);
ok(calls.filter((c) => c.includes("/messages")).length === 1 && calls[0].includes("/chats/2"), `รอบหน้าใช้เส้นที่จำไว้ทันที (${calls.filter((c) => c.includes("/messages")).length} ครั้ง)`);

// ── 3. คุกกี้ตาย = หยุดทันที ไม่ไล่เส้นอื่น ──
calls.length = 0;
mockFetch(() => ({ status: 401, body: {} }));
let err: OaError | null = null;
try {
  await fetchOaChatMessages(BOT, CHAT, "ses=dead", 50);
} catch (e) {
  err = e as OaError;
}
ok(err instanceof OaError && err.status === 401 && calls.length === 1, `401 → หยุดหลังยิงครั้งเดียว (${calls.length}) · ${err?.message.slice(0, 40)}`);

// ── 4. normalize รูปแบบอื่น ──
const a = toOaMessage({ messageId: "x", createdAt: "2026-10-15T10:00:00+07:00", sourceType: "ACCOUNT", operator: { displayName: "แอดมิน B" }, text: "โอเคค่ะ" });
ok(a?.from === "account" && a.by === "แอดมิน B" && a.text === "โอเคค่ะ" && a.at === "2026-10-15T03:00:00.000Z", "รูปแบบ createdAt ISO + sourceType + operator.displayName");
const b = toOaMessage({ id: "y", timestamp: 1760522400, direction: "in", message: { type: "sticker" } });
ok(b?.from === "user" && b.type === "sticker" && b.at === new Date(1760522400 * 1000).toISOString(), "timestamp วินาที + direction in + สติกเกอร์");
const c = toOaMessage({ id: "z", timestamp: T0, message: { type: "text", text: "?" } });
ok(c?.from === "unknown", "ไม่มีฟิลด์บอกฝั่ง = unknown (probe โชว์ตัวอย่างให้ไล่)");

// ── 5. รหัส entry ตรงสูตร CSV import ──
const csvId = (atMs: number, sender: string, text: string) => `oa-${createHash("sha1").update(`${atMs}|Account|${sender}|${text}`).digest("hex").slice(0, 20)}`;
ok(oaEntryId(T0 + 999, "พนักงาน ก", "สวัสดีค่ะ") === csvId(T0, "พนักงาน ก", "สวัสดีค่ะ"), "มิลลิวินาทีปัดทิ้ง = id เดียวกับ CSV");
ok(oaEntryId(T0, "", "คุณส่งรูป") === csvId(T0, "Unknown", "คุณส่งรูป"), "ไม่มีชื่อ = Unknown เหมือน CSV");

// ── 6. กันซ้ำกับ log ──
const existing: Existing[] = [
  { at: T0 + 60_000, type: "text", parts: ["สวัสดีค่ะ ยอดรวม 500 บาท"] },
  { at: T0 + 200_000, type: "text", parts: ["ขอบคุณค่ะ", "รอสักครู่นะคะ"] }, // n8n รวม "a / b"
  { at: T0, type: "image", parts: [] },
];
const txt = (t: string, at: number) => ({ id: "", at: new Date(at).toISOString(), from: "account" as const, by: "", type: "text", text: t });
ok(alreadyLogged(txt("สวัสดีค่ะ  ยอดรวม 500 บาท", T0 + 60_000 + 4 * 60_000), T0 + 60_000 + 4 * 60_000, existing), "ข้อความเดียวกัน (ช่องว่างต่าง) ใน 5 นาที = มีแล้ว");
ok(!alreadyLogged(txt("สวัสดีค่ะ ยอดรวม 500 บาท", T0 + 60_000 + 6 * 60_000), T0 + 60_000 + 6 * 60_000, existing), "เกิน 5 นาที = ของใหม่");
ok(alreadyLogged(txt("รอสักครู่นะคะ", T0 + 200_000), T0 + 200_000, existing), "ตรงท่อนหนึ่งของ 'a / b' = มีแล้ว");
ok(!alreadyLogged(txt("ยอดรวม 600 บาท", T0 + 60_000), T0 + 60_000, existing), "ข้อความต่าง = ของใหม่");
ok(alreadyLogged({ ...txt("", T0 + 90_000), type: "image" }, T0 + 90_000, existing), "รูปในช่วง 2 นาที = มีแล้ว");
ok(!alreadyLogged({ ...txt("", T0 + 180_000), type: "image" }, T0 + 180_000, existing), "รูปเกิน 2 นาที = ของใหม่");

console.log(fails ? `\n❌ ไม่ผ่าน ${fails} ข้อ` : "\n✅ ผ่านทุกข้อ");
process.exit(fails ? 1 : 0);
