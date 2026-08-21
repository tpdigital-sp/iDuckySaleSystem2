import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data}=await sb.from("products").select("id,data").limit(2000);
const seen=new Map();
for(const r of data){
  for(const o of r.data.options||[]){
    if(/ขนาด|เพิ่มขนาด/.test(o.label) && (o.choices||[]).some(c=>c.extra)){
      const key=o.label+" :: "+(o.choices||[]).map(c=>`${c.name}${c.extra?"(+"+c.extra+")":""}${c.askPrice?"💬":""}`).join(", ");
      if(!seen.has(key)) seen.set(key, r.id+" | "+r.data.name+(o.extraFromQty?` [extraFromQty:${o.extraFromQty}]`:"")+(o.display?` [${o.display}]`:""));
    }
  }
}
let n=0;
for(const [k,v] of seen){ if(n++>14) break; console.log("▸",v,"\n   ",k.slice(0,400),"\n"); }
console.log("total distinct:",seen.size);
