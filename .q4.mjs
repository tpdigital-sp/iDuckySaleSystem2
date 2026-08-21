import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data}=await sb.from("products").select("data").eq("id","keyring-copy-copy").single();
const d=data.data;
console.log("name:",d.name,"| driverLabels:",JSON.stringify(d.pricing?.driverLabels),"| tiers:",d.pricing?.tiers?.map(t=>t.label).join(" · "));
for(const o of d.options||[]){
  console.log(`\n### ${o.label} | display:${o.display} | extraFromQty:${o.extraFromQty} | showWhen:${JSON.stringify(o.showWhen)}`);
  console.log("   ", (o.choices||[]).slice(0,22).map(c=>`${c.name}${c.extra!=null?`(+${c.extra}`:""}${c.extraBelow!=null?`/ปลีก+${c.extraBelow}`:""}${c.extra!=null?")":""}${c.askPrice?"💬":""}`).join(" · ").slice(0,700));
}
