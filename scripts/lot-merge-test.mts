/**
 * 🧪 ทดสอบ "ตะกร้ารวมล็อต" ทุกสินค้าในฐานข้อมูลจริง
 *   สั่งสินค้าเดียวกัน 2 บรรทัดสเปคเดียวกัน → ราคาต่อชิ้นหลังรวมล็อตต้อง:
 *   • สินค้าเรทแบบสินค้า/วัสดุ (minQty เท่ากันหมด เช่น โฟโต้การ์ด/เสื้อ/สายคล้องคอ): เท่าบรรทัดเดี่ยวที่จำนวนรวม "เรทเดิม" เป๊ะ
 *   • สินค้าเรทขั้นบันไดจำนวน (เรท 1 = 11 ชิ้น · เรท 2 = 50 ชิ้น): ไม่แพงกว่าบรรทัดเดี่ยว และตรงกับเรทที่ระบบเลือกที่จำนวนรวม
 *   • สองบรรทัดต้องได้ราคาเท่ากัน
 *   ครอบคลุม: ทุกเรท public · ช่องตาราง ต้น/กลาง/ท้าย · จำนวน 3 ระดับ (ขั้นต่ำต่อลาย ×1 ×5 ×30)
 *
 *   npx tsx scripts/lot-merge-test.mts            # ทุกสินค้าที่เปิดขาย
 *   npx tsx scripts/lot-merge-test.mts --hidden   # รวมสินค้าซ่อน/ฉบับร่างด้วย
 *   npx tsx scripts/lot-merge-test.mts photocard-digital   # เฉพาะตัว (ระบุ id ได้หลายตัว)
 *
 * ที่มา: 8 ก.ย. 69 OD-260908-7338 โฟโต้การ์ด PET 10+10 เซ็ต โดนย้ายไปเรทอาร์ตมัน ฿95 แทน ฿180
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { repriceCartGroups, publicRates, unitPriceParts, needsQuote, RATE_LABEL, type Product } from "../src/lib/products";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")] as [string,string];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const args = process.argv.slice(2);
const includeHidden = args.includes("--hidden");
const onlyIds = args.filter(a=>!a.startsWith("--"));
const verbose = args.includes("--verbose") || onlyIds.length > 0;
const toP = (row:any) => ({id:row.id,name:row.name,price:row.price,category:row.category,...(row.data as any)}) as Product;
const { data: prows, error } = await sb.from("products").select("id,name,price,category,data");
if (error) throw error;
let ok=0, bad=0, tested=0, skipHidden=0, skipInternal=0, skipArea=0, skipNoTable=0; const fails: string[] = [];
for (const r of prows!.sort((a,b)=>a.id.localeCompare(b.id))) {
  if (onlyIds.length && !onlyIds.includes(r.id)) continue;
  if (r.id.startsWith("__")) { skipInternal++; continue; }
  const p = toP(r);
  if (p.hidden && !includeHidden) { skipHidden++; continue; }
  if (p.areaPricing?.enabled) { skipArea++; continue; }
  const rs = publicRates(p);
  const ladder = rs.length>=2 && !p.hardMinQty && new Set(rs.map(x=>x.minQty??1)).size>1;
  const matrices = rs.length ? rs.map(x=>({m:x.pricing, rate:x as any})) : p.pricing ? [{m:p.pricing, rate:undefined as any}] : [];
  const cases: { label: string; sel: Record<string,string>; qty: number }[] = [];
  for (const {m, rate} of matrices) {
    const keys = Object.keys(m?.cells ?? {}); if (!keys.length) continue;
    const picks = [keys[0], keys[Math.floor(keys.length/2)], keys[keys.length-1]].filter((k,i,a)=>a.indexOf(k)===i);
    for (const key of picks) {
      const sel: Record<string,string> = Object.fromEntries(m.driverLabels.map((l:string,i:number)=>[l, key.split("│")[i]]));
      if (rate) sel[RATE_LABEL] = rate.label;
      if (needsQuote(p, sel)) continue;
      const per = Math.max(rate?.minPerDesign ?? 1, 1);
      for (const qty of [per, per*5, per*30]) cases.push({ label: `${rate?.label ?? "เรทเดียว"} · ${key||"-"} · ${qty}+${qty}`, sel, qty });
    }
  }
  if (!cases.length) { skipNoTable++; continue; }
  tested++;
  let pOk = 0, pBad = 0;
  for (const c of cases) {
    const lines = [{productId:p.id, qty:c.qty, selections:c.sel},{productId:p.id, qty:c.qty, selections:c.sel}];
    let out; try { out = repriceCartGroups(lines, id=>id===p.id?p:undefined); } catch(e:any) { pBad++; fails.push(`💥 ${p.id} ${p.name} | ${c.label} | ${e.message}`); continue; }
    const single1 = unitPriceParts(p, c.sel, c.qty).total;
    const single2 = unitPriceParts(p, c.sel, c.qty*2).total;
    const u = out[0].unitPrice, u2 = out[1].unitPrice;
    let good: boolean;
    if (u !== u2) good = false;
    else if (!ladder) good = Math.abs(u - single2) < 0.5;
    else {
      const rl = out[0].merged?.rateLabel ?? c.sel[RATE_LABEL];
      const exp = unitPriceParts(p, {...c.sel, [RATE_LABEL]: rl}, c.qty*2).total;
      good = u <= single1 + 0.5 && Math.abs(u - exp) < 0.5;
    }
    if (good) pOk++; else { pBad++; fails.push(`❌ ${p.id} ${p.name} | ${c.label} | รวม ฿${u}/${u2} (${out[0].merged?.rateLabel ?? "-"}) · เดี่ยว@${c.qty} ฿${single1} · เดี่ยว@${c.qty*2} ฿${single2}`); }
  }
  ok += pOk; bad += pBad;
  if (verbose || pBad) console.log(`${pBad ? "❌" : "✅"} ${p.id} · ${p.name} · ${ladder ? "ขั้นบันได" : rs.length>=2 ? "เรทแบบสินค้า" : "เรทเดียว"} · ${pOk}/${pOk+pBad} เคส`);
}
for (const f of fails) console.log(f);
console.log(`\nสินค้าที่ทดสอบ ${tested} ตัว · เคสผ่าน ${ok} · ไม่ผ่าน ${bad}`);
console.log(`ข้าม: แถวภายในระบบ ${skipInternal} · ซ่อน ${skipHidden} · คิดตามพื้นที่ ${skipArea} · ไม่มีตาราง ${skipNoTable}`);
process.exit(bad ? 1 : 0);
