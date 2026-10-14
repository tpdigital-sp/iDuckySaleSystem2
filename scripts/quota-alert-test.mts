/**
 * 📣 npm run check:quota-alert — คาดการณ์โควตา + การ์ดเตือนทุกระดับผ่านกติกา Flex ของ LINE (ไม่ส่งจริง ไม่เขียนฐาน)
 */
import { forecastQuota, quotaAlertCard, QUOTA_LEVELS } from "../src/lib/server/line-quota-alert";
import { bubbleOf } from "../src/lib/server/line-alert";
import { checkFlexMessages, type LineMessage } from "../src/lib/server/notify";

let fail = 0;
const ok = (c: boolean, label: string) => {
  console.log(`${c ? "✅" : "❌"} ${label}`);
  if (!c) fail++;
};
const at = new Date("2026-10-14T08:00:00Z");
const f1 = forecastQuota({ limit: 35000, used: 11823, left: 23177 }, at)!;
ok(f1.outOn === null && f1.perDay > 800 && f1.perDay < 900, `ใช้ปกติ → พอถึงสิ้นเดือน (${f1.perDay}/วัน)`);
const f2 = forecastQuota({ limit: 35000, used: 20000, left: 15000 }, new Date("2026-10-10T05:00:00Z"))!;
ok(f2.outOn === "17 ต.ค.", `ใช้เร็ว → คาดหมด ${f2.outOn}`);
ok(forecastQuota({ limit: null, used: 1, left: null }, at) === null, "ไม่จำกัดโควตา → ไม่คาดการณ์");
for (const level of QUOTA_LEVELS) {
  const used = Math.round((35000 * level) / 100);
  const q = { limit: 35000, used, left: 35000 - used };
  const card = quotaAlertCard(q, forecastQuota(q, at)!, level, at);
  const msg: LineMessage = { type: "flex", altText: card.alt.slice(0, 380), contents: bubbleOf(card) };
  const errs = checkFlexMessages([msg]);
  ok(!errs.length && card.alt.length > 10, `การ์ดระดับ ${level}% ผ่านกติกา LINE${errs.length ? ` — ${errs.join(" · ")}` : ""} · "${card.title}"`);
}
if (fail) process.exit(1);
