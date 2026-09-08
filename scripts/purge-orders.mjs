import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const KEEP = new Set(["OD-260908-3901","OD-260908-3264"]);
const APPLY = process.argv.includes("--apply");
const rows=[]; for(let from=0;;from+=500){ const {data,error}=await sb.from("orders").select("*").range(from,from+499); if(error) throw error; rows.push(...data); if(data.length<500) break; }
console.log("total", rows.length);
const keep = rows.filter(r=>KEEP.has(r.id)); const del = rows.filter(r=>!KEEP.has(r.id));
console.log("keep:", keep.map(r=>`${r.id} ${r.data?.customerName??r.data?.customer?.name??""} ฿${r.data?.total}`));
console.log("delete:", del.length);
if(!APPLY){ console.log(del.slice(0,5).map(r=>r.id), "..."); process.exit(0); }
mkdirSync("backups",{recursive:true});
const f=`backups/orders-before-purge-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`;
writeFileSync(f, JSON.stringify(rows,null,1)); console.log("backup ->", f);
const ids = del.map(r=>r.id);
for(let i=0;i<ids.length;i+=50){ const {error}=await sb.from("orders").delete().in("id", ids.slice(i,i+50)); if(error) throw error; }
const {count}=await sb.from("orders").select("*",{count:"exact",head:true});
console.log("remaining", count);
