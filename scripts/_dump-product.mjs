import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const { data, error } = await sb.from("products").select("id,name,price,category,data").eq("id", process.argv[2]).single();
if (error) throw error;
writeFileSync(process.argv[3], JSON.stringify(data, null, 2));
console.log("ok", data.name, "hidden=", data.data?.hidden);
