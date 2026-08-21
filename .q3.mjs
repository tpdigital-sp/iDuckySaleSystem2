import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data}=await sb.from("products").select("id,data").limit(2000);
const id=process.argv[2];
const r=data.find(x=>x.id===id);
const d=r.data;
console.log(JSON.stringify(d,null,1).slice(0, Number(process.argv[3]||8000)));
