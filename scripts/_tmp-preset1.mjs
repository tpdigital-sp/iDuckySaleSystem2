import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url).pathname,"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,data").eq("id", process.argv[2]).maybeSingle();
const p = data.data;
console.log("label:", p.label, "| display:", p.display, "| stockBearing:", p.stockBearing, "| keys:", Object.keys(p).join(","));
for (const c of p.choices||[]) console.log("  ", c.name.padEnd(40), "extra:", c.extra ?? "-", "| img:", c.imageSrc? "yes":"-", "| stock:", c.stockItemId||"-");
