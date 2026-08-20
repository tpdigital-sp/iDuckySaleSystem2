import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url).pathname,"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,name,data").neq("category","__presets__");
for (const r of data||[]) {
  const opts = r.data?.options||[];
  const hit = opts.filter(o=>o.presetId==="preset" || o.presetId?.includes("preset") || /อะคริลิคพิเศษ|สีอะคริลิค/.test(o.label));
  if (hit.length) console.log(r.id.padEnd(26), r.name?.slice(0,28).padEnd(30), hit.map(o=>`${o.label}[preset:${o.presetId||"-"}|disp:${o.display||"pills"}|${o.choices.length}|showWhen:${o.showWhen?JSON.stringify(o.showWhen):"-"}|extras:${[...new Set(o.choices.map(c=>c.extra||0))].join(",")}]`).join("  "));
}
