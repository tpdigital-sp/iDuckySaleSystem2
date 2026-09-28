import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from("products").select("id,sort,data").eq("badge","ใหม่").order("sort",{ascending:true});
const shown = data.slice(-8).reverse();
console.log("โชว์ในแถบมาใหม่ (8):"); shown.forEach((r,i)=>console.log(` ${i+1}. ${r.data.name} (sort ${r.sort})`));
console.log("ไม่ได้อยู่ในแถบ:", data.filter(r=>!shown.includes(r)).map(r=>`${r.data.name} (sort ${r.sort})`).join(", "));
