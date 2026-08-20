import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url).pathname,"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,data").eq("category","__presets__");
for (const r of data||[]) {
  const p = r.data;
  console.log(r.id.padEnd(30), "|", (p.label||"").padEnd(30), "|", (p.choices||[]).length, "|", (p.choices||[]).slice(0,8).map(c=>c.name+(c.imageSrc?"🖼":"")).join(" · ").slice(0,120));
}
