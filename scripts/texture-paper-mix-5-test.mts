/** 🧪 ค่าคละลาย texture-paper ลายละ 5 ลายแรกฟรี — npx tsx scripts/texture-paper-mix-5-test.mts */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { designFeeFor, feeBreakdown, mixRuleFor, DESIGN_LABEL, type Product } from "../src/lib/products";
const env = Object.fromEntries(readFileSync("/Users/iduckshop/Desktop/iDuckySaleSystem2/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()] as [string,string];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const { data } = await sb.from("products").select("id,name,price,category,data").eq("id","texture-paper");
const row:any = data![0]; const p = {id:row.id,name:row.name,price:row.price,category:row.category,...row.data} as Product;
const sel: Record<string,string> = {};
for (const o of p.options) if (o.choices?.length && o.label!=="พิมพ์รองสีขาว (ด้านหน้า)") sel[o.label]=o.choices[0].label;
console.log("mixRuleFor:", JSON.stringify(mixRuleFor(p, sel)));
const cases: [number,number,number][] = [[1,1,0],[1,2,5],[1,3,10],[1,4,15],[1,5,20],[2,3,5],[2,4,10],[3,3,0],[10,4,0],[2,9,35]];
let fail=0;
for (const [qty,designs,want] of cases) {
  const s = {...sel, [DESIGN_LABEL]: String(designs)};
  const got = designFeeFor(p, s, qty);
  const ok = got===want; if(!ok) fail++;
  console.log(`${ok?"✓":"❌"} qty ${qty} × ${designs} ลาย → ค่าคละ ${got} (คาด ${want})`);
}
console.log(fail?`FAIL ${fail}`:"ALL PASS");
