// ลบออเดอร์ตามเลข: node scripts/delete-order.mjs OD-xxxxxx-xxxx [...] [--apply]  (สำรองแถวลง backups/ ก่อนลบ)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const ids = process.argv.slice(2).filter(a=>a.startsWith("OD-")); const APPLY = process.argv.includes("--apply");
if(!ids.length){ console.error("ระบุเลข OD-…"); process.exit(1); }
const {data,error}=await sb.from("orders").select("*").in("id", ids); if(error) throw error;
console.log("found:", data.map(r=>`${r.id} ${r.data?.customerName??r.data?.customer?.name??""} ${r.data?.status??""} ฿${r.data?.total} paid=${(r.data?.payments??r.data?.slips??[]).length}`));
const missing = ids.filter(id=>!data.some(r=>r.id===id)); if(missing.length) console.log("not found:", missing);
if(!APPLY) process.exit(0);
mkdirSync("backups",{recursive:true});
const f=`backups/orders-before-delete-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`;
writeFileSync(f, JSON.stringify(data,null,1)); console.log("backup ->", f);
const {error:e2}=await sb.from("orders").delete().in("id", data.map(r=>r.id)); if(e2) throw e2;
const {count}=await sb.from("orders").select("*",{count:"exact",head:true}); console.log("deleted", data.length, "· remaining", count);
