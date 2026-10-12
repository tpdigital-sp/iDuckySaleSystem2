/**
 * 🎁 กลุ่มสีไหมที่ป้ายบอก "รวมในราคา 3 สี" แต่ไม่ได้ตั้ง freeFirstN → คิด ฿10 ตั้งแต่สีแรก
 * (OD-261012-4404 · 12 ต.ค. 69) · ใส่ freeFirstN: 3 · idempotent · ต้อง --write ถึงจะเขียน
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const WRITE = process.argv.includes("--write");
const IDS = ["armpatch-1", "crossbody-bag"];
for (const id of IDS) {
  const { data: row, error } = await sb.from("products").select("data").eq("id", id).single();
  if (error) throw error;
  const p = row.data;
  let changed = 0;
  for (const o of p.options ?? []) {
    if (!/^สีไหม/.test(o.label) || !/รวมในราคา\s*3\s*สี/.test(o.label)) continue;
    if (o.freeFirstN === 3) { console.log("ok แล้ว", id, o.label); continue; }
    console.log(WRITE ? "เขียน" : "จะเขียน", id, o.label, o.freeFirstN, "→ 3");
    o.freeFirstN = 3; changed++;
  }
  if (!changed || !WRITE) continue;
  const up = await sb.from("products").update({ data: p }).eq("id", id).select("data").single();
  if (up.error) throw up.error;
  console.log("✓", id, up.data.data.options.filter((o) => o.freeFirstN).map((o) => o.freeFirstN));
}
