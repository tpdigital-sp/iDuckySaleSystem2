import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const id = process.argv[2];
const { data, error } = await sb.from("products").select("*").eq("id", id).maybeSingle();
if (error) throw error;
console.log(JSON.stringify(data, null, 1));
