import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from("products").select("id,data").not("id","like","\\_\\_%");
if (error) { console.error(error); process.exit(1); }
const counts = {};
const rows = [];
for (const r of data) { const b = r.data?.badge ?? ""; counts[b] = (counts[b]||0)+1; if (b) rows.push([r.id, b, r.data?.name]); }
console.log("total", data.length, counts);
console.log(rows.map(r=>r.join(" | ")).join("\n"));
