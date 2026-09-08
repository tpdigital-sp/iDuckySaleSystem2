// ซ่อมข้อความวันที่ (data.date) ของ orders/quotes ที่เคยแช่เป็นเวลา UTC ให้เป็นเวลาไทย จาก created_at
//   node scripts/fix-doc-dates-bkk.mjs           → ดูก่อน
//   node scripts/fix-doc-dates-bkk.mjs --apply   → เขียนจริง
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const APPLY = process.argv.includes("--apply");
const fmt = d => d.toLocaleString("th-TH", { timeZone:"Asia/Bangkok", day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
for (const table of ["orders","quotes"]) {
  const {data,error}=await sb.from(table).select("id,data,created_at"); if(error) throw error;
  let n=0;
  for (const r of data) {
    const want = fmt(new Date(r.created_at));
    if (r.data?.date === want) continue;
    console.log(`${table} ${r.id}: "${r.data?.date}" → "${want}"`); n++;
    if (APPLY) { const {error:e}=await sb.from(table).update({ data: { ...r.data, date: want } }).eq("id", r.id); if(e) throw e; }
  }
  console.log(`${table}: ${APPLY?"แก้":"จะแก้"} ${n}/${data.length}`);
}
