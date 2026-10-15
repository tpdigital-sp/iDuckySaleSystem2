/**
 * 🔎 ทดสอบ API ค้นหาคลังแชท LINE (หน้าออเดอร์ → ผูก LINE) ว่าตอบเร็ว/ช้า/พังไหม
 * เซ็นคุกกี้แอดมินเองจาก ADMIN_SESSION_SECRET ใน .env.local (ไม่พิมพ์ความลับออกมา)
 *
 *   npm run probe:line-search                       → localhost:3016 ค้น PooM 2 รอบ (รอบแรกเย็น = ดู partial)
 *   npx tsx scripts/line-search-probe.mts <base> <q…>  → ระบุเซิร์ฟเวอร์/คำค้นเอง
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const p = { username: "iduckyshop", name: "probe", role: "Administrator", exp: Math.floor(Date.now() / 1000) + 900 };
const b = Buffer.from(JSON.stringify(p)).toString("base64url");
const tok = `${b}.${createHmac("sha256", env.ADMIN_SESSION_SECRET!).update(b).digest("base64url")}`;
const base = process.argv[2] ?? "http://localhost:3016";
for (const q of process.argv.slice(3).length ? process.argv.slice(3) : ["PooM", "PooM", "poom"]) {
  const t = Date.now();
  try {
    const res = await fetch(`${base}/api/admin/line-customers?${q.startsWith("?") ? q.slice(1) : `q=${encodeURIComponent(q)}`}`, { headers: { cookie: `ducky_admin_session=${tok}` }, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    let j: any = null; try { j = JSON.parse(text); } catch {}
    console.log(`q=${q} http=${res.status} ${Date.now() - t}ms`, j ? { n: j.customers?.length, total: j.total, exact: j.exact, refreshed: j.refreshed, indexed: j.indexed, err: j.error, page: j.page, hasMore: j.hasMore, todayCount: j.todayCount, names: j.customers?.slice(0, 6).map((c: any) => c.name) } : text.slice(0, 200));
  } catch (e) { console.log(`q=${q} THROW ${Date.now() - t}ms`, (e as Error).message); }
}
