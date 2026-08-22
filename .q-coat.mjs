import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data } = await sb.from("products").select("id,name,category,data");
for (const p of data) {
  const d = p.data || {};
  const opts = d.options || [];
  const hasCoat = opts.some(o=>/เคลือบ/.test(o.label||"") || (o.choices||[]).some(c=>/เคลือบ/.test(c.name||"")));
  const hasA5 = JSON.stringify(d).includes("A5");
  const isBook = /เล่ม/.test(d.unit||"") || /สมุด|notebook|โน้ต/i.test(p.name||"") || /สมุด/.test(p.id||"");
  if ((hasCoat && hasA5) || isBook) {
    console.log(`${p.id} | ${p.name} | หมวด ${p.category} | หน่วย ${d.unit} | hidden ${d.hidden}`);
    for (const o of opts) console.log(`    ${o.label} [${o.display||"pills"}] : ` + (o.choices||[]).map(c=>c.name+(c.extra!=null?` (+${c.extra})`:"")).join(" · ").slice(0,220));
  }
}
