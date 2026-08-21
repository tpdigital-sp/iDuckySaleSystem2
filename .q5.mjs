import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data}=await sb.from("products").select("id,data").limit(2000);
const hits=data.filter(r=>/CABLE CARE/i.test(r.data.name||""));
for(const h of hits){ console.log("###",h.id,h.data.name); console.log(JSON.stringify(h.data.options,null,1).slice(0,3500)); }
