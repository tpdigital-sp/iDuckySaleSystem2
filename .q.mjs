import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("./.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
for (const id of process.argv.slice(2)) {
  const { data, error } = await sb.from("products").select("id,name,data").eq("id", id).maybeSingle();
  if (error || !data) { console.log(id, "NOT FOUND", error?.message); continue; }
  const d = data.data;
  console.log("=====", id, "|", d.name, "| hidden", d.hidden);
  console.log("pricing:", JSON.stringify(d.pricing));
  if (d.priceRates) for (const r of d.priceRates) console.log("  RATE", r.id, r.label, "|", r.desc, "|", JSON.stringify(r.pricing));
  for (const o of d.options ?? []) {
    console.log(` == ${o.label} (${o.display||"pills"}) showWhen=${JSON.stringify(o.showWhen||null)}`);
    for (const c of o.choices) console.log("    -", c.name, "| extra", c.extra ?? 0, c.askPrice?"| ASK":"", c.perUnit?`| perUnit ${c.perUnit}`:"");
  }
  console.log("terms:\n" + (d.terms||"(none)"));
}
