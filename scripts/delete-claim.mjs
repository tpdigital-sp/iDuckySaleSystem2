// ลบเคสเคลมตามเลข: node scripts/delete-claim.mjs CL-xxxxxx-xxxx [--apply]  (สำรองแถวลง backups/ ก่อนลบ)
// ไม่มี --apply = ดูเฉย ๆ ว่าจะลบอะไร · ระบบเคลมตั้งใจไม่มีปุ่มลบในหน้าจอ (เคสคือหลักฐาน) ลบได้จากสคริปต์นี้เท่านั้น
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const ids = process.argv.slice(2).filter(a=>a.startsWith("CL-")); const APPLY = process.argv.includes("--apply");
if(!ids.length){ console.error("ระบุเลข CL-…"); process.exit(1); }
const {data,error}=await sb.from("product_claims").select("*").in("id", ids); if(error) throw error;
if(!data.length){ console.log("ไม่พบเคสที่ระบุ"); process.exit(0); }
for(const r of data){ const c=r.data??{}; console.log(`${c.id} · ${c.customer??""} · ใบ ${c.orderId??""}${c.legacy?" (ใบนอกระบบ)":""} · ${c.type??""} · ${c.status??""} · ${c.createdAt??""} · รูป ${(c.photoPaths??[]).length}`); }
if(!APPLY){ console.log("\n— ดูเฉย ๆ ยังไม่ลบ · ใส่ --apply ถึงจะลบจริง —"); process.exit(0); }
mkdirSync("backups",{recursive:true});
const f=`backups/claims-before-delete-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`;
writeFileSync(f, JSON.stringify(data,null,1)); console.log("backup ->", f);
const {error:e2}=await sb.from("product_claims").delete().in("id", ids); if(e2) throw e2;
const {count}=await sb.from("product_claims").select("*",{count:"exact",head:true}); console.log("ลบแล้ว", data.length, "· เหลือ", count);
