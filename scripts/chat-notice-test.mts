/**
 * 🎴 npm run check:chat-notice — การ์ดที่ notify.ts สร้าง ดึงหัวการ์ด (ชื่อ+สี) ไปโชว์ในหน้าแชทได้ครบทุกแบบ (ไม่เขียนฐาน)
 */
import { NOTICE_HEX, statusFlex, orderNotice, type NoticeTone } from "../src/lib/server/notify";
import { headOf } from "../src/lib/server/chat-notice-log";
import type { Order } from "../src/lib/types";

let fail = 0;
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) fail++;
};
const order = { id: "OD-261014-0001", status: "ชำระแล้ว", items: [], total: 500, name: "ทดสอบ" } as unknown as Order;
const cards = [
  ["statusFlex", statusFlex(order, "https://iduckystore.com/order/OD-261014-0001")],
  ["orderNotice", orderNotice(order, "https://iduckystore.com/order/x", { tone: Object.keys(NOTICE_HEX)[0] as NoticeTone, head: "ได้รับสลิปแล้ว", headline: "ทดสอบ", alt: "ได้รับสลิปแล้ว" })],
] as const;
for (const [name, msgs] of cards) {
  const flex = (msgs as { type: string; contents?: unknown }[]).find((m) => m.type === "flex");
  const h = flex ? headOf(flex.contents) : null;
  ok(!!h && !!h.title && h.title !== "iDucky Prints Studio", `${name}: หัวการ์ด = "${h?.title}"`);
  ok(!!h && /^#[0-9A-F]{6}$/i.test(h.color), `${name}: สีหัว = ${h?.color}`);
}
ok(headOf({ type: "bubble" }) === null, "การ์ดไม่มีหัว → null");
if (fail) process.exit(1);
