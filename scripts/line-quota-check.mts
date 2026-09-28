/**
 * 📊 เช็คโควตาข้อความ LINE OA — บัญชีร้าน (LINE_MESSAGING_ACCESS_TOKEN) + บัญชีแจ้งเตือน (__line_alert__) · อ่านอย่างเดียว ไม่เปลืองโควตา
 *
 *   npm run check:line-quota            → โควตา/ใช้ไป + ยอดส่งย้อนหลัง 10 วันแยกช่องทาง (push/multicast/broadcast/reply/แชท)
 *   npm run check:line-quota -- 20      → ย้อน 20 วัน
 *
 * ที่มา 28 ก.ย. 69: ปุ่ม 🔔 ทดสอบส่ง ขึ้น "โควตาข้อความของ LINE OA หมดแล้ว" — บัญชีร้านใช้ครบ 15,000/15,000
 * ทั้งที่ระบบนี้ push ทั้งเดือน ~2,400 · ส่วนที่หายไป ~12,600 อยู่ในคืน 27 → เช้า 28 (สถิติรายวันของ LINE ออกวันถัดไป)
 * ตารางนี้ชี้ให้เห็นว่าวันไหน "broadcast/multicast" (OA Manager/บอทข้างนอก) กับ "apiPush" (ระบบนี้) กินไปเท่าไหร่
 */
import { openToken, loadLineAlert } from "../src/lib/server/line-alert.ts";
import { lineQuota } from "../src/lib/server/line-quota.ts";

const days = Math.max(1, Math.min(31, Number(process.argv[2]) || 10));
const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("th-TH"));

async function get<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  return res && res.ok ? ((await res.json()) as T) : null;
}

async function report(label: string, token: string) {
  const info = await get<{ displayName?: string; basicId?: string; premiumId?: string }>("https://api.line.me/v2/bot/info", token);
  const q = await lineQuota(token, { fresh: true });
  console.log(`\n══ ${label}: ${info?.displayName ?? "?"} (${info?.premiumId ?? info?.basicId ?? "?"})`);
  if (!q) {
    console.log("   ถามโควตาไม่ได้ (token ผิด/หมดอายุ?)");
    return;
  }
  const pct = q.limit ? Math.round((q.used / q.limit) * 100) : null;
  console.log(`   โควตาเดือนนี้ ${n(q.used)}/${n(q.limit)} ข้อความ${pct !== null ? ` (${pct}%)` : ""} · เหลือ ${n(q.left)}${q.left === 0 ? "  ⛔ หมดแล้ว — ส่งหาลูกค้าไม่ได้จนถึงวันที่ 1 เดือนหน้า หรือซื้อข้อความเพิ่มใน OA Manager" : ""}`);
  console.log(`   ${"วันที่".padEnd(10)} ${"apiPush".padStart(8)} ${"multicast".padStart(9)} ${"broadcast".padStart(9)} ${"narrowcast".padStart(10)} ${"reply".padStart(6)} ${"แชท(OA)".padStart(8)}  หมายเหตุ`);
  let apiPushSum = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const ins = await get<Record<string, number | string>>(`https://api.line.me/v2/bot/insight/message/delivery?date=${ymd}`, token);
    if (!ins || ins.status !== "ready") {
      console.log(`   ${ymd.padEnd(10)} ${"(สถิติยังไม่ออก — LINE สรุปวันถัดไป)"}`);
      continue;
    }
    const v = (k: string) => Number(ins[k] ?? 0);
    apiPushSum += v("apiPush");
    const heavy = v("broadcast") + v("apiBroadcast") + v("apiMulticast") + v("apiNarrowcast") + v("targeting");
    console.log(
      `   ${ymd.padEnd(10)} ${n(v("apiPush")).padStart(8)} ${n(v("apiMulticast")).padStart(9)} ${n(v("broadcast") + v("apiBroadcast")).padStart(9)} ${n(v("apiNarrowcast") + v("targeting")).padStart(10)} ${n(v("apiReply")).padStart(6)} ${n(v("chat")).padStart(8)}  ${heavy ? "⚠️ ส่งหมู่ (นับโควตาเต็ม ๆ)" : ""}`,
    );
  }
  console.log(`   รวม apiPush ${days} วัน = ${n(apiPushSum)} · แชทจาก OA Manager/ตอบกลับ (reply) ไม่นับโควตา · ข้อความเข้ากลุ่มนับเท่าจำนวนคนในกลุ่ม`);
}

const shop = process.env.LINE_MESSAGING_ACCESS_TOKEN;
if (shop) await report("บัญชีร้าน (คุยกับลูกค้า)", shop);
else console.log("ไม่มี LINE_MESSAGING_ACCESS_TOKEN ใน .env.local");
const alert = openToken((await loadLineAlert()).enc);
if (alert) await report("บัญชีแจ้งเตือน (กลุ่มแอดมิน)", alert);
else console.log("\n(บัญชีแจ้งเตือน: ไม่มี token/ถอดไม่ได้ในเครื่องนี้ — ข้าม)");
