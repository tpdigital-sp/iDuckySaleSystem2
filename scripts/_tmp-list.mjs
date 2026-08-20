import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url).pathname,"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,name,category").neq("category","__presets__");
const q = process.argv[2] || "";
for (const r of data.filter(r=>!q||(r.name||"").includes(q)||r.id.includes(q))) console.log(r.id.padEnd(28), r.category?.padEnd(12), r.name);
