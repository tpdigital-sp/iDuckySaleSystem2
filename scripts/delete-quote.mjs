// ลบใบเสนอราคาตามเลข: node scripts/delete-quote.mjs QT-xxxxxx-xxxx [--apply]  (สำรองแถวลง backups/ ก่อนลบ)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const ids = process.argv.slice(2).filter(a=>a.startsWith("QT-")); const APPLY = process.argv.includes("--apply");
if(!ids.length){ console.error("ระบุเลข QT-…"); process.exit(1); }
const {data,error}=await sb.from("quotes").select("*").in("id", ids); if(error) throw error;
console.log("found:", data.map(r=>`${r.id} ${r.data?.customerName??""} ${r.data?.status??""}`));
if(!APPLY) process.exit(0);
mkdirSync("backups",{recursive:true});
const f=`backups/quotes-before-delete-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`;
writeFileSync(f, JSON.stringify(data,null,1)); console.log("backup ->", f);
const {error:e2}=await sb.from("quotes").delete().in("id", ids); if(e2) throw e2;
const {count}=await sb.from("quotes").select("*",{count:"exact",head:true}); console.log("deleted", ids.length, "· remaining", count);
