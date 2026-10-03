/**
 * ผ้าเชียร์ (2-2-2) เรท "สกรีน 1 ด้าน" — คำอธิบายเรทไม่บอกว่าเก็บขอบแบบไหน (แบบ 2 ด้านบอกครบ)
 * กราฟฟิกอ่านบรรทัด "สเปคเรท" หน้าออเดอร์แล้วไม่รู้ว่าเย็บยังไง (OD-261002-7187 · 3 ต.ค. 69)
 * เจ้าของร้านยืนยัน: 1 ด้าน = เย็บโพ้งเก็บขอบรอบผืน · รันซ้ำได้ (มีแล้วไม่เติมซ้ำ)
 * + FAQ/จุดเด่นหน้าสินค้าที่พูดถึงแบบ 1 ด้าน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ID = "2-2-2", LABEL = "ผ้าเชียร์ · สกรีน 1 ด้าน", ADD = "เย็บโพ้งเก็บขอบรอบผืน";
const { data: row, error } = await sb.from("products").select("data").eq("id", ID).single();
if (error) throw error;
const d = row.data;
const rate = d.priceRates.find((r) => r.label === LABEL && !r.dealerOnly);
if (!rate) throw new Error("ไม่เจอเรท");
/** จุดที่บอกแบบ 1 ด้านในหน้าสินค้า — การ์ดเรท + FAQ "1 ด้าน กับ 2 ด้าน ต่างกันยังไง" + จุดเด่นบรรทัดแรก (เจ้าของร้านขอ 3 ต.ค. 69) */
const patches = [
  [rate, "desc", "สกรีน 1 ด้าน · ", `สกรีน 1 ด้าน · ${ADD} · `, ADD],
  [d.seo?.faqs?.[1], "a", "1 ด้าน = ผ้า 1 ชิ้น สกรีนหน้าเดียว", "1 ด้าน = ผ้า 1 ชิ้น สกรีนหน้าเดียว เย็บโพ้งเก็บขอบ", "เดียว เย็บโพ้ง"],
  [d.highlights, 0, "1 ด้าน (ผ้า 1 ชิ้น)", "1 ด้าน (ผ้า 1 ชิ้น เย็บโพ้งเก็บขอบ)", "ชิ้น เย็บโพ้ง"],
];
let n = 0;
for (const [obj, key, from, to, done] of patches) {
  if (!obj || typeof obj[key] !== "string") throw new Error("ไม่เจอช่อง " + key);
  if (obj[key].includes(done)) continue;
  if (!obj[key].includes(from)) throw new Error(`ไม่เจอข้อความ "${from}" ใน ${obj[key]}`);
  obj[key] = obj[key].replace(from, to);
  n++;
}
if (!n) { console.log("ครบแล้ว ไม่ต้องเขียน"); process.exit(0); }
d.savedAt = new Date().toISOString();
const want = JSON.stringify([rate.desc, d.seo.faqs[1].a, d.highlights[0]]);
const { data: out, error: e2 } = await sb.from("products").update({ data: d }).eq("id", ID).select("data");
if (e2) throw e2;
const b = out?.[0]?.data;
const got = JSON.stringify([b?.priceRates.find((r) => r.label === LABEL && !r.dealerOnly)?.desc, b?.seo?.faqs?.[1]?.a, b?.highlights?.[0]]);
if (got !== want) throw new Error("อ่านกลับไม่ตรง: " + got);
console.log("✓ เขียน", n, "จุด\n" + JSON.parse(got).join("\n"));
