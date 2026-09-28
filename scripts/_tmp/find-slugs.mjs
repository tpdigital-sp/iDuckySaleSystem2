import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const slugs = [
 "กรอบรูปอะคริลิค-ขอบเงิน-ทอง-ดำ-โรสโกล","กรอบรูปจิ๊กซอร์-อะคริลิค","กรอบรูปอะคริลิคขาตั้ง","360°-PHONE-STAND",
 "MOBILE-PHONE-HANGING-ไดคัทตามทรง","SolventPremium","เสื้อกีฬา-ทรง-SPORT-พิมพ์ลายเต็มตัว","เสื้อยืด-ทรง-UNISEX-พิมพ์ลายเต็มตัว",
 "COMFY-PANTS-กางเกงทรงกระบอก","Case-Frame-Card"];
const { data } = await sb.from("products").select("id,data").not("id","like","\\_\\_%");
for (const s of slugs) {
  const hit = data.filter(r => r.data?.slug === s || r.id === s);
  console.log(s, "→", hit.map(r=>`${r.id} (${r.data.name}) badge=${r.data.badge??""} hidden=${!!r.data.hidden}`).join(" ; ") || "❌ ไม่พบ");
}
