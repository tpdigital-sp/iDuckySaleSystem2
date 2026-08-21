import {readFileSync} from "node:fs";
import {createClient} from "@supabase/supabase-js";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data}=await sb.from("products").select("id,data").limit(2000);
const hit=data.find(r=>r.data?.slug==="สแตนดี้");
console.log("slug สแตนดี้ →", hit?.id, "|", hit?.data?.name);
const d=hit.data;
console.log("driverLabels:", JSON.stringify(d.pricing?.driverLabels));
console.log("rates:", (d.priceRates||[]).map(r=>r.label).join(" | "));
for(const o of d.options||[]){
  if(!/สีอะคริลิค|อะคริลิค|ขนาด/.test(o.label)) continue;
  console.log("\n### ", o.label, "| display:",o.display, "| extraFromQty:",o.extraFromQty, "| showWhen:",JSON.stringify(o.showWhen));
  console.log(JSON.stringify(o.choices?.slice(0,6),null,1));
}
