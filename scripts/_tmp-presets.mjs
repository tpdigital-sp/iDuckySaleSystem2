import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url).pathname,"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,data").eq("category","__presets__");
for (const r of data||[]) {
  const list = r.data?.presets || r.data?.items || r.data;
  console.log("ROW", r.id, Array.isArray(list)? list.length+" presets":typeof list);
  if (Array.isArray(list)) for (const p of list) console.log("   ", (p.id||"").padEnd(22), (p.label||"").padEnd(28), (p.choices||[]).length, "ตัวเลือก", (p.choices||[]).slice(0,5).map(c=>c.name).join(" · ").slice(0,90));
}
